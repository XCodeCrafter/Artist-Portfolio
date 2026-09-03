import { randomUUID } from "node:crypto";
import { Resend } from "resend";
import { NextResponse } from "next/server";
import { z } from "zod";
import { writeAuditLog } from "@/lib/admin/audit";
import { keyedDigest } from "@/lib/admin/security-secret";
import { createAdminServiceClient } from "@/lib/admin/service";
import { normalizePortfolioType } from "@/lib/content/profile";
import {
  getInquiryIntentLabel,
  getLegacyInquiryClassification,
  INQUIRY_INTENTS,
  resolvePublicInquiryIntent,
  type InquiryIntent,
  type LegacyInquiryType,
} from "@/lib/inquiries";
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
  inquiryIntent: z.enum(INQUIRY_INTENTS).optional(),
  portfolioType: z.enum(["musician", "actor"]).optional(),
  inquiryType: z.enum(["booking", "collaboration"]).optional(),
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

async function getConfiguredPortfolioType(): Promise<PortfolioType> {
  const supabase = createAdminServiceClient();
  if (!supabase) return "actor";

  const { data, error } = await supabase
    .from("site_settings")
    .select("portfolio_type")
    .eq("id", "main")
    .limit(1)
    .maybeSingle<{ portfolio_type?: string | null }>();

  if (error || !data) return "actor";

  return normalizePortfolioType(data.portfolio_type);
}

async function writeBookingInquiry(input: {
  name: string;
  email: string;
  message: string;
  portfolioType: PortfolioType;
  inquiryType: LegacyInquiryType;
  inquiryIntent: InquiryIntent;
  ipKey: string;
  userAgent: string;
}): Promise<
  | { ok: true; id: string }
  | { ok: false; reason: "insert-failed" | "not-configured" }
> {
  const supabase = createAdminServiceClient();
  if (!supabase) return { ok: false, reason: "not-configured" };

  const row = {
    name: input.name,
    email: input.email,
    message: input.message,
    portfolio_type: input.portfolioType,
    inquiry_type: input.inquiryType,
    inquiry_intent: input.inquiryIntent,
    status: "new",
    source_ip: input.ipKey,
    user_agent: input.userAgent,
  };

  const result = await supabase
    .from("booking_inquiries")
    .insert({ ...row, email_status: "pending" })
    .select("id")
    .limit(1)
    .maybeSingle<{ id: string }>();

  const missingIntentColumn =
    Boolean(result.error) &&
    ["42703", "PGRST204"].includes(result.error?.code || "") &&
    result.error?.message.toLowerCase().includes("inquiry_intent");

  if (missingIntentColumn) {
    const fallbackResult = await supabase
      .from("booking_inquiries")
      .insert({
        name: input.name,
        email: input.email,
        message: input.message,
        portfolio_type: input.portfolioType,
        inquiry_type: input.inquiryType,
        status: "new",
        source_ip: input.ipKey,
        user_agent: input.userAgent,
        email_status: "pending",
      })
      .select("id")
      .limit(1)
      .maybeSingle<{ id: string }>();

    if (fallbackResult.error) {
      console.error(fallbackResult.error);
      return { ok: false, reason: "insert-failed" };
    }
    return fallbackResult.data?.id
      ? { ok: true, id: fallbackResult.data.id }
      : { ok: false, reason: "insert-failed" };
  } else if (result.error) {
    console.error(result.error);
    return { ok: false, reason: "insert-failed" };
  }

  return result.data?.id
    ? { ok: true, id: result.data.id }
    : { ok: false, reason: "insert-failed" };
}

async function updateInquiryEmailStatus(
  inquiryId: string | null,
  status:
    | "sent"
    | "delivered"
    | "delayed"
    | "bounced"
    | "complained"
    | "failed"
    | "suppressed",
  resendEmailId?: string
): Promise<
  | { ok: true }
  | {
      ok: false;
      reason:
        | "inquiry-unavailable"
        | "migration-required"
        | "not-configured"
        | "provider-id-missing"
        | "update-failed";
      errorCode?: string;
    }
