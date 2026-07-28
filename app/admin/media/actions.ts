"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { verifyAdminActionOrigin } from "@/lib/admin/action-security";
import { requireAdmin } from "@/lib/admin/auth";
import { writeAuditLog } from "@/lib/admin/audit";
import { createAdminServiceClient } from "@/lib/admin/service";
import {
  ensureMediaBucket,
  getMediaKind,
  getMediaSizeLimit,
  MEDIA_BUCKET,
} from "@/lib/admin/media";

const MEDIA_PATH = "/admin/media";
const REVALIDATE_PATHS = [
  "/",
  "/bio",
  "/gallery",
  "/music",
  "/video",
  "/booking",
  "/admin",
  MEDIA_PATH,
  "/admin/content",
];

const idValue = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9][a-z0-9_-]*$/i);

const mediaMetadataSchema = z.object({
  id: idValue,
  label: z.string().trim().min(1).max(220),
  alt: z.string().trim().max(220),
  usageKey: z.string().trim().max(120),
  sortOrder: z.coerce.number().int().min(0).max(9999),
  isPublished: z.boolean(),
});

const uploadMetadataSchema = mediaMetadataSchema.omit({ id: true }).extend({
  id: idValue.optional(),
});

const INTERNAL_MEDIA_BASE = "https://portfolio.invalid";

