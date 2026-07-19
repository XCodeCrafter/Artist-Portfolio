import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";
import { z } from "zod";
import { writeAuditLog } from "@/lib/admin/audit";
import { createAdminServiceClient } from "@/lib/admin/service";

export const runtime = "nodejs";

const MAX_ANALYTICS_BYTES = 8 * 1024;
const BOT_USER_AGENT_PATTERN =
  /\b(curl|wget|python-requests|httpie|scrapy|go-http-client|java\/|libwww-perl|masscan|nikto|sqlmap|zgrab|headlesschrome)\b/i;

const AnalyticsEventSchema = z.object({
  eventName: z.enum(["page_view", "outbound_click", "booking_submit"]),
  pagePath: z.string().trim().max(300).default(""),
  targetLabel: z.string().trim().max(220).default(""),
  targetUrl: z.string().trim().max(1200).default(""),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
});

function isTrackablePath(path: string) {
  if (!path) return false;
  if (path.startsWith("/admin")) return false;
  if (path.startsWith("/api")) return false;
  return true;
}

function safeOrigin(value?: string | null) {
  if (!value) return "";

  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}

function sanitizeHeaderValue(value?: string | null) {
  return (value || "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[\u0000-\u001f\u007f]+/g, "")
    .trim()
    .slice(0, 220);
}

function getIp(req: Request) {
  const xf = req.headers.get("x-forwarded-for");
  const value = xf ? xf.split(",")[0] : req.headers.get("x-real-ip");
  const sanitized = (value || "0.0.0.0")
    .replace(/[^\w:.-]/g, "")
    .slice(0, 80)
    .trim();

  return sanitized || "0.0.0.0";
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

  for (const value of [
    process.env.SITE_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "",
  ]) {
    const origin = safeOrigin(value);
    if (origin) origins.add(origin);
  }

  if (process.env.NODE_ENV !== "production") {
    origins.add("http://localhost:3000");
    origins.add("http://127.0.0.1:3000");
  }

  return origins;
}

function hasAllowedOriginOrReferer(req: Request) {
  const origins = configuredOrigins(req);
  const origin = safeOrigin(req.headers.get("origin"));
  if (origin) return origins.has(origin);

  const refererOrigin = safeOrigin(req.headers.get("referer"));
  if (refererOrigin) return origins.has(refererOrigin);

  return false;
}

function getRequestMeta(req: Request) {
  const userAgent = req.headers.get("user-agent") || "";
  const referrer = req.headers.get("referer") || "";

  return {
    referrer: referrer.slice(0, 500),
    userAgent: userAgent.slice(0, 500),
  };
}

function hasRedisEnv() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

  return Boolean(url && token);
}

function shouldBlockUserAgent(userAgent: string) {
  const value = userAgent.trim();
  if (!value) return true;
  return BOT_USER_AGENT_PATTERN.test(value);
}

function sanitizeMetadata(metadata: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(metadata)
      .slice(0, 20)
      .map(([key, value]) => {
        const safeKey = key.replace(/[^\w:.-]/g, "").slice(0, 80) || "meta";
        if (
          typeof value === "string" ||
          typeof value === "number" ||
          typeof value === "boolean" ||
          value === null
        ) {
          return [
            safeKey,
            typeof value === "string" ? value.slice(0, 500) : value,
          ];
        }

        return [safeKey, String(value).slice(0, 500)];
      })
  );
}

async function readJsonWithLimit(req: Request) {
  const raw = await req.text().catch(() => "");
  const bytes = new TextEncoder().encode(raw).length;

  if (bytes > MAX_ANALYTICS_BYTES) {
    return {
      ok: false as const,
      action: "security_analytics_payload_too_large",
      metadata: { bytes },
    };
  }

  try {
    return { ok: true as const, body: JSON.parse(raw) as unknown };
  } catch {
    return {
      ok: false as const,
      action: "security_analytics_invalid_payload",
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
    recordId: "/api/analytics",
    metadata: {
      ip: getIp(req),
      userAgent: sanitizeHeaderValue(req.headers.get("user-agent")),
      origin: sanitizeHeaderValue(req.headers.get("origin")),
      referer: sanitizeHeaderValue(req.headers.get("referer")),
      ...metadata,
    },
  });
}

export async function POST(req: Request) {
  const contentLength = Number(req.headers.get("content-length") || "0");
  if (contentLength > MAX_ANALYTICS_BYTES) {
    await writeSecurityEvent(req, "security_analytics_payload_too_large", {
      contentLength,
    });
    return NextResponse.json({ ok: true });
  }

  if (!hasAllowedOriginOrReferer(req)) {
    await writeSecurityEvent(req, "security_analytics_bad_origin");
    return NextResponse.json({ ok: true });
  }

  const userAgent = req.headers.get("user-agent") || "";
  if (shouldBlockUserAgent(userAgent)) {
    await writeSecurityEvent(req, "security_analytics_suspicious_user_agent");
    return NextResponse.json({ ok: true });
  }

  const bodyResult = await readJsonWithLimit(req);
  if (!bodyResult.ok) {
    await writeSecurityEvent(req, bodyResult.action, bodyResult.metadata);
    return NextResponse.json({ ok: true });
  }

  const parsed = AnalyticsEventSchema.safeParse(bodyResult.body);

  if (!parsed.success) {
    await writeSecurityEvent(req, "security_analytics_invalid_payload", {
      fields: parsed.error.issues.map((issue) => issue.path.join(".")),
    });
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  if (!isTrackablePath(parsed.data.pagePath)) {
    return NextResponse.json({ ok: true });
  }

  const supabase = createAdminServiceClient();
  if (!supabase) {
    return NextResponse.json({ ok: true });
  }

  if (hasRedisEnv()) {
    try {
      const ratelimit = new Ratelimit({
        redis: Redis.fromEnv(),
        limiter: Ratelimit.slidingWindow(120, "1 m"),
        analytics: true,
        prefix: "rl:analytics",
      });
      const rl = await ratelimit.limit(`ip:${getIp(req)}`);

      if (!rl.success) {
        await writeSecurityEvent(req, "security_analytics_rate_limited", {
          limit: rl.limit,
          remaining: rl.remaining,
          reset: rl.reset,
        });
        return NextResponse.json({ ok: true });
      }
    } catch (error) {
      console.error("Analytics rate limiter unavailable", error);
    }
  }

  const { error } = await supabase.from("analytics_events").insert({
    event_name: parsed.data.eventName,
    page_path: parsed.data.pagePath,
    target_label: parsed.data.targetLabel,
    target_url: parsed.data.targetUrl,
    metadata: {
      ...sanitizeMetadata(parsed.data.metadata),
      ...getRequestMeta(req),
    },
  });

  if (error) {
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true });
}
