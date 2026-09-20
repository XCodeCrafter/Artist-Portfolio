"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/auth";
import { verifyAdminActionOrigin } from "@/lib/admin/action-security";
import { createAdminServiceClient } from "@/lib/admin/service";
import { writeAuditLog } from "@/lib/admin/audit";
import { isMissingSiteAppearanceSchemaError } from "@/lib/admin/site-appearance";
import { parseAppearanceSubmission, type AppearanceEditorSection, type AppearanceSaveState } from "@/lib/admin/site-appearance-editor";

const formSchema = z.object({ section: z.string().max(32), payload: z.string().max(4_000), versions: z.string().max(1_000) }).strict();
function result(status: AppearanceSaveState["status"], message: string, extra: Partial<AppearanceSaveState> = {}): AppearanceSaveState {
  return { status, message, eventId: randomUUID(), ...extra };
}

export async function saveSiteAppearanceV2(_previousState: AppearanceSaveState, formData: FormData): Promise<AppearanceSaveState> {
  // requireAdmin verifies the approved active profile and MFA (aal2) before
  // parsing client input or creating any service-role database client here.
  const admin = await requireAdmin();
  if (!(await verifyAdminActionOrigin(admin.id, "site-appearance-v2:main"))) {
    return result("security-error", "The request origin was blocked. Refresh Admin V2 and try again.");
  }
  const form = formSchema.safeParse({ section: formData.get("section"), payload: formData.get("payload"), versions: formData.get("versions") });
  if (!form.success) return result("invalid", "This settings draft could not be read. Reload the editor and try again.");
  let payload: unknown;
  let versions: unknown;
  try { payload = JSON.parse(form.data.payload); versions = JSON.parse(form.data.versions); }
  catch { return result("invalid", "The settings draft could not be read."); }
  const parsed = parseAppearanceSubmission(form.data.section, payload, versions);
  if (!parsed.success) return result("invalid", "Fix the highlighted fields before saving.", {
    ...(form.data.section === "name" || form.data.section === "appearance" ? { section: form.data.section as AppearanceEditorSection } : {}),
    fieldErrors: parsed.fieldErrors,
  });
  const section = parsed.data.section;
  const supabase = createAdminServiceClient();
  if (!supabase) return result("missing-service", "Supabase admin access is not configured, so nothing was saved.", { section });

  // Each action can update only its named fields. The timestamp predicate is
  // part of this single UPDATE; concurrent changes never become blind writes.
  const values = parsed.data.section === "name"
    ? { artist_name: parsed.data.payload.artistName }
    : {
      display_font: parsed.data.payload.displayFont,
      body_font: parsed.data.payload.bodyFont,
      ui_font: parsed.data.payload.uiFont,
      footer_effect: parsed.data.payload.footerEffect,
    };
  const columns = section === "name"
    ? "artist_name,updated_at"
    : "display_font,body_font,ui_font,footer_effect,updated_at";
  const { data, error } = await supabase.from("site_settings")
    .update(values)
    .eq("id", "main")
    .eq("updated_at", parsed.data.versions.updatedAt)
    .select(columns)
    .maybeSingle<Record<string, unknown>>();
  if (error) {
    if (error.code === "40001") return result("conflict", "Site settings changed in another admin session. Your draft was kept. Reload before saving again.", { section });
    if (isMissingSiteAppearanceSchemaError(error)) return result("migration-required", "The database is missing existing site settings fields. Check the settings migrations before saving.", { section });
    if (error.code === "22023" || error.code === "23514") return result("invalid", "The database rejected these settings. Review your selections and try again.", { section });
    console.error("Admin V2 appearance save failed.", { section, code: error.code });
    return result("error", "Settings could not be saved. Your local changes are still here.", { section });
  }
  if (!data) return result("conflict", "Site settings changed in another admin session or are no longer available. Your draft was kept. Reload before saving again.", { section });

  const canonicalSection = section === "name"
    ? { artistName: data.artist_name }
    : { displayFont: data.display_font, bodyFont: data.body_font, uiFont: data.ui_font, footerEffect: data.footer_effect };
  const confirmed = parseAppearanceSubmission(section, canonicalSection, { updatedAt: data.updated_at });
  if (!confirmed.success) return result("error", "The save response could not be confirmed. Reload to verify your saved settings.", { section });

  await writeAuditLog({
    actorId: admin.id, action: `site_appearance_v2_${section}_save`, tableName: "site_settings", recordId: "main",
    metadata: { section, fields: Object.keys(values) },
  });
  revalidatePath("/", "layout");
  for (const path of ["/admin/v2", "/admin/v2/navigation", "/admin/v2/settings/appearance", "/admin/content", "/admin/settings"]) revalidatePath(path);
  return result("saved", section === "name" ? "Owner name saved and published." : "Appearance saved and published.", {
    section, canonicalSection: confirmed.data.payload, versions: confirmed.data.versions, savedAt: new Date().toISOString(),
  });
}
