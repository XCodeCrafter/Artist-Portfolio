import "server-only";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { verifyAdminActionOrigin } from "@/lib/admin/action-security";
import { requireAdmin } from "@/lib/admin/auth";
import { writeAuditLog } from "@/lib/admin/audit";
import {
  getAdminInquiryStatusPath,
  normalizeAdminInquiryPage,
  normalizeAdminInquiryRange,
  type AdminInquiryNavigationContext,
  type AdminInquirySurface,
} from "@/lib/admin/inquiry-routes";
import { createAdminServiceClient } from "@/lib/admin/service";

const inquirySchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["new", "read", "replied", "archived"]),
  adminNotes: z.string().trim().max(4000),
});

const deleteSchema = z.object({
  id: z.string().uuid(),
});

function formValue(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function redirectToStatus(
  surface: AdminInquirySurface,
  status: string,
  context: AdminInquiryNavigationContext = {}
): never {
  redirect(getAdminInquiryStatusPath(surface, status, context));
}

function getNavigationContext(formData: FormData): AdminInquiryNavigationContext {
  const context: AdminInquiryNavigationContext = {};
  if (formData.has("page")) {
    context.page = normalizeAdminInquiryPage(formValue(formData, "page"));
  }
  if (formData.has("rangeDays")) {
    context.rangeDays = normalizeAdminInquiryRange(
      formValue(formData, "rangeDays")
    );
  }
  return context;
}

async function writeInquiryAudit(
  input: Parameters<typeof writeAuditLog>[0]
) {
  try {
    return (await writeAuditLog(input)).ok;
  } catch (error) {
    console.error("[inbox] Inquiry mutation succeeded but audit logging threw.", {
      action: input.action,
      recordId: input.recordId || "",
      error,
    });
    return false;
  }
}

async function getWriteContext(
  surface: AdminInquirySurface,
  navigation: AdminInquiryNavigationContext
) {
  const admin = await requireAdmin();
  if (!(await verifyAdminActionOrigin(admin.id, "analytics:inquiries"))) {
    redirectToStatus(surface, "security-error", navigation);
  }

  const supabase = createAdminServiceClient();
  if (!supabase) {
    redirectToStatus(surface, "missing-service", navigation);
  }

  return { admin, supabase };
}

function revalidateInquirySurfaces() {
  revalidatePath("/admin/analytics");
  revalidatePath("/admin/v2/inbox");
  revalidatePath("/admin");
  revalidatePath("/admin/v2");
}

export async function updateInquiryOnSurface(
  surface: AdminInquirySurface,
  formData: FormData
) {
  const navigation = getNavigationContext(formData);
  const parsed = inquirySchema.safeParse({
    id: formValue(formData, "id"),
    status: formValue(formData, "status"),
    adminNotes: formValue(formData, "adminNotes"),
  });

  if (!parsed.success) redirectToStatus(surface, "invalid", navigation);

  const { admin, supabase } = await getWriteContext(surface, navigation);
  const result = await supabase
    .from("booking_inquiries")
    .update({
      status: parsed.data.status,
      admin_notes: parsed.data.adminNotes,
    })
    .eq("id", parsed.data.id)
    .select("id")
    .maybeSingle();

  if (result.error) {
    console.error(result.error);
    redirectToStatus(surface, "save-error", navigation);
  }
  if (!result.data) redirectToStatus(surface, "not-found", navigation);

  const auditOk = await writeInquiryAudit({
    actorId: admin.id,
    action: "inquiry_update",
    tableName: "booking_inquiries",
    recordId: parsed.data.id,
    metadata: { status: parsed.data.status },
  });

  revalidateInquirySurfaces();
  redirectToStatus(
    surface,
    auditOk ? "saved" : "saved-audit-warning",
    navigation
  );
}

export async function deleteInquiryOnSurface(
  surface: AdminInquirySurface,
  formData: FormData
) {
  const navigation = getNavigationContext(formData);
  const parsed = deleteSchema.safeParse({
    id: formValue(formData, "id"),
  });

  if (!parsed.success) redirectToStatus(surface, "invalid", navigation);

  const { admin, supabase } = await getWriteContext(surface, navigation);
  const result = await supabase
    .from("booking_inquiries")
    .delete()
    .eq("id", parsed.data.id)
    .select("id")
    .maybeSingle();

  if (result.error) {
    console.error(result.error);
    redirectToStatus(surface, "delete-error", navigation);
  }
  if (!result.data) redirectToStatus(surface, "not-found", navigation);

  const auditOk = await writeInquiryAudit({
    actorId: admin.id,
    action: "inquiry_delete",
    tableName: "booking_inquiries",
    recordId: parsed.data.id,
  });

  revalidateInquirySurfaces();
  redirectToStatus(
    surface,
    auditOk ? "deleted" : "deleted-audit-warning",
    navigation
  );
}
