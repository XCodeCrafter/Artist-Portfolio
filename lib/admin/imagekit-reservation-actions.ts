"use server";

import { getImageKitReservationContext, type ImageKitReservationFailure } from "@/lib/admin/imagekit-action-context";
import {
  prepareImageKitRequestSchema, imageKitIntentRequestSchema, imageKitAssetId,
  parseImageKitUploadSnapshot, toImageKitUploadStatus,
} from "@/lib/admin/imagekit-lifecycle-contracts";

type Context = Extract<Awaited<ReturnType<typeof getImageKitReservationContext>>, { ok: true }>;
type Result = ImageKitReservationFailure | { ok: true; upload: ReturnType<typeof toImageKitUploadStatus> };
const invalid: ImageKitReservationFailure = { ok: false, code: "invalid-request", message: "Check the file details and start with a valid upload reservation." };
const unconfirmed: ImageKitReservationFailure = { ok: false, code: "unconfirmed", message: "The reservation result could not be confirmed. Check its status with the same reservation ID; do not start another upload yet." };

async function invoke(context: Context, name: string, args: Record<string, unknown>, intentId: string): Promise<Result> {
  try {
    const { data, error } = await context.client.rpc(name, { ...args, p_actor_id: context.actorId });
    if (error) {
      if (["PGRST202", "42883", "42P01"].includes(error.code)) {
        return { ok: false, code: "migration-required", message: "Apply and verify migrations 0047 and 0048 before the ImageKit pilot." };
      }
      if (["42501", "23503"].includes(error.code)) {
        return { ok: false, code: "intent-unavailable", message: "This reservation is unavailable to your account." };
      }
      if (["23505", "40001"].includes(error.code)) {
        return { ok: false, code: "conflict", message: "The reservation changed or conflicts with existing media. Check its status before retrying." };
      }
      return unconfirmed;
    }
    const snapshot = parseImageKitUploadSnapshot(data, { intentId, storageContainer: context.storageContainer });
    if (snapshot && name === "prepare_imagekit_upload_v1" && (
      snapshot.mimeType !== args.p_mime_type || snapshot.expectedByteSize !== args.p_byte_size ||
      snapshot.expectedChecksumSha256 !== args.p_checksum_sha256
    )) return unconfirmed;
    if (snapshot && name === "close_imagekit_upload_v1" && snapshot.status === "prepared") return unconfirmed;
    return snapshot ? { ok: true, upload: toImageKitUploadStatus(snapshot) } : unconfirmed;
  } catch {
    // Timeout/transport failure can occur after commit. Never retry or close
    // implicitly, and never forward provider/DB details or credential material.
    return unconfirmed;
  }
}

/** Stores declared metadata only. Does NOT claim/sign authority or upload. */
export async function prepareImageKitReservation(input: unknown): Promise<Result> {
  const context = await getImageKitReservationContext("prepare");
  if (!context.ok) return context;
  const parsed = prepareImageKitRequestSchema.safeParse(input);
  if (!parsed.success) return invalid;
  const value = parsed.data;
  return invoke(context, "prepare_imagekit_upload_v1", {
    p_intent_id: value.intentId, p_asset_id: imageKitAssetId(value.intentId),
    p_asset_metadata: { label: value.label, alt: value.alt, usageKey: value.usageKey, sortOrder: value.sortOrder, isPublished: value.isPublished },
    p_storage_container: context.storageContainer, p_mime_type: value.mimeType,
    p_byte_size: value.sizeBytes, p_checksum_sha256: value.checksumSha256, p_ttl_seconds: 600,
  }, value.intentId);
}

/** Read/expire this actor's durable intent; no provider lookup or reissuance. */
export async function resolveImageKitReservation(input: unknown): Promise<Result> {
  const context = await getImageKitReservationContext("resolve");
  if (!context.ok) return context;
  const parsed = imageKitIntentRequestSchema.safeParse(input);
  if (!parsed.success) return invalid;
  return invoke(context, "resolve_imagekit_upload_v1", { p_intent_id: parsed.data.intentId }, parsed.data.intentId);
}

/** Logical cancellation queues reconciliation if issued. It deletes no bytes. */
export async function cancelImageKitReservation(input: unknown): Promise<Result> {
  const context = await getImageKitReservationContext("cancel");
  if (!context.ok) return context;
  const parsed = imageKitIntentRequestSchema.safeParse(input);
  if (!parsed.success) return invalid;
  return invoke(context, "close_imagekit_upload_v1", { p_intent_id: parsed.data.intentId, p_status: "cancelled" }, parsed.data.intentId);
}
