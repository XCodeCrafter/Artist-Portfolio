import { Resend } from "resend";
import { NextResponse } from "next/server";
import { z } from "zod";
import { writeAuditLog } from "@/lib/admin/audit";
import { keyedDigest } from "@/lib/admin/security-secret";
import { createAdminServiceClient } from "@/lib/admin/service";
import { normalizePortfolioType } from "@/lib/content/profile";
import { getClientIp, getPseudonymousIpKey } from "@/lib/security/request";
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

function safeOrigin(value?: string | null) {
  if (!value) return "";

  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}

function configuredOrigins(req: Request) {
  const origins = new Set<string>();
  const host = req.headers.get("host");
  const forwardedProto = req.headers.get("x-forwarded-proto");
  const protocol =
    forwardedProto || (host?.startsWith("localhost") ? "http" : "https");

  if (host) {
    origins.add(`${protocol}://${host}`);
  }

  const envOrigins = [
    process.env.SITE_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "",
  ];

  for (const origin of envOrigins) {
    const parsed = safeOrigin(origin);
    if (parsed) origins.add(parsed);
  }

  if (process.env.NODE_ENV !== "production") {
    origins.add("http://localhost:3000");
    origins.add("http://127.0.0.1:3000");
  }

  return origins;
}

function hasAllowedOrigin(req: Request) {
  const origin = safeOrigin(req.headers.get("origin"));
  const refererOrigin = safeOrigin(req.headers.get("referer"));
  const candidate = origin || refererOrigin;

  return Boolean(candidate && configuredOrigins(req).has(candidate));
}

function getUserAgent(req: Request) {
  return (req.headers.get("user-agent") || "").slice(0, 500);
}

function shouldBlockUserAgent(userAgent: string) {
  const value = userAgent.trim();
  if (!value) return true;
  return BOT_USER_AGENT_PATTERN.test(value);
}

async function readJsonWithLimit(req: Request) {
  const raw = await req.text().catch(() => "");
  const bytes = new TextEncoder().encode(raw).length;

  if (bytes > MAX_REQUEST_BYTES) {
    return {
      ok: false as const,
      status: 413,
      error: "Payload is too large.",
      action: "security_contact_payload_too_large",
      metadata: { bytes },
    };
  }

  try {
    return { ok: true as const, body: JSON.parse(raw) as unknown, bytes };
  } catch {
    return {
      ok: false as const,
      status: 400,
      error: "Invalid payload.",
      action: "security_contact_invalid_payload",
      metadata: { bytes },
    };
  }
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
      referer: sanitizeHeaderValue(req.headers.get("referer") || ""),
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
    const contentLength = Number(req.headers.get("content-length") || "0");
    if (contentLength > MAX_REQUEST_BYTES) {
      await writeSecurityEvent(req, "security_contact_payload_too_large", {
        contentLength,
      });
      return jsonError(413, "Payload is too large.");
    }

    if (!hasAllowedOrigin(req)) {
      await writeSecurityEvent(req, "security_contact_bad_origin");
      return jsonError(403, "Request origin is not allowed.");
    }

    const bodyResult = await readJsonWithLimit(req);
    if (!bodyResult.ok) {
      await writeSecurityEvent(req, bodyResult.action, bodyResult.metadata);
      return jsonError(bodyResult.status, bodyResult.error);
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

    const ipKey = keyedDigest("public-rate-ip", getClientIp(req.headers));
    const rateLimit = await consumeDatabaseRateLimit({
      bucket: "public:booking:ip",
      identifierHash: ipKey,
      limit: 5,
      windowSeconds: 60,
    });

    if (!rateLimit.allowed) {
      await writeSecurityEvent(req, "security_contact_rate_limited", {
        configured: rateLimit.configured,
        limit: rateLimit.limit,
        remaining: rateLimit.remaining,
        retryAfterSeconds: rateLimit.retryAfterSeconds,
        portfolioType,
        inquiryType,
      });

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
        recordId: email,
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
