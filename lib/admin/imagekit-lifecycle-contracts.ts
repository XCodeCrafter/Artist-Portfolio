import "server-only";

import { z } from "zod";
import { getImageKitMediaTarget } from "@/lib/admin/imagekit-media-policy";

const intentIdSchema = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
const providerIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const checksumSchema = z.string().regex(/^[0-9a-f]{64}$/);
const mimeSchema = z.enum([
  "image/avif", "image/gif", "image/jpeg", "image/png", "image/webp",
  "video/mp4", "video/quicktime", "video/webm",
]);
const timestampSchema = z.string().max(40).datetime({ offset: true })
  .refine((value) => Number.isFinite(Date.parse(value)));

function metadataText(maximum: number, minimum = 0) {
  // Check the original string before trimming: a trailing newline must not be
  // silently normalized into a different, apparently valid client request.
  return z.string().refine((value) => !/[\u0000-\u001f\u007f-\u009f]/.test(value))
    .transform((value) => value.trim()).pipe(z.string().min(minimum).max(maximum));
}

export const prepareImageKitRequestSchema = z.object({
  intentId: intentIdSchema,
  label: metadataText(220, 1),
  alt: metadataText(220),
  usageKey: metadataText(120),
  sortOrder: z.number().int().min(0).max(9999),
  isPublished: z.boolean(),
  mimeType: mimeSchema,
  sizeBytes: z.number().int().positive().safe(),
  checksumSha256: checksumSchema,
}).strict().refine((value) => {
  const target = getImageKitMediaTarget(value.mimeType);
  return target !== null && value.sizeBytes <= target.maximumBytes;
}, { message: "File exceeds the ImageKit pilot limit.", path: ["sizeBytes"] });

export const imageKitIntentRequestSchema = z.object({ intentId: intentIdSchema }).strict();
export const imageKitFinalizeRequestSchema = z.object({
  intentId: intentIdSchema,
  fileId: providerIdSchema,
}).strict();

/** These admin actions allocate their own namespace; callers cannot adopt assets. */
export function imageKitAssetId(intentId: string) {
  return `imagekit-${intentId}`;
}

const snapshotSchema = z.object({
  intentId: intentIdSchema,
  assetId: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,99}$/),
  physicalObjectId: intentIdSchema,
  storageProvider: z.literal("imagekit"),
  storageContainer: providerIdSchema,
  objectKey: z.string().max(256),
  mediaType: z.enum(["image", "video"]),
  mimeType: mimeSchema,
  expectedByteSize: z.number().int().positive().safe(),
  expectedChecksumSha256: checksumSchema,
  expiresAt: timestampSchema,
  status: z.enum(["prepared", "consumed", "expired", "cancelled", "failed"]),
  issuedAt: timestampSchema.nullable(),
  authorityExpiresAt: timestampSchema.nullable(),
  fileId: providerIdSchema.nullable(),
  versionId: providerIdSchema.nullable(),
  versionToken: z.string().regex(/^[A-Za-z0-9_.-]{1,256}$/).nullable(),
  sourceVariantId: intentIdSchema.nullable(),
  cleanupState: z.enum(["not_needed", "pending", "leased", "attention"]),
}).strict();

export type ImageKitUploadSnapshot = Readonly<z.infer<typeof snapshotSchema>>;
const claimOutcomeSchema = z.enum(["issued", "already_issued", "terminal", "too_late"]);
const finalizedOutcomeSchema = z.enum(["consumed", "already_consumed"]);
export type ImageKitClaimSnapshot = ImageKitUploadSnapshot & Readonly<{
  outcome: z.infer<typeof claimOutcomeSchema>;
}>;
export type ImageKitFinalizedSnapshot = ImageKitUploadSnapshot & Readonly<{
  outcome: z.infer<typeof finalizedOutcomeSchema>;
}>;

