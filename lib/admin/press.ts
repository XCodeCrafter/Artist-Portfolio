import "server-only";

import { requireAdmin } from "@/lib/admin/auth";
import { createAdminServiceClient, hasAdminServiceEnv } from "@/lib/admin/service";
import { parseHomeSectionSubmission, type HomeEditorVersions } from "@/lib/admin/home-editor";
import { createHomeEditorialDefaults, type HomePress } from "@/lib/admin/home-editorial";

export type PressEditorSnapshot = { draft: HomePress; versions: HomeEditorVersions };
export type AdminPressEditorData = {
  snapshot: PressEditorSnapshot;
  isConfigured: boolean;
  migrationRequired: boolean;
  loadError?: string;
};

/** Press keeps its existing storage and CAS version; no copies or data conversion. */
export async function getAdminPressEditorData(): Promise<AdminPressEditorData> {
  await requireAdmin();
  const snapshot: PressEditorSnapshot = {
    draft: createHomeEditorialDefaults().press,
    versions: { updatedAt: new Date(0).toISOString() },
  };
  const fallback = { snapshot, isConfigured: true, migrationRequired: false };
  if (!hasAdminServiceEnv()) return { ...fallback, isConfigured: false };
  const supabase = createAdminServiceClient();
  if (!supabase) return { ...fallback, isConfigured: false };

  try {
    const { data, error } = await supabase.from("home_page_config")
      .select("draft,updated_at").eq("id", "main")
      .abortSignal(AbortSignal.timeout(10_000))
      .maybeSingle<{ draft: unknown; updated_at: unknown }>();
    if (error) {
      const missing = ["42P01", "PGRST205"].includes(error.code || "") &&
        /home_page_config/.test(error.message || "");
      return missing
        ? { ...fallback, migrationRequired: true }
        : { ...fallback, loadError: "Press content could not be loaded. Reload before editing." };
    }
    if (!data || !data.draft || typeof data.draft !== "object" || Array.isArray(data.draft)) {
      return { ...fallback, loadError: "The saved Press content could not be confirmed. Reload before editing." };
    }
    if (!("press" in data.draft)) return { ...fallback, migrationRequired: true };
    const parsed = parseHomeSectionSubmission("press", data.draft.press, { updatedAt: data.updated_at });
    if (!parsed.success) {
      return { ...fallback, loadError: "Press content returned an unexpected shape. The editor is read-only until refreshed." };
    }
    return {
      snapshot: { draft: parsed.data.payload as HomePress, versions: parsed.data.versions },
      isConfigured: true,
      migrationRequired: false,
    };
  } catch {
    return { ...fallback, loadError: "Press content could not be loaded. Reload before editing." };
  }
}
