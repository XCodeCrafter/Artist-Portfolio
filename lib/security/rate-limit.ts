import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminServiceClient } from "@/lib/admin/service";

export type DatabaseRateLimitResult = {
  allowed: boolean;
  configured: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
};

type DatabaseRateLimitInput = {
  bucket: string;
  identifierHash: string;
  limit: number;
  windowSeconds: number;
};

type RateLimitRow = {
  allowed?: unknown;
  remaining?: unknown;
  retry_after_seconds?: unknown;
};

const READINESS_IDENTIFIER_HASH = "0".repeat(64);

function unavailableResult(limit: number, configured: boolean) {
  return {
    allowed: process.env.NODE_ENV !== "production",
    configured,
    limit,
    remaining: 0,
    retryAfterSeconds: 60,
  } satisfies DatabaseRateLimitResult;
}

function isValidInput(input: DatabaseRateLimitInput) {
  return (
    /^[a-z0-9:_-]{1,120}$/.test(input.bucket) &&
    /^[0-9a-f]{64}$/.test(input.identifierHash) &&
    Number.isInteger(input.limit) &&
    input.limit > 0 &&
    input.limit <= 10_000 &&
    Number.isInteger(input.windowSeconds) &&
    input.windowSeconds > 0 &&
    input.windowSeconds <= 7 * 24 * 60 * 60
  );
}

/**
 * Consumes an atomic, shared rate-limit slot in Supabase PostgreSQL.
 * The RPC is server-only and accepts pseudonymous HMAC identifiers only.
 */
export async function consumeDatabaseRateLimit(
  input: DatabaseRateLimitInput
): Promise<DatabaseRateLimitResult> {
  if (!isValidInput(input)) {
    return unavailableResult(input.limit, false);
  }

  const supabase = createAdminServiceClient();
  if (!supabase) {
    return unavailableResult(input.limit, false);
  }

  try {
    const { data, error } = await supabase.rpc("consume_security_rate_limit", {
      p_bucket: input.bucket,
      p_identifier_hash: input.identifierHash,
      p_limit: input.limit,
      p_window_seconds: input.windowSeconds,
    });

    if (error) {
      const missingSchema = ["PGRST202", "42883", "42P01"].includes(
        error.code || ""
      );
      return unavailableResult(input.limit, !missingSchema);
    }

    const row = (Array.isArray(data) ? data[0] : data) as RateLimitRow | null;
    if (
      !row ||
      typeof row.allowed !== "boolean" ||
      typeof row.remaining !== "number" ||
      typeof row.retry_after_seconds !== "number"
    ) {
      return unavailableResult(input.limit, true);
    }

    return {
      allowed: row.allowed,
      configured: true,
      limit: input.limit,
      remaining: Math.max(0, Math.trunc(row.remaining)),
      retryAfterSeconds: Math.max(1, Math.trunc(row.retry_after_seconds)),
    };
  } catch {
    return unavailableResult(input.limit, true);
  }
}

/** Verifies that the protected RPC and its backing table are both usable. */
export async function probeDatabaseRateLimit(
  client?: SupabaseClient | null
): Promise<boolean> {
  const supabase = client || createAdminServiceClient();
  if (!supabase) return false;

  try {
    const { data, error } = await supabase.rpc("consume_security_rate_limit", {
      p_bucket: "system:readiness",
      p_identifier_hash: READINESS_IDENTIFIER_HASH,
      p_limit: 10_000,
      p_window_seconds: 60,
    });
    if (error) return false;

    const row = (Array.isArray(data) ? data[0] : data) as RateLimitRow | null;
    return (
      Boolean(row) &&
      typeof row?.allowed === "boolean" &&
      typeof row?.remaining === "number" &&
      typeof row?.retry_after_seconds === "number"
    );
  } catch {
    return false;
  }
}
