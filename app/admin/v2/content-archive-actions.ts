"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { verifyAdminActionOrigin } from "@/lib/admin/action-security";
import { createAdminServiceClient } from "@/lib/admin/service";
import { writeAuditLog } from "@/lib/admin/audit";
import { getVisualContentArchiveData } from "@/lib/admin/visual-content-archive";
import { visualArchiveMutationSchema, visualArchiveSection, parseVisualArchivePage, parseVisualArchiveSnapshot, type VisualArchiveMutationResult } from "@/lib/admin/visual-content-archive-editor";

export async function loadVisualContentArchivePage(collection: unknown, offset: number) {
  return getVisualContentArchiveData(collection, offset);
}

export async function mutateVisualContentArchive(input: unknown): Promise<VisualArchiveMutationResult> {
  const admin = await requireAdmin();
  if (!(await verifyAdminActionOrigin(admin.id, "visual-content-archive-v2"))) {
    return { ok: false, message: "The request origin was blocked. Reload the dashboard and try again." };
  }
  const parsed = visualArchiveMutationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "The archive request is incomplete or stale. Reload before trying again." };
  const unconfirmed = (): VisualArchiveMutationResult => ({ ok: false, reloadRequired: true,
    message: "The archive result could not be confirmed. Your drafts are kept. Reload and check the saved collection before trying again." });
  try {
    const client = createAdminServiceClient();
    if (!client) return { ok: false, message: "Supabase admin access is unavailable. Nothing was sent." };
    const { collection, operation, itemId, expectedVersions, expectedArchiveUpdatedAt } = parsed.data;
    // A lost response may follow a committed transaction. Never retry writes.
    const { data, error } = await client.rpc("mutate_visual_content_archive_v2", {
      p_collection: collection, p_operation: operation, p_item_id: itemId,
      p_expected_versions: expectedVersions, p_actor_id: admin.id,
      p_expected_archive_updated_at: expectedArchiveUpdatedAt ?? null,
    });
    if (error) {
      if (["PGRST202", "42883"].includes(error.code)) return { ok: false, message: "This archive needs migration 0044. Existing editing still works." };
      if (error.code === "40001") return { ok: false, reloadRequired: true, message: "This collection or archive changed in another session. Reload before continuing." };
      return unconfirmed();
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) return unconfirmed();
    const response = data as Record<string, unknown>;
    if (response.outcome === "capacity") return { ok: false, message: "All active slots are occupied, including hidden items. Archive another saved item first; this one remains safely archived." };
    if (response.outcome === "featured_conflict") return { ok: false, message: "Another saved video already has the legacy featured marker. Archive that video before restoring this one. Your archived video has not changed." };
    if (["conflict", "missing", "id_in_use"].includes(String(response.outcome))) return {
      ok: false, reloadRequired: true, message: "The saved collection or archive changed. Nothing was overwritten. Reload before continuing.",
    };
    const section = visualArchiveSection(collection);
    if (response.collection !== collection || response.section !== section ||
      response.outcome !== (operation === "archive" ? "archived" : "restored")) return unconfirmed();
    const snapshot = parseVisualArchiveSnapshot(collection, response.canonicalSection, response.versions);
    const archive = parseVisualArchivePage(collection, response.archive);
    if (!snapshot || !archive || archive.offset !== 0 || snapshot.payload.items.length > archive.activeLimit) return unconfirmed();
    const expectedIds = new Set(Object.keys(expectedVersions.items));
    if (operation === "archive") expectedIds.delete(itemId);
    else expectedIds.add(itemId);
    const items = snapshot.payload.items;
    if (items.length !== expectedIds.size || items.some(item => !expectedIds.has(item.id))) return unconfirmed();
    const restored = items.find(item => item.id === itemId);
    if (operation === "archive" ? Boolean(restored) : !restored || restored.isPublished) return unconfirmed();
    if (operation === "restore" && archive.items.some(item => item.id === itemId)) return unconfirmed();
    const audit = await writeAuditLog({ actorId: admin.id, action: `${collection}_${operation}`,
      tableName: collection === "gallery" ? "gallery_images" : "videos", recordId: itemId,
      metadata: { recoverable: true, restoredHidden: operation === "restore" } });
    revalidatePath("/", "layout");
    revalidatePath(collection === "gallery" ? "/gallery" : "/video");
    revalidatePath(`/admin/v2/pages/${collection}`);
    revalidatePath("/admin/v2/media");
    const message = operation === "archive"
      ? "Item archived and removed from the public page. Its slot is free; no media file was deleted."
      : "Item restored as hidden. Review it and save it as visible when you are ready.";
    return { ok: true, collection, section, canonicalSection: snapshot.payload, versions: snapshot.versions, archive,
      message: `${message}${audit && !audit.ok ? " The audit log could not be recorded." : ""}` };
  } catch {
    return unconfirmed();
  }
}
