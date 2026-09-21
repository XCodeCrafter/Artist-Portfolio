import "server-only";
import { requireAdmin } from "./auth";
import { createAdminServiceClient } from "./service";
import { archiveOffsetSchema, emptyArchivePage, parseArchivePage, type ArchiveData } from "./content-archive-editor";

export async function getNavbarShortcutArchiveData(offset = 0): Promise<ArchiveData> {
  await requireAdmin();
  const unavailable = (message: string): ArchiveData => ({ available: false, page: emptyArchivePage(), message });
  if (!archiveOffsetSchema.safeParse(offset).success) return unavailable("Choose a valid archive page.");
  try {
    const client = createAdminServiceClient();
    if (!client) return unavailable("Archive access is unavailable. Existing shortcut editing remains separate.");
    const { data, error } = await client.rpc("get_navbar_shortcut_archive_v2", { p_offset: offset })
      .abortSignal(AbortSignal.timeout(5000));
    if (error) return unavailable(["PGRST202", "42883"].includes(error.code)
      ? "Shortcut archive needs migration 0041. Existing shortcut editing still works."
      : "The shortcut archive could not be verified. Reload before archiving or restoring anything.");
    const page = parseArchivePage(data);
    return page && page.offset === offset ? { available: true, page }
      : unavailable("The archive response could not be verified. Existing shortcut editing still works.");
  } catch {
    return unavailable("The shortcut archive could not be loaded. Existing shortcut editing still works.");
  }
}
