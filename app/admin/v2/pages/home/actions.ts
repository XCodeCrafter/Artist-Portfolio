"use server";
import { getPhotoSaveCall, isMissingPhotoFramingSchemaError, PHOTO_FRAMING_MIGRATION_MESSAGE } from "@/lib/admin/photo-framing";
import { getHeroSaveCall, isMissingHeroFramingSchemaError, HERO_FRAMING_MIGRATION_MESSAGE } from "@/lib/admin/hero-framing";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { verifyAdminActionOrigin } from "@/lib/admin/action-security";
import { requireAdmin } from "@/lib/admin/auth";
import { writeAuditLog } from "@/lib/admin/audit";
import { isHomeEditorWriteConflict, isMissingHomeEditorSchemaError, isMissingHomeEditorialSchemaError } from "@/lib/admin/home";
import { parseHomeSectionSubmission, type HomeEditorSection, type HomeSaveState } from "@/lib/admin/home-editor";
import { createAdminServiceClient } from "@/lib/admin/service";

const formSchema = z.object({ section: z.string().max(32), payload: z.string().max(160_000), versions: z.string().max(1_000) }).strict();
function result(status: HomeSaveState["status"], message: string, extra: Partial<HomeSaveState> = {}): HomeSaveState {
  return { status, message, eventId: randomUUID(), ...extra };
}
export async function saveHomeSectionV2(_previousState: HomeSaveState, formData: FormData): Promise<HomeSaveState> {
  const admin = await requireAdmin();
  // Reject ambiguous multipart submissions instead of silently taking the first
  // value. Next's own $ACTION_* fields remain outside the editable contract.
  if (["section", "payload", "versions"].some(key => formData.getAll(key).length !== 1)) {
    return result("invalid", "This Home draft could not be read. Review the active editor and try again.");
  }
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
  const editorial = ["layout", "release", "work", "press"].includes(section);
  const originalArgs = {
    p_site_id: "main", p_section: section, p_expected_updated_at: parsed.data.versions.updatedAt, p_payload: parsed.data.payload,
  };
  const saveCall = editorial ? { name: "save_home_editorial_section_v2", args: originalArgs }
    : getPhotoSaveCall("home", section, parsed.data.payload, parsed.data.versions, getHeroSaveCall("home", section, "save_home_section_v2", originalArgs));
  let response;
  try {
    response = await supabase.rpc(saveCall.name, saveCall.args).abortSignal(AbortSignal.timeout(10_000));
  } catch {
    // Transport failure does not establish whether the transaction committed.
    // Never retry this write or report that nothing was saved.
    return result("error", "The save outcome could not be confirmed. Your draft was kept, but the server may have saved it. Reload the saved Home before trying again.", { section });
  }
  if (!response || typeof response !== "object") return result("error", "The save response could not be confirmed. Reload before editing Home again.", { section });
  const { data, error } = response;
  if (error) {
    if (isMissingHomeEditorialSchemaError(error)) return result("migration-required", "Apply database migration 0055 and reload to edit the new Home sections. Your draft has been kept.", { section });
    if (isMissingPhotoFramingSchemaError(error)) return result("migration-required", PHOTO_FRAMING_MIGRATION_MESSAGE, { section });
    if (isMissingHeroFramingSchemaError(error)) return result("migration-required", HERO_FRAMING_MIGRATION_MESSAGE, { section });
    if (isHomeEditorWriteConflict(error)) return result("conflict", "Home changed in another admin session. Your draft was kept. Reload before saving again.", { section });
    if (isMissingHomeEditorSchemaError(error)) return result("migration-required", "The Home editor needs database migration 0037 before it can save.", { section });
    if (error.code === "22023" || error.code === "23514") return result("invalid", "Review this section's content and select available Media Library files before saving.", { section });
    console.error("Admin V2 Home save failed.", { section, code: error.code });
    return result("error", "The save outcome could not be confirmed. Your draft was kept, but the server may have saved it. Reload the saved Home before trying again.", { section });
  }
  const canonical = data && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : null;
  const confirmed = parseHomeSectionSubmission(section, canonical?.canonicalSection, canonical?.versions);
  if (!confirmed.success || confirmed.data.versions.updatedAt === parsed.data.versions.updatedAt) {
    return result("error", "The save response could not be confirmed. Reload before editing Home again.", { section });
  }
  // The canonical response has confirmed the write. A follow-up failure must
  // not discard its new CAS version or invite an accidental duplicate save.
  const warnings: string[] = [];
  let auditTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    const audit = await Promise.race([
      writeAuditLog({ actorId: admin.id, action: `home_v2_${section}_save`, tableName: "home_page_config", recordId: "main", metadata: { section } }),
      new Promise<null>(resolve => { auditTimer = setTimeout(() => resolve(null), 2_000); }),
    ]);
    if (audit === null) warnings.push("Audit confirmation timed out; the audit entry may still be recorded.");
    else if (!audit.ok) warnings.push("The audit log could not be recorded.");
  } catch {
    console.error("Admin V2 Home audit follow-up failed.", { section });
    warnings.push("The audit log could not be recorded.");
  } finally {
    if (auditTimer !== undefined) clearTimeout(auditTimer);
  }
  let cacheFailed = false;
  for (const path of ["/", "/admin/v2/pages/home", "/admin/v2-preview/home", "/admin/v2"]) {
    try { revalidatePath(path); }
    catch {
      cacheFailed = true;
      console.error("Admin V2 Home cache refresh failed.", { section, path });
    }
  }
  if (cacheFailed) warnings.push("The page cache could not be fully refreshed; the public page may still show the previous version.");
  const message = warnings.length ? `Section saved. ${warnings.join(" ")}` : "Section saved and published.";
  return result("saved", message, { section, canonicalSection: confirmed.data.payload, versions: confirmed.data.versions, savedAt: new Date().toISOString() });
}