function isSafeMediaUrl(value: string) {
  if (!value) return true;

  try {
    if (value.startsWith("//")) return false;
    if (value.startsWith("/")) {
      return new URL(value, INTERNAL_MEDIA_BASE).origin === INTERNAL_MEDIA_BASE;
    }

    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

function isSafeImageUrl(value: string) {
  if (!value) return true;
  if (value.startsWith("/")) return isSafeMediaUrl(value);

  const storageBase = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!storageBase) return false;

  try {
    const imageUrl = new URL(value);
    const storageUrl = new URL(storageBase);
    return (
      isSafeMediaUrl(value) &&
      storageUrl.protocol === "https:" &&
      imageUrl.origin === storageUrl.origin &&
      imageUrl.pathname.startsWith("/storage/v1/object/public/")
    );
  } catch {
    return false;
  }
}

function isSafeCtaUrl(value: string) {
  return value.startsWith("#") || isSafeMediaUrl(value);
}

function isSafeEmbedUrl(value: string) {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      (url.port && url.port !== "443")
    ) {
      return false;
    }

    return [
      "open.spotify.com",
      "player.vimeo.com",
      "w.soundcloud.com",
      "www.youtube.com",
      "www.youtube-nocookie.com",
      "youtube.com",
      "youtu.be",
    ].includes(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

const galleryImageMetadataSchema = z.object({
  id: idValue,
  title: z.string().trim().min(1).max(180),
  src: z.string().trim().min(1).max(1000).refine(isSafeImageUrl),
  alt: z.string().trim().max(220),
  caption: z.string().trim().max(600),
  category: z.string().trim().max(80),
  sortOrder: z.coerce.number().int().min(0).max(9999),
  isPublished: z.boolean(),
  isMosaic: z.boolean(),
  isFreelanceStory: z.boolean(),
  freelanceStoryOrder: z.coerce.number().int().min(0).max(9999),
});

const galleryPresentationSchema = z.object({
  introEyebrow: z.string().trim().min(1).max(220),
  introTitle: z.string().trim().min(1).max(500),
  interludeLabel: z.string().trim().min(1).max(220),
  interludeMeta: z.string().trim().max(220),
  interludeEyebrow: z.string().trim().max(220),
  interludeTitle: z.string().trim().min(1).max(500),
  interludeVideoSrc: z.string().trim().max(1200).refine(isSafeMediaUrl),
  interludePosterSrc: z.string().trim().max(1200).refine(isSafeImageUrl),
  storyLabel: z.string().trim().min(1).max(220),
  storyScrollLabel: z.string().trim().max(220),
});

const galleryHeroSchema = z
  .object({
    title: z.string().trim().min(1).max(220),
    subtitle: z.string().trim().max(220),
    ctaLabel: z.string().trim().max(220),
    ctaHref: z.string().trim().max(1200).refine(isSafeCtaUrl),
    backgroundSrc: z
      .string()
      .trim()
      .min(1)
      .max(1200)
      .refine(isSafeMediaUrl),
    posterSrc: z.string().trim().max(1200).refine(isSafeImageUrl),
    mediaType: z.enum(["image", "video"]),
    sortOrder: z.coerce.number().int().min(0).max(9999),
  })
  .superRefine((hero, context) => {
    if (hero.mediaType === "image" && !isSafeImageUrl(hero.backgroundSrc)) {
      context.addIssue({
        code: "custom",
        message:
          "Choose a local hero image or one uploaded to this site's media library.",
        path: ["backgroundSrc"],
      });
    }
  });

const showreelVideoSchema = z
  .object({
    id: idValue,
    title: z.string().trim().min(1).max(220),
    description: z.string().trim().max(1000),
    embedUrl: z.string().trim().min(1).max(1200),
    platform: z.string().trim().min(1).max(80),
    thumbnailSrc: z
      .string()
      .trim()
      .max(1200)
      .refine(isSafeImageUrl),
    videoType: z.enum([
      "showreel",
      "scene",
      "self_tape",
      "interview",
      "music_video",
      "behind_scenes",
      "other",
    ]),
    isFeatured: z.boolean(),
    sortOrder: z.coerce.number().int().min(0).max(9999),
    isPublished: z.boolean(),
  })
  .superRefine((video, context) => {
    const sourceType = video.platform.toLowerCase();
    const sourceIsValid =
      sourceType === "upload" || sourceType === "direct"
        ? isSafeMediaUrl(video.embedUrl)
        : isSafeEmbedUrl(video.embedUrl);

    if (!sourceIsValid) {
      context.addIssue({
        code: "custom",
        message: "The selected video source is not allowed.",
        path: ["embedUrl"],
      });
    }
  });

const showreelPresentationSchema = z.object({
  sectionEyebrow: z.string().trim().max(220),
  sectionTitle: z.string().trim().min(1).max(500),
  sectionBody: z.string().trim().max(1000),
  featuredLabel: z.string().trim().max(220),
  featuredFallback: z.string().trim().max(1000),
  libraryEyebrow: z.string().trim().max(220),
  libraryTitle: z.string().trim().max(500),
  emptyText: z.string().trim().max(1000),
});

function formValue(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function formChecked(formData: FormData, key: string) {
  return formData.get(key) === "on";
}

type MediaView = "studio" | "showreel" | "library";

function redirectToStatus(
  status: string,
  view?: MediaView,
  anchor?: string
): never {
  const params = new URLSearchParams({ status });
  if (view) params.set("view", view);
  redirect(
    `${MEDIA_PATH}?${params.toString()}${anchor ? `#${anchor}` : ""}`
  );
}

function revalidateMediaSurfaces() {
  for (const path of REVALIDATE_PATHS) {
    revalidatePath(path);
  }
}

function isMissingPlacementSchema(error: { message?: string } | null) {
  const message = error?.message?.toLowerCase() || "";
  return ["is_mosaic", "is_freelance_story", "freelance_story_order"].some(
    (column) => message.includes(column)
  );
}

function isMissingGalleryStudioSchema(error: { message?: string } | null) {
  return (error?.message?.toLowerCase() || "").includes(
    "gallery_presentation"
  );
}

function slugify(value: string, fallback: string) {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return slug || fallback;
}

function normalizeGalleryId(formData: FormData) {
  const requested = formValue(formData, "id");
  if (requested) return requested;

  return `${slugify(
    [formValue(formData, "title"), formValue(formData, "alt")]
      .filter(Boolean)
      .join(" "),
    "gallery-image"
  )}-${randomUUID().slice(0, 6)}`;
}

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

async function getWriteContext() {
  const admin = await requireAdmin();
  if (!(await verifyAdminActionOrigin(admin.id, "media"))) {
    redirectToStatus("security-error");
  }

  const supabase = createAdminServiceClient();

  if (!supabase) {
    redirectToStatus("missing-service");
  }

  return { admin, supabase };
}

type PrepareMediaUploadInput = {
  id?: string;
  label: string;
  alt: string;
  usageKey: string;
  sortOrder: number;
  isPublished: boolean;
  fileName: string;
  fileSize: number;
  mimeType: string;
};

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
});

export async function prepareMediaUpload(input: PrepareMediaUploadInput) {
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

  const { supabase } = await getWriteContext();
  const bucketResult = await ensureMediaBucket(supabase);
  if (bucketResult.error) {
    console.error(bucketResult.error);
    return { ok: false as const, error: "Storage bucket could not be prepared." };
  }

  const id =
    parsed.data.id ||
    `${slugify(parsed.data.label || input.fileName, "media")}-${randomUUID().slice(
      0,
      8
    )}`;
  const extension = getExtension(input.mimeType);
  const storagePath = `${mediaKind}/${id}.${extension}`;
  const signedUpload = await supabase.storage
    .from(MEDIA_BUCKET)
    .createSignedUploadUrl(storagePath, { upsert: false });

  if (signedUpload.error) {
    console.error(signedUpload.error);
    return { ok: false as const, error: "Secure upload could not be prepared." };
  }

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
    },
  };
}

