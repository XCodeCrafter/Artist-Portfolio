import "server-only";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminServiceClient, hasAdminServiceEnv } from "@/lib/admin/service";
import {
  createFallbackAppearanceEditorSnapshot,
  parseAppearanceEditorSnapshot,
  type AppearanceEditorSnapshot,
} from "@/lib/admin/site-appearance-editor";
import { DEFAULT_FOOTER_CONTENT } from "@/lib/content/footer";

type DatabaseErrorLike = { code?: string | null; message?: string | null; details?: string | null; hint?: string | null };
export function isMissingSiteAppearanceSchemaError(error?: DatabaseErrorLike | null) {
  if (!error) return false;
  const message = [error.message, error.details, error.hint].filter(Boolean).join(" ");
  return ["42703", "42P01", "PGRST204", "PGRST205"].includes(error.code || "")
    && /site_settings|artist_name|display_font|body_font|ui_font|footer_effect|footer_content|updated_at/i.test(message);
}

export type AdminAppearanceData = {
  snapshot: AppearanceEditorSnapshot;
  isConfigured: boolean;
  migrationRequired: boolean;
  footerMigrationRequired?: boolean;
  loadError?: string;
};

export async function getAdminAppearanceData(): Promise<AdminAppearanceData> {
  await requireAdmin();
  const snapshot = createFallbackAppearanceEditorSnapshot();
  if (!hasAdminServiceEnv()) return { snapshot, isConfigured: false, migrationRequired: false };
  const supabase = createAdminServiceClient();
  if (!supabase) return { snapshot, isConfigured: false, migrationRequired: false };

  // Read * so adding footer content does not disable existing name/font controls
  // on deployments awaiting migration 0039. Missing legacy fields still fail closed.
  const { data, error } = await supabase.from("site_settings")
    .select("*")
    .eq("id", "main")
    .maybeSingle();
  if (error) {
    const migrationRequired = isMissingSiteAppearanceSchemaError(error);
    if (!migrationRequired) console.error("Admin V2 appearance snapshot failed.", { code: error.code });
    return {
      snapshot, isConfigured: true, migrationRequired,
      loadError: migrationRequired
        ? "The saved typography or footer settings are missing from the database. Check the existing settings migrations before editing."
        : "Site settings could not be loaded. The editor is read-only until it can be refreshed.",
    };
  }
  const confirmed = data && parseAppearanceEditorSnapshot({
    draft: {
      name: { artistName: data.artist_name },
      appearance: { displayFont: data.display_font, bodyFont: data.body_font, uiFont: data.ui_font, footerEffect: data.footer_effect },
      identity: { tagline: data.tagline, description: data.description, location: data.location, contactBlurb: data.contact_blurb },
      footer: data.footer_content === undefined ? DEFAULT_FOOTER_CONTENT : data.footer_content,
    },
    versions: { updatedAt: data.updated_at },
  });
  if (!confirmed) return {
    snapshot, isConfigured: true, migrationRequired: false,
    loadError: "The saved site settings are missing or invalid. Reload before editing; nothing can be saved from this view.",
  };
  return { snapshot: confirmed, isConfigured: true, migrationRequired: false, footerMigrationRequired: data?.footer_content === undefined };
}
