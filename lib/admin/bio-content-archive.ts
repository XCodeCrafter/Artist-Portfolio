import "server-only";
import { requireAdmin } from "./auth";
import { createAdminServiceClient } from "./service";
import { archiveOffsetSchema, emptyArchivePage, parseArchivePage, type ArchiveData } from "./content-archive-editor";
import { bioArchiveCollectionSchema } from "./bio-content-archive-editor";

export async function getBioContentArchiveData(collection: unknown, offset = 0): Promise<ArchiveData> {
  await requireAdmin();
  const unavailable = (message: string): ArchiveData => ({ available: false, page: emptyArchivePage(), message });
  const target = bioArchiveCollectionSchema.safeParse(collection);
  if (!target.success || !archiveOffsetSchema.safeParse(offset).success) return unavailable("Choose a valid Bio archive page.");
  try {
    const client = createAdminServiceClient();
    if (!client) return unavailable("Archive access is unavailable. Existing Bio editing remains separate.");
    const { data, error } = await client.rpc("get_bio_content_archive_v2", { p_collection: target.data, p_offset: offset })
      .abortSignal(AbortSignal.timeout(5000));
    if (error) return unavailable(["PGRST202", "42883"].includes(error.code)
      ? "Bio archive needs migration 0043. Existing Bio editing still works."
      : "The Bio archive could not be verified. Reload before archiving or restoring anything.");
    const page = parseArchivePage(data);
    return page && page.offset === offset ? { available: true, page }
      : unavailable("The archive response could not be verified. Existing Bio editing still works.");
  } catch {
    return unavailable("The Bio archive could not be loaded. Existing Bio editing still works.");
  }
}
