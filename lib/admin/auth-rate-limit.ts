import "server-only";

import { headers } from "next/headers";
import { keyedDigest } from "@/lib/admin/security-secret";
import { getClientIp } from "@/lib/security/request";
import { consumeDatabaseRateLimit } from "@/lib/security/rate-limit";

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

function limitsFor(kind: AuthRateLimitKind) {
  if (kind === "password-reset") {
    return { account: 3, ip: 8, windowSeconds: 60 * 60 };
  }

  if (kind === "mfa") {
    return { account: 8, ip: 20, windowSeconds: 10 * 60 };
  }

  return { account: 5, ip: 12, windowSeconds: 15 * 60 };
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

  if (!accountKey || !ipKey) {
    return {
      allowed: process.env.NODE_ENV !== "production",
      configured: false,
      retryAfterSeconds: 60,
      auditMetadata,
    };
  }

  const limits = limitsFor(kind);
  const [accountResult, ipResult] = await Promise.all([
    consumeDatabaseRateLimit({
      bucket: `admin-auth:${kind}:account`,
      identifierHash: accountKey,
      limit: limits.account,
      windowSeconds: limits.windowSeconds,
    }),
    consumeDatabaseRateLimit({
      bucket: `admin-auth:${kind}:ip`,
      identifierHash: ipKey,
      limit: limits.ip,
      windowSeconds: limits.windowSeconds,
    }),
  ]);

  return {
    allowed: accountResult.allowed && ipResult.allowed,
    configured: accountResult.configured && ipResult.configured,
    retryAfterSeconds: Math.max(
      accountResult.retryAfterSeconds,
      ipResult.retryAfterSeconds
    ),
    auditMetadata,
  };
}
