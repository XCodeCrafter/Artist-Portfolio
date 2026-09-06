"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { verifyAdminActionOrigin } from "@/lib/admin/action-security";
import { requireAdmin } from "@/lib/admin/auth";
import { writeAuditLog } from "@/lib/admin/audit";
import {
  ADMIN_SECURITY_SURFACE_PATHS,
  getAdminSecurityPath,
  parseAdminSecuritySurface,
  type AdminSecuritySurface,
} from "@/lib/admin/security-routes";
import { createAdminServiceClient } from "@/lib/admin/service";

const adminProfileSchema = z.object({
  userId: z.string().uuid(),
  email: z.string().trim().email().max(200),
  role: z.enum(["admin", "owner"]),
  isActive: z.boolean(),
});

const deleteProfileSchema = z.object({
  userId: z.string().uuid(),
});

function formValue(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function formChecked(formData: FormData, key: string) {
  return formData.get(key) === "on";
}

function isLastOwnerError(error: { message?: string } | null) {
  return Boolean(
    error?.message?.toLowerCase().includes("at least one active owner")
  );
}

function redirectToStatus(
  status: string,
  surface: AdminSecuritySurface
): never {
  const params = new URLSearchParams({ status });
  redirect(`${getAdminSecurityPath(surface)}?${params.toString()}#access`);
}

function revalidateSecurityViews() {
  for (const path of Object.values(ADMIN_SECURITY_SURFACE_PATHS)) {
    revalidatePath(path);
  }
  revalidatePath("/admin");
  revalidatePath("/admin/v2");
}

async function getOwnerWriteContext(surface: AdminSecuritySurface) {
  const admin = await requireAdmin();
  if (!(await verifyAdminActionOrigin(admin.id, "security:admin-profiles"))) {
    redirectToStatus("security-error", surface);
  }

  if (admin.role !== "owner") {
    redirectToStatus("owner-required", surface);
  }

  const supabase = createAdminServiceClient();
  if (!supabase) {
    redirectToStatus("missing-service", surface);
  }

  return { admin, supabase };
}

async function revokeSessions(
  supabase: NonNullable<ReturnType<typeof createAdminServiceClient>>,
  actorId: string,
  targetUserId: string
) {
  const result = await supabase.rpc("revoke_admin_user_sessions", {
    target_user_id: targetUserId,
  });

  if (!result.error) return true;

  console.error(result.error);
  await writeAuditLog({
    actorId,
    action: "security_admin_session_revoke_failed",
    tableName: "auth",
    recordId: targetUserId,
    metadata: { errorCode: result.error.code || "unknown" },
  });
  return false;
}

async function hasAdminProfile(
  supabase: NonNullable<ReturnType<typeof createAdminServiceClient>>,
  userId: string,
  surface: AdminSecuritySurface
) {
  const result = await supabase
    .from("admin_profiles")
    .select("user_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle<{ user_id: string }>();

  if (result.error) {
    console.error(result.error);
    redirectToStatus("profile-check-error", surface);
  }
  return Boolean(result.data);
}

export async function saveAdminProfile(formData: FormData) {
  const surface = parseAdminSecuritySurface(formData.get("securitySurface"));
  const parsed = adminProfileSchema.safeParse({
    userId: formValue(formData, "userId"),
    email: formValue(formData, "email"),
    role: formValue(formData, "role"),
    isActive: formChecked(formData, "isActive"),
  });

  if (!parsed.success) redirectToStatus("invalid", surface);

  const { admin, supabase } = await getOwnerWriteContext(surface);
  const authUserResult = await supabase.auth.admin.getUserById(
    parsed.data.userId
  );
  const authEmail = authUserResult.data.user?.email?.toLowerCase();

  if (
    authUserResult.error ||
    !authEmail ||
    authEmail !== parsed.data.email.toLowerCase()
  ) {
    redirectToStatus("auth-user-mismatch", surface);
  }

  if (
    parsed.data.userId === admin.id &&
    (!parsed.data.isActive || parsed.data.role !== "owner")
  ) {
    redirectToStatus("self-protected", surface);
  }

  const result = await supabase.from("admin_profiles").upsert({
    user_id: parsed.data.userId,
    email: parsed.data.email.toLowerCase(),
    role: parsed.data.role,
    is_active: parsed.data.isActive,
  });

  if (result.error) {
    console.error(result.error);
    if (isLastOwnerError(result.error)) {
      redirectToStatus("last-owner-required", surface);
    }
    redirectToStatus("save-error", surface);
  }

  if (
    !parsed.data.isActive &&
    !(await revokeSessions(supabase, admin.id, parsed.data.userId))
  ) {
    redirectToStatus("session-revoke-error", surface);
  }

  const auditResult = await writeAuditLog({
    actorId: admin.id,
    action: "admin_profile_save",
    tableName: "admin_profiles",
    recordId: parsed.data.userId,
    metadata: {
      email: parsed.data.email.toLowerCase(),
      role: parsed.data.role,
      isActive: parsed.data.isActive,
    },
  });

  revalidateSecurityViews();
  redirectToStatus(
    auditResult.ok ? "saved" : "saved-audit-warning",
    surface
  );
}

export async function deleteAdminProfile(formData: FormData) {
  const surface = parseAdminSecuritySurface(formData.get("securitySurface"));
  const parsed = deleteProfileSchema.safeParse({
    userId: formValue(formData, "userId"),
  });

  if (!parsed.success) redirectToStatus("invalid", surface);

  const { admin, supabase } = await getOwnerWriteContext(surface);

  if (parsed.data.userId === admin.id) {
    redirectToStatus("self-protected", surface);
  }
  if (!(await hasAdminProfile(supabase, parsed.data.userId, surface))) {
    redirectToStatus("admin-not-found", surface);
  }

  if (!(await revokeSessions(supabase, admin.id, parsed.data.userId))) {
    redirectToStatus("session-revoke-error", surface);
  }

  const result = await supabase
    .from("admin_profiles")
    .delete()
    .eq("user_id", parsed.data.userId);

  if (result.error) {
    console.error(result.error);
    if (isLastOwnerError(result.error)) {
      redirectToStatus("last-owner-required", surface);
    }
    redirectToStatus("delete-error", surface);
  }

  const auditResult = await writeAuditLog({
    actorId: admin.id,
    action: "admin_profile_delete",
    tableName: "admin_profiles",
    recordId: parsed.data.userId,
  });

  revalidateSecurityViews();
  redirectToStatus(
    auditResult.ok ? "deleted" : "deleted-audit-warning",
    surface
  );
}

export async function revokeAdminSessions(formData: FormData) {
  const surface = parseAdminSecuritySurface(formData.get("securitySurface"));
  const parsed = deleteProfileSchema.safeParse({
    userId: formValue(formData, "userId"),
  });
  if (!parsed.success) redirectToStatus("invalid", surface);

  const { admin, supabase } = await getOwnerWriteContext(surface);
  if (!(await hasAdminProfile(supabase, parsed.data.userId, surface))) {
    redirectToStatus("admin-not-found", surface);
  }
  if (!(await revokeSessions(supabase, admin.id, parsed.data.userId))) {
    redirectToStatus("session-revoke-error", surface);
  }

  const auditResult = await writeAuditLog({
    actorId: admin.id,
    action: "admin_sessions_revoked",
    tableName: "auth",
    recordId: parsed.data.userId,
  });

  revalidateSecurityViews();
  redirectToStatus(
    auditResult.ok ? "sessions-revoked" : "sessions-revoked-audit-warning",
    surface
  );
}

export async function resetAdminMfa(formData: FormData) {
  const surface = parseAdminSecuritySurface(formData.get("securitySurface"));
  const parsed = deleteProfileSchema.safeParse({
    userId: formValue(formData, "userId"),
  });
  if (!parsed.success) redirectToStatus("invalid", surface);

  const { admin, supabase } = await getOwnerWriteContext(surface);
  if (!(await hasAdminProfile(supabase, parsed.data.userId, surface))) {
    redirectToStatus("admin-not-found", surface);
  }
  const factors = await supabase.auth.admin.mfa.listFactors({
    userId: parsed.data.userId,
  });
  if (factors.error) redirectToStatus("mfa-reset-error", surface);

  // Revoke first: if the database RPC is unavailable, no factor is removed
  // while an existing aal2 session remains usable.
  const revokedSessions = await supabase.rpc("revoke_admin_user_sessions", {
    target_user_id: parsed.data.userId,
  });
  if (revokedSessions.error) {
    console.error(revokedSessions.error);
    await writeAuditLog({
      actorId: admin.id,
      action: "security_admin_mfa_session_revoke_failed",
      tableName: "auth",
      recordId: parsed.data.userId,
      metadata: {
        factorCount: factors.data.factors.length,
        errorCode: revokedSessions.error.code || "unknown",
      },
    });
    redirectToStatus("mfa-reset-error", surface);
  }

  for (const factor of factors.data.factors) {
    const result = await supabase.auth.admin.mfa.deleteFactor({
      id: factor.id,
      userId: parsed.data.userId,
    });
    if (result.error) redirectToStatus("mfa-reset-error", surface);
  }

  const auditResult = await writeAuditLog({
    actorId: admin.id,
    action: "admin_mfa_reset",
    tableName: "auth",
    recordId: parsed.data.userId,
    metadata: { factorCount: factors.data.factors.length },
  });

  revalidateSecurityViews();
  redirectToStatus(
    auditResult.ok ? "mfa-reset" : "mfa-reset-audit-warning",
    surface
  );
}
