import "server-only";

import { headers } from "next/headers";
import { keyedDigest } from "@/lib/admin/security-secret";
import { getClientIp } from "@/lib/security/request";
import { consumeDatabaseRateLimit } from "@/lib/security/rate-limit";

type AuthRateLimitKind = "login" | "password-reset" | "mfa";

type AuthRateLimitResult = {
  allowed: boolean;
  configured: boolean;
  firstDenied: boolean;
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
      firstDenied: false,
      retryAfterSeconds: 60,
      auditMetadata,
    };
  }

  const limits = limitsFor(kind);
  const ipResult = await consumeDatabaseRateLimit({
    bucket: `admin-auth:${kind}:ip`,
    identifierHash: ipKey,
    limit: limits.ip,
    windowSeconds: limits.windowSeconds,
  });

  // The IP bucket is the admission gate. Do not create unbounded account rows
  // for rotating email addresses after that source has already been denied.
  if (!ipResult.allowed) {
    return {
      allowed: false,
      configured: ipResult.configured,
      firstDenied: ipResult.firstDenied,
      retryAfterSeconds: ipResult.retryAfterSeconds,
      auditMetadata,
    };
  }

  const accountResult = await consumeDatabaseRateLimit({
    bucket: `admin-auth:${kind}:account`,
    identifierHash: accountKey,
    limit: limits.account,
    windowSeconds: limits.windowSeconds,
  });

  return {
    allowed: accountResult.allowed && ipResult.allowed,
    configured: accountResult.configured && ipResult.configured,
    firstDenied: accountResult.firstDenied,
    retryAfterSeconds: Math.max(
      accountResult.retryAfterSeconds,
      ipResult.retryAfterSeconds
    ),
    auditMetadata,
  };
}
