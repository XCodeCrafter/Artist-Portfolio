import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminServiceClient } from "@/lib/admin/service";

export function isAdminIdentityUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function isMissingAdminHardeningRpc(
  error: { code?: string; message?: string } | null,
  functionName: "is_admin_session_active" | "issue_admin_recovery_challenge"
) {
  if (error?.code === "PGRST202") return true;
  // An undefined helper inside an installed RPC is a real backend failure.
  return error?.code === "42883" &&
    Boolean(error.message?.includes(`function public.${functionName}(`)) &&
    Boolean(error.message?.includes("does not exist"));
}

/**
 * Claims must already have been signature-verified by the caller. Only a missing
 * 0038 RPC retains the previous JWT behavior while the migration is pending;
 * database failures and unexpected responses deny access.
 */
export async function isAdminSessionActive(userId: string, sessionId: string) {
  if (!isAdminIdentityUuid(userId) || !isAdminIdentityUuid(sessionId)) return false;
  const supabase = createAdminServiceClient();
  if (!supabase) return process.env.NODE_ENV !== "production";

  try {
    const { data, error } = await supabase.rpc("is_admin_session_active", {
      p_user_id: userId,
      p_session_id: sessionId,
    });
    if (isMissingAdminHardeningRpc(error, "is_admin_session_active")) return true;
    return !error && data === true;
  } catch {
    return false;
  }
}

/** Read-only readiness check; never enumerates or mutates real sessions. */
export async function probeAdminSessionBoundary(client?: SupabaseClient | null) {
  const supabase = client || createAdminServiceClient();
  if (!supabase) return false;
  try {
    const { data, error } = await supabase.rpc("is_admin_session_active", {
      p_user_id: "00000000-0000-4000-8000-000000000000",
      p_session_id: "00000000-0000-4000-8000-000000000000",
    });
    return !error && typeof data === "boolean";
  } catch {
    return false;
  }
}