function isWholeSecondTimestamp(value: string) {
  return /T\d{2}:\d{2}:\d{2}(?:\.0+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && Date.parse(value) % 1000 === 0;
}

/**
 * Parse only the base 0047 prepare/resolve/close result. A claim or finalization
 * result has an additional outcome and is deliberately NOT accepted here.
 * This is validation, not ownership proof: callers must use actor-scoped RPCs.
 */
export function parseImageKitUploadSnapshot(
  input: unknown,
  expected: { intentId: string; storageContainer: string },
): ImageKitUploadSnapshot | null {
  if (!intentIdSchema.safeParse(expected.intentId).success ||
      !providerIdSchema.safeParse(expected.storageContainer).success) return null;
  const parsed = snapshotSchema.safeParse(input);
  if (!parsed.success) return null;
  const value = parsed.data;
  const target = getImageKitMediaTarget(value.mimeType);
  if (!target || value.intentId !== expected.intentId ||
      value.storageContainer !== expected.storageContainer ||
      value.assetId !== imageKitAssetId(expected.intentId) ||
      value.objectKey !== `media/source/${value.assetId}/${value.intentId}.${target.extension}` ||
      value.mediaType !== (value.mimeType.startsWith("image/") ? "image" : "video") ||
      value.expectedByteSize > target.maximumBytes) return null;

  const issued = value.issuedAt !== null;
  if (issued !== (value.authorityExpiresAt !== null)) return null;
  if (value.issuedAt !== null && value.authorityExpiresAt !== null) {
    const issuedAt = Date.parse(value.issuedAt);
    const authorityExpiresAt = Date.parse(value.authorityExpiresAt);
    const expiresAt = Math.floor(Date.parse(value.expiresAt) / 1000) * 1000;
    if (!isWholeSecondTimestamp(value.issuedAt) || !isWholeSecondTimestamp(value.authorityExpiresAt) ||
        authorityExpiresAt - issuedAt < 30_000 ||
        authorityExpiresAt !== Math.min(issuedAt + 300_000, expiresAt - 2000)) return null;
  }

  const binding = [value.fileId, value.versionId, value.versionToken, value.sourceVariantId];
  const allBound = binding.every((part) => part !== null);
  const allUnbound = binding.every((part) => part === null);
  if (value.status === "consumed") {
    if (!issued || !allBound || value.cleanupState !== "not_needed") return null;
  } else {
    if (!allUnbound) return null;
    if (value.status === "prepared" || !issued) {
      if (value.cleanupState !== "not_needed") return null;
    } else if (value.cleanupState === "not_needed") return null;
  }
  return value;
}

/** A claim result never authorizes signing unless its exact outcome is issued. */
export function parseImageKitClaimSnapshot(
  input: unknown,
  expected: { intentId: string; storageContainer: string },
): ImageKitClaimSnapshot | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const { outcome, ...base } = input as Record<string, unknown>;
  const parsedOutcome = claimOutcomeSchema.safeParse(outcome);
  if (!parsedOutcome.success) return null;
  // Strip only the known outcome field. The base parser must still reject any
  // other extra field and enforce all identity/binding/lifecycle invariants.
  const snapshot = parseImageKitUploadSnapshot(base, expected);
  if (!snapshot) return null;
  if (["issued", "already_issued"].includes(parsedOutcome.data) &&
      (snapshot.status !== "prepared" || snapshot.issuedAt === null)) return null;
  if (parsedOutcome.data === "terminal" && snapshot.status === "prepared") return null;
  if (parsedOutcome.data === "too_late" &&
      (snapshot.status !== "cancelled" || snapshot.issuedAt !== null)) return null;
  return { ...snapshot, outcome: parsedOutcome.data };
}

/** Validate the atomic finalizer result without weakening the base contract. */
export function parseImageKitFinalizedSnapshot(
  input: unknown,
  expected: { intentId: string; storageContainer: string },
): ImageKitFinalizedSnapshot | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const { outcome, ...base } = input as Record<string, unknown>;
  const parsedOutcome = finalizedOutcomeSchema.safeParse(outcome);
  if (!parsedOutcome.success) return null;
  const snapshot = parseImageKitUploadSnapshot(base, expected);
  if (!snapshot || snapshot.status !== "consumed") return null;
  return { ...snapshot, outcome: parsedOutcome.data };
}

/** Explicit safe projection: never spread a private lifecycle snapshot to UI. */
export function toImageKitUploadStatus(snapshot: ImageKitUploadSnapshot) {
  return {
    intentId: snapshot.intentId,
    assetId: snapshot.assetId,
    status: snapshot.status,
    expiresAt: snapshot.expiresAt,
    issued: snapshot.issuedAt !== null,
    cleanupPending: snapshot.cleanupState !== "not_needed",
  };
}
