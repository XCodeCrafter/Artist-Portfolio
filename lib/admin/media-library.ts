import { z } from "zod";
import { createAdminServiceClient } from "./service";
import { getMediaAssets } from "./media";
import type { MediaUsage } from "./media-library-editor";
import { getMediaLibraryPosters } from "./media-library-posters";

const usageSchema = z.array(z.object({ asset_id: z.string(), reference_label: z.string(), reference_count: z.coerce.number().int().positive() }));

export async function getMediaLibraryV2Data() {
  const media = await getMediaAssets({ includeDeleted: true });
  const referenceTime = Date.now();
  const supabase = createAdminServiceClient();
  const usage: MediaUsage = {};
  if (!supabase || media.loadError) return { ...media, referenceTime, usage, posters: {}, usageError: "Media usage could not be verified. Delete and restore are disabled." };
  const [{ data, error }, posters] = await Promise.all([
    Promise.resolve().then(() => supabase.rpc("get_media_library_v2_usage")).catch(() => ({ data: null, error: { code: "" } })),
    getMediaLibraryPosters(supabase, media.assets),
  ]);
  const parsed = usageSchema.safeParse(data);
  if (error || !parsed.success) return {
    ...media, referenceTime, usage, posters,
    usageError: error?.code === "PGRST202" || error?.code === "42883"
      ? "Media usage and safe removal need migration 0040. Upload and file details remain available."
      : "Media usage could not be verified. Delete and restore are disabled; reload before trying again.",
  };
  const groups = new Map<string, MediaUsage[string]>();
  for (const row of parsed.data) {
    const entries = groups.get(row.asset_id) ?? [];
    entries.push({ label: row.reference_label, count: row.reference_count });
    groups.set(row.asset_id, entries);
  }
  return { ...media, referenceTime, usage: Object.fromEntries(groups), posters, usageError: undefined };
}
