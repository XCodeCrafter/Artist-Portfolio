import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import {
  createAdminServiceClient,
  hasAdminServiceEnv,
} from "@/lib/admin/service";
import { hasSupabaseBrowserEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

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

export async function getCurrentAdmin(): Promise<AdminUser | null> {
  const admin = await getCurrentAdminCandidate();
  if (!admin) return null;

  const supabase = await createClient();
  const { data, error } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

  if (error || data.currentLevel !== "aal2") {
    return null;
  }

  return admin;
}

/**
 * Returns an approved password-authenticated admin before MFA elevation.
 * Only MFA enrollment, MFA verification, and password recovery may use this.
 */
export async function getCurrentAdminCandidate(): Promise<AdminUser | null> {
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
    id: user.id,
    email: user.email || "",
    role: profile?.role || "admin",
    hasActiveProfile: Boolean(profile),
  };
}

export async function requireAdmin() {
  const admin = await getCurrentAdmin();

  if (!admin) {
    const candidate = await getCurrentAdminCandidate();
    if (candidate) redirect("/admin/mfa");
    redirect("/admin/login");
  }

  return admin;
}