export async function finalizeMediaUpload(input: unknown) {
  const parsed = finalizeUploadSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "Uploaded media metadata is invalid." };
  }

  const expectedPrefix = `${parsed.data.mediaType}/${parsed.data.id}.`;
  if (
    !parsed.data.storagePath.startsWith(expectedPrefix) ||
    getMediaKind(parsed.data.mimeType) !== parsed.data.mediaType ||
    parsed.data.fileSize > getMediaSizeLimit(parsed.data.mimeType)
  ) {
    return { ok: false as const, error: "Uploaded media path is invalid." };
  }

  const { admin, supabase } = await getWriteContext();
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
    await supabase.storage.from(MEDIA_BUCKET).remove([parsed.data.storagePath]);
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
    await supabase.storage.from(MEDIA_BUCKET).remove([parsed.data.storagePath]);
    console.error(insertResult.error);
    return { ok: false as const, error: insertResult.error.message };
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

export async function updateMediaAsset(formData: FormData) {
  const parsed = mediaMetadataSchema.safeParse({
    id: formValue(formData, "id"),
    label: formValue(formData, "label"),
    alt: formValue(formData, "alt"),
    usageKey: formValue(formData, "usageKey"),
    sortOrder: formValue(formData, "sortOrder"),
    isPublished: formChecked(formData, "isPublished"),
  });

  if (!parsed.success) redirectToStatus("invalid-metadata", "library");

  const { admin, supabase } = await getWriteContext();
  const result = await supabase
    .from("media_assets")
    .update({
      label: parsed.data.label,
      alt: parsed.data.alt,
      usage_key: parsed.data.usageKey,
      sort_order: parsed.data.sortOrder,
      is_published: parsed.data.isPublished,
    })
    .eq("id", parsed.data.id);

  if (result.error) {
    console.error(result.error);
    redirectToStatus("save-error", "library");
  }

  await writeAuditLog({
    actorId: admin.id,
    action: "media_update",
    tableName: "media_assets",
    recordId: parsed.data.id,
  });

  revalidateMediaSurfaces();
  redirectToStatus("updated", "library");
}

export async function deleteMediaAsset(formData: FormData) {
  const parsed = idValue.safeParse(formValue(formData, "id"));
  if (!parsed.success) redirectToStatus("invalid-metadata", "library");

  const { admin, supabase } = await getWriteContext();
  const { data: asset, error: readError } = await supabase
    .from("media_assets")
    .select("id, storage_bucket, storage_path")
    .eq("id", parsed.data)
    .limit(1)
    .maybeSingle<{
      id: string;
      storage_bucket: string | null;
      storage_path: string | null;
    }>();

  if (readError) {
    console.error(readError);
    redirectToStatus("delete-error", "library");
  }

  if (asset?.storage_bucket && asset.storage_path) {
    const removeResult = await supabase.storage
      .from(asset.storage_bucket)
      .remove([asset.storage_path]);

    if (removeResult.error) {
      console.error(removeResult.error);
      redirectToStatus("delete-error", "library");
    }
  }

  const deleteResult = await supabase
    .from("media_assets")
    .delete()
    .eq("id", parsed.data);

  if (deleteResult.error) {
    console.error(deleteResult.error);
    redirectToStatus("delete-error", "library");
  }

  await writeAuditLog({
    actorId: admin.id,
    action: "media_delete",
    tableName: "media_assets",
    recordId: parsed.data,
    metadata: {
      storageBucket: asset?.storage_bucket,
      storagePath: asset?.storage_path,
    },
  });

  revalidateMediaSurfaces();
  redirectToStatus("deleted", "library");
}

