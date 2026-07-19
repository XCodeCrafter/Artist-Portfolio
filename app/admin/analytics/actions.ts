"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { verifyAdminActionOrigin } from "@/lib/admin/action-security";
import { requireAdmin } from "@/lib/admin/auth";
import { writeAuditLog } from "@/lib/admin/audit";
import { createAdminServiceClient } from "@/lib/admin/service";

const ANALYTICS_PATH = "/admin/analytics";

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

function redirectToStatus(status: string): never {
  const params = new URLSearchParams({ status });
  redirect(`${ANALYTICS_PATH}?${params.toString()}#inquiries`);
}

async function getWriteContext() {
  const admin = await requireAdmin();
  if (!(await verifyAdminActionOrigin(admin.id, "analytics:inquiries"))) {
    redirectToStatus("security-error");
  }

  const supabase = createAdminServiceClient();

  if (!supabase) {
    redirectToStatus("missing-service");
  }

  return { admin, supabase };
}

export async function updateInquiry(formData: FormData) {
  const parsed = inquirySchema.safeParse({
    id: formValue(formData, "id"),
    status: formValue(formData, "status"),
    adminNotes: formValue(formData, "adminNotes"),
  });

  if (!parsed.success) redirectToStatus("invalid");

  const { admin, supabase } = await getWriteContext();
  const result = await supabase
    .from("booking_inquiries")
    .update({
      status: parsed.data.status,
      admin_notes: parsed.data.adminNotes,
    })
    .eq("id", parsed.data.id);

  if (result.error) {
    console.error(result.error);
    redirectToStatus("save-error");
  }

  await writeAuditLog({
    actorId: admin.id,
    action: "inquiry_update",
    tableName: "booking_inquiries",
    recordId: parsed.data.id,
    metadata: { status: parsed.data.status },
  });

  revalidatePath(ANALYTICS_PATH);
  revalidatePath("/admin");
  redirectToStatus("saved");
}

export async function deleteInquiry(formData: FormData) {
  const parsed = deleteSchema.safeParse({
    id: formValue(formData, "id"),
  });

  if (!parsed.success) redirectToStatus("invalid");

  const { admin, supabase } = await getWriteContext();
  const result = await supabase
    .from("booking_inquiries")
    .delete()
    .eq("id", parsed.data.id);

  if (result.error) {
    console.error(result.error);
    redirectToStatus("delete-error");
  }

  await writeAuditLog({
    actorId: admin.id,
    action: "inquiry_delete",
    tableName: "booking_inquiries",
    recordId: parsed.data.id,
  });

  revalidatePath(ANALYTICS_PATH);
  revalidatePath("/admin");
  redirectToStatus("deleted");
}
