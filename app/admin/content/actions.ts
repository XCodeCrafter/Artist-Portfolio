"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { verifyAdminActionOrigin } from "@/lib/admin/action-security";
import { requireAdmin } from "@/lib/admin/auth";
import { writeAuditLog } from "@/lib/admin/audit";
import { createAdminServiceClient } from "@/lib/admin/service";
import { PAGE_SLUGS } from "@/lib/content/modules";
import {
  BODY_FONT_KEYS,
  DISPLAY_FONT_KEYS,
  UI_FONT_KEYS,
} from "@/lib/content/fonts";
import { PORTFOLIO_TYPES } from "@/lib/content/profile";
import { detectSocialPlatform } from "@/lib/content/social-platforms";
import {
  ACTOR_CREDIT_TYPES,
  FOOTER_EFFECTS,
  VIDEO_TYPES,
  type PageSlug,
  type PortfolioType,
} from "@/lib/content/types";

const CONTENT_PATHS = [
  "/",
  "/bio",
  "/gallery",
  "/music",
  "/video",
  "/booking",
  "/admin",
  "/admin/content",
  "/admin/analytics",
  "/admin/media",
  "/admin/security",
];

const shortText = z.string().trim().max(220);
const mediumText = z.string().trim().max(1000);
const longText = z.string().trim().max(6000);
const sortOrder = z.coerce.number().int().min(0).max(9999);
const idValue = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9][a-z0-9_-]*$/i);

const INTERNAL_HREF_BASE = "https://portfolio.invalid";