> {
  if (!inquiryId) return { ok: false, reason: "inquiry-unavailable" };
  const supabase = createAdminServiceClient();
  if (!supabase) return { ok: false, reason: "not-configured" };
  const providerIdMissing = status === "sent" && !resendEmailId;

  const result = await supabase
    .from("booking_inquiries")
    .update({
      email_status: status,
      email_status_changed_at: new Date().toISOString(),
      ...(resendEmailId ? { resend_email_id: resendEmailId } : {}),
    })
    .eq("id", inquiryId)
    .select("id")
    .limit(1)
    .maybeSingle<{ id: string }>();

  if (result.error) {
    const message = result.error.message.toLowerCase();
    const migrationRequired =
      message.includes("email_status") ||
      message.includes("resend_email_id") ||
      ["42703", "PGRST204", "PGRST205"].includes(result.error.code || "");

    console.error(result.error);
    return {
      ok: false,
      reason: migrationRequired ? "migration-required" : "update-failed",
      errorCode: result.error.code || undefined,
    };
  }

  if (!result.data?.id) return { ok: false, reason: "update-failed" };
  return providerIdMissing
    ? { ok: false, reason: "provider-id-missing" }
    : { ok: true };
}

async function updateInquiryEmailTracking(input: {
  inquiryId: string | null;
  email: string;
  portfolioType: PortfolioType;
  inquiryType: LegacyInquiryType;
  inquiryIntent: InquiryIntent;
  status:
    | "sent"
    | "delivered"
    | "delayed"
    | "bounced"
    | "complained"
    | "failed"
    | "suppressed";
  resendEmailId?: string;
}) {
  const trackingResult = await updateInquiryEmailStatus(
    input.inquiryId,
    input.status,
    input.resendEmailId
  );

  if (!trackingResult.ok) {
    await writeAuditLog({
      action: "booking_email_tracking_failed",
      tableName: "booking_inquiries",
      recordId:
        input.inquiryId ||
        keyedDigest("booking-email-record", input.email) ||
        randomUUID(),
      metadata: {
        portfolioType: input.portfolioType,
        inquiryType: input.inquiryType,
        inquiryIntent: input.inquiryIntent,
        provider: "resend",
        status: input.status,
        reason: trackingResult.reason,
        ...(trackingResult.errorCode
          ? { errorCode: trackingResult.errorCode }
          : {}),
      },
    });
  }

  return trackingResult;
}

