import { randomUUID } from "node:crypto";
import { Resend } from "resend";
import { NextResponse } from "next/server";
import { z } from "zod";
import { writeAuditLog } from "@/lib/admin/audit";
import { keyedDigest } from "@/lib/admin/security-secret";
import { createAdminServiceClient } from "@/lib/admin/service";
import { normalizePortfolioType } from "@/lib/content/profile";
import { readJsonBodyWithLimit } from "@/lib/security/json-body";
import { hasAllowedRequestOrigin } from "@/lib/security/origin";
import {
  getClientIp,
  getPseudonymousIpKey,
  getReferrerWithoutQuery,
} from "@/lib/security/request";
import { consumeDatabaseRateLimit } from "@/lib/security/rate-limit";
import type { PortfolioType } from "@/lib/content";

export const runtime = "nodejs";

const MIN_FORM_ELAPSED_MS = 1800;
const MAX_REQUEST_BYTES = 20 * 1024;

const BookingSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(200),
  message: z.string().trim().min(10).max(4000),
  company: z.string().trim().max(200).optional().default(""),
  website: z.string().trim().max(200).optional().default(""),
  portfolioType: z.enum(["musician", "actor"]).optional().default("musician"),
  inquiryType: z
    .enum(["booking", "collaboration"])
    .optional()
    .default("booking"),
  startedAt: z.number().int().positive(),
});

const BOT_USER_AGENT_PATTERN =
  /\b(curl|wget|python-requests|httpie|scrapy|go-http-client|java\/|libwww-perl|masscan|nikto|sqlmap|zgrab|headlesschrome)\b/i;

function jsonError(
  status: number,
  error: string,
  headers?: Record<string, string>
) {
  return NextResponse.json({ ok: false, error }, { status, headers });
}

function sanitizeHeaderValue(value: string) {
  return value
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[\u0000-\u001f\u007f]+/g, "")
    .trim()
    .slice(0, 120);
}

function getUserAgent(req: Request) {
  return (req.headers.get("user-agent") || "").slice(0, 500);
}

function shouldBlockUserAgent(userAgent: string) {
  const value = userAgent.trim();
  if (!value) return true;
  return BOT_USER_AGENT_PATTERN.test(value);
}

async function writeSecurityEvent(
  req: Request,
  action: string,
  metadata: Record<string, unknown> = {}
) {
  await writeAuditLog({
    action,
    tableName: "security_events",
    recordId: "/api/booking",
    metadata: {
      ipKey: getPseudonymousIpKey(req.headers),
      userAgent: getUserAgent(req),
      origin: sanitizeHeaderValue(req.headers.get("origin") || ""),
      referer: sanitizeHeaderValue(getReferrerWithoutQuery(req.headers)),
      ...metadata,
    },
  });
}

async function getConfiguredPortfolioType(
  fallback: PortfolioType
): Promise<PortfolioType> {
  const supabase = createAdminServiceClient();
  if (!supabase) return fallback;

  const { data, error } = await supabase
    .from("site_settings")
    .select("portfolio_type")
    .eq("id", "main")
    .limit(1)
    .maybeSingle<{ portfolio_type?: string | null }>();

  if (error || !data) return fallback;

  return normalizePortfolioType(data.portfolio_type);
}

async function writeBookingInquiry(input: {
  name: string;
  email: string;
  message: string;
  portfolioType: PortfolioType;
  inquiryType: "booking" | "collaboration";
  ipKey: string;
  userAgent: string;
}) {
  const supabase = createAdminServiceClient();
  if (!supabase) return;

  const row = {
    name: input.name,
    email: input.email,
    message: input.message,
    portfolio_type: input.portfolioType,
    inquiry_type: input.inquiryType,
    status: "new",
    source_ip: input.ipKey,
    user_agent: input.userAgent,
  };

  const result = await supabase.from("booking_inquiries").insert(row);

  if (
    result.error?.message.includes("portfolio_type") ||
    result.error?.message.includes("inquiry_type")
  ) {
    const fallbackResult = await supabase.from("booking_inquiries").insert({
      name: input.name,
      email: input.email,
      message: input.message,
      status: "new",
      source_ip: input.ipKey,
      user_agent: input.userAgent,
    });

    if (fallbackResult.error) {
      console.error(fallbackResult.error);
    }
  } else if (result.error) {
    console.error(result.error);
  }
}

async function writeBookingAnalytics(input: {
  userAgent: string;
  portfolioType: PortfolioType;
  inquiryType: "booking" | "collaboration";
}) {
  const supabase = createAdminServiceClient();
  if (!supabase) return;

  await supabase.from("analytics_events").insert({
    event_name: "booking_submit",
    page_path: "/booking",
    target_label:
      input.inquiryType === "collaboration"
        ? "Collaboration form"
        : "Booking form",
    target_url: "",
    metadata: {
      portfolioType: input.portfolioType,
      inquiryType: input.inquiryType,
      userAgent: input.userAgent.slice(0, 500),
    },
  });
}

