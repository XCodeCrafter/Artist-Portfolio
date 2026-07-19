"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { verifyAdminActionOrigin } from "@/lib/admin/action-security";
import { requireAdmin } from "@/lib/admin/auth";
import { writeAuditLog } from "@/lib/admin/audit";
import { createAdminServiceClient } from "@/lib/admin/service";

const SECURITY_PATH = "/admin/security";

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

function redirectToStatus(status: string): never {
  const params = new URLSearchParams({ status });
  redirect(`${SECURITY_PATH}?${params.toString()}#admin-profiles`);
}

async function getOwnerWriteContext() {
  const admin = await requireAdmin();
  if (!(await verifyAdminActionOrigin(admin.id, "security:admin-profiles"))) {
    redirectToStatus("security-error");
  }

  if (admin.role !== "owner") {
    redirectToStatus("owner-required");
  }

  const supabase = createAdminServiceClient();
  if (!supabase) {
    redirectToStatus("missing-service");
  }

  return { admin, supabase };
}

export async function saveAdminProfile(formData: FormData) {
  const parsed = adminProfileSchema.safeParse({
    userId: formValue(formData, "userId"),
    email: formValue(formData, "email"),
    role: formValue(formData, "role"),
    isActive: formChecked(formData, "isActive"),
  });

  if (!parsed.success) redirectToStatus("invalid");

  const { admin, supabase } = await getOwnerWriteContext();
  const authUserResult = await supabase.auth.admin.getUserById(
    parsed.data.userId
  );
  const authEmail = authUserResult.data.user?.email?.toLowerCase();

  if (
    authUserResult.error ||
    !authEmail ||
    authEmail !== parsed.data.email.toLowerCase()
  ) {
    redirectToStatus("auth-user-mismatch");
  }

  if (
    parsed.data.userId === admin.id &&
    (!parsed.data.isActive || parsed.data.role !== "owner")
  ) {
    redirectToStatus("self-protected");
  }

  const result = await supabase.from("admin_profiles").upsert({
    user_id: parsed.data.userId,
    email: parsed.data.email.toLowerCase(),
    role: parsed.data.role,
    is_active: parsed.data.isActive,
  });

  if (result.error) {
    console.error(result.error);
    redirectToStatus("save-error");
  }

  if (!parsed.data.isActive) {
    await supabase.rpc("revoke_admin_user_sessions", {
      target_user_id: parsed.data.userId,
    });
  }

  await writeAuditLog({
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

  revalidatePath(SECURITY_PATH);
  revalidatePath("/admin");
  redirectToStatus("saved");
}

export async function deleteAdminProfile(formData: FormData) {
  const parsed = deleteProfileSchema.safeParse({
    userId: formValue(formData, "userId"),
  });

  if (!parsed.success) redirectToStatus("invalid");

  const { admin, supabase } = await getOwnerWriteContext();

  if (parsed.data.userId === admin.id) {
    redirectToStatus("self-protected");
  }

  const result = await supabase
    .from("admin_profiles")
    .delete()
    .eq("user_id", parsed.data.userId);

  if (result.error) {
    console.error(result.error);
    redirectToStatus("delete-error");
  }

  await supabase.rpc("revoke_admin_user_sessions", {
    target_user_id: parsed.data.userId,
  });

  await writeAuditLog({
    actorId: admin.id,
    action: "admin_profile_delete",
    tableName: "admin_profiles",
    recordId: parsed.data.userId,
  });

  revalidatePath(SECURITY_PATH);
  revalidatePath("/admin");
  redirectToStatus("deleted");
}

export async function resetAdminMfa(formData: FormData) {
  const parsed = deleteProfileSchema.safeParse({
    userId: formValue(formData, "userId"),
  });
  if (!parsed.success) redirectToStatus("invalid");

  const { admin, supabase } = await getOwnerWriteContext();
  const factors = await supabase.auth.admin.mfa.listFactors({
    userId: parsed.data.userId,
  });
  if (factors.error) redirectToStatus("mfa-reset-error");

  for (const factor of factors.data.factors) {
    const result = await supabase.auth.admin.mfa.deleteFactor({
      id: factor.id,
      userId: parsed.data.userId,
    });
    if (result.error) redirectToStatus("mfa-reset-error");
  }

  await writeAuditLog({
    actorId: admin.id,
    action: "admin_mfa_reset",
    tableName: "auth",
    recordId: parsed.data.userId,
    metadata: { factorCount: factors.data.factors.length },
  });

  redirectToStatus("mfa-reset");
}
