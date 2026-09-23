import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PageSlug } from "@/lib/content/types";
import { heroFramingSchema } from "@/lib/content/hero-framing";
import { loadHeroEditorSnapshot } from "@/lib/admin/hero-framing";
import { parseBioEditorSnapshot } from "@/lib/admin/bio-editor";
import { parseGalleryEditorSnapshot } from "@/lib/admin/gallery-editor";
import { parseMusicEditorSnapshot } from "@/lib/admin/music-editor";
import { parseShowreelEditorSnapshot } from "@/lib/admin/showreel-editor";

type RpcError = { code?: string | null; message?: string | null; details?: string | null; hint?: string | null };
export const PHOTO_FRAMING_MIGRATION_MESSAGE = "Apply database migration 0051 and reload to save photo positioning. Your draft has been kept.";
export function isMissingPhotoFramingSchemaError(error?: RpcError | null) {
  return Boolean(error && ["PGRST202", "42883"].includes(error.code || "") &&
    /(?:get_photo_editor_with_framing_v2|save_photo_section_with_framing_v2|get_public_photo_framings_v1)/i.test(
      [error.message, error.details, error.hint].filter(Boolean).join(" ")
    ));
}
/** A missing dependency or another photo API is not proof this read API is absent. */
function isMissingPhotoEditorSnapshotError(error?: RpcError | null) {
  return Boolean(error && ["PGRST202", "42883"].includes(error.code || "") &&
    /\bget_photo_editor_with_framing_v2\b/i.test(
      [error.message, error.details, error.hint].filter(Boolean).join(" ")
    ));
}
function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function photoFields(page: PageSlug, section: string, payload: unknown): unknown[] {
  const value = record(payload);
  if (!value) return [];
  if (page === "home") {
    if (section === "about") return [value.framing];
    if (section === "feature") return [value.posterFraming];
    if (section === "stories") return Array.isArray(value.images) ? value.images.map(item => record(item)?.framing) : [undefined];
  }
  const list = page === "bio" && section === "biography" ? value.galleryImages
    : ((page === "music" && section === "platforms") || (page === "gallery" && section === "frames") ||
       (page === "video" && section === "works")) ? value.items : null;
  return Array.isArray(list) ? list.map(item => record(item)?.framing) : [];
}

/** Reads may fall back only on an absent additive RPC; unknown failures keep writes closed. */
export async function loadPhotoEditorSnapshot(client: SupabaseClient, page: PageSlug, legacyRpc: string) {
  if (page === "booking") return loadHeroEditorSnapshot(client, page, legacyRpc);
  try {
    const response = await client.rpc("get_photo_editor_with_framing_v2", { p_page: page, p_site_id: "main" })
      .abortSignal(AbortSignal.timeout(5000));
    if (response.error) {
      if (isMissingPhotoEditorSnapshotError(response.error)) return loadHeroEditorSnapshot(client, page, legacyRpc);
      return response;
    }
    const snapshot = record(response.data);
    const draft = page === "home" ? record(snapshot?.draft) : snapshot;
    const hero = record(draft?.hero);
    const sections = page === "home" ? ["about", "feature", "stories"]
      : page === "bio" ? ["biography"] : page === "music" ? ["platforms"] : page === "gallery" ? ["frames"] : ["works"];
    if (snapshot?.photoFramingAvailable !== true || !hero || !Object.hasOwn(hero, "framing") ||
        !heroFramingSchema.nullable().safeParse(hero.framing).success || sections.some(section => {
          const payload = page === "music" ? { items: draft?.platforms } : draft?.[section];
          return !record(payload) || photoFields(page, section, payload).some(value => !heroFramingSchema.nullable().safeParse(value).success);
        })) {
      return { data: null, error: { code: "INVALID_PHOTO_FRAMING_SNAPSHOT", message: "Photo positioning could not be verified." } };
    }
    return response;
  } catch {
    return { data: null, error: { code: "PHOTO_FRAMING_SNAPSHOT_UNAVAILABLE", message: "Photo positioning could not be loaded." } };
  }
}

/** One atomic content + crop save, with the existing section's CAS/guards. Never retry an old RPC on write failure. */
export function getPhotoSaveCall(page: PageSlug, section: string, payload: unknown, versions: unknown,
  original: { name: string; args: Record<string, unknown> }) {
  if (!photoFields(page, section, payload).some(value => value !== undefined)) return original;
  return { name: "save_photo_section_with_framing_v2", args: {
    p_page: page, p_section: section, p_site_id: "main", p_payload: payload, p_versions: versions,
  } };
}

function ordered(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ordered);
  const object = record(value);
  return object ? Object.fromEntries(Object.keys(object).sort().map(key => [key, ordered(object[key])])) : value;
}

/** Archive RPCs predate 0051. Rehydrate retained crops only against the SAME
 * section versions. A concurrent change or uncertain read requires a reload,
 * never replacement of the draft by a mixed-era snapshot or a repeated write. */
export async function reloadPhotoArchiveSection(client: SupabaseClient, page: PageSlug, section: string,
  versions: unknown, originalPayload: unknown): Promise<unknown | null> {
  if (!(page === "bio" && section === "biography") && !(page === "gallery" && section === "frames") &&
      !(page === "music" && section === "platforms") && !(page === "video" && section === "works")) return originalPayload;
  try {
    // No old-snapshot fallback is needed here: before 0051 the archive response
    // is already complete and no photo crops could have been written.
    const response = await client.rpc("get_photo_editor_with_framing_v2", { p_page: page, p_site_id: "main" })
      .abortSignal(AbortSignal.timeout(5000));
    if (response.error) return isMissingPhotoEditorSnapshotError(response.error) ? originalPayload : null;
    const snapshot = page === "bio" ? parseBioEditorSnapshot(response.data)
      : page === "music" ? parseMusicEditorSnapshot(response.data)
        : page === "gallery" ? parseGalleryEditorSnapshot(response.data) : parseShowreelEditorSnapshot(response.data);
    if (snapshot?.photoFramingAvailable !== true) return null;
    const currentVersions = record(snapshot.versions)?.[section];
    const payload = record(snapshot.draft)?.[section];
    if (!payload || JSON.stringify(ordered(currentVersions)) !== JSON.stringify(ordered(versions)) ||
        photoFields(page, section, payload).some(value => !heroFramingSchema.nullable().safeParse(value).success)) return null;
    return payload;
  } catch { return null; }
}
