import "server-only";

import { headers } from "next/headers";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { keyedDigest } from "@/lib/admin/security-secret";

type AuthRateLimitKind = "login" | "password-reset" | "mfa";

type AuthRateLimitResult = {
  allowed: boolean;
  configured: boolean;
  retryAfterSeconds: number;
  auditMetadata: {
    accountKey: string;
    ipKey: string;
    rateLimitKind: AuthRateLimitKind;
  };
};

function getRedis() {
  const url =
    process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "";
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    process.env.KV_REST_API_TOKEN ||
    "";

  return url && token ? new Redis({ url, token }) : null;
}

function getClientIp(headerStore: Headers) {
  const forwardedFor = headerStore.get("x-forwarded-for")?.split(",")[0]?.trim();
  const candidate =
    headerStore.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
    forwardedFor ||
    headerStore.get("x-real-ip")?.trim() ||
    "unknown";

  return candidate.slice(0, 80);
}

function limitsFor(kind: AuthRateLimitKind) {
  if (kind === "password-reset") {
    return { account: 3, ip: 8, window: "1 h" as const };
  }

  if (kind === "mfa") {
    return { account: 8, ip: 20, window: "10 m" as const };
  }

  return { account: 5, ip: 12, window: "15 m" as const };
}

export async function enforceAuthRateLimit(
  kind: AuthRateLimitKind,
  accountIdentifier: string
): Promise<AuthRateLimitResult> {
  const headerStore = await headers();
  const accountKey = keyedDigest(
    "auth-rate-account",
    accountIdentifier.trim().toLowerCase()
  );
  const ipKey = keyedDigest("auth-rate-ip", getClientIp(headerStore));
  const auditMetadata = { accountKey, ipKey, rateLimitKind: kind };
  const redis = getRedis();

  if (!redis || !accountKey || !ipKey) {
    return {
      allowed: process.env.NODE_ENV !== "production",
      configured: false,
      retryAfterSeconds: 60,
      auditMetadata,
    };
  }

  const limits = limitsFor(kind);
  const accountLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limits.account, limits.window),
    prefix: `portfolio:admin-auth:${kind}:account`,
  });
  const ipLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limits.ip, limits.window),
    prefix: `portfolio:admin-auth:${kind}:ip`,
  });
  let accountResult;
  let ipResult;
  try {
    [accountResult, ipResult] = await Promise.all([
      accountLimiter.limit(accountKey),
      ipLimiter.limit(ipKey),
    ]);
  } catch {
    return {
      allowed: false,
      configured: true,
      retryAfterSeconds: 60,
      auditMetadata,
    };
  }
  const resetAt = Math.max(accountResult.reset, ipResult.reset);

  return {
    allowed: accountResult.success && ipResult.success,
    configured: true,
    retryAfterSeconds: Math.max(1, Math.ceil((resetAt - Date.now()) / 1000)),
    auditMetadata,
  };
}