export async function saveMediaGalleryImage(formData: FormData) {
  const parsed = galleryImageMetadataSchema.safeParse({
    id: normalizeGalleryId(formData),
    title: formValue(formData, "title"),
    src: formValue(formData, "src"),
    alt: formValue(formData, "alt"),
    caption: formValue(formData, "caption"),
    category: formValue(formData, "category"),
    sortOrder: formValue(formData, "sortOrder"),
    isPublished: formChecked(formData, "isPublished"),
    isMosaic: formChecked(formData, "isMosaic"),
    isFreelanceStory: formChecked(formData, "isFreelanceStory"),
    freelanceStoryOrder: formValue(formData, "freelanceStoryOrder") || 0,
  });

  if (!parsed.success) redirectToStatus("invalid-gallery-metadata");

  const { admin, supabase } = await getWriteContext();
  if (parsed.data.isFreelanceStory) {
    const selected = await supabase
      .from("gallery_images")
      .select("id")
      .eq("is_freelance_story", true);

    if (isMissingPlacementSchema(selected.error)) {
      redirectToStatus("placement-migration-required");
    }

    if (selected.error) {
      console.error(selected.error);
      redirectToStatus("save-gallery-error");
    }

    const isAlreadySelected = selected.data.some(
      (image) => image.id === parsed.data.id
    );
    if (!isAlreadySelected && selected.data.length >= 4) {
      redirectToStatus("story-limit-reached");
    }
  }

  const result = await supabase.from("gallery_images").upsert({
    id: parsed.data.id,
    title: parsed.data.title,
    src: parsed.data.src,
    alt: parsed.data.alt,
    caption: parsed.data.caption,
    category: parsed.data.category,
    sort_order: parsed.data.sortOrder,
    is_published: parsed.data.isPublished,
    is_mosaic: parsed.data.isMosaic,
    is_freelance_story: parsed.data.isFreelanceStory,
    freelance_story_order: parsed.data.freelanceStoryOrder,
  });

  if (result.error) {
    console.error(result.error);
    if (isMissingPlacementSchema(result.error)) {
      redirectToStatus("placement-migration-required");
    }
    redirectToStatus("save-gallery-error");
  }

  await writeAuditLog({
    actorId: admin.id,
    action: "media_gallery_update",
    tableName: "gallery_images",
    recordId: parsed.data.id,
    metadata: {
      section: "media-gallery",
    },
  });

  revalidateMediaSurfaces();
  redirectToStatus("saved-gallery-image");
}

