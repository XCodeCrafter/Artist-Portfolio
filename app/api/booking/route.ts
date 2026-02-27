//artist-portfolio/app/api/booking/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { Resend } from "resend";
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

export const runtime = "nodejs";

const BookingSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(200),
  message: z.string().trim().min(10).max(4000),
  company: z.string().trim().max(200).optional().default(""),
  startedAt: z.number().int(),
});

function getIp(req: Request) {
  const xf = req.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0].trim();
  const xr = req.headers.get("x-real-ip");
  return (xr || "0.0.0.0").trim();
}

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const parsed = BookingSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(400, "Invalid payload.");
    }

    const { name, email, message, company, startedAt } = parsed.data;

    // Honeypot triggered -> act like success (don’t teach bots)
    if (company && company.length > 0) {
      return NextResponse.json({ ok: true, message: "Thanks!" });
    }

    // Too fast submit -> likely bot
    const elapsed = Date.now() - startedAt;
    if (elapsed < 1800) {
      return NextResponse.json({ ok: true, message: "Thanks!" });
    }

    // Rate limit (Upstash)
    const redis = Redis.fromEnv();
    const ratelimit = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, "1 m"), // 5/min per IP
      analytics: true,
      prefix: "rl:booking",
    });

    const ip = getIp(req);
    const rl = await ratelimit.limit(`ip:${ip}`);
    if (!rl.success) {
      return jsonError(429, "Too many requests. Try again in a minute.");
    }

    const apiKey = process.env.RESEND_API_KEY;
    const to = process.env.BOOKING_TO_EMAIL;
    const from = process.env.BOOKING_FROM_EMAIL;

    if (!apiKey || !to || !from) {
      return jsonError(500, "Server is not configured for email sending.");
    }

    const resend = new Resend(apiKey);

    const subject = `New booking inquiry — ${name}`;
    const text = [
      "New booking/inquiry message",
      "",
      `Name: ${name}`,
      `Email: ${email}`,
      "",
      "Message:",
      message,
      "",
      `IP: ${ip}`,
      `Time: ${new Date().toISOString()}`,
    ].join("\n");

    await resend.emails.send({
      from,
      to,
      replyTo: email,
      subject,
      text,
    });

    return NextResponse.json({
      ok: true,
      message: "Message sent. Thanks — I’ll reply soon.",
    });
  } catch {
    return jsonError(500, "Unexpected server error.");
  }
}