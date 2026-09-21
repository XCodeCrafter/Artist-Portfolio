import "server-only";
import { loadHeroEditorSnapshot } from "@/lib/admin/hero-framing";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminServiceClient, hasAdminServiceEnv } from "@/lib/admin/service";
import { createFallbackHomeEditorSnapshot, createHomeDraftFromContent, parseHomeEditorSnapshot, type HomeEditorSnapshot } from "@/lib/admin/home-editor";
import { getPortfolioContent } from "@/lib/content";

type DatabaseErrorLike = { code?: string | null; message?: string | null; details?: string | null; hint?: string | null };
export function isMissingHomeEditorSchemaError(error?: DatabaseErrorLike | null) {
  if (!error) return false;
  const message = [error.message, error.details, error.hint].filter(Boolean).join(" ");
  return ((error.code === "PGRST202" || error.code === "PGRST205" || error.code === "42883" || error.code === "42P01") && /home_page_config|(?:get_home_page_v2_snapshot|save_home_section_v2)/i.test(message))
    || (error.code === "23503" && /home_page_snapshot_missing/i.test(message));
}
export function isHomeEditorWriteConflict(error?: DatabaseErrorLike | null) {
  return Boolean(error && (error.code === "40001" || /home_page_changed/.test(error.message || "")));
}
export type AdminHomeEditorData = { snapshot: HomeEditorSnapshot; isConfigured: boolean; migrationRequired: boolean; loadError?: string };
export async function getAdminHomeEditorData(): Promise<AdminHomeEditorData> {
  await requireAdmin();
  const fallback = createFallbackHomeEditorSnapshot();
  if (!hasAdminServiceEnv()) return { snapshot: fallback, isConfigured: false, migrationRequired: false };
  const supabase = createAdminServiceClient();
  if (!supabase) return { snapshot: fallback, isConfigured: false, migrationRequired: false };
  const { data, error } = await loadHeroEditorSnapshot(supabase, "home", "get_home_page_v2_snapshot");
  if (error && isMissingHomeEditorSchemaError(error)) {
    try {
      const content = await getPortfolioContent();
      return { snapshot: { ...fallback, draft: createHomeDraftFromContent(content) }, isConfigured: true, migrationRequired: true };
    } catch {
      return { snapshot: fallback, isConfigured: true, migrationRequired: true, loadError: "Home content could not be loaded. Apply migration 0037 and reload the editor." };
    }
  }
  if (error) {
    console.error("Admin V2 Home snapshot failed.", { code: error.code, message: error.message });
    return { snapshot: fallback, isConfigured: true, migrationRequired: false, loadError: "Home content could not be loaded. The editor is read-only until it can be refreshed." };
  }
  const snapshot = parseHomeEditorSnapshot(data);
  return snapshot
    ? { snapshot, isConfigured: true, migrationRequired: false }
    : { snapshot: fallback, isConfigured: true, migrationRequired: false, loadError: "Home content returned an unexpected shape. Reload before editing." };
}