export async function saveGalleryPresentation(formData: FormData) {
  const parsed = galleryPresentationSchema.safeParse({
    introEyebrow: formValue(formData, "introEyebrow"),
    introTitle: formValue(formData, "introTitle"),
    interludeLabel: formValue(formData, "interludeLabel"),
    interludeMeta: formValue(formData, "interludeMeta"),
    interludeEyebrow: formValue(formData, "interludeEyebrow"),
    interludeTitle: formValue(formData, "interludeTitle"),
    interludeVideoSrc: formValue(formData, "interludeVideoSrc"),
    interludePosterSrc: formValue(formData, "interludePosterSrc"),
    storyLabel: formValue(formData, "storyLabel"),
    storyScrollLabel: formValue(formData, "storyScrollLabel"),
  });

  if (!parsed.success) redirectToStatus("invalid-gallery-copy");

  const { admin, supabase } = await getWriteContext();
  const result = await supabase.from("gallery_presentation").upsert({
    id: "main",
    intro_eyebrow: parsed.data.introEyebrow,
    intro_title: parsed.data.introTitle,
    interlude_label: parsed.data.interludeLabel,
    interlude_meta: parsed.data.interludeMeta,
    interlude_eyebrow: parsed.data.interludeEyebrow,
    interlude_title: parsed.data.interludeTitle,
    interlude_video_src: parsed.data.interludeVideoSrc,
    interlude_poster_src: parsed.data.interludePosterSrc,
    story_label: parsed.data.storyLabel,
    story_scroll_label: parsed.data.storyScrollLabel,
  });

  if (result.error) {
    console.error(result.error);
    if (isMissingGalleryStudioSchema(result.error)) {
      const fallbackResult = await supabase.from("media_assets").upsert({
        id: "gallery-studio-settings",
        label: "Gallery Studio settings",
        src: "/gallery",
        alt: "",
        media_type: "document",
        usage_key: "system:gallery-studio",
        sort_order: 0,
        is_published: true,
        storage_bucket: "",
        storage_path: "",
        file_size: 0,
        mime_type: "application/json",
        metadata: parsed.data,
      });
      if (fallbackResult.error) {
        console.error(fallbackResult.error);
        redirectToStatus("gallery-studio-migration-required");
      }
    } else {
      redirectToStatus("save-gallery-copy-error");
    }
  }

  await writeAuditLog({
    actorId: admin.id,
    action: "gallery_presentation_update",
    tableName: "gallery_presentation",
    recordId: "main",
    metadata: { section: "gallery-studio" },
  });

  revalidateMediaSurfaces();
  redirectToStatus("saved-gallery-copy");
}

export async function saveGalleryHero(formData: FormData) {
  const parsed = galleryHeroSchema.safeParse({
    title: formValue(formData, "title"),
    subtitle: formValue(formData, "subtitle"),
    ctaLabel: formValue(formData, "ctaLabel"),
    ctaHref: formValue(formData, "ctaHref"),
    backgroundSrc: formValue(formData, "backgroundSrc"),
    posterSrc: formValue(formData, "posterSrc"),
    mediaType: formValue(formData, "mediaType"),
    sortOrder: formValue(formData, "sortOrder"),
  });
  if (!parsed.success) redirectToStatus("invalid-gallery-hero");

  const { admin, supabase } = await getWriteContext();
  const result = await supabase.from("page_heroes").upsert({
    page_slug: "gallery",
    title: parsed.data.title,
    subtitle: parsed.data.subtitle,
    cta_label: parsed.data.ctaLabel,
    cta_href: parsed.data.ctaHref,
    background_src: parsed.data.backgroundSrc,
    poster_src: parsed.data.posterSrc,
    media_type: parsed.data.mediaType,
    sort_order: parsed.data.sortOrder,
  });
  if (result.error) redirectToStatus("save-gallery-hero-error");

  await writeAuditLog({
    actorId: admin.id,
    action: "gallery_hero_update",
    tableName: "page_heroes",
    recordId: "gallery",
    metadata: { section: "gallery-studio" },
  });
  revalidateMediaSurfaces();
  redirectToStatus("saved-gallery-hero");
}

export async function saveShowreelHero(formData: FormData) {
  const parsed = galleryHeroSchema.safeParse({
    title: formValue(formData, "title"),
    subtitle: formValue(formData, "subtitle"),
    ctaLabel: formValue(formData, "ctaLabel"),
    ctaHref: formValue(formData, "ctaHref"),
    backgroundSrc: formValue(formData, "backgroundSrc"),
    posterSrc: formValue(formData, "posterSrc"),
    mediaType: formValue(formData, "mediaType"),
    sortOrder: formValue(formData, "sortOrder"),
  });
  if (!parsed.success) {
    redirectToStatus("invalid-showreel-hero", "showreel", "showreel-hero");
  }

  const { admin, supabase } = await getWriteContext();
  const result = await supabase.from("page_heroes").upsert({
    page_slug: "video",
    title: parsed.data.title,
    subtitle: parsed.data.subtitle,
    cta_label: parsed.data.ctaLabel,
    cta_href: parsed.data.ctaHref,
    background_src: parsed.data.backgroundSrc,
    poster_src: parsed.data.posterSrc,
    media_type: parsed.data.mediaType,
    sort_order: parsed.data.sortOrder,
  });
  if (result.error) {
    redirectToStatus(
      "save-showreel-hero-error",
      "showreel",
      "showreel-hero"
    );
  }
  await writeAuditLog({ actorId: admin.id, action: "showreel_hero_update", tableName: "page_heroes", recordId: "video", metadata: { section: "showreel-studio" } });
  revalidateMediaSurfaces();
  redirectToStatus("saved-showreel-hero", "showreel", "showreel-hero");
}

