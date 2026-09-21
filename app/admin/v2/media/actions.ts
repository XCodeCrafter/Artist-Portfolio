"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { verifyAdminActionOrigin } from "@/lib/admin/action-security";
import { createAdminServiceClient } from "@/lib/admin/service";
import { writeAuditLog } from "@/lib/admin/audit";
import { isSafeManagedMediaSource } from "@/lib/media-source";
import { mediaDetailsSchema, mediaMutationSchema, type MediaLibraryResult } from "@/lib/admin/media-library-editor";

function revalidateMedia() {
  revalidatePath("/", "layout");
  revalidatePath("/admin/v2", "layout");
  for (const path of ["/admin/media", "/admin/content"]) revalidatePath(path);
}

export async function saveMediaDetailsV2(input: unknown): Promise<MediaLibraryResult> {
  const admin = await requireAdmin();
  if (!(await verifyAdminActionOrigin(admin.id, "media-v2:details"))) return { ok: false, message: "The request origin was blocked. Refresh Admin V2 and try again." };
  const parsed = mediaDetailsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Add a file name (up to 220 characters), and check the description and note lengths." };
  const supabase = createAdminServiceClient();
  if (!supabase) return { ok: false, message: "Admin storage access is not configured." };
  const { id, expectedUpdatedAt, label, alt, usageKey, isPublished } = parsed.data;
  const { data, error } = await supabase.from("media_assets")
    .update({ label, alt, usage_key: usageKey, is_published: isPublished }).eq("id", id).eq("updated_at", expectedUpdatedAt)
    .is("deleted_at", null).select("id").maybeSingle();
  if (error) return { ok: false, message: "File details could not be saved. Your draft is still here." };
  if (!data) return { ok: false, conflict: true, message: "This file changed in another session. Reload its saved details before trying again." };
  await writeAuditLog({ actorId: admin.id, action: "media_v2_details_save", tableName: "media_assets", recordId: id });
  revalidateMedia();
  return { ok: true, message: "Library details saved. Existing page captions and alt text are edited on their own pages." };
}

export async function mutateMediaAssetV2(input: unknown): Promise<MediaLibraryResult> {
  const admin = await requireAdmin();
  if (!(await verifyAdminActionOrigin(admin.id, "media-v2:lifecycle"))) return { ok: false, message: "The request origin was blocked. Refresh Admin V2 and try again." };
  const parsed = mediaMutationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Choose a valid file, action and replacement before continuing." };
  const supabase = createAdminServiceClient();
  if (!supabase) return { ok: false, message: "Admin storage access is not configured." };
  const value = parsed.data;
  let replacementVersion: string | null = null;
  if (value.operation === "replace_and_trash") {
    const candidate = await supabase.from("media_assets").select("src,updated_at")
      .eq("id", value.replacementId!).eq("is_published", true).is("deleted_at", null)
      .maybeSingle<{ src: string; updated_at: string }>();
    if (candidate.error || !candidate.data || !isSafeManagedMediaSource(candidate.data.src)) {
      return { ok: false, message: "The replacement is not an available file from this portfolio's configured storage. Choose another file." };
    }
    replacementVersion = candidate.data.updated_at;
  }
  const { data, error } = await supabase.rpc("mutate_media_asset_v2", {
    p_asset_id: value.id, p_expected_updated_at: value.expectedUpdatedAt, p_actor_id: admin.id,
    p_operation: value.operation, p_replacement_id: value.replacementId ?? null,
    p_replacement_expected_updated_at: replacementVersion,
  });
  if (error) return { ok: false, conflict: error.code === "40001", message:
    error.code === "PGRST202" || error.code === "42883" ? "Apply and verify migration 0040 before using safe media removal."
      : error.code === "40001" ? "The file or its usage changed. Reload and review its usage before trying again."
      : "This action could not be completed safely. Nothing was removed; refresh and try again." };
  const outcome = typeof data === "object" && data !== null ? (data as Record<string, unknown>).outcome : null;
  const messages: Record<string, string> = {
    conflict: "This file changed in another session. Reload before trying again.",
    missing: "This file no longer exists in the library.",
    in_use: "This file is used on the portfolio. Choose a replacement to remove it safely.",
    invalid_replacement: "The replacement is unavailable or incompatible. Choose another active file of the same type.",
    pipeline_busy: "This file has protected optimization or provider records. Its variants need a provider-aware cleanup workflow before removal; no files were changed.",
  };
  if (typeof outcome !== "string" || !["trashed", "replaced_and_trashed", "restored"].includes(outcome)) {
    return { ok: false, conflict: outcome === "conflict" || outcome === "in_use" || outcome === "missing", message: messages[String(outcome)] || "The action could not be confirmed. Reload the library to verify its state." };
  }
  await writeAuditLog({ actorId: admin.id, action: `media_v2_${outcome}`, tableName: "media_assets", recordId: value.id,
    metadata: { replacementId: value.replacementId ?? null, operation: value.operation } });
  revalidateMedia();
  return { ok: true, message: outcome === "restored" ? "File restored to the library. Previous page placements were not restored."
    : outcome === "replaced_and_trashed" ? "Portfolio references replaced; the old file is now in recoverable Trash."
      : "File moved to recoverable Trash. Storage bytes are retained until permanent cleanup." };
}
