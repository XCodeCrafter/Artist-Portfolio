import { NextResponse } from "next/server";
import { z } from "zod";
import { writeAuditLog } from "@/lib/admin/audit";
import { keyedDigest } from "@/lib/admin/security-secret";
import { createAdminServiceClient } from "@/lib/admin/service";
import { readJsonBodyWithLimit } from "@/lib/security/json-body";
import { hasAllowedRequestOrigin } from "@/lib/security/origin";
import {
  getClientIp,
  getPseudonymousIpKey,
  getReferrerWithoutQuery,
} from "@/lib/security/request";
import { consumeDatabaseRateLimit } from "@/lib/security/rate-limit";

export const runtime = "nodejs";

const MAX_ANALYTICS_BYTES = 8 * 1024;
const BOT_USER_AGENT_PATTERN =
  /\b(curl|wget|python-requests|httpie|scrapy|go-http-client|java\/|libwww-perl|masscan|nikto|sqlmap|zgrab|headlesschrome)\b/i;

const PUBLIC_PAGE_PATHS = [
  "/",
  "/bio",
  "/booking",
  "/gallery",
  "/music",
  "/privacy",
  "/terms",
  "/video",
] as const;

const PublicPagePathSchema = z.enum(PUBLIC_PAGE_PATHS);
const PageViewMetadataSchema = z
  .object({
    title: z.string().trim().max(300).optional(),
  })
  .strict()
  .optional()
  .default({});
const EmptyMetadataSchema = z.object({}).strict().optional().default({});

function isSafeHttpsUrl(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

const SafeHttpsUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(1200)
  .refine(isSafeHttpsUrl)
  // Destination origin is sufficient for aggregate analytics and avoids
  // retaining query strings or fragments that may contain user data.
  .transform((value) => new URL(value).origin);

const AnalyticsEventSchema = z.discriminatedUnion("eventName", [
  z.object({
    eventName: z.literal("page_view"),
    pagePath: PublicPagePathSchema,
    targetLabel: z.literal("").optional().default(""),
    targetUrl: z.literal("").optional().default(""),
    metadata: PageViewMetadataSchema,
  }),
  z.object({
    eventName: z.literal("outbound_click"),
    pagePath: PublicPagePathSchema,
    targetLabel: z.string().trim().max(220).optional().default(""),
    targetUrl: SafeHttpsUrlSchema,
    metadata: EmptyMetadataSchema,
  }),
]);

function sanitizeHeaderValue(value?: string | null) {
  return (value || "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[\u0000-\u001f\u007f]+/g, "")
    .trim()
    .slice(0, 220);
}

function getRequestMeta(req: Request) {
  const userAgent = req.headers.get("user-agent") || "";

  return {
    referrer: getReferrerWithoutQuery(req.headers),
    userAgent: userAgent.slice(0, 500),
  };
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
    recordId: "/api/analytics",
    metadata: {
      ipKey: getPseudonymousIpKey(req.headers),
      userAgent: sanitizeHeaderValue(req.headers.get("user-agent")),
      origin: sanitizeHeaderValue(req.headers.get("origin")),
      referer: sanitizeHeaderValue(getReferrerWithoutQuery(req.headers)),
      ...metadata,
    },
  });
}

export async function POST(req: Request) {
  const ipKey = keyedDigest("public-rate-ip", getClientIp(req.headers));
  const admissionLimit = await consumeDatabaseRateLimit({
    bucket: "public:analytics:ip",
    identifierHash: ipKey,
    limit: 120,
    windowSeconds: 60,
  });

  if (!admissionLimit.allowed) {
    if (admissionLimit.firstDenied) {
      await writeSecurityEvent(req, "security_analytics_rate_limited", {
        bucket: "admission",
        limit: admissionLimit.limit,
        retryAfterSeconds: admissionLimit.retryAfterSeconds,
      });
    }
    return NextResponse.json({ ok: true });
  }

  if (!hasAllowedRequestOrigin(req.headers)) {
    await writeSecurityEvent(req, "security_analytics_bad_origin");
    return NextResponse.json({ ok: true });
  }

  const userAgent = req.headers.get("user-agent") || "";
  if (shouldBlockUserAgent(userAgent)) {
    await writeSecurityEvent(req, "security_analytics_suspicious_user_agent");
    return NextResponse.json({ ok: true });
  }

  const bodyResult = await readJsonBodyWithLimit(req, MAX_ANALYTICS_BYTES);
  if (!bodyResult.ok) {
    await writeSecurityEvent(
      req,
      bodyResult.code === "payload-too-large"
        ? "security_analytics_payload_too_large"
        : "security_analytics_invalid_payload",
      {
        bytes: bodyResult.bytes,
        reason: bodyResult.code,
        ...(bodyResult.declaredLength === undefined
          ? {}
          : { declaredLength: bodyResult.declaredLength }),
      }
    );
    return NextResponse.json({ ok: true });
  }

  const parsed = AnalyticsEventSchema.safeParse(bodyResult.body);

  if (!parsed.success) {
    await writeSecurityEvent(req, "security_analytics_invalid_payload", {
      fields: parsed.error.issues.map((issue) => issue.path.join(".")),
    });
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const supabase = createAdminServiceClient();
  if (!supabase) {
    return NextResponse.json({ ok: true });
  }

  const clientMetadata =
    parsed.data.eventName === "page_view" && parsed.data.metadata.title
      ? { title: parsed.data.metadata.title }
      : {};

  const { error } = await supabase.from("analytics_events").insert({
    event_name: parsed.data.eventName,
    page_path: parsed.data.pagePath,
    target_label: parsed.data.targetLabel,
    target_url: parsed.data.targetUrl,
    metadata: {
      ...clientMetadata,
      ...getRequestMeta(req),
    },
  });

  if (error) {
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true });
}
