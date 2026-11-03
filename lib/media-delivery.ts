// Relative import: next.config.ts loads this module before path aliases exist.
import {
  getConfiguredImageKitUrlEndpoint,
  isConfiguredSupabaseMediaSource,
} from "./media-source";

/**
 * Public media delivery through the ImageKit CDN, with Supabase Storage kept as
 * the only source of truth.
 *
 * ImageKit is configured with the Supabase project domain as a "Web Folder"
 * origin, so `https://ik.imagekit.io/<id>/storage/v1/object/public/...` fetches
 * the same object once and then serves it from ImageKit's cache. Visitors stop
 * consuming Supabase egress; uploads, admin and stored URLs are unchanged.
 *
 * `tr=orig-true` delivers the original bytes untouched. Without it ImageKit
 * re-encodes videos (to WebM at quality 50, spending video processing units)
 * and recompresses images that `next/image` then compresses a second time.
 *
 * Only render data is rewritten. Stored values, admin editors, metadata and
 * site-sharing validation keep the canonical Supabase URLs, because those paths
 * validate sources with `isConfiguredMediaLibrarySource`.
 */
export const MEDIA_DELIVERY_QUERY = "?tr=orig-true";

const DELIVERABLE_EXTENSION =
  /\.(?:avif|gif|jpe?g|png|webp|mp4|m4v|mov|webm)$/i;

export function getMediaDeliveryEndpoint(): string | null {
  if (process.env.MEDIA_DELIVERY_CDN !== "imagekit") return null;
  return getConfiguredImageKitUrlEndpoint();
}

function toDeliveryUrlWith(value: string, endpoint: string): string {
  if (!isConfiguredSupabaseMediaSource(value)) return value;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return value;
  }
  // Signed or versioned URLs carry meaning in their query; leave them alone.
  if (url.search || !DELIVERABLE_EXTENSION.test(url.pathname)) return value;

  return `${endpoint}${url.pathname}${MEDIA_DELIVERY_QUERY}`;
}

/** Rewrites one public Supabase media URL to its CDN URL when enabled. */
export function toDeliveryUrl(value: string): string {
  const endpoint = getMediaDeliveryEndpoint();
  return endpoint ? toDeliveryUrlWith(value, endpoint) : value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function mapDeep(value: unknown, endpoint: string): unknown {
  if (typeof value === "string") return toDeliveryUrlWith(value, endpoint);
  if (Array.isArray(value)) return value.map((item) => mapDeep(item, endpoint));
  if (!isPlainObject(value)) return value;

  const mapped: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    mapped[key] = mapDeep(item, endpoint);
  }
  return mapped;
}

/**
 * Returns a copy of public render data with every Supabase media URL pointed at
 * the CDN. When delivery is disabled the input is returned unchanged.
 */
export function withMediaDelivery<T>(value: T): T {
  const endpoint = getMediaDeliveryEndpoint();
  return endpoint ? (mapDeep(value, endpoint) as T) : value;
}
