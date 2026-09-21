"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { verifyAdminActionOrigin } from "@/lib/admin/action-security";
import { requireAdmin } from "@/lib/admin/auth";
import { writeAuditLog } from "@/lib/admin/audit";
import { createAdminServiceClient } from "@/lib/admin/service";
import { idValue, mediaMetadataSchema, revalidateMediaSurfaces, slugify } from "@/lib/admin/media-action-shared";
import {
  prepareMediaUpload as prepareSharedMediaUpload,
  finalizeMediaUpload as finalizeSharedMediaUpload,
} from "@/lib/admin/media-upload-actions";
import {
  isConfiguredMediaLibrarySource,
  isSafeLocalMediaPath,
} from "@/lib/media-source";

const MEDIA_PATH = "/admin/media";
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
  return (
    isSafeLocalMediaPath(value) || isConfiguredMediaLibrarySource(value)
  );
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

function isMissingGalleryV2Snapshot(error: {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}) {
  const message = [error.message, error.details, error.hint]
    .filter(Boolean)
    .join(" ");
  return (
    error.code === "PGRST202" ||
    (error.code === "42883" && /get_gallery_page_v2_snapshot/i.test(message)) ||
    /schema cache.*get_gallery_page_v2_snapshot/i.test(message)
  );
}

async function handOffLegacyGalleryWrite(supabase: SupabaseClient) {
  const { error } = await supabase.rpc("get_gallery_page_v2_snapshot", {
    p_site_id: "main",
  });

  // A successful snapshot proves 0031 is active. Any other failure except a
  // definitely missing RPC also fails closed: the V1 form must never become a
  // back door around V2's version checks.
  if (!error || !isMissingGalleryV2Snapshot(error)) {
    redirect("/admin/v2/pages/gallery?from=classic");
  }
}

function isMissingShowreelV2Snapshot(error: {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}) {
  const message = [error.message, error.details, error.hint]
    .filter(Boolean)
    .join(" ");
  return (
    error.code === "PGRST202" ||
    (error.code === "42883" && /get_showreel_page_v2_snapshot/i.test(message)) ||
    /schema cache.*get_showreel_page_v2_snapshot/i.test(message)
  );
}

async function handOffLegacyShowreelWrite(supabase: SupabaseClient) {
  const { error } = await supabase.rpc("get_showreel_page_v2_snapshot", {
    p_site_id: "main",
  });

  // Once 0032 exists, every classic write fails closed into the optimistic V2
  // editor. An ambiguous database failure must not reopen the old delete path.
  if (!error || !isMissingShowreelV2Snapshot(error)) {
    redirect("/admin/v2/pages/showreel?from=classic");
  }
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

// Compatibility entry points for older open Classic forms. The shared upload
// actions own all validation, authorization, storage verification and writes.
export async function prepareMediaUpload(value: unknown) {
  return prepareSharedMediaUpload(value);
}

export async function finalizeMediaUpload(input: unknown) {
  return finalizeSharedMediaUpload(input);
}

export async function updateMediaAsset(formData: FormData) {
  const parsed = mediaMetadataSchema.extend({
    expectedUpdatedAt: z.string().max(64).refine(
      (value) => /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value))
    ),
  }).safeParse({
    expectedUpdatedAt: formValue(formData, "expectedUpdatedAt"),
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
    .eq("id", parsed.data.id)
    .eq("updated_at", parsed.data.expectedUpdatedAt)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (result.error) {
    console.error(result.error);
    redirectToStatus("save-error", "library");
  }
  if (!result.data) redirectToStatus("media-write-conflict", "library");

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
  // Older open Classic forms carry no media version. Never let them bypass the
  // new usage review and explicit snapshot-based removal in V2.
  await requireAdmin();
  void formData;
  redirect("/admin/v2/media");
}

export async function restoreMediaAsset(formData: FormData) {
  // Old Classic forms have no version token. A stale form must not restore a
  // newer Trash state or bypass V2's lifecycle checks. Review fresh data there.
  const admin = await requireAdmin();
  if (!(await verifyAdminActionOrigin(admin.id, "media"))) {
    redirectToStatus("security-error", "library");
  }
  void formData;
  redirect("/admin/v2/media");
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
  await handOffLegacyGalleryWrite(supabase);
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
  await handOffLegacyGalleryWrite(supabase);
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
  await handOffLegacyGalleryWrite(supabase);
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
  await handOffLegacyShowreelWrite(supabase);
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
  await handOffLegacyShowreelWrite(supabase);
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
  await handOffLegacyShowreelWrite(supabase);
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
  await handOffLegacyShowreelWrite(supabase);
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
  await handOffLegacyGalleryWrite(supabase);
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
  await handOffLegacyGalleryWrite(supabase);
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
