import "server-only";

import { createHmac } from "node:crypto";
import type { ImageKitMediaUploadCredentials } from "@/lib/admin/media-upload-config";

export const IMAGEKIT_UPLOAD_ENDPOINT =
  "https://upload.imagekit.io/api/v2/files/upload";
export const IMAGEKIT_UPLOAD_AUTH_TTL_SECONDS = 5 * 60;

const MINIMUM_USEFUL_TTL_SECONDS = 30;
const EXPIRY_SAFETY_SECONDS = 2;
const IMAGEKIT_PILOT_IMAGE_BYTES = 10 * 1024 * 1024;
const IMAGEKIT_PILOT_VIDEO_BYTES = 95_000_000;
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ASSET_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,99}$/;

const MIME_TARGETS = {
  "image/avif": {
    extension: "avif",
    maximumBytes: IMAGEKIT_PILOT_IMAGE_BYTES,
  },
  "image/gif": { extension: "gif", maximumBytes: IMAGEKIT_PILOT_IMAGE_BYTES },
  "image/jpeg": {
    extension: "jpg",
    maximumBytes: IMAGEKIT_PILOT_IMAGE_BYTES,
  },
  "image/png": { extension: "png", maximumBytes: IMAGEKIT_PILOT_IMAGE_BYTES },
  "image/webp": {
    extension: "webp",
    maximumBytes: IMAGEKIT_PILOT_IMAGE_BYTES,
  },
  "video/mp4": {
    extension: "mp4",
    maximumBytes: IMAGEKIT_PILOT_VIDEO_BYTES,
  },
  "video/quicktime": {
    extension: "mov",
    maximumBytes: IMAGEKIT_PILOT_VIDEO_BYTES,
  },
  "video/webm": {
    extension: "webm",
    maximumBytes: IMAGEKIT_PILOT_VIDEO_BYTES,
  },
} as const;

type ImageKitPilotMimeType = keyof typeof MIME_TARGETS;

export type ImageKitV2UploadParams = Readonly<{
  fileName: string;
  folder: string;
  useUniqueFileName: "false";
  overwriteFile: "false";
  isPrivateFile: "false";
  isPublished: "true";
  checks: string;
}>;

export type ImageKitUploadAuthority = Readonly<{
  uploadEndpoint: typeof IMAGEKIT_UPLOAD_ENDPOINT;
  token: string;
  expiresAt: number;
  uploadParams: ImageKitV2UploadParams;
}>;

export type ImageKitUploadAuthorityResult =
  | Readonly<{
      ok: true;
      authority: ImageKitUploadAuthority;
    }>
  | Readonly<{
      ok: false;
      reason:
        | "invalid-target"
        | "invalid-media"
        | "invalid-expiry"
        | "intent-expired";
    }>;

type CreateImageKitUploadAuthorityInput = Readonly<{
  credentials: ImageKitMediaUploadCredentials;
  intentId: string;
  assetId: string;
  objectKey: string;
  mimeType: string;
  expectedByteSize: number;
  intentExpiresAt: string;
  nowSeconds?: number;
}>;

function base64UrlJson(value: object) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function isImageKitPilotMimeType(
  mimeType: string
): mimeType is ImageKitPilotMimeType {
  return Object.hasOwn(MIME_TARGETS, mimeType);
}

/**
 * Creates a short-lived ImageKit Upload V2 JWT for one database reservation.
 * Every multipart field returned in uploadParams is represented byte-for-byte
 * in the signed payload. The caller must append only `file` and `token` beyond
 * these values. A V2 token is one-shot even after a failed request: never issue
 * this twice for one intent; 0037 must cancel/fail it and allocate a new intent
 * and object key before retrying. V2 is currently beta, so this adapter must
 * not be wired before the 0037 resolver/finalizer.
 */
export function createImageKitUploadAuthority(
  input: CreateImageKitUploadAuthorityInput
): ImageKitUploadAuthorityResult {
  const nowSeconds = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const expiresAtSeconds = Math.floor(Date.parse(input.intentExpiresAt) / 1000);

  if (
    !UUID_V4_PATTERN.test(input.intentId) ||
    !ASSET_ID_PATTERN.test(input.assetId)
  ) {
    return { ok: false, reason: "invalid-target" };
  }

  if (!isImageKitPilotMimeType(input.mimeType)) {
    return { ok: false, reason: "invalid-media" };
  }

  const mediaTarget = MIME_TARGETS[input.mimeType];
  if (
    !Number.isSafeInteger(input.expectedByteSize) ||
    input.expectedByteSize < 1 ||
    input.expectedByteSize > mediaTarget.maximumBytes
  ) {
    return { ok: false, reason: "invalid-media" };
  }

  const expectedObjectKey =
    `media/source/${input.assetId}/${input.intentId}.` +
    mediaTarget.extension;
  if (input.objectKey !== expectedObjectKey) {
    return { ok: false, reason: "invalid-target" };
  }

  if (!Number.isSafeInteger(nowSeconds) || !Number.isFinite(expiresAtSeconds)) {
    return { ok: false, reason: "invalid-expiry" };
  }

  const expiresAt = Math.min(
    nowSeconds + IMAGEKIT_UPLOAD_AUTH_TTL_SECONDS,
    expiresAtSeconds - EXPIRY_SAFETY_SECONDS
  );
  if (expiresAt - nowSeconds < MINIMUM_USEFUL_TTL_SECONDS) {
    return { ok: false, reason: "intent-expired" };
  }

  const uploadParams: ImageKitV2UploadParams = {
    fileName: `${input.intentId}.${mediaTarget.extension}`,
    folder: `/media/source/${input.assetId}`,
    useUniqueFileName: "false",
    overwriteFile: "false",
    isPrivateFile: "false",
    isPublished: "true",
    checks:
      `"file.size" = ${input.expectedByteSize} AND ` +
      `"file.mime" = "${input.mimeType}"`,
  };
  const protectedHeader = {
    alg: "HS256",
    typ: "JWT",
    kid: input.credentials.publicKey,
  } as const;
  const payload = {
    ...uploadParams,
    iat: nowSeconds,
    exp: expiresAt,
  } as const;
  const signingInput = `${base64UrlJson(protectedHeader)}.${base64UrlJson(payload)}`;
  const signature = createHmac("sha256", input.credentials.privateKey)
    .update(signingInput)
    .digest("base64url");

  return {
    ok: true,
    authority: {
      uploadEndpoint: IMAGEKIT_UPLOAD_ENDPOINT,
      token: `${signingInput}.${signature}`,
      expiresAt,
      uploadParams,
    },
  };
}
