"use server";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { verifyAdminActionOrigin } from "@/lib/admin/action-security";
import { requireAdmin } from "@/lib/admin/auth";
import { writeAuditLog } from "@/lib/admin/audit";
import { createAdminServiceClient } from "@/lib/admin/service";
import { hasAuthSecuritySecret, keyedDigest, safeDigestEqual } from "@/lib/admin/security-secret";
import { ensureMediaBucket, getMediaKind, getMediaSizeLimit, MEDIA_BUCKET } from "@/lib/admin/media";
import { idValue, mediaMetadataSchema, revalidateMediaSurfaces, slugify } from "@/lib/admin/media-action-shared";

const uploadMetadataSchema = mediaMetadataSchema.omit({ id: true }).extend({
  id: idValue.optional(),
});

function getExtension(mimeType: string) {
  const fallbackByMime: Record<string, string> = {
    "image/avif": "avif",
    "image/gif": "gif",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "video/mp4": "mp4",
    "video/quicktime": "mov",
    "video/webm": "webm",
  };

  return fallbackByMime[mimeType] || "bin";
}

function startsWithBytes(bytes: Uint8Array, signature: number[]) {
  return signature.every((value, index) => bytes[index] === value);
}

function detectMediaMimeType(bytes: Uint8Array) {
  if (startsWithBytes(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (
    startsWithBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  ) {
    return "image/png";
  }

  const ascii = new TextDecoder("ascii").decode(bytes);
  if (ascii.startsWith("GIF87a") || ascii.startsWith("GIF89a")) {
    return "image/gif";
  }
  if (ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP") {
    return "image/webp";
  }
  if (ascii.slice(4, 8) === "ftyp") {
    const brand = ascii.slice(8, 12);
    const compatibleBrands = ascii.slice(8, 32);
    if (
      brand === "avif" ||
      brand === "avis" ||
      compatibleBrands.includes("avif") ||
      compatibleBrands.includes("avis")
    ) {
      return "image/avif";
    }
    if (brand === "qt  ") return "video/quicktime";
    return "video/mp4";
  }
  if (startsWithBytes(bytes, [0x1a, 0x45, 0xdf, 0xa3])) {
    return "video/webm";
  }

  return null;
}

async function inspectStoredMedia(publicUrl: string) {
  const response = await fetch(publicUrl, {
    cache: "no-store",
    headers: { Range: "bytes=0-4095" },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok || !response.body) return null;

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;

  while (byteLength < 32) {
    const chunk = await reader.read();
    if (chunk.done) break;
    chunks.push(chunk.value);
    byteLength += chunk.value.byteLength;
  }
  await reader.cancel();

  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const contentRange = response.headers.get("content-range") || "";
  const rangeSize = Number(contentRange.match(/\/(\d+)$/)?.[1]);
  const contentLength = Number(response.headers.get("content-length"));

  return {
    mimeType: detectMediaMimeType(bytes),
    responseSize:
      Number.isSafeInteger(rangeSize) && rangeSize > 0
        ? rangeSize
        : Number.isSafeInteger(contentLength) && contentLength > 0
          ? contentLength
          : null,
  };
}

async function getUploadWriteContext() {
  // Authentication redirects must retain Next's normal control flow. Origin and
  // configuration failures, however, are upload errors shown in either editor.
  const admin = await requireAdmin();
  if (!(await verifyAdminActionOrigin(admin.id, "media"))) {
    return { ok: false as const, error: "The request origin was blocked. Refresh the admin and try again." };
  }

  const supabase = createAdminServiceClient();
  if (!supabase) {
    return { ok: false as const, error: "Media uploads are not configured." };
  }

  return { ok: true as const, admin, supabase };
}

const prepareUploadSchema = uploadMetadataSchema.extend({
  label: z.string().trim().max(220),
  fileName: z.string().trim().min(1).max(260),
  fileSize: z.number().int().positive().safe(),
  mimeType: z.string().trim().min(1).max(120),
});

const finalizeUploadSchema = z.object({
  id: idValue,
  label: z.string().trim().min(1).max(220),
  alt: z.string().trim().max(220),
  usageKey: z.string().trim().max(120),
  sortOrder: z.coerce.number().int().min(0).max(9999),
  isPublished: z.boolean(),
  mediaType: z.enum(["image", "video"]),
  storagePath: z.string().trim().min(1).max(500),
  fileName: z.string().trim().min(1).max(260),
  fileSize: z.coerce.number().int().positive(),
  mimeType: z.string().trim().min(1).max(120),
  uploadExpiresAt: z.number().int().positive().safe(),
  uploadProof: z.string().regex(/^[a-f0-9]{64}$/),
});

function uploadProof(adminId: string, ticket: {
  id: string; storagePath: string; mimeType: string; fileSize: number;
  mediaType: string; uploadExpiresAt: number;
}) {
  return keyedDigest("media-upload-finalization-v1", JSON.stringify([
    adminId, MEDIA_BUCKET, ticket.id, ticket.storagePath, ticket.mimeType,
    ticket.fileSize, ticket.mediaType, ticket.uploadExpiresAt,
  ]));
}

export async function prepareMediaUpload(value: unknown) {
  const context = await getUploadWriteContext();
  if (!context.ok) return context;
  const { admin, supabase } = context;
  if (!hasAuthSecuritySecret()) {
    return { ok: false as const, error: "Secure upload signing is not configured." };
  }
  const preparation = prepareUploadSchema.safeParse(value);
  if (!preparation.success) {
    return { ok: false as const, error: "Upload details need attention." };
  }
  const input = preparation.data;
  const mediaKind = getMediaKind(input.mimeType);
  if (!mediaKind) {
    return { ok: false as const, error: "Unsupported file type." };
  }

  if (input.fileSize <= 0) {
    return { ok: false as const, error: "Choose a file before upload." };
  }

  if (input.fileSize > getMediaSizeLimit(input.mimeType)) {
    return { ok: false as const, error: "File is too large." };
  }

  const parsed = uploadMetadataSchema.safeParse({
    id: input.id || undefined,
    label: input.label || input.fileName,
    alt: input.alt,
    usageKey: input.usageKey,
    sortOrder: input.sortOrder,
    isPublished: input.isPublished,
  });

  if (!parsed.success) {
    return { ok: false as const, error: "Media metadata needs attention." };
  }

  const bucketResult = await ensureMediaBucket(supabase);
  if (bucketResult.error) {
    console.error(bucketResult.error);
    return { ok: false as const, error: "Storage bucket could not be prepared." };
  }

  // A caller can name an upload, but can never claim an existing object key.
  const id = `${slugify(parsed.data.id || parsed.data.label || input.fileName, "media").slice(0, 60)}-${randomUUID()}`;
  const extension = getExtension(input.mimeType);
  const storagePath = `${mediaKind}/${id}.${extension}`;
  const signedUpload = await supabase.storage
    .from(MEDIA_BUCKET)
    .createSignedUploadUrl(storagePath, { upsert: false });

  if (signedUpload.error) {
    console.error(signedUpload.error);
    return { ok: false as const, error: "Secure upload could not be prepared." };
  }

  const uploadExpiresAt = Date.now() + 60 * 60 * 1000;
  const proof = uploadProof(admin.id, {
    id, storagePath, mimeType: input.mimeType, fileSize: input.fileSize,
    mediaType: mediaKind, uploadExpiresAt,
  });
  return {
    ok: true as const,
    ticket: {
      id,
      label: parsed.data.label,
      alt: parsed.data.alt,
      usageKey: parsed.data.usageKey,
      sortOrder: parsed.data.sortOrder,
      isPublished: parsed.data.isPublished,
      mediaType: mediaKind,
      storageBucket: MEDIA_BUCKET,
      storagePath,
      fileName: input.fileName,
      fileSize: input.fileSize,
      mimeType: input.mimeType,
      token: signedUpload.data.token,
      uploadExpiresAt,
      uploadProof: proof,
    },
  };
}

export async function finalizeMediaUpload(input: unknown) {
  const context = await getUploadWriteContext();
  if (!context.ok) return context;
  const { admin, supabase } = context;
  const parsed = finalizeUploadSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "Uploaded media metadata is invalid." };
  }

  if (
    parsed.data.uploadExpiresAt <= Date.now() ||
    !safeDigestEqual(parsed.data.uploadProof, uploadProof(admin.id, parsed.data))
  ) {
    return { ok: false as const, error: "This upload ticket is invalid or expired. Start the upload again." };
  }
  const expectedPath = `${parsed.data.mediaType}/${parsed.data.id}.${getExtension(parsed.data.mimeType)}`;
  if (
    parsed.data.storagePath !== expectedPath ||
    getMediaKind(parsed.data.mimeType) !== parsed.data.mediaType ||
    parsed.data.fileSize > getMediaSizeLimit(parsed.data.mimeType)
  ) {
    return { ok: false as const, error: "Uploaded media path is invalid." };
  }

  const pathParts = parsed.data.storagePath.split("/");
  const fileName = pathParts.pop() || "";
  const folder = pathParts.join("/");
  const storedObjects = await supabase.storage.from(MEDIA_BUCKET).list(folder, {
    limit: 10,
    search: fileName,
  });

  const storedObject = storedObjects.data?.find(
    (object) => object.name === fileName
  );
  if (storedObjects.error || !storedObject) {
    if (storedObjects.error) console.error(storedObjects.error);
    return { ok: false as const, error: "Uploaded file could not be verified." };
  }

  const {
    data: { publicUrl },
  } = supabase.storage
    .from(MEDIA_BUCKET)
    .getPublicUrl(parsed.data.storagePath);

  let inspectedMedia: Awaited<ReturnType<typeof inspectStoredMedia>> = null;
  try {
    inspectedMedia = await inspectStoredMedia(publicUrl);
  } catch (error) {
    console.error(error);
  }

  const metadataSize = Number(storedObject.metadata?.size);
  const actualSize =
    Number.isSafeInteger(metadataSize) && metadataSize > 0
      ? metadataSize
      : inspectedMedia?.responseSize;
  const verifiedMimeType = inspectedMedia?.mimeType;

  if (
    !actualSize ||
    actualSize !== parsed.data.fileSize ||
    actualSize > getMediaSizeLimit(parsed.data.mimeType) ||
    verifiedMimeType !== parsed.data.mimeType ||
    getMediaKind(verifiedMimeType) !== parsed.data.mediaType
  ) {
    // Do not physically delete from a failure path: this ticket may be a replay
    // of a successfully registered upload. Cleanup needs durable ownership.
    await writeAuditLog({
      actorId: admin.id,
      action: "security_admin_media_upload_rejected",
      tableName: "media_assets",
      recordId: parsed.data.id,
      metadata: {
        claimedMimeType: parsed.data.mimeType,
        claimedSize: parsed.data.fileSize,
        verifiedMimeType,
        verifiedSize: actualSize,
      },
    });
    return { ok: false as const, error: "Uploaded file content did not match its declared type." };
  }

  const insertResult = await supabase.from("media_assets").insert({
    id: parsed.data.id,
    label: parsed.data.label,
    src: publicUrl,
    alt: parsed.data.alt,
    media_type: parsed.data.mediaType,
    usage_key: parsed.data.usageKey,
    sort_order: parsed.data.sortOrder,
    is_published: parsed.data.isPublished,
    storage_bucket: MEDIA_BUCKET,
    storage_path: parsed.data.storagePath,
    file_size: actualSize,
    mime_type: verifiedMimeType,
    metadata: {
      uploadedAt: new Date().toISOString(),
    },
  });

  if (insertResult.error) {
    if (insertResult.error.code === "23505") {
      // A lost response can lead to retrying a successfully committed insert.
      // A duplicate alone proves nothing: reconcile only the exact verified
      // object, owned by this signed ticket, and never revive a trashed row or
      // overwrite metadata that another admin may have edited since upload.
      const existing = await supabase.from("media_assets")
        .select("id,src,storage_bucket,storage_path,file_size,mime_type,media_type,deleted_at")
        .eq("id", parsed.data.id)
        .maybeSingle();
      const asset = existing.data;
      if (!existing.error && asset &&
          asset.id === parsed.data.id &&
          asset.src === publicUrl &&
          asset.storage_bucket === MEDIA_BUCKET &&
          asset.storage_path === parsed.data.storagePath &&
          asset.file_size === actualSize &&
          asset.mime_type === verifiedMimeType &&
          asset.media_type === parsed.data.mediaType &&
          asset.deleted_at === null) {
        revalidateMediaSurfaces();
        return { ok: true as const };
      }
    }
    // An insert can fail after another retry has already registered this file.
    // Retain the object; permanent cleanup must prove it is still unreferenced.
    console.error("Media asset insert failed after upload verification.", {
      code: insertResult.error.code || "unknown",
      message: insertResult.error.message,
    });
    return {
      ok: false as const,
      error: "Uploaded media could not be added to the library.",
    };
  }

  await writeAuditLog({
    actorId: admin.id,
    action: "media_upload",
    tableName: "media_assets",
    recordId: parsed.data.id,
    metadata: {
      mediaType: parsed.data.mediaType,
      mimeType: parsed.data.mimeType,
      size: parsed.data.fileSize,
      storagePath: parsed.data.storagePath,
    },
  });

  revalidateMediaSurfaces();
  return { ok: true as const };
}
