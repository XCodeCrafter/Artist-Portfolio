"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { verifyAdminActionOrigin } from "@/lib/admin/action-security";
import { requireAdmin } from "@/lib/admin/auth";
import { writeAuditLog } from "@/lib/admin/audit";
import { isHomeEditorWriteConflict, isMissingHomeEditorSchemaError } from "@/lib/admin/home";
import { parseHomeSectionSubmission, type HomeEditorSection, type HomeSaveState } from "@/lib/admin/home-editor";
import { createAdminServiceClient } from "@/lib/admin/service";

const formSchema = z.object({ section: z.string().max(32), payload: z.string().max(160_000), versions: z.string().max(1_000) }).strict();
function result(status: HomeSaveState["status"], message: string, extra: Partial<HomeSaveState> = {}): HomeSaveState {
  return { status, message, eventId: randomUUID(), ...extra };
}
export async function saveHomeSectionV2(_previousState: HomeSaveState, formData: FormData): Promise<HomeSaveState> {
  const admin = await requireAdmin();
  const form = formSchema.safeParse({ section: formData.get("section"), payload: formData.get("payload"), versions: formData.get("versions") });
  if (!form.success) return result("invalid", "This Home draft could not be read. Review the active editor and try again.");
  let payload: unknown;
  let versions: unknown;
  try { payload = JSON.parse(form.data.payload); versions = JSON.parse(form.data.versions); }
  catch { return result("invalid", "The Home draft could not be read."); }
  const parsed = parseHomeSectionSubmission(form.data.section, payload, versions);
  if (!parsed.success) return result("invalid", "Fix the highlighted fields before saving.", { section: form.data.section as HomeEditorSection, fieldErrors: parsed.fieldErrors });
  const section = parsed.data.section;
  if (!(await verifyAdminActionOrigin(admin.id, `home-v2:${section}`))) return result("security-error", "The request origin was blocked. Refresh Admin V2 and try again.", { section });
  const supabase = createAdminServiceClient();
  if (!supabase) return result("missing-service", "Supabase admin access is not configured, so nothing was saved.", { section });
  // This service-only RPC validates and locks live Media Library rows, then
  // checks the page version and changes only this section in one transaction.
  const { data, error } = await supabase.rpc("save_home_section_v2", {
    p_site_id: "main", p_section: section, p_expected_updated_at: parsed.data.versions.updatedAt, p_payload: parsed.data.payload,
  });
  if (error) {
    if (isHomeEditorWriteConflict(error)) return result("conflict", "Home changed in another admin session. Your draft was kept. Reload before saving again.", { section });
    if (isMissingHomeEditorSchemaError(error)) return result("migration-required", "The Home editor needs database migration 0037 before it can save.", { section });
    if (error.code === "22023" || error.code === "23514") return result("invalid", "Review this section's content and select available Media Library files before saving.", { section });
    console.error("Admin V2 Home save failed.", { section, code: error.code, message: error.message });
    return result("error", "The section could not be saved. Your local changes are still here.", { section });
  }
  const response = data && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : null;
  const confirmed = parseHomeSectionSubmission(section, response?.canonicalSection, response?.versions);
  if (!confirmed.success) return result("error", "The save response could not be confirmed. Reload before editing Home again.", { section });
  await writeAuditLog({ actorId: admin.id, action: `home_v2_${section}_save`, tableName: "home_page_config", recordId: "main", metadata: { section } });
  revalidatePath("/");
  revalidatePath("/admin/v2/pages/home");
  revalidatePath("/admin/v2-preview/home");
  revalidatePath("/admin/v2");
  return result("saved", "Section saved and published.", { section, canonicalSection: confirmed.data.payload, versions: confirmed.data.versions, savedAt: new Date().toISOString() });
}
