import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createAdminServiceClient,
  hasAdminServiceEnv,
} from "@/lib/admin/service";

export const MEDIA_BUCKET =
  process.env.SUPABASE_MEDIA_BUCKET || "portfolio-media";

export const ALLOWED_IMAGE_MIME_TYPES = [
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const ALLOWED_VIDEO_MIME_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
] as const;

export const ALLOWED_MEDIA_MIME_TYPES = [
  ...ALLOWED_IMAGE_MIME_TYPES,
  ...ALLOWED_VIDEO_MIME_TYPES,
] as const;

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

export type MediaAsset = {
  id: string;
  label: string;
  src: string;
  alt: string;
  mediaType: "image" | "video" | "audio" | "document";
  usageKey: string;
  sortOrder: number;
  isPublished: boolean;
  storageBucket: string;
  storagePath: string;
  fileSize: number;
  mimeType: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  deletedAt: string;
  deletedBy: string;
};

type MediaAssetRow = {
  id: string;
  label: string;
  src: string;
  alt: string;
  media_type: MediaAsset["mediaType"];
  usage_key: string;
  sort_order: number;
  is_published: boolean;
  storage_bucket: string | null;
  storage_path: string | null;
  file_size: number | null;
  mime_type: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  deleted_by?: string | null;
};

function mapAsset(row: MediaAssetRow): MediaAsset {
  return {
    id: row.id,
    label: row.label,
    src: row.src,
    alt: row.alt,
    mediaType: row.media_type,
    usageKey: row.usage_key,
    sortOrder: row.sort_order,
    isPublished: row.is_published,
    storageBucket: row.storage_bucket || "",
    storagePath: row.storage_path || "",
    fileSize: row.file_size || 0,
    mimeType: row.mime_type || "",
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at || "",
    deletedBy: row.deleted_by || "",
  };
}

export function getMediaKind(mimeType: string): "image" | "video" | null {
  if (ALLOWED_IMAGE_MIME_TYPES.includes(mimeType as never)) return "image";
  if (ALLOWED_VIDEO_MIME_TYPES.includes(mimeType as never)) return "video";
  return null;
}

export function getMediaSizeLimit(mimeType: string) {
  return getMediaKind(mimeType) === "video" ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
}

export function formatBytes(bytes: number) {
  if (!bytes) return "0 B";

  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const precision = Number.isInteger(value) || value >= 10 || unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
}

export async function ensureMediaBucket(supabase: SupabaseClient) {
  const bucketOptions = {
    public: true,
    fileSizeLimit: MAX_VIDEO_BYTES,
    allowedMimeTypes: [...ALLOWED_MEDIA_MIME_TYPES],
  };

  const { data: buckets, error: listError } =
    await supabase.storage.listBuckets();

  if (listError) {
    return { error: listError };
  }

  const exists = buckets?.some((bucket) => bucket.name === MEDIA_BUCKET);

  if (!exists) {
    return supabase.storage.createBucket(MEDIA_BUCKET, bucketOptions);
  }

  // Bucket configuration belongs to migrations/deployment. Updating it before
  // every upload can fail when the project-wide size cap is below the stored
  // bucket limit, even though the existing bucket is fully usable.
  return { data: { name: MEDIA_BUCKET }, error: null };
}

export async function getMediaAssets(options?: {
  includeDeleted?: boolean;
}): Promise<{
  assets: MediaAsset[];
  isConfigured: boolean;
  loadError?: string;
}> {
  if (!hasAdminServiceEnv()) {
    return {
      assets: [],
      isConfigured: false,
    };
  }

  const supabase = createAdminServiceClient();
  if (!supabase) {
    return {
      assets: [],
      isConfigured: false,
    };
  }

  const { data, error } = await supabase
    .from("media_assets")
    .select("*")
    .neq("id", "gallery-studio-settings")
    .neq("id", "showreel-studio-settings")
    .neq("id", "home-studio-settings")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false })
    .returns<MediaAssetRow[]>();

  if (error) {
    return {
      assets: [],
      isConfigured: true,
      loadError: "Unable to load media assets from Supabase.",
    };
  }

  return {
    assets: (data || [])
      .map(mapAsset)
      .filter((asset) => options?.includeDeleted || !asset.deletedAt),
    isConfigured: true,
  };
}
