import "server-only";
import { requireAdmin } from "./auth";
import { createAdminServiceClient } from "./service";
import { archiveOffsetSchema, emptyArchivePage, parseArchivePage, type ArchiveData } from "./content-archive-editor";
import { musicArchiveSectionSchema } from "./music-content-archive-editor";

export async function getMusicContentArchiveData(section: unknown, offset = 0): Promise<ArchiveData> {
  await requireAdmin();
  const unavailable = (message: string): ArchiveData => ({ available: false, page: emptyArchivePage(), message });
  const target = musicArchiveSectionSchema.safeParse(section);
  if (!target.success || !archiveOffsetSchema.safeParse(offset).success) return unavailable("Choose a valid Music archive page.");
  try {
    const client = createAdminServiceClient();
    if (!client) return unavailable("Archive access is unavailable. Existing Music editing remains separate.");
    const { data, error } = await client.rpc("get_music_content_archive_v2", { p_section: target.data, p_offset: offset })
      .abortSignal(AbortSignal.timeout(5000));
    if (error) return unavailable(["PGRST202", "42883"].includes(error.code)
      ? "Music archive needs migration 0042. Existing Music editing still works."
      : "The Music archive could not be verified. Reload before archiving or restoring anything.");
    const page = parseArchivePage(data);
    return page && page.offset === offset ? { available: true, page }
      : unavailable("The archive response could not be verified. Existing Music editing still works.");
  } catch {
    return unavailable("The Music archive could not be loaded. Existing Music editing still works.");
  }
}
