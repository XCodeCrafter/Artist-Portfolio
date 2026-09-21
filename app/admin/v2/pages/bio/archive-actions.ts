"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { verifyAdminActionOrigin } from "@/lib/admin/action-security";
import { createAdminServiceClient } from "@/lib/admin/service";
import { writeAuditLog } from "@/lib/admin/audit";
import { getBioContentArchiveData } from "@/lib/admin/bio-content-archive";
import { parseArchivePage } from "@/lib/admin/content-archive-editor";
import {
  BIO_ARCHIVE_LIMITS, bioArchiveMutationSchema, bioArchiveSection,
  parseBioArchiveSnapshot, sameBioArchiveVersion, type BioArchiveMutationResult,
} from "@/lib/admin/bio-content-archive-editor";

export async function loadBioContentArchivePage(collection: unknown, offset: number) {
  return getBioContentArchiveData(collection, offset);
}

export async function mutateBioContentArchive(input: unknown): Promise<BioArchiveMutationResult> {
  const admin = await requireAdmin();
  if (!(await verifyAdminActionOrigin(admin.id, "bio-content-archive-v2"))) {
    return { ok: false, message: "The request origin was blocked. Reload the dashboard and try again." };
  }
  const parsed = bioArchiveMutationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "The archive request is incomplete or stale. Reload before trying again." };
  const unconfirmed = (): BioArchiveMutationResult => ({ ok: false, reloadRequired: true,
    message: "The archive result could not be confirmed. Your drafts are kept. Reload and check the saved collection before trying again." });
  try {
    const client = createAdminServiceClient();
    if (!client) return { ok: false, message: "Supabase admin access is unavailable. Nothing was sent." };
    const { collection, operation, itemId, expectedVersions, expectedArchiveUpdatedAt } = parsed.data;
    // A response may be lost after commit. Never repeat a lifecycle write automatically.
    const { data, error } = await client.rpc("mutate_bio_content_archive_v2", {
      p_collection: collection, p_operation: operation, p_item_id: itemId,
      p_expected_versions: expectedVersions, p_actor_id: admin.id,
      p_expected_archive_updated_at: expectedArchiveUpdatedAt ?? null,
    });
    if (error) {
      if (["PGRST202", "42883"].includes(error.code)) return { ok: false, message: "Bio archive needs migration 0043. Existing Bio editing still works." };
      if (error.code === "40001") return { ok: false, reloadRequired: true, message: "This Bio section or its archive changed in another session. Reload before continuing." };
      return unconfirmed();
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) return unconfirmed();
    const response = data as Record<string, unknown>;
    if (response.outcome === "capacity") return { ok: false, message: `All ${BIO_ARCHIVE_LIMITS[collection]} slots are occupied, including hidden items. Archive another saved item first; this one remains safely archived.` };
    if (["conflict", "missing", "id_in_use"].includes(String(response.outcome))) return {
      ok: false, reloadRequired: true, message: "The saved section or archive changed. Nothing was overwritten. Reload before continuing.",
    };
    const section = bioArchiveSection(collection);
    if (response.collection !== collection || response.section !== section ||
      response.outcome !== (operation === "archive" ? "archived" : "restored")) return unconfirmed();
    const snapshot = parseBioArchiveSnapshot(collection, response.canonicalSection, response.versions);
    const archive = parseArchivePage(response.archive);
    if (!snapshot || !archive || archive.offset !== 0) return unconfirmed();

    function matchesTransition(items: { id: string }[], before: Record<string, string>, affected: boolean) {
      const expectedIds = new Set(Object.keys(before));
      if (affected) {
        if (operation === "archive") expectedIds.delete(itemId);
        else expectedIds.add(itemId);
      }
      return items.length === expectedIds.size && items.every((item) => expectedIds.has(item.id));
    }
    if (snapshot.section === "credits" && parsed.data.collection === "credits") {
      if (!matchesTransition(snapshot.payload.items, parsed.data.expectedVersions.items, true)) return unconfirmed();
    } else if (snapshot.section === "biography" && parsed.data.collection !== "credits") {
      if (!matchesTransition(snapshot.payload.galleryImages, parsed.data.expectedVersions.galleryItems, collection === "portraits") ||
        !matchesTransition(snapshot.payload.paragraphs, parsed.data.expectedVersions.paragraphItems, collection === "paragraphs") ||
        !sameBioArchiveVersion(snapshot.versions.profileUpdatedAt, parsed.data.expectedVersions.profileUpdatedAt)) return unconfirmed();
    } else return unconfirmed();
    const items = snapshot.section === "credits" ? snapshot.payload.items
      : collection === "portraits" ? snapshot.payload.galleryImages : snapshot.payload.paragraphs;
    const restored = items.find((item) => item.id === itemId);
    if (operation === "archive" ? Boolean(restored) : !restored || restored.isPublished) return unconfirmed();
    if (operation === "restore" && archive.items.some((item) => item.id === itemId)) return unconfirmed();
    const audit = await writeAuditLog({ actorId: admin.id, action: `bio_${collection}_${operation}`,
      tableName: collection === "credits" ? "actor_credits" : collection === "portraits" ? "bio_gallery_images" : "bio_paragraphs",
      recordId: itemId, metadata: { recoverable: true, restoredHidden: operation === "restore" } });
    revalidatePath("/", "layout");
    revalidatePath("/bio");
    revalidatePath("/admin/v2/pages/bio");
    revalidatePath("/admin/v2/media");
    const message = operation === "archive"
      ? "Item archived and removed from the public Bio page. Its slot is free; no media file was deleted."
      : "Item restored as hidden. Review it and save it as visible when you are ready.";
    return { ok: true, collection, section, canonicalSection: snapshot.payload, versions: snapshot.versions, archive,
      message: `${message}${audit && !audit.ok ? " The audit log could not be recorded." : ""}` };
  } catch {
    return unconfirmed();
  }
}