export async function POST(req: Request) {
  try {
    const ipKey = keyedDigest("public-rate-ip", getClientIp(req.headers));
    const admissionLimit = await consumeDatabaseRateLimit({
      bucket: "public:booking:admission:ip",
      identifierHash: ipKey,
      limit: 30,
      windowSeconds: 60,
    });

    if (!admissionLimit.allowed) {
      if (admissionLimit.firstDenied) {
        await writeSecurityEvent(req, "security_contact_rate_limited", {
          bucket: "admission",
          limit: admissionLimit.limit,
          retryAfterSeconds: admissionLimit.retryAfterSeconds,
        });
      }

      if (!admissionLimit.configured) {
        return jsonError(503, "Security service is temporarily unavailable.");
      }

      return jsonError(429, "Too many requests. Try again in a minute.", {
        "Retry-After": String(admissionLimit.retryAfterSeconds),
      });
    }

    if (!hasAllowedRequestOrigin(req.headers)) {
      await writeSecurityEvent(req, "security_contact_bad_origin");
      return jsonError(403, "Request origin is not allowed.");
    }

    const bodyResult = await readJsonBodyWithLimit(req, MAX_REQUEST_BYTES);
    if (!bodyResult.ok) {
      const payloadTooLarge = bodyResult.code === "payload-too-large";
      await writeSecurityEvent(
        req,
        payloadTooLarge
          ? "security_contact_payload_too_large"
          : "security_contact_invalid_payload",
        {
          bytes: bodyResult.bytes,
          reason: bodyResult.code,
          ...(bodyResult.declaredLength === undefined
            ? {}
            : { declaredLength: bodyResult.declaredLength }),
        }
      );

      if (bodyResult.status === 415) {
        return jsonError(415, "Content-Type must be application/json.");
      }

      return jsonError(
        bodyResult.status,
        payloadTooLarge ? "Payload is too large." : "Invalid payload."
      );
    }

    const parsed = BookingSchema.safeParse(bodyResult.body);
    if (!parsed.success) {
      await writeSecurityEvent(req, "security_contact_invalid_payload", {
        fields: parsed.error.issues.map((issue) => issue.path.join(".")),
      });
      return jsonError(400, "Invalid payload.");
    }

    const { name, email, message, company, website, startedAt } = parsed.data;
    const portfolioType = await getConfiguredPortfolioType(
      parsed.data.portfolioType
    );
    const inquiryType =
      portfolioType === "actor" ? "collaboration" : parsed.data.inquiryType;

    // Honeypot triggered. Return success so automated clients learn nothing.
    const honeypotFields = [
      company.length > 0 ? "company" : "",
      website.length > 0 ? "website" : "",
    ].filter(Boolean);

    if (honeypotFields.length > 0) {
      await writeSecurityEvent(req, "security_contact_honeypot", {
        fields: honeypotFields,
        portfolioType,
        inquiryType,
      });
      return NextResponse.json({ ok: true, message: "Thanks!" });
    }

    const elapsed = Date.now() - startedAt;
    if (elapsed < MIN_FORM_ELAPSED_MS) {
      await writeSecurityEvent(req, "security_contact_too_fast", {
        elapsed,
        portfolioType,
        inquiryType,
      });
      return NextResponse.json({ ok: true, message: "Thanks!" });
    }

    const userAgent = getUserAgent(req);
    if (shouldBlockUserAgent(userAgent)) {
      await writeSecurityEvent(req, "security_contact_suspicious_user_agent", {
        portfolioType,
        inquiryType,
      });
      return NextResponse.json({ ok: true, message: "Thanks!" });
    }

    const rateLimit = await consumeDatabaseRateLimit({
      bucket: "public:booking:ip",
      identifierHash: ipKey,
      limit: 5,
      windowSeconds: 60,
    });

    if (!rateLimit.allowed) {
      if (rateLimit.firstDenied) {
        await writeSecurityEvent(req, "security_contact_rate_limited", {
          bucket: "submission",
          limit: rateLimit.limit,
          retryAfterSeconds: rateLimit.retryAfterSeconds,
        });
      }

      if (!rateLimit.configured) {
        return jsonError(503, "Security service is temporarily unavailable.");
      }

      return jsonError(429, "Too many requests. Try again in a minute.", {
        "Retry-After": String(rateLimit.retryAfterSeconds),
      });
    }

    const apiKey = process.env.RESEND_API_KEY;
    const to = process.env.BOOKING_TO_EMAIL;
    const from = process.env.BOOKING_FROM_EMAIL;

    if (!apiKey || !to || !from) {
      return jsonError(500, "Server is not configured for email sending.");
    }

    const resend = new Resend(apiKey);

    await writeBookingInquiry({
      name,
      email,
      message,
      portfolioType,
      inquiryType,
      ipKey,
      userAgent,
    });

    const isCollaboration = inquiryType === "collaboration";
    const safeName = sanitizeHeaderValue(name) || "Unknown sender";
    const subject = isCollaboration
      ? `New collaboration inquiry - ${safeName}`
      : `New booking inquiry - ${safeName}`;
    const text = [
      isCollaboration
        ? "New let's-work-together message"
        : "New booking/inquiry message",
      "",
      `Portfolio: ${portfolioType}`,
      `Inquiry type: ${inquiryType}`,
      "",
      `Name: ${name}`,
      `Email: ${email}`,
      "",
      "Message:",
      message,
      "",
      `Time: ${new Date().toISOString()}`,
    ].join("\n");

    const emailResult = await resend.emails.send({
      from,
      to,
      replyTo: email,
      subject,
      text,
    });

    if (emailResult.error) {
      console.error(emailResult.error);
      await writeAuditLog({
        action: "booking_email_failed",
        tableName: "booking_inquiries",
        recordId:
          keyedDigest("booking-email-record", email) || randomUUID(),
        metadata: {
          portfolioType,
          inquiryType,
          provider: "resend",
        },
      });
      return jsonError(502, "Message was saved, but email delivery failed.");
    }

    await writeBookingAnalytics({ userAgent, portfolioType, inquiryType });

    return NextResponse.json({
      ok: true,
      message: isCollaboration
        ? "Message sent. Thanks - I will reply soon."
        : "Message sent. Thanks - I'll reply soon.",
    });
  } catch {
    return jsonError(500, "Unexpected server error.");
  }
}