async function writeBookingAnalytics(input: {
  userAgent: string;
  portfolioType: PortfolioType;
  inquiryType: LegacyInquiryType;
  inquiryIntent: InquiryIntent;
}) {
  const supabase = createAdminServiceClient();
  if (!supabase) return;

  const deviceCategory = /tablet|ipad/i.test(input.userAgent)
    ? "Tablet"
    : /mobile|iphone|android/i.test(input.userAgent)
      ? "Mobile"
      : "Desktop";

  await supabase.from("analytics_events").insert({
    event_name: "booking_submit",
    page_path: "/booking",
    target_label: `${getInquiryIntentLabel(input.inquiryIntent)} inquiry form`,
    target_url: "",
    metadata: {
      portfolioType: input.portfolioType,
      inquiryType: input.inquiryType,
      inquiryIntent: input.inquiryIntent,
      deviceCategory,
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
    const configuredPortfolioType = await getConfiguredPortfolioType();
    const inquiryIntent = resolvePublicInquiryIntent({
      inquiryIntent: parsed.data.inquiryIntent,
      inquiryType: parsed.data.inquiryType,
      portfolioType: parsed.data.portfolioType,
    });
    const { portfolioType, inquiryType } = getLegacyInquiryClassification(
      inquiryIntent,
      configuredPortfolioType
    );

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
        inquiryIntent,
      });
      return NextResponse.json({ ok: true, message: "Thanks!" });
    }

    const elapsed = Date.now() - startedAt;
    if (elapsed < MIN_FORM_ELAPSED_MS) {
      await writeSecurityEvent(req, "security_contact_too_fast", {
        elapsed,
        portfolioType,
        inquiryType,
        inquiryIntent,
      });
      return NextResponse.json({ ok: true, message: "Thanks!" });
    }

    const userAgent = getUserAgent(req);
    if (shouldBlockUserAgent(userAgent)) {
      await writeSecurityEvent(req, "security_contact_suspicious_user_agent", {
        portfolioType,
        inquiryType,
        inquiryIntent,
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

    const inquiry = await writeBookingInquiry({
      name,
      email,
      message,
      portfolioType,
      inquiryType,
      inquiryIntent,
      ipKey,
      userAgent,
    });
    const inquiryId = inquiry.ok ? inquiry.id : null;

    if (!inquiry.ok) {
      await writeAuditLog({
        action: "booking_inquiry_persistence_failed",
        tableName: "booking_inquiries",
        recordId: keyedDigest("booking-inquiry-record", email) || randomUUID(),
        metadata: {
          portfolioType,
          inquiryType,
          inquiryIntent,
          reason: inquiry.reason,
        },
      });
    }

    const apiKey = process.env.RESEND_API_KEY;
    const to = process.env.BOOKING_TO_EMAIL;
    const from = process.env.BOOKING_FROM_EMAIL;

    if (!apiKey || !to || !from) {
      await updateInquiryEmailTracking({
        inquiryId,
        email,
        portfolioType,
        inquiryType,
        inquiryIntent,
        status: "failed",
      });
      await writeAuditLog({
        action: "booking_email_failed",
        tableName: "booking_inquiries",
        recordId:
          inquiryId || keyedDigest("booking-email-record", email) || randomUUID(),
        metadata: {
          portfolioType,
          inquiryType,
          inquiryIntent,
          provider: "resend",
          reason: "not-configured",
        },
      });

      if (!inquiry.ok) {
        return jsonError(
          503,
          "Message could not be saved or sent. Please try again later."
        );
      }

      await writeBookingAnalytics({
        userAgent,
        portfolioType,
        inquiryType,
        inquiryIntent,
      });
      return NextResponse.json(
        {
          ok: true,
          message:
            "Message received. Email notification is temporarily unavailable, but it is saved in the inbox.",
        },
        { status: 202 }
      );
    }

    const resend = new Resend(apiKey);

    const safeName = sanitizeHeaderValue(name) || "Unknown sender";
    const intentLabel = getInquiryIntentLabel(inquiryIntent);
    const subject = `New ${intentLabel.toLowerCase()} inquiry - ${safeName}`;
    const text = [
      `New ${intentLabel.toLowerCase()} inquiry`,
      "",
      `Intent: ${intentLabel}`,
      `Legacy portfolio snapshot: ${portfolioType}`,
      `Legacy inquiry type: ${inquiryType}`,
      "",
      `Name: ${name}`,
      `Email: ${email}`,
      "",
      "Message:",
      message,
      "",
      `Time: ${new Date().toISOString()}`,
    ].join("\n");

    let emailResult: Awaited<ReturnType<Resend["emails"]["send"]>>;
    try {
      emailResult = await resend.emails.send({
        from,
        to,
        replyTo: email,
        subject,
        text,
      });
    } catch (error) {
      console.error(error);
      await updateInquiryEmailTracking({
        inquiryId,
        email,
        portfolioType,
        inquiryType,
        inquiryIntent,
        status: "failed",
      });
      await writeAuditLog({
        action: "booking_email_failed",
        tableName: "booking_inquiries",
        recordId:
          inquiryId || keyedDigest("booking-email-record", email) || randomUUID(),
        metadata: {
          portfolioType,
          inquiryType,
          inquiryIntent,
          provider: "resend",
          reason: "provider-request-failed",
        },
      });
      return jsonError(
        502,
        inquiry.ok
          ? "Message was saved, but email delivery failed."
          : "Message could not be saved or sent. Please try again later."
      );
    }

    if (emailResult.error) {
      console.error(emailResult.error);
      await updateInquiryEmailTracking({
        inquiryId,
        email,
        portfolioType,
        inquiryType,
        inquiryIntent,
        status: "failed",
      });
      await writeAuditLog({
        action: "booking_email_failed",
        tableName: "booking_inquiries",
        recordId:
          inquiryId || keyedDigest("booking-email-record", email) || randomUUID(),
        metadata: {
          portfolioType,
          inquiryType,
          inquiryIntent,
          provider: "resend",
          reason: "provider-rejected",
        },
      });
      return jsonError(
        502,
        inquiry.ok
          ? "Message was saved, but email delivery failed."
          : "Message could not be saved or sent. Please try again later."
      );
    }

    await updateInquiryEmailTracking({
      inquiryId,
      email,
      portfolioType,
      inquiryType,
      inquiryIntent,
      status: "sent",
      resendEmailId: emailResult.data?.id,
    });

    await writeBookingAnalytics({
      userAgent,
      portfolioType,
      inquiryType,
      inquiryIntent,
    });

    return NextResponse.json({
      ok: true,
      message: "Message sent. Thanks - I will reply soon.",
    });
  } catch {
    return jsonError(500, "Unexpected server error.");
  }
}