export async function saveShowreelVideo(formData: FormData) {
  const requestedId = formValue(formData, "id");
  const parsed = showreelVideoSchema.safeParse({
    id: requestedId || `${slugify(formValue(formData, "title"), "video")}-${randomUUID().slice(0, 6)}`,
    title: formValue(formData, "title"),
    description: formValue(formData, "description"),
    embedUrl: formValue(formData, "embedUrl"),
    platform: formValue(formData, "platform"),
    thumbnailSrc: formValue(formData, "thumbnailSrc"),
    videoType: formValue(formData, "videoType") || "showreel",
    isFeatured: formChecked(formData, "isFeatured"),
    sortOrder: formValue(formData, "sortOrder"),
    isPublished: formChecked(formData, "isPublished"),
  });
  if (!parsed.success) {
    redirectToStatus("invalid-showreel-video", "showreel", "showreel-videos");
  }

  const { admin, supabase } = await getWriteContext();
  if (parsed.data.platform.toLowerCase() === "upload") {
    const selectedAsset = await supabase
      .from("media_assets")
      .select("id")
      .eq("src", parsed.data.embedUrl)
      .eq("media_type", "video")
      .limit(1)
      .maybeSingle<{ id: string }>();

    if (selectedAsset.error || !selectedAsset.data) {
      if (selectedAsset.error) console.error(selectedAsset.error);
      redirectToStatus(
        "invalid-showreel-video",
        "showreel",
        "showreel-videos"
      );
    }
  }

  if (parsed.data.isFeatured) {
    const cleared = await supabase.from("videos").update({ is_featured: false }).neq("id", parsed.data.id);
    if (cleared.error) {
      redirectToStatus(
        "save-showreel-video-error",
        "showreel",
        "showreel-videos"
      );
    }
  }
  const result = await supabase.from("videos").upsert({
    id: parsed.data.id,
    title: parsed.data.title,
    description: parsed.data.description,
    embed_url: parsed.data.embedUrl,
    platform: parsed.data.platform,
    thumbnail_src: parsed.data.thumbnailSrc,
    video_type: parsed.data.videoType,
    is_featured: parsed.data.isFeatured,
    sort_order: parsed.data.sortOrder,
    is_published: parsed.data.isPublished,
  });
  if (result.error) {
    redirectToStatus(
      "save-showreel-video-error",
      "showreel",
      "showreel-videos"
    );
  }
  await writeAuditLog({ actorId: admin.id, action: "showreel_video_update", tableName: "videos", recordId: parsed.data.id, metadata: { videoType: parsed.data.videoType } });
  revalidateMediaSurfaces();
  redirectToStatus("saved-showreel-video", "showreel", "showreel-videos");
}

export async function saveShowreelPresentation(formData: FormData) {
  const parsed = showreelPresentationSchema.safeParse({
    sectionEyebrow: formValue(formData, "sectionEyebrow"),
    sectionTitle: formValue(formData, "sectionTitle"),
    sectionBody: formValue(formData, "sectionBody"),
    featuredLabel: formValue(formData, "featuredLabel"),
    featuredFallback: formValue(formData, "featuredFallback"),
    libraryEyebrow: formValue(formData, "libraryEyebrow"),
    libraryTitle: formValue(formData, "libraryTitle"),
    emptyText: formValue(formData, "emptyText"),
  });
  if (!parsed.success) {
    redirectToStatus("invalid-showreel-copy", "showreel", "showreel-copy");
  }
  const { admin, supabase } = await getWriteContext();
  const result = await supabase.from("media_assets").upsert({
    id: "showreel-studio-settings",
    label: "Showreel Studio settings",
    src: "/video",
    alt: "",
    media_type: "document",
    usage_key: "system:showreel-studio",
    sort_order: 0,
    is_published: true,
    storage_bucket: "",
    storage_path: "",
    file_size: 0,
    mime_type: "application/json",
    metadata: parsed.data,
  });
  if (result.error) {
    redirectToStatus(
      "save-showreel-copy-error",
      "showreel",
      "showreel-copy"
    );
  }
  await writeAuditLog({ actorId: admin.id, action: "showreel_presentation_update", tableName: "media_assets", recordId: "showreel-studio-settings", metadata: {} });
  revalidateMediaSurfaces();
  redirectToStatus("saved-showreel-copy", "showreel", "showreel-copy");
}

