"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { verifyAdminActionOrigin } from "@/lib/admin/action-security";
import { createAdminServiceClient } from "@/lib/admin/service";
import { writeAuditLog } from "@/lib/admin/audit";
import { getNavbarShortcutArchiveData } from "@/lib/admin/content-archive";
import { archiveMutationSchema, parseArchivePage, type ArchiveMutationResult } from "@/lib/admin/content-archive-editor";
import { parseNavbarSocialLinksSnapshot } from "@/lib/admin/navbar-social-links-editor";

export async function loadNavbarShortcutArchivePage(offset: number) {
  return getNavbarShortcutArchiveData(offset);
}

export async function mutateNavbarShortcutArchive(input: unknown): Promise<ArchiveMutationResult> {
  const admin = await requireAdmin();
  if (!(await verifyAdminActionOrigin(admin.id, "navbar-shortcut-archive-v2"))) {
    return { ok: false, message: "The request origin was blocked. Reload the dashboard and try again." };
  }
  const parsed = archiveMutationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "The archive request is incomplete or stale. Reload before trying again." };
  const unconfirmed = (): ArchiveMutationResult => ({ ok: false, reloadRequired: true,
    message: "The archive result could not be confirmed. Your draft is kept. Reload and check the saved shortcuts before trying again." });
  try {
    const client = createAdminServiceClient();
    if (!client) return { ok: false, message: "Supabase admin access is unavailable. Nothing was sent." };
    const { operation, itemId, expectedVersions, expectedArchiveUpdatedAt } = parsed.data;
    // No transport retry: a lost response must not cause a second lifecycle write.
    const { data, error } = await client.rpc("mutate_navbar_shortcut_archive_v2", {
      p_operation: operation, p_item_id: itemId, p_expected_versions: expectedVersions,
      p_actor_id: admin.id, p_expected_archive_updated_at: expectedArchiveUpdatedAt ?? null,
    });
    if (error) {
      if (["PGRST202", "42883"].includes(error.code)) return { ok: false, message: "Shortcut archive needs migration 0041. Existing shortcut editing still works." };
      if (error.code === "40001") return { ok: false, reloadRequired: true, message: "Shortcuts or their archive changed in another session. Reload before continuing." };
      return unconfirmed();
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) return unconfirmed();
    const response = data as Record<string, unknown>;
    if (response.outcome === "capacity") return { ok: false, message: "All 16 shortcut slots are occupied, including hidden links. Archive another saved shortcut first; this item remains safely archived." };
    if (["conflict", "missing", "id_in_use"].includes(String(response.outcome))) return {
      ok: false, reloadRequired: true, message: "The saved shortcuts or archive changed. Nothing was overwritten. Reload before continuing.",
    };
    if (response.outcome !== (operation === "archive" ? "archived" : "restored")) return unconfirmed();
    const snapshot = parseNavbarSocialLinksSnapshot(response.snapshot);
    const archive = parseArchivePage(response.archive);
    if (!snapshot || !archive || archive.offset !== 0) return unconfirmed();
    const expectedIds = new Set(Object.keys(expectedVersions));
    if (operation === "archive") expectedIds.delete(itemId);
    else expectedIds.add(itemId);
    if (snapshot.items.length !== expectedIds.size ||
      snapshot.items.some((item) => !expectedIds.has(item.id))) return unconfirmed();
    const restored = snapshot.items.find((item) => item.id === itemId);
    if (operation === "archive" ? Boolean(restored) : !restored || restored.isPublished) return unconfirmed();
    if (operation === "restore" && archive.items.some((item) => item.id === itemId)) return unconfirmed();

    const audit = await writeAuditLog({ actorId: admin.id, action: `navbar_shortcut_${operation}`,
      tableName: "social_links", recordId: itemId, metadata: { recoverable: true, restoredHidden: operation === "restore" } });
    revalidatePath("/", "layout");
    revalidatePath("/admin/v2/navigation");
    revalidatePath("/admin/v2/media");
    const message = operation === "archive"
      ? "Shortcut archived and removed from the navbar and footer. Its slot is free; no media file was deleted."
      : "Shortcut restored as hidden. Review it and save it as visible when you are ready.";
    return { ok: true, snapshot, archive, message: `${message}${audit && !audit.ok ? " The audit log could not be recorded." : ""}` };
  } catch {
    return unconfirmed();
  }
}