function isSafeHref(value: string) {
  if (!value) return true;

  try {
    if (value.startsWith("#")) {
      const url = new URL(value, INTERNAL_HREF_BASE);
      return (
        url.origin === INTERNAL_HREF_BASE &&
        url.pathname === "/" &&
        !url.search &&
        Boolean(url.hash)
      );
    }

    if (value.startsWith("//")) return false;

    if (value.startsWith("/")) {
      return new URL(value, INTERNAL_HREF_BASE).origin === INTERNAL_HREF_BASE;
    }

    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

const safeHref = z
  .string()
  .trim()
  .max(1200)
  .refine(isSafeHref);

function isSafeMediaSrc(value: string) {
  if (!value) return true;

  try {
    if (value.startsWith("//")) return false;
    if (value.startsWith("/")) {
      return new URL(value, INTERNAL_HREF_BASE).origin === INTERNAL_HREF_BASE;
    }

    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

function isSafeImageSrc(value: string) {
  if (!value) return true;
  if (value.startsWith("/")) return isSafeMediaSrc(value);

  const storageBase = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!storageBase) return false;

  try {
    const imageUrl = new URL(value);
    const storageUrl = new URL(storageBase);
    return (
      isSafeMediaSrc(value) &&
      storageUrl.protocol === "https:" &&
      imageUrl.origin === storageUrl.origin &&
      imageUrl.pathname.startsWith("/storage/v1/object/public/")
    );
  } catch {
    return false;
  }
}

const safeMediaSrc = z
  .string()
  .trim()
  .max(1200)
  .refine(isSafeMediaSrc);

const safeImageSrc = z
  .string()
  .trim()
  .max(1200)
  .refine(isSafeImageSrc, {
    message: "Choose a local image or one uploaded to this site's media library.",
  });

const settingsSchema = z.object({
  portfolioType: z.enum(PORTFOLIO_TYPES as [PortfolioType, ...PortfolioType[]]),
  footerEffect: z.enum(FOOTER_EFFECTS),
  artistName: shortText.min(1),
  displayFont: z.enum(DISPLAY_FONT_KEYS),
  bodyFont: z.enum(BODY_FONT_KEYS),
  uiFont: z.enum(UI_FONT_KEYS),
  tagline: shortText,
  description: mediumText,
  location: shortText,
  spotifyArtistUrl: safeHref,
  spotifyEmbedUrl: safeHref,
  contactBlurb: mediumText,
});

const heroSchema = z
  .object({
    pageSlug: z.enum(PAGE_SLUGS as [PageSlug, ...PageSlug[]]),
    title: shortText.min(1),
    subtitle: shortText,
    ctaLabel: shortText,
    ctaHref: safeHref,
    backgroundSrc: safeMediaSrc.min(1),
    posterSrc: safeImageSrc,
    mediaType: z.enum(["image", "video"]),
    sortOrder,
  })
  .superRefine((hero, context) => {
    if (hero.mediaType === "image" && !isSafeImageSrc(hero.backgroundSrc)) {
      context.addIssue({
        code: "custom",
        message:
          "Choose a local hero image or one uploaded to this site's media library.",
        path: ["backgroundSrc"],
      });
    }
  });

const aboutHomeSchema = z.object({
  heading: shortText.min(1),
  body: longText.min(1),
  ctaLabel: shortText,
  ctaHref: safeHref,
  imageSrc: safeImageSrc.min(1),
  imageAlt: shortText,
});

const homePresentationSchema = z.object({
  updatesHeading: shortText.min(1),
  updatesImageSrc: safeImageSrc,
  updatesImageAlt: shortText,
  updatesCtaLabel: shortText,
  updatesCtaHref: safeHref,
  featureTitle: shortText,
  featureBody: mediumText,
  featureCtaLabel: shortText,
  featureCtaHref: safeHref,
  featureImageSrc: safeImageSrc,
  featureImageAlt: shortText,
  featureVideoSrc: safeMediaSrc,
  featurePosterSrc: safeImageSrc,
  storyTitle: shortText.min(1),
  storyBody: mediumText,
  storyCtaLabel: shortText,
  storyCtaHref: safeHref,
  storyImage1Src: safeImageSrc,
  storyImage1Title: shortText,
  storyImage1Body: mediumText,
  storyImage2Src: safeImageSrc,
  storyImage2Title: shortText,
  storyImage2Body: mediumText,
  storyImage3Src: safeImageSrc,
  storyImage3Title: shortText,
  storyImage3Body: mediumText,
  storyImage4Src: safeImageSrc,
  storyImage4Title: shortText,
  storyImage4Body: mediumText,
});

const bioProfileSchema = z.object({
  topLabel: shortText,
  introText: longText,
  caption: shortText,
});

const homeUpdateSchema = z.object({
  id: idValue,
  text: mediumText.min(1),
  linkLabel: shortText,
  href: safeHref,
  avatarSrc: safeImageSrc,
  sortOrder,
  isPublished: z.boolean(),
});

const socialLinkSchema = z.object({
  id: idValue,
  label: shortText.min(1),
  platform: shortText.min(1),
  href: safeHref.min(1),
  iconKey: shortText,
  sortOrder,
  isPublished: z.boolean(),
});

const musicPlatformSchema = z.object({
  id: idValue,
  title: shortText.min(1),
  label: shortText,
  href: safeHref.min(1),
  iconKey: shortText,
  imageSrc: safeImageSrc,
  sortOrder,
  isPublished: z.boolean(),
});

const soundcloudTrackSchema = z.object({
  id: idValue,
  title: shortText,
  embedUrl: safeHref.min(1),
  sortOrder,
  isPublished: z.boolean(),
});

const bioGalleryImageSchema = z.object({
  id: idValue,
  src: safeImageSrc.min(1),
  alt: shortText,
  sortOrder,
  isPublished: z.boolean(),
});

const galleryImageSchema = z.object({
  id: idValue,
  title: shortText.min(1),
  src: safeImageSrc.min(1),
  alt: shortText,
  caption: mediumText,
  category: shortText,
  sortOrder,
  isPublished: z.boolean(),
});

const bioParagraphSchema = z.object({
  id: idValue,
  body: longText.min(1),
  revealDelay: z.coerce.number().int().min(0).max(5000),
  sortOrder,
  isPublished: z.boolean(),
});

const bioParagraphsBulkSchema = z.array(
  z.object({
    id: idValue.optional(),
    body: longText.min(1),
    revealDelay: z.coerce.number().int().min(0).max(5000),
    isPublished: z.boolean(),
  })
).max(50);

const videoSchema = z.object({
  id: idValue,
  title: shortText.min(1),
  description: mediumText,
  embedUrl: safeHref.min(1),
  platform: shortText.min(1),
  thumbnailSrc: safeImageSrc,
  videoType: z.enum(VIDEO_TYPES),
  isFeatured: z.boolean(),
  sortOrder,
  isPublished: z.boolean(),
});

const actorResumeSchema = z.object({
  headline: shortText,
  summary: longText,
  location: shortText,
  playingAge: shortText,
  height: shortText,
  eyes: shortText,
  hair: shortText,
  languages: mediumText,
  skills: mediumText,
  representation: shortText,
  resumeUrl: safeHref,
});

const actorCreditSchema = z.object({
  id: idValue,
  creditType: z.enum(ACTOR_CREDIT_TYPES),
  title: shortText.min(1),
  role: shortText,
  production: shortText,
  director: shortText,
  year: shortText,
  href: safeHref,
  sortOrder,
  isPublished: z.boolean(),
});

function formValue(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function formChecked(formData: FormData, key: string) {
  return formData.get(key) === "on";
}

const CONTENT_RETURN_SECTIONS = new Set([
  "home",
  "bio",
  "music-links",
  "booking",
  "settings",
  "socials",
]);

function getReturnSection(formData: FormData, fallback: string) {
  const value = formValue(formData, "returnSection");
  return CONTENT_RETURN_SECTIONS.has(value) ? value : fallback;
}

function slugifyId(value: string, fallback: string) {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return slug || `${fallback}-${Date.now()}`;
}

function normalizeId(formData: FormData, seedKeys: string[], fallback: string) {
  const explicitId = formValue(formData, "id");
  if (explicitId) return explicitId;

  const seed = seedKeys.map((key) => formValue(formData, key)).find(Boolean);
  return slugifyId(seed || fallback, fallback);
}

function redirectToStatus(status: string, section: string): never {
  const params = new URLSearchParams({ status });
  redirect(`/admin/content?${params.toString()}#${section}`);
}

function revalidatePortfolio() {
  revalidatePath("/", "layout");

  for (const path of CONTENT_PATHS) {
    revalidatePath(path);
  }
}

function isMissingTypographySchema(error: { message?: string } | null) {
  const message = error?.message?.toLowerCase() || "";
  return ["display_font", "body_font", "ui_font"].some((column) =>
    message.includes(column)
  );
}

function isMissingFooterEffectSchema(error: { message?: string } | null) {
  return (error?.message?.toLowerCase() || "").includes("footer_effect");
}

async function getWriteContext(section: string) {
  const admin = await requireAdmin();
  if (!(await verifyAdminActionOrigin(admin.id, `content:${section}`))) {
    redirectToStatus("security-error", section);
  }

  const supabase = createAdminServiceClient();

  if (!supabase) {
    redirectToStatus("missing-service", section);
  }

  return { admin, supabase };
}

async function assertMutation(
  result: { error: { message?: string } | null },
  section: string
) {
  if (result.error) {
    console.error(result.error);
    redirectToStatus("save-error", section);
  }
}

export async function updateSiteSettings(formData: FormData) {
  const returnSection = getReturnSection(formData, "settings");
  const parsed = settingsSchema.safeParse({
    portfolioType: formValue(formData, "portfolioType"),
    footerEffect: formValue(formData, "footerEffect"),
    artistName: formValue(formData, "artistName"),
    displayFont: formValue(formData, "displayFont"),
    bodyFont: formValue(formData, "bodyFont"),
    uiFont: formValue(formData, "uiFont"),
    tagline: formValue(formData, "tagline"),
    description: formValue(formData, "description"),
    location: formValue(formData, "location"),
    spotifyArtistUrl: formValue(formData, "spotifyArtistUrl"),
    spotifyEmbedUrl: formValue(formData, "spotifyEmbedUrl"),
    contactBlurb: formValue(formData, "contactBlurb"),
  });

  if (!parsed.success) redirectToStatus("invalid", returnSection);

  const { admin, supabase } = await getWriteContext(returnSection);
  const result = await supabase.from("site_settings").upsert({
    id: "main",
    portfolio_type: parsed.data.portfolioType,
    footer_effect: parsed.data.footerEffect,
    artist_name: parsed.data.artistName,
    display_font: parsed.data.displayFont,
    body_font: parsed.data.bodyFont,
    ui_font: parsed.data.uiFont,
    tagline: parsed.data.tagline,
    description: parsed.data.description,
    location: parsed.data.location,
    spotify_artist_url: parsed.data.spotifyArtistUrl,
    spotify_embed_url: parsed.data.spotifyEmbedUrl,
    contact_blurb: parsed.data.contactBlurb,
  });

  if (isMissingTypographySchema(result.error)) {
    redirectToStatus("typography-migration-required", returnSection);
  }

  if (isMissingFooterEffectSchema(result.error)) {
    redirectToStatus("footer-effect-migration-required", returnSection);
  }

  await assertMutation(result, returnSection);
  await writeAuditLog({
    actorId: admin.id,
    action: "content_update",
    tableName: "site_settings",
    recordId: "main",
    metadata: { section: "settings" },
  });

  revalidatePortfolio();
  redirectToStatus("saved-settings", returnSection);
}

export async function updatePageHero(formData: FormData) {
  const returnSection = getReturnSection(formData, "home");
  const parsed = heroSchema.safeParse({
    pageSlug: formValue(formData, "pageSlug"),
    title: formValue(formData, "title"),
    subtitle: formValue(formData, "subtitle"),
    ctaLabel: formValue(formData, "ctaLabel"),
    ctaHref: formValue(formData, "ctaHref"),
    backgroundSrc: formValue(formData, "backgroundSrc"),
    posterSrc: formValue(formData, "posterSrc"),
    mediaType: formValue(formData, "mediaType"),
    sortOrder: formValue(formData, "sortOrder"),
  });

  if (!parsed.success) redirectToStatus("invalid", returnSection);

  const { admin, supabase } = await getWriteContext(returnSection);
  const result = await supabase.from("page_heroes").upsert({
    page_slug: parsed.data.pageSlug,
    title: parsed.data.title,
    subtitle: parsed.data.subtitle,
    cta_label: parsed.data.ctaLabel,
    cta_href: parsed.data.ctaHref,
    background_src: parsed.data.backgroundSrc,
    poster_src: parsed.data.posterSrc,
    media_type: parsed.data.mediaType,
    sort_order: parsed.data.sortOrder,
  });

  await assertMutation(result, returnSection);
  await writeAuditLog({
    actorId: admin.id,
    action: "content_update",
    tableName: "page_heroes",
    recordId: parsed.data.pageSlug,
    metadata: { section: "heroes" },
  });

  revalidatePortfolio();
  redirectToStatus("saved-hero", returnSection);
}

export async function updateAboutHome(formData: FormData) {
  const parsed = aboutHomeSchema.safeParse({
    heading: formValue(formData, "heading"),
    body: formValue(formData, "body"),
    ctaLabel: formValue(formData, "ctaLabel"),
    ctaHref: formValue(formData, "ctaHref"),
    imageSrc: formValue(formData, "imageSrc"),
    imageAlt: formValue(formData, "imageAlt"),
  });

  if (!parsed.success) redirectToStatus("invalid", "home");

  const { admin, supabase } = await getWriteContext("home");
  const result = await supabase.from("about_home").upsert({
    id: "main",
    heading: parsed.data.heading,
    body: parsed.data.body,
    cta_label: parsed.data.ctaLabel,
    cta_href: parsed.data.ctaHref,
    image_src: parsed.data.imageSrc,
    image_alt: parsed.data.imageAlt,
  });

  await assertMutation(result, "home");
  await writeAuditLog({
    actorId: admin.id,
    action: "content_update",
    tableName: "about_home",
    recordId: "main",
    metadata: { section: "home" },
  });

  revalidatePortfolio();
  redirectToStatus("saved-home", "home");
}

export async function updateHomePresentation(formData: FormData) {
  const parsed = homePresentationSchema.safeParse({
    updatesHeading: formValue(formData, "updatesHeading"),
    updatesImageSrc: formValue(formData, "updatesImageSrc"),
    updatesImageAlt: formValue(formData, "updatesImageAlt"),
    updatesCtaLabel: formValue(formData, "updatesCtaLabel"),
    updatesCtaHref: formValue(formData, "updatesCtaHref"),
    featureTitle: formValue(formData, "featureTitle"),
    featureBody: formValue(formData, "featureBody"),
    featureCtaLabel: formValue(formData, "featureCtaLabel"),
    featureCtaHref: formValue(formData, "featureCtaHref"),
    featureImageSrc: formValue(formData, "featureImageSrc"),
    featureImageAlt: formValue(formData, "featureImageAlt"),
    featureVideoSrc: formValue(formData, "featureVideoSrc"),
    featurePosterSrc: formValue(formData, "featurePosterSrc"),
    storyTitle: formValue(formData, "storyTitle"),
    storyBody: formValue(formData, "storyBody"),
    storyCtaLabel: formValue(formData, "storyCtaLabel"),
    storyCtaHref: formValue(formData, "storyCtaHref"),
    storyImage1Src: formValue(formData, "storyImage1Src"),
    storyImage1Title: formValue(formData, "storyImage1Title"),
    storyImage1Body: formValue(formData, "storyImage1Body"),
    storyImage2Src: formValue(formData, "storyImage2Src"),
    storyImage2Title: formValue(formData, "storyImage2Title"),
    storyImage2Body: formValue(formData, "storyImage2Body"),
    storyImage3Src: formValue(formData, "storyImage3Src"),
    storyImage3Title: formValue(formData, "storyImage3Title"),
    storyImage3Body: formValue(formData, "storyImage3Body"),
    storyImage4Src: formValue(formData, "storyImage4Src"),
    storyImage4Title: formValue(formData, "storyImage4Title"),
    storyImage4Body: formValue(formData, "storyImage4Body"),
  });
  if (!parsed.success) redirectToStatus("invalid", "home");
  const { admin, supabase } = await getWriteContext("home-presentation");
  const result = await supabase.from("media_assets").upsert({
    id: "home-studio-settings",
    label: "Home Studio settings",
    src: "/",
    alt: "",
    media_type: "document",
    usage_key: "system:home-studio",
    sort_order: 0,
    is_published: true,
    storage_bucket: "",
    storage_path: "",
    file_size: 0,
    mime_type: "application/json",
    metadata: parsed.data,
  });
  await assertMutation(result, "home");
  await writeAuditLog({ actorId: admin.id, action: "home_presentation_update", tableName: "media_assets", recordId: "home-studio-settings", metadata: {} });
  revalidatePortfolio();
  redirectToStatus("saved-home-presentation", "home");
}

export async function updateBioProfile(formData: FormData) {
  const parsed = bioProfileSchema.safeParse({
    topLabel: formValue(formData, "topLabel"),
    introText: formValue(formData, "introText"),
    caption: formValue(formData, "caption"),
  });

  if (!parsed.success) redirectToStatus("invalid", "bio");

  const { admin, supabase } = await getWriteContext("bio");
  const result = await supabase.from("bio_profile").upsert({
    id: "main",
    top_label: parsed.data.topLabel,
    intro_text: parsed.data.introText,
    caption: parsed.data.caption,
  });

  await assertMutation(result, "bio");
  await writeAuditLog({
    actorId: admin.id,
    action: "content_update",
    tableName: "bio_profile",
    recordId: "main",
    metadata: { section: "bio" },
  });

  revalidatePortfolio();
  redirectToStatus("saved-bio", "bio");
}

export async function saveHomeUpdate(formData: FormData) {
  const parsed = homeUpdateSchema.safeParse({
    id: normalizeId(formData, ["text", "linkLabel"], "update"),
    text: formValue(formData, "text"),
    linkLabel: formValue(formData, "linkLabel"),
    href: formValue(formData, "href"),
    avatarSrc: formValue(formData, "avatarSrc"),
    sortOrder: formValue(formData, "sortOrder"),
    isPublished: formChecked(formData, "isPublished"),
  });

  if (!parsed.success) redirectToStatus("invalid", "updates");

  const { admin, supabase } = await getWriteContext("updates");
  const result = await supabase.from("home_updates").upsert({
    id: parsed.data.id,
    text: parsed.data.text,
    link_label: parsed.data.linkLabel,
    href: parsed.data.href,
    avatar_src: parsed.data.avatarSrc,
    sort_order: parsed.data.sortOrder,
    is_published: parsed.data.isPublished,
  });

  await assertMutation(result, "updates");
  await writeAuditLog({
    actorId: admin.id,
    action: "content_update",
    tableName: "home_updates",
    recordId: parsed.data.id,
    metadata: { section: "updates" },
  });

  revalidatePortfolio();
  redirectToStatus("saved-update", "updates");
}

export async function saveSocialLink(formData: FormData) {
  const parsed = socialLinkSchema.safeParse({
    id: normalizeId(formData, ["label", "platform"], "social"),
    label: formValue(formData, "label"),
    platform: formValue(formData, "platform"),
    href: formValue(formData, "href"),
    iconKey: formValue(formData, "iconKey"),
    sortOrder: formValue(formData, "sortOrder"),
    isPublished: formChecked(formData, "isPublished"),
  });

  if (!parsed.success) redirectToStatus("invalid", "socials");

  const { admin, supabase } = await getWriteContext("socials");
  const iconKey = detectSocialPlatform(
    parsed.data.iconKey,
    parsed.data.platform,
    parsed.data.href,
    parsed.data.label
  );
  const result = await supabase.from("social_links").upsert({
    id: parsed.data.id,
    label: parsed.data.label,
    platform: parsed.data.platform,
    href: parsed.data.href,
    icon_key: iconKey,
    sort_order: parsed.data.sortOrder,
    is_published: parsed.data.isPublished,
  });

  await assertMutation(result, "socials");
  await writeAuditLog({
    actorId: admin.id,
    action: "content_update",
    tableName: "social_links",
    recordId: parsed.data.id,
    metadata: { section: "socials" },
  });

  revalidatePortfolio();
  redirectToStatus("saved-social", "socials");
}

export async function saveMusicPlatformLink(formData: FormData) {
  const parsed = musicPlatformSchema.safeParse({
    id: normalizeId(formData, ["title", "label"], "music-link"),
    title: formValue(formData, "title"),
    label: formValue(formData, "label"),
    href: formValue(formData, "href"),
    iconKey: formValue(formData, "iconKey"),
    imageSrc: formValue(formData, "imageSrc"),
    sortOrder: formValue(formData, "sortOrder"),
    isPublished: formChecked(formData, "isPublished"),
  });

  if (!parsed.success) redirectToStatus("invalid", "music-links");

  const { admin, supabase } = await getWriteContext("music-links");
  const result = await supabase.from("music_platform_links").upsert({
    id: parsed.data.id,
    title: parsed.data.title,
    label: parsed.data.label,
    href: parsed.data.href,
    icon_key: parsed.data.iconKey,
    image_src: parsed.data.imageSrc,
    sort_order: parsed.data.sortOrder,
    is_published: parsed.data.isPublished,
  });

  await assertMutation(result, "music-links");
  await writeAuditLog({
    actorId: admin.id,
    action: "content_update",
    tableName: "music_platform_links",
    recordId: parsed.data.id,
    metadata: { section: "music-links" },
  });

  revalidatePortfolio();
  redirectToStatus("saved-music-link", "music-links");
}

export async function saveSoundcloudTrack(formData: FormData) {
  const parsed = soundcloudTrackSchema.safeParse({
    id: normalizeId(formData, ["title", "embedUrl"], "track"),
    title: formValue(formData, "title"),
    embedUrl: formValue(formData, "embedUrl"),
    sortOrder: formValue(formData, "sortOrder"),
    isPublished: formChecked(formData, "isPublished"),
  });

  if (!parsed.success) redirectToStatus("invalid", "tracks");

  const { admin, supabase } = await getWriteContext("tracks");
  const result = await supabase.from("soundcloud_tracks").upsert({
    id: parsed.data.id,
    title: parsed.data.title,
    embed_url: parsed.data.embedUrl,
    sort_order: parsed.data.sortOrder,
    is_published: parsed.data.isPublished,
  });

  await assertMutation(result, "tracks");
  await writeAuditLog({
    actorId: admin.id,
    action: "content_update",
    tableName: "soundcloud_tracks",
    recordId: parsed.data.id,
    metadata: { section: "tracks" },
  });

  revalidatePortfolio();
  redirectToStatus("saved-track", "tracks");
}

export async function saveBioGalleryImage(formData: FormData) {
  const parsed = bioGalleryImageSchema.safeParse({
    id: normalizeId(formData, ["alt", "src"], "bio-image"),
    src: formValue(formData, "src"),
    alt: formValue(formData, "alt"),
    sortOrder: formValue(formData, "sortOrder"),
    isPublished: formChecked(formData, "isPublished"),
  });

  if (!parsed.success) redirectToStatus("invalid", "bio-gallery");

  const { admin, supabase } = await getWriteContext("bio-gallery");
  const result = await supabase.from("bio_gallery_images").upsert({
    id: parsed.data.id,
    src: parsed.data.src,
    alt: parsed.data.alt,
    sort_order: parsed.data.sortOrder,
    is_published: parsed.data.isPublished,
  });

  await assertMutation(result, "bio-gallery");
  await writeAuditLog({
    actorId: admin.id,
    action: "content_update",
    tableName: "bio_gallery_images",
    recordId: parsed.data.id,
    metadata: { section: "bio-gallery" },
  });

  revalidatePortfolio();
  redirectToStatus("saved-bio-gallery", "bio-gallery");
}

export async function saveGalleryImage(formData: FormData) {
  const parsed = galleryImageSchema.safeParse({
    id: normalizeId(formData, ["title", "alt", "src"], "gallery-image"),
    title: formValue(formData, "title"),
    src: formValue(formData, "src"),
    alt: formValue(formData, "alt"),
    caption: formValue(formData, "caption"),
    category: formValue(formData, "category"),
    sortOrder: formValue(formData, "sortOrder"),
    isPublished: formChecked(formData, "isPublished"),
  });

  if (!parsed.success) redirectToStatus("invalid", "gallery-images");

  const { admin, supabase } = await getWriteContext("gallery-images");
  const result = await supabase.from("gallery_images").upsert({
    id: parsed.data.id,
    title: parsed.data.title,
    src: parsed.data.src,
    alt: parsed.data.alt,
    caption: parsed.data.caption,
    category: parsed.data.category,
    sort_order: parsed.data.sortOrder,
    is_published: parsed.data.isPublished,
  });

  await assertMutation(result, "gallery-images");
  await writeAuditLog({
    actorId: admin.id,
    action: "content_update",
    tableName: "gallery_images",
    recordId: parsed.data.id,
    metadata: { section: "gallery-images" },
  });

  revalidatePortfolio();
  redirectToStatus("saved-gallery-image", "gallery-images");
}

export async function saveBioParagraph(formData: FormData) {
  const parsed = bioParagraphSchema.safeParse({
    id: normalizeId(formData, ["body"], "bio-paragraph"),
    body: formValue(formData, "body"),
    revealDelay: formValue(formData, "revealDelay"),
    sortOrder: formValue(formData, "sortOrder"),
    isPublished: formChecked(formData, "isPublished"),
  });

  if (!parsed.success) redirectToStatus("invalid", "bio-paragraphs");

  const { admin, supabase } = await getWriteContext("bio-paragraphs");
  const result = await supabase.from("bio_paragraphs").upsert({
    id: parsed.data.id,
    body: parsed.data.body,
    reveal_delay: parsed.data.revealDelay,
    sort_order: parsed.data.sortOrder,
    is_published: parsed.data.isPublished,
  });

  await assertMutation(result, "bio-paragraphs");
  await writeAuditLog({
    actorId: admin.id,
    action: "content_update",
    tableName: "bio_paragraphs",
    recordId: parsed.data.id,
    metadata: { section: "bio-paragraphs" },
  });

  revalidatePortfolio();
  redirectToStatus("saved-bio-paragraph", "bio-paragraphs");
}

export async function saveBioParagraphs(formData: FormData) {
  let input: unknown;
  try {
    input = JSON.parse(formValue(formData, "paragraphsJson"));
  } catch {
    redirectToStatus("invalid", "bio-paragraphs");
  }

  const parsed = bioParagraphsBulkSchema.safeParse(input);
  if (!parsed.success) redirectToStatus("invalid", "bio-paragraphs");

  const rows = parsed.data.map((item, index) => ({
    id: item.id || `bio-${randomUUID().slice(0, 12)}`,
    body: item.body,
    reveal_delay: item.revealDelay,
    sort_order: (index + 1) * 10,
    is_published: item.isPublished,
  }));
  if (new Set(rows.map((row) => row.id)).size !== rows.length) {
    redirectToStatus("invalid", "bio-paragraphs");
  }

  const { admin, supabase } = await getWriteContext("bio-paragraphs");
  const existing = await supabase.from("bio_paragraphs").select("id");
  await assertMutation(existing, "bio-paragraphs");

  if (rows.length) {
    const saved = await supabase.from("bio_paragraphs").upsert(rows);
    await assertMutation(saved, "bio-paragraphs");
  }

  const submittedIds = new Set(rows.map((row) => row.id));
  const removedIds = (existing.data || [])
    .map((row) => String(row.id))
    .filter((id) => !submittedIds.has(id));
  if (removedIds.length) {
    const removed = await supabase
      .from("bio_paragraphs")
      .delete()
      .in("id", removedIds);
    await assertMutation(removed, "bio-paragraphs");
  }

  await writeAuditLog({
    actorId: admin.id,
    action: "bio_paragraphs_replace",
    tableName: "bio_paragraphs",
    recordId: "all",
    metadata: { count: rows.length, deleted: removedIds.length },
  });
  revalidatePortfolio();
  redirectToStatus("saved-bio-paragraphs", "bio");
}

export async function saveVideo(formData: FormData) {
  const parsed = videoSchema.safeParse({
    id: normalizeId(formData, ["title", "platform"], "video"),
    title: formValue(formData, "title"),
    description: formValue(formData, "description"),
    embedUrl: formValue(formData, "embedUrl"),
    platform: formValue(formData, "platform"),
    thumbnailSrc: formValue(formData, "thumbnailSrc"),
    videoType: formValue(formData, "videoType") || "music_video",
    isFeatured: formChecked(formData, "isFeatured"),
    sortOrder: formValue(formData, "sortOrder"),
    isPublished: formChecked(formData, "isPublished"),
  });

  if (!parsed.success) redirectToStatus("invalid", "videos");

  const { admin, supabase } = await getWriteContext("videos");
  if (parsed.data.isFeatured) {
    const featuredResult = await supabase
      .from("videos")
      .update({ is_featured: false })
      .neq("id", parsed.data.id);

    await assertMutation(featuredResult, "videos");
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

  await assertMutation(result, "videos");
  await writeAuditLog({
    actorId: admin.id,
    action: "content_update",
    tableName: "videos",
    recordId: parsed.data.id,
    metadata: { section: "videos" },
  });

  revalidatePortfolio();
  redirectToStatus("saved-video", "videos");
}

export async function updateActorResume(formData: FormData) {
  const parsed = actorResumeSchema.safeParse({
    headline: formValue(formData, "headline"),
    summary: formValue(formData, "summary"),
    location: formValue(formData, "location"),
    playingAge: formValue(formData, "playingAge"),
    height: formValue(formData, "height"),
    eyes: formValue(formData, "eyes"),
    hair: formValue(formData, "hair"),
    languages: formValue(formData, "languages"),
    skills: formValue(formData, "skills"),
    representation: formValue(formData, "representation"),
    resumeUrl: formValue(formData, "resumeUrl"),
  });

  if (!parsed.success) redirectToStatus("invalid", "actor-resume");

  const { admin, supabase } = await getWriteContext("actor-resume");
  const result = await supabase.from("actor_resume").upsert({
    id: "main",
    headline: parsed.data.headline,
    summary: parsed.data.summary,
    location: parsed.data.location,
    playing_age: parsed.data.playingAge,
    height: parsed.data.height,
    eyes: parsed.data.eyes,
    hair: parsed.data.hair,
    languages: parsed.data.languages,
    skills: parsed.data.skills,
    representation: parsed.data.representation,
    resume_url: parsed.data.resumeUrl,
  });

  await assertMutation(result, "actor-resume");
  await writeAuditLog({
    actorId: admin.id,
    action: "content_update",
    tableName: "actor_resume",
    recordId: "main",
    metadata: { section: "actor-resume" },
  });

  revalidatePortfolio();
  redirectToStatus("saved-actor-resume", "actor-resume");
}

export async function saveActorCredit(formData: FormData) {
  const parsed = actorCreditSchema.safeParse({
    id: normalizeId(formData, ["title", "role", "production"], "credit"),
    creditType: formValue(formData, "creditType") || "other",
    title: formValue(formData, "title"),
    role: formValue(formData, "role"),
    production: formValue(formData, "production"),
    director: formValue(formData, "director"),
    year: formValue(formData, "year"),
    href: formValue(formData, "href"),
    sortOrder: formValue(formData, "sortOrder"),
    isPublished: formChecked(formData, "isPublished"),
  });

  if (!parsed.success) redirectToStatus("invalid", "actor-credits");

  const { admin, supabase } = await getWriteContext("actor-credits");
  const result = await supabase.from("actor_credits").upsert({
    id: parsed.data.id,
    credit_type: parsed.data.creditType,
    title: parsed.data.title,
    role: parsed.data.role,
    production: parsed.data.production,
    director: parsed.data.director,
    year: parsed.data.year,
    href: parsed.data.href,
    sort_order: parsed.data.sortOrder,
    is_published: parsed.data.isPublished,
  });

  await assertMutation(result, "actor-credits");
  await writeAuditLog({
    actorId: admin.id,
    action: "content_update",
    tableName: "actor_credits",
    recordId: parsed.data.id,
    metadata: { section: "actor-credits" },
  });

  revalidatePortfolio();
  redirectToStatus("saved-actor-credit", "actor-credits");
}

async function deleteById(
  formData: FormData,
  tableName: string,
  section: string
) {
  const parsed = idValue.safeParse(formValue(formData, "id"));
  if (!parsed.success) redirectToStatus("invalid", section);

  const { admin, supabase } = await getWriteContext(section);
  const result = await supabase.from(tableName).delete().eq("id", parsed.data);

  await assertMutation(result, section);
  await writeAuditLog({
    actorId: admin.id,
    action: "content_delete",
    tableName,
    recordId: parsed.data,
    metadata: { section },
  });

  revalidatePortfolio();
  redirectToStatus("deleted", section);
}

export async function deleteHomeUpdate(formData: FormData) {
  await deleteById(formData, "home_updates", "updates");
}

export async function deleteSocialLink(formData: FormData) {
  await deleteById(formData, "social_links", "socials");
}

export async function deleteMusicPlatformLink(formData: FormData) {
  await deleteById(formData, "music_platform_links", "music-links");
}

export async function deleteSoundcloudTrack(formData: FormData) {
  await deleteById(formData, "soundcloud_tracks", "tracks");
}

export async function deleteBioGalleryImage(formData: FormData) {
  await deleteById(formData, "bio_gallery_images", "bio-gallery");
}

export async function deleteGalleryImage(formData: FormData) {
  await deleteById(formData, "gallery_images", "gallery-images");
}

export async function deleteBioParagraph(formData: FormData) {
  await deleteById(formData, "bio_paragraphs", "bio-paragraphs");
}

export async function deleteVideo(formData: FormData) {
  await deleteById(formData, "videos", "videos");
}

export async function deleteActorCredit(formData: FormData) {
  await deleteById(formData, "actor_credits", "actor-credits");
}
