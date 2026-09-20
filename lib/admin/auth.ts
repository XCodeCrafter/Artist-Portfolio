import { redirect } from "next/navigation";
import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import {
  createAdminServiceClient,
  hasAdminServiceEnv,
} from "@/lib/admin/service";
import { hasSupabaseBrowserEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { isAdminSessionActive } from "@/lib/admin/session-security";

export type AdminRole = "admin" | "owner";

export type AdminUser = {
  id: string;
  email: string;
  role: AdminRole;
  hasActiveProfile: boolean;
};

type AdminProfileRow = {
  user_id: string;
  email: string;
  role: AdminRole;
  is_active: boolean;
};

export function getAllowedAdminEmails() {
  return (
    (process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );
}

function getAllowedAdminEmailSet() {
  return new Set(getAllowedAdminEmails());
}

export function isAdminEmailAllowed(email?: string | null) {
  const normalizedEmail = email?.toLowerCase();
  if (!normalizedEmail) return false;

  const allowedEmails = getAllowedAdminEmailSet();
  if (allowedEmails.size === 0) return false;

  return allowedEmails.has(normalizedEmail);
}

function requiresAdminProfile() {
  return process.env.NODE_ENV === "production";
}

async function getActiveAdminProfile(user: User): Promise<AdminProfileRow | null> {
  const supabase = createAdminServiceClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("admin_profiles")
    .select("user_id, email, role, is_active")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle<AdminProfileRow>();

  if (error || !data) return null;

  const userEmail = user.email?.toLowerCase();
  const profileEmail = data.email.toLowerCase();

  if (!userEmail || userEmail !== profileEmail) {
    return null;
  }

  return data;
}

export async function isAdminEmailApproved(email?: string | null) {
  const normalizedEmail = email?.trim().toLowerCase();
  if (!normalizedEmail) return false;

  const supabase = createAdminServiceClient();
  if (supabase) {
    const { data, error } = await supabase
      .from("admin_profiles")
      .select("user_id")
      .eq("email", normalizedEmail)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle<{ user_id: string }>();

    return !error && Boolean(data);
  }

  if (requiresAdminProfile()) return false;
  return isAdminEmailAllowed(normalizedEmail);
}

export async function isAllowedAdmin(user: User | null) {
  if (!user) return false;

  const email = user?.email?.toLowerCase();
  if (!email) return false;

  if (hasAdminServiceEnv()) {
    return Boolean(await getActiveAdminProfile(user));
  }

  if (requiresAdminProfile()) return false;
  return isAdminEmailAllowed(email);
}

export const getCurrentAdmin = cache(async (): Promise<AdminUser | null> => {
  const context = await getCurrentAdminContext();
  return context?.aal === "aal2" ? context.admin : null;
});

/**
 * Returns an approved password-authenticated admin before MFA elevation.
 * Only MFA enrollment, MFA verification, and password recovery may use this.
 */
export const getCurrentAdminCandidate = cache(async (): Promise<AdminUser | null> => {
  return (await getCurrentAdminContext())?.admin || null;
});

const getCurrentAdminContext = cache(async (): Promise<{
  admin: AdminUser;
  aal: string;
} | null> => {
  if (!hasSupabaseBrowserEnv()) {
    return null;
  }

  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  const claimsResult = await supabase.auth.getClaims();
  const claims = claimsResult.data?.claims;
  if (
    claimsResult.error ||
    claims?.sub !== user.id ||
    typeof claims.session_id !== "string" ||
    !(await isAdminSessionActive(user.id, claims.session_id))
  ) {
    return null;
  }

  const profile = hasAdminServiceEnv()
    ? await getActiveAdminProfile(user)
    : null;

  if (
    hasAdminServiceEnv()
      ? !profile
      : requiresAdminProfile() || !isAdminEmailAllowed(user.email)
  ) {
    return null;
  }

  return {
    admin: {
      id: user.id,
      email: user.email || "",
      role: profile?.role || "admin",
      hasActiveProfile: Boolean(profile),
    },
    aal: typeof claims.aal === "string" ? claims.aal : "aal1",
  };
});

export const requireAdmin = cache(async () => {
  const admin = await getCurrentAdmin();

  if (!admin) {
    const candidate = await getCurrentAdminCandidate();
    if (candidate) redirect("/admin/mfa");
    redirect("/admin/login");
  }

  return admin;
});
