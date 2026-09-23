import "server-only";

const IMAGE_BYTES = 10 * 1024 * 1024;
const VIDEO_BYTES = 95_000_000;
const TARGETS = {
  "image/avif": { extension: "avif", maximumBytes: IMAGE_BYTES },
  "image/gif": { extension: "gif", maximumBytes: IMAGE_BYTES },
  "image/jpeg": { extension: "jpg", maximumBytes: IMAGE_BYTES },
  "image/png": { extension: "png", maximumBytes: IMAGE_BYTES },
  "image/webp": { extension: "webp", maximumBytes: IMAGE_BYTES },
  "video/mp4": { extension: "mp4", maximumBytes: VIDEO_BYTES },
  "video/quicktime": { extension: "mov", maximumBytes: VIDEO_BYTES },
  "video/webm": { extension: "webm", maximumBytes: VIDEO_BYTES },
} as const;

/** One policy for the dormant signer and verifier; no provider calls. */
export function getImageKitMediaTarget(mimeType: string) {
  return Object.hasOwn(TARGETS, mimeType)
    ? TARGETS[mimeType as keyof typeof TARGETS]
    : null;
}

export function isImageKitTargetIdentity(intentId: string, assetId: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(intentId)
    && /^[a-z0-9][a-z0-9_-]{0,99}$/.test(assetId);
}
