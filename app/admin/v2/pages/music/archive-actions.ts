"use server";

import { revalidatePath } from "next/cache";
import { reloadPhotoArchiveSection } from "@/lib/admin/photo-framing";
import { requireAdmin } from "@/lib/admin/auth";
import { verifyAdminActionOrigin } from "@/lib/admin/action-security";
import { createAdminServiceClient } from "@/lib/admin/service";
import { writeAuditLog } from "@/lib/admin/audit";
import { getMusicContentArchiveData } from "@/lib/admin/music-content-archive";
import { parseArchivePage } from "@/lib/admin/content-archive-editor";
import {
  MUSIC_ARCHIVE_LIMITS, musicArchiveMutationSchema, parseMusicArchiveSnapshot,
  type MusicArchiveMutationResult,
} from "@/lib/admin/music-content-archive-editor";

export async function loadMusicContentArchivePage(section: unknown, offset: number) {
  return getMusicContentArchiveData(section, offset);
}

export async function mutateMusicContentArchive(input: unknown): Promise<MusicArchiveMutationResult> {
  const admin = await requireAdmin();
  if (!(await verifyAdminActionOrigin(admin.id, "music-content-archive-v2"))) {
    return { ok: false, message: "The request origin was blocked. Reload the dashboard and try again." };
  }
  const parsed = musicArchiveMutationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "The archive request is incomplete or stale. Reload before trying again." };
  const unconfirmed = (): MusicArchiveMutationResult => ({ ok: false, reloadRequired: true,
    message: "The archive result could not be confirmed. Your drafts are kept. Reload and check the saved collection before trying again." });
  try {
    const client = createAdminServiceClient();
    if (!client) return { ok: false, message: "Supabase admin access is unavailable. Nothing was sent." };
    const { section, operation, itemId, expectedVersions, expectedArchiveUpdatedAt } = parsed.data;
    // A lost response may follow a committed move. Never retry automatically.
    const { data, error } = await client.rpc("mutate_music_content_archive_v2", {
      p_section: section, p_operation: operation, p_item_id: itemId,
      p_expected_versions: expectedVersions.items, p_actor_id: admin.id,
      p_expected_presentation_updated_at: parsed.data.section === "soundcloud" ? parsed.data.expectedVersions.presentationUpdatedAt : null,
      p_expected_archive_updated_at: expectedArchiveUpdatedAt ?? null,
    });
    if (error) {
      if (["PGRST202", "42883"].includes(error.code)) return { ok: false, message: "Music archive needs migration 0042. Existing Music editing still works." };
      if (error.code === "40001") return { ok: false, reloadRequired: true, message: "This Music collection or its archive changed in another session. Reload before continuing." };
      return unconfirmed();
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) return unconfirmed();
    const response = data as Record<string, unknown>;
    if (response.outcome === "capacity") return { ok: false, message: `All ${MUSIC_ARCHIVE_LIMITS[section]} slots are occupied, including hidden items. Archive another saved item first; this one remains safely archived.` };
    if (["conflict", "missing", "id_in_use"].includes(String(response.outcome))) return {
      ok: false, reloadRequired: true, message: "The saved collection or archive changed. Nothing was overwritten. Reload before continuing.",
    };
    if (response.section !== section || response.outcome !== (operation === "archive" ? "archived" : "restored")) return unconfirmed();
    const snapshot = parseMusicArchiveSnapshot(section, response.canonicalSection, response.versions);
    const archive = parseArchivePage(response.archive);
    if (!snapshot || !archive || archive.offset !== 0) return unconfirmed();
    const expectedIds = new Set(Object.keys(expectedVersions.items));
    if (operation === "archive") expectedIds.delete(itemId);
    else expectedIds.add(itemId);
    if (snapshot.payload.items.length !== expectedIds.size ||
      snapshot.payload.items.some((item) => !expectedIds.has(item.id))) return unconfirmed();
    const restored = snapshot.payload.items.find((item) => item.id === itemId);
    if (operation === "archive" ? Boolean(restored) : !restored || restored.isPublished) return unconfirmed();
    if (operation === "restore" && archive.items.some((item) => item.id === itemId)) return unconfirmed();
    const audit = await writeAuditLog({ actorId: admin.id, action: `music_${section}_${operation}`,
      tableName: section === "platforms" ? "music_platform_links" : "soundcloud_tracks", recordId: itemId,
      metadata: { recoverable: true, restoredHidden: operation === "restore" } });
    revalidatePath("/", "layout");
    revalidatePath("/music");
    revalidatePath("/admin/v2/pages/music");
    revalidatePath("/admin/v2/media");
    const canonicalSection = await reloadPhotoArchiveSection(client, "music", section, snapshot.versions, snapshot.payload);
    if (canonicalSection === null) return unconfirmed();
    const message = operation === "archive"
      ? "Item archived and removed from the public Music page. Its slot is free; no media file was deleted."
      : "Item restored as hidden. Review it and save it as visible when you are ready.";
    return { ok: true, section, canonicalSection, versions: snapshot.versions, archive,
      message: `${message}${audit && !audit.ok ? " The audit log could not be recorded." : ""}` };
  } catch {
    return unconfirmed();
  }
}