export async function deleteShowreelVideo(formData: FormData) {
  const parsed = idValue.safeParse(formValue(formData, "id"));
  if (!parsed.success) {
    redirectToStatus("invalid-showreel-video", "showreel", "showreel-videos");
  }
  const { admin, supabase } = await getWriteContext();
  const result = await supabase.from("videos").delete().eq("id", parsed.data);
  if (result.error) {
    redirectToStatus(
      "delete-showreel-video-error",
      "showreel",
      "showreel-videos"
    );
  }
  await writeAuditLog({ actorId: admin.id, action: "showreel_video_delete", tableName: "videos", recordId: parsed.data, metadata: {} });
  revalidateMediaSurfaces();
  redirectToStatus("deleted-showreel-video", "showreel", "showreel-videos");
}

export async function moveGalleryImage(formData: FormData) {
  const parsed = z
    .object({ id: idValue, direction: z.enum(["up", "down"]) })
    .safeParse({
      id: formValue(formData, "id"),
      direction: formValue(formData, "direction"),
    });
  if (!parsed.success) redirectToStatus("invalid-gallery-metadata");

  const { admin, supabase } = await getWriteContext();
  const current = await supabase
    .from("gallery_images")
    .select("id, sort_order")
    .eq("id", parsed.data.id)
    .single();
  if (current.error || !current.data) redirectToStatus("save-gallery-error");

  let neighborQuery = supabase
    .from("gallery_images")
    .select("id, sort_order")
    .neq("id", parsed.data.id)
    .limit(1);
  neighborQuery =
    parsed.data.direction === "up"
      ? neighborQuery.lt("sort_order", current.data.sort_order).order("sort_order", { ascending: false })
      : neighborQuery.gt("sort_order", current.data.sort_order).order("sort_order", { ascending: true });
  const neighbor = await neighborQuery.maybeSingle();
  if (neighbor.error) redirectToStatus("save-gallery-error");
  if (!neighbor.data) redirectToStatus("saved-gallery-image");

  const first = await supabase
    .from("gallery_images")
    .update({ sort_order: neighbor.data.sort_order })
    .eq("id", current.data.id);
  const second = await supabase
    .from("gallery_images")
    .update({ sort_order: current.data.sort_order })
    .eq("id", neighbor.data.id);
  if (first.error || second.error) redirectToStatus("save-gallery-error");

  await writeAuditLog({
    actorId: admin.id,
    action: "media_gallery_reorder",
    tableName: "gallery_images",
    recordId: parsed.data.id,
    metadata: { direction: parsed.data.direction },
  });
  revalidateMediaSurfaces();
  redirectToStatus("moved-gallery-image");
}

export async function deleteMediaGalleryImage(formData: FormData) {
  const parsed = idValue.safeParse(formValue(formData, "id"));
  if (!parsed.success) redirectToStatus("invalid-gallery-metadata");

  const { admin, supabase } = await getWriteContext();
  const result = await supabase
    .from("gallery_images")
    .delete()
    .eq("id", parsed.data);

  if (result.error) {
    console.error(result.error);
    redirectToStatus("delete-gallery-error");
  }

  await writeAuditLog({
    actorId: admin.id,
    action: "media_gallery_delete",
    tableName: "gallery_images",
    recordId: parsed.data,
    metadata: {
      section: "media-gallery",
    },
  });

  revalidateMediaSurfaces();
  redirectToStatus("deleted-gallery-image");
}
