import "server-only";

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { createAdminServiceClient } from "@/lib/admin/service";
import {
  hasAuthSecuritySecret,
  keyedDigest,
} from "@/lib/admin/security-secret";
import { createClient } from "@/lib/supabase/server";

const RECOVERY_TTL_SECONDS = 10 * 60;
const RECOVERY_COOKIE =
  process.env.NODE_ENV === "production"
    ? "__Host-admin-recovery"
    : "admin-recovery";

function recoveryCookieOptions() {
  return {
    httpOnly: true,
    maxAge: RECOVERY_TTL_SECONDS,
    path: "/",
    // The recovery callback is reached through a top-level navigation from the
    // Supabase Auth domain. Strict cookies can be withheld on the immediate
    // same-origin redirect that follows that cross-site navigation, making a
    // freshly issued challenge look invalid. Lax permits that safe GET flow;
    // the cookie remains HttpOnly, Secure in production, short-lived,
    // one-time, and bound to the matching Supabase session in the database.
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };
}

function tokenDigest(token: string) {
  return keyedDigest("admin-recovery-token", token);
}

function getSessionId(accessToken: string) {
  try {
    const payload = accessToken.split(".")[1];
    if (!payload) return "";
    const claims = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    ) as { session_id?: unknown };
    return typeof claims.session_id === "string" ? claims.session_id : "";
  } catch {
    return "";
  }
}

function sessionDigest(accessToken: string) {
  const sessionId = getSessionId(accessToken);
  return sessionId ? keyedDigest("admin-recovery-session", sessionId) : "";
}

export async function issueAdminRecoveryChallenge(
  userId: string,
  accessToken: string
) {
  const supabase = createAdminServiceClient();
  if (!supabase || !hasAuthSecuritySecret()) return false;

  const token = randomBytes(32).toString("base64url");
  const tokenHash = tokenDigest(token);
  const sessionHash = sessionDigest(accessToken);
  if (!tokenHash || !sessionHash) return false;

  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + RECOVERY_TTL_SECONDS * 1000
  ).toISOString();

  await supabase
    .from("admin_recovery_challenges")
    .delete()
    .lt("expires_at", now.toISOString());

  const { error } = await supabase.from("admin_recovery_challenges").insert({
    user_id: userId,
    token_hash: tokenHash,
    session_hash: sessionHash,
    expires_at: expiresAt,
  });

  if (error) return false;

  const cookieStore = await cookies();
  cookieStore.set(RECOVERY_COOKIE, token, recoveryCookieOptions());
  return true;
}

async function getChallengeLookup(userId: string) {
  const cookieStore = await cookies();
  const token = cookieStore.get(RECOVERY_COOKIE)?.value || "";
  if (!token || !hasAuthSecuritySecret()) return null;

  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) return null;

  const tokenHash = tokenDigest(token);
  const sessionHash = sessionDigest(session.access_token);
  if (!tokenHash || !sessionHash) return null;

  return { sessionHash, tokenHash, userId };
}

export async function hasValidAdminRecoveryChallenge(userId: string) {
  const lookup = await getChallengeLookup(userId);
  const supabase = createAdminServiceClient();
  if (!lookup || !supabase) return false;

  const { data, error } = await supabase
    .from("admin_recovery_challenges")
    .select("id")
    .eq("user_id", lookup.userId)
    .eq("token_hash", lookup.tokenHash)
    .eq("session_hash", lookup.sessionHash)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .limit(1)
    .maybeSingle<{ id: string }>();

  return !error && Boolean(data);
}

export async function consumeAdminRecoveryChallenge(userId: string) {
  const lookup = await getChallengeLookup(userId);
  const supabase = createAdminServiceClient();
  if (!lookup || !supabase) return false;

  const { data, error } = await supabase
    .from("admin_recovery_challenges")
    .update({ used_at: new Date().toISOString() })
    .eq("user_id", lookup.userId)
    .eq("token_hash", lookup.tokenHash)
    .eq("session_hash", lookup.sessionHash)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("id")
    .limit(1)
    .maybeSingle<{ id: string }>();

  await clearAdminRecoveryChallenge();
  return !error && Boolean(data);
}

export async function clearAdminRecoveryChallenge() {
  const cookieStore = await cookies();
  cookieStore.set(RECOVERY_COOKIE, "", {
    ...recoveryCookieOptions(),
    maxAge: 0,
  });
}
