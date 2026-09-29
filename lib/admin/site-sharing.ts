import "server-only";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminServiceClient } from "@/lib/admin/service";
import { createFallbackSharingEditorSnapshot, parseSharingEditorSnapshot, type SharingEditorSnapshot } from "@/lib/admin/site-sharing-editor";
import { parsePublicSharingMetadata } from "@/lib/content/site-sharing";

type DatabaseError = { code?: string | null; message?: string | null; details?: string | null; hint?: string | null };
export const SHARING_MIGRATION_MESSAGE = "Apply database migration 0056 and reload to edit sharing settings. Your draft has been kept.";
export function isMissingSharingSchemaError(error?: DatabaseError | null) {
  return Boolean(error && ["PGRST202", "PGRST205", "42883", "42P01"].includes(error.code || "") &&
    /site_sharing/.test([error.message, error.details, error.hint].filter(Boolean).join(" ")));
}
export type AdminSharingData = { snapshot: SharingEditorSnapshot; isConfigured: boolean; migrationRequired: boolean; loadError?: string; loadWarning?: string };
export async function getAdminSharingData(): Promise<AdminSharingData> {
  await requireAdmin();
  const snapshot = createFallbackSharingEditorSnapshot();
  const client = createAdminServiceClient();
  if (!client) return { snapshot, isConfigured: false, migrationRequired: false };
  try {
    const { data, error } = await client.rpc("get_site_sharing_editor_v2", { p_site_id: "main" }).abortSignal(AbortSignal.timeout(5_000));
    if (isMissingSharingSchemaError(error)) return { snapshot, isConfigured: true, migrationRequired: true };
    const parsed = !error && parseSharingEditorSnapshot(data);
    if (parsed) return { snapshot: parsed, isConfigured: true, migrationRequired: false };
    // A media-origin change must not trap the owner in a read-only editor.
    // Preserve exact CAS and owner text, clear only the unusable cover locally.
    if (!error && data && typeof data === "object" && !Array.isArray(data)) {
      const recovered = parsePublicSharingMetadata(data.draft);
      const safeSnapshot = recovered && parseSharingEditorSnapshot({ ...data, draft: recovered });
      if (safeSnapshot) return { snapshot: safeSnapshot, isConfigured: true, migrationRequired: false,
        loadWarning: "The previous cover is no longer available from this site's configured media sources. Select a new cover or save to use the built-in preview. Your saved text is unchanged." };
    }
    console.error("Sharing settings could not be confirmed.", { code: error?.code });
  } catch { console.error("Sharing settings request failed."); }
  return { snapshot, isConfigured: true, migrationRequired: false, loadError: "Sharing settings could not be loaded. Editing is disabled until the saved version is reachable." };
}
