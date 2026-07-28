import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FALLBACK_CONTENT } from "./fallback";
import { PAGE_SLUGS } from "./modules";
import {
  normalizeBodyFont,
  normalizeDisplayFont,
  normalizeUiFont,
} from "./fonts";
import { normalizePortfolioType } from "./profile";
import { createPublicContentClient } from "./supabase";
import {
  ACTOR_CREDIT_TYPES,
  VIDEO_TYPES,
  normalizeFooterEffect,
} from "./types";
import type {
  ActorCredit,
  ActorCreditType,
  ActorResume,
  AboutHomeContent,
  BioGalleryImage,
  BioParagraph,
  GalleryImage,
  GalleryPresentation,
  FooterEffect,
  HeroContent,
  HomeUpdate,
  HomePresentation,
  MusicPlatformLink,
  PageSlug,
  PortfolioContent,
  PortfolioType,
  SiteSettings,
  SocialLink,
  SoundcloudTrack,
  VideoItem,
  VideoPresentation,
  VideoType,
} from "./types";

type SiteSettingsRow = {
  portfolio_type?: string | null;
  footer_effect?: string | null;
  artist_name: string;
  display_font?: string | null;
  body_font?: string | null;
  ui_font?: string | null;
  tagline: string;
  description: string;
  location: string;
  spotify_artist_url: string;
  spotify_embed_url: string;
  contact_blurb: string;
};

type PageHeroRow = {
  page_slug: string;
  title: string;
  subtitle: string;
  cta_label: string;
  cta_href: string;
  background_src: string;
  poster_src: string;
  media_type: "image" | "video";
};

type HomeUpdateRow = {
  id: string;
  text: string;
  link_label: string;
  href: string;
  avatar_src: string;
};

type AboutHomeRow = {
  heading: string;
  body: string;
  cta_label: string;
  cta_href: string;
  image_src: string;
  image_alt: string;
};

type SocialLinkRow = {
  id: string;
  label: string;
  platform: string;
  href: string;
  icon_key: string;
};

type MusicPlatformRow = {
  id: string;
  title: string;
  label: string;
  href: string;
  icon_key: string;
  image_src: string;
};

type SoundcloudTrackRow = {
  id: string;
  title: string;
  embed_url: string;
};

type BioGalleryImageRow = {
  id: string;
  src: string;
  alt: string;
};

type GalleryImageRow = {
  id: string;
  title: string;
  src: string;
  alt: string;
  caption: string;
  category: string;
  is_mosaic?: boolean | null;
  is_freelance_story?: boolean | null;
  freelance_story_order?: number | null;
};

type GalleryPresentationRow = {
  intro_eyebrow: string;
  intro_title: string;
  interlude_label: string;
  interlude_meta: string;
  interlude_eyebrow: string;
  interlude_title: string;
  interlude_video_src: string;
  interlude_poster_src: string;
  story_label: string;
  story_scroll_label: string;
};

type BioProfileRow = {
  top_label: string;
  intro_text: string;
  caption: string;
};

type BioParagraphRow = {
  id: string;
  body: string;
  reveal_delay: number;
};

type VideoRow = {
  id: string;
  title: string;
  description?: string | null;
  embed_url: string;
  platform: string;
  thumbnail_src: string;
  video_type?: string | null;
  is_featured?: boolean | null;
};

type ActorResumeRow = {
  headline: string;
  summary: string;
  location: string;
  playing_age: string;
  height: string;
  eyes: string;
  hair: string;
  languages: string;
  skills: string;
  representation: string;
  resume_url: string;
};

type ActorCreditRow = {
  id: string;
  credit_type?: string | null;
  title: string;
  role: string;
  production: string;
  director: string;
  year: string;
  href: string;
};

const PAGE_SLUG_SET = new Set<PageSlug>(PAGE_SLUGS);

function mapSettings(row?: SiteSettingsRow): SiteSettings {
  if (!row) return FALLBACK_CONTENT.settings;

  return {
    portfolioType: normalizePortfolioType(row.portfolio_type),
    footerEffect: normalizeFooterEffect(row.footer_effect),
    artistName: row.artist_name,
    displayFont: normalizeDisplayFont(row.display_font),
    bodyFont: normalizeBodyFont(row.body_font),
    uiFont: normalizeUiFont(row.ui_font),
    tagline: row.tagline,
    description: row.description,
    location: row.location,
    spotifyArtistUrl: row.spotify_artist_url,
    spotifyEmbedUrl: row.spotify_embed_url,
    contactBlurb: row.contact_blurb,
  };
}

function mapHeroes(rows: PageHeroRow[]): Record<PageSlug, HeroContent> {
  const heroes = { ...FALLBACK_CONTENT.heroes };

  for (const row of rows) {
    if (!PAGE_SLUG_SET.has(row.page_slug as PageSlug)) continue;

    heroes[row.page_slug as PageSlug] = {
      title: row.title,
      subtitle: row.subtitle,
      ctaLabel: row.cta_label,
      ctaHref: row.cta_href,
      backgroundSrc: row.background_src,
      posterSrc: row.poster_src,
      mediaType: row.media_type,
    };
  }

  return heroes;
}

function mapHomeUpdates(
  rows: HomeUpdateRow[],
  allowFallback = true
): HomeUpdate[] {
  if (!rows.length) return allowFallback ? FALLBACK_CONTENT.homeUpdates : [];

  return rows.map((row) => ({
    id: row.id,
    text: row.text,
    linkLabel: row.link_label || undefined,
    href: row.href || undefined,
    avatarSrc: row.avatar_src,
  }));
}

function mapAboutHome(row?: AboutHomeRow): AboutHomeContent {
  if (!row) return FALLBACK_CONTENT.aboutHome;

  return {
    heading: row.heading,
    body: row.body,
    ctaLabel: row.cta_label,
    ctaHref: row.cta_href,
    imageSrc: row.image_src,
    imageAlt: row.image_alt,
  };
}

function mapSocialLinks(
  rows: SocialLinkRow[],
  allowFallback = true
): SocialLink[] {
  if (!rows.length) return allowFallback ? FALLBACK_CONTENT.socialLinks : [];

  return rows.map((row) => ({
    id: row.id,
    label: row.label,
    platform: row.platform,
    href: row.href,
    iconKey: row.icon_key,
  }));
}

function mapMusicPlatforms(
  rows: MusicPlatformRow[],
  allowFallback = true
): MusicPlatformLink[] {
  if (!rows.length) return allowFallback ? FALLBACK_CONTENT.musicPlatforms : [];

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    label: row.label,
    href: row.href,
    iconKey: row.icon_key,
    imageSrc: row.image_src,
  }));
}

function mapSoundcloudTracks(
  rows: SoundcloudTrackRow[],
  allowFallback = true
): SoundcloudTrack[] {
  if (!rows.length) return allowFallback ? FALLBACK_CONTENT.soundcloudTracks : [];

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    embedUrl: row.embed_url,
  }));
}

function mapBioGalleryImages(
  rows: BioGalleryImageRow[],
  allowFallback = true
): BioGalleryImage[] {
  if (!rows.length) {
    return allowFallback ? FALLBACK_CONTENT.bio.galleryImages : [];
  }

  return rows.map((row) => ({
    id: row.id,
    src: row.src,
    alt: row.alt,
  }));
}

function mapGalleryImages(
  rows: GalleryImageRow[],
  allowFallback = true
): GalleryImage[] {
  if (!rows.length) return allowFallback ? FALLBACK_CONTENT.galleryImages : [];

  return rows.map((row, index) => ({
    id: row.id,
    title: row.title,
    src: row.src,
    alt: row.alt,
    caption: row.caption,
    category: row.category,
    isMosaic: row.is_mosaic ?? true,
    isFreelanceStory: row.is_freelance_story ?? index < 4,
    freelanceStoryOrder: row.freelance_story_order ?? (index + 1) * 10,
  }));
}

function mapGalleryPresentation(
  row?: GalleryPresentationRow,
  metadata: Record<string, unknown> = {}
): GalleryPresentation {
  if (!row) {
    const fallback = FALLBACK_CONTENT.galleryPresentation;
    return Object.fromEntries(
      Object.entries(fallback).map(([key, value]) => [
        key,
        typeof metadata[key] === "string" ? metadata[key] : value,
      ])
    ) as GalleryPresentation;
  }

  return {
    introEyebrow: row.intro_eyebrow,
    introTitle: row.intro_title,
    interludeLabel: row.interlude_label,
    interludeMeta: row.interlude_meta,
    interludeEyebrow: row.interlude_eyebrow,
    interludeTitle: row.interlude_title,
    interludeVideoSrc: row.interlude_video_src,
    interludePosterSrc: row.interlude_poster_src,
    storyLabel: row.story_label,
    storyScrollLabel:
      row.story_scroll_label === "Scroll through the practice"
        ? FALLBACK_CONTENT.galleryPresentation.storyScrollLabel
        : row.story_scroll_label,
  };
}

function mapVideoPresentation(
  metadata: Record<string, unknown> = {}
): VideoPresentation {
  const fallback = FALLBACK_CONTENT.videoPresentation;
  return Object.fromEntries(
    Object.entries(fallback).map(([key, value]) => [
      key,
      typeof metadata[key] === "string" ? metadata[key] : value,
    ])
  ) as VideoPresentation;
}

function mapHomePresentation(
  metadata: Record<string, unknown> = {}
): HomePresentation {
  const fallback = FALLBACK_CONTENT.homePresentation;
  const mapped = Object.fromEntries(
    Object.entries(fallback).map(([key, value]) => [
      key,
      typeof metadata[key] === "string" ? metadata[key] : value,
    ])
  ) as HomePresentation;

  if (mapped.featureTitle === "SHOWREEL") {
    mapped.featureTitle = fallback.featureTitle;
  }
  if (
    mapped.featureBody ===
    "Selected screen work, performance clips, and showreel material in one focused place."
  ) {
    mapped.featureBody = fallback.featureBody;
  }

  return mapped;
}

function mapBioProfile(row?: BioProfileRow) {
  if (!row) {
    return {
      topLabel: FALLBACK_CONTENT.bio.topLabel,
      introText: FALLBACK_CONTENT.bio.introText,
      caption: FALLBACK_CONTENT.bio.caption,
    };
  }

  return {
    topLabel: row.top_label,
    introText: row.intro_text,
    caption: row.caption,
  };
}

function mapBioParagraphs(
  rows: BioParagraphRow[],
  allowFallback = true
): BioParagraph[] {
  if (!rows.length) return allowFallback ? FALLBACK_CONTENT.bio.paragraphs : [];

  return rows.map((row) => ({
    id: row.id,
    body: row.body,
    revealDelay: row.reveal_delay,
  }));
}

function mapVideos(rows: VideoRow[], allowFallback = true): VideoItem[] {
  if (!rows.length) return allowFallback ? FALLBACK_CONTENT.videos : [];

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description || "",
    embedUrl: row.embed_url,
    platform: row.platform,
    thumbnailSrc: row.thumbnail_src,
    videoType: normalizeVideoType(row.video_type),
    isFeatured: Boolean(row.is_featured),
  }));
}

function normalizeVideoType(value?: string | null): VideoType {
  return VIDEO_TYPES.includes(value as VideoType)
    ? (value as VideoType)
    : "music_video";
}

function mapActorResume(row?: ActorResumeRow): ActorResume {
  if (!row) return FALLBACK_CONTENT.actorResume;

  return {
    headline: row.headline,
    summary: row.summary,
    location: row.location,
    playingAge: row.playing_age,
    height: row.height,
    eyes: row.eyes,
    hair: row.hair,
    languages: row.languages,
    skills: row.skills,
    representation: row.representation,
    resumeUrl: row.resume_url,
  };
}

function mapActorCredits(
  rows: ActorCreditRow[],
  allowFallback = true
): ActorCredit[] {
  if (!rows.length) return allowFallback ? FALLBACK_CONTENT.actorCredits : [];

  return rows.map((row) => ({
    id: row.id,
    creditType: normalizeActorCreditType(row.credit_type),
    title: row.title,
    role: row.role,
    production: row.production,
    director: row.director,
    year: row.year,
    href: row.href,
  }));
}

function normalizeActorCreditType(value?: string | null): ActorCreditType {
  return ACTOR_CREDIT_TYPES.includes(value as ActorCreditType)
    ? (value as ActorCreditType)
    : "other";
}

async function readSupabaseContent(
  supabase: SupabaseClient,
  allowFallback: boolean
): Promise<PortfolioContent> {
  const [
    settings,
    heroes,
    updates,
    about,
    socials,
    platforms,
    tracks,
    gallery,
    galleryImages,
    galleryPresentation,
    galleryPresentationAsset,
    videoPresentationAsset,
    homePresentationAsset,
    bioProfile,
    paragraphs,
    videos,
    actorResume,
    actorCredits,
  ] = await Promise.all([
    supabase
      .from("site_settings")
      .select("*")
      .eq("id", "main")
      .limit(1)
      .returns<SiteSettingsRow[]>(),
    supabase
      .from("page_heroes")
      .select("*")
      .order("sort_order", { ascending: true })
      .returns<PageHeroRow[]>(),
    supabase
      .from("home_updates")
      .select("*")
      .eq("is_published", true)
      .order("sort_order", { ascending: true })
      .returns<HomeUpdateRow[]>(),
    supabase
      .from("about_home")
      .select("*")
      .eq("id", "main")
      .limit(1)
      .returns<AboutHomeRow[]>(),
    supabase
      .from("social_links")
      .select("*")
      .eq("is_published", true)
      .order("sort_order", { ascending: true })
      .returns<SocialLinkRow[]>(),
    supabase
      .from("music_platform_links")
      .select("*")
      .eq("is_published", true)
      .order("sort_order", { ascending: true })
      .returns<MusicPlatformRow[]>(),
    supabase
      .from("soundcloud_tracks")
      .select("*")
      .eq("is_published", true)
      .order("sort_order", { ascending: true })
      .returns<SoundcloudTrackRow[]>(),
    supabase
      .from("bio_gallery_images")
      .select("*")
      .eq("is_published", true)
      .order("sort_order", { ascending: true })
      .returns<BioGalleryImageRow[]>(),
    supabase
      .from("gallery_images")
      .select("*")
      .eq("is_published", true)
      .order("sort_order", { ascending: true })
      .returns<GalleryImageRow[]>(),
    supabase
      .from("gallery_presentation")
      .select("*")
      .eq("id", "main")
      .limit(1)
      .returns<GalleryPresentationRow[]>(),
    supabase
      .from("media_assets")
      .select("metadata")
      .eq("id", "gallery-studio-settings")
      .limit(1)
      .returns<Array<{ metadata: Record<string, unknown> }>>(),
    supabase
      .from("media_assets")
      .select("metadata")
      .eq("id", "showreel-studio-settings")
      .limit(1)
      .returns<Array<{ metadata: Record<string, unknown> }>>(),
    supabase
      .from("media_assets")
      .select("metadata")
      .eq("id", "home-studio-settings")
      .limit(1)
      .returns<Array<{ metadata: Record<string, unknown> }>>(),
    supabase
      .from("bio_profile")
      .select("*")
      .eq("id", "main")
      .limit(1)
      .returns<BioProfileRow[]>(),
    supabase
      .from("bio_paragraphs")
      .select("*")
      .eq("is_published", true)
      .order("sort_order", { ascending: true })
      .returns<BioParagraphRow[]>(),
    supabase
      .from("videos")
      .select("*")
      .eq("is_published", true)
      .order("sort_order", { ascending: true })
      .returns<VideoRow[]>(),
    supabase
      .from("actor_resume")
      .select("*")
      .eq("id", "main")
      .limit(1)
      .returns<ActorResumeRow[]>(),
    supabase
      .from("actor_credits")
      .select("*")
      .eq("is_published", true)
      .order("sort_order", { ascending: true })
      .returns<ActorCreditRow[]>(),
  ]);

  const errors = [
    settings.error,
    heroes.error,
    updates.error,
    about.error,
    socials.error,
    platforms.error,
    tracks.error,
    gallery.error,
    galleryImages.error,
    galleryPresentationAsset.error,
    videoPresentationAsset.error,
    homePresentationAsset.error,
    bioProfile.error,
    paragraphs.error,
    videos.error,
    actorResume.error,
    actorCredits.error,
  ].filter(Boolean);

  if (errors.length) {
    throw new Error("Unable to load portfolio content from Supabase.");
  }

  const settingsRow = settings.data?.[0];
  const heroRows = heroes.data ?? [];

  if (!allowFallback) {
    const portfolioType = normalizePortfolioType(settingsRow?.portfolio_type);
    const identityMissing =
      !settingsRow?.artist_name.trim() ||
      !heroRows.find((row) => row.page_slug === "home")?.title.trim();
    const requiredProfileMissing =
      !about.data?.[0] ||
      !bioProfile.data?.[0] ||
      (portfolioType === "actor" && !actorResume.data?.[0]);

    if (identityMissing || requiredProfileMissing) {
      throw new Error("Required published portfolio content is incomplete.");
    }
  }

  const bioProfileContent = mapBioProfile(bioProfile.data?.[0]);

  return {
    settings: mapSettings(settingsRow),
    heroes: mapHeroes(heroRows),
    homeUpdates: mapHomeUpdates(updates.data ?? [], allowFallback),
    homePresentation: mapHomePresentation(
      homePresentationAsset.data?.[0]?.metadata
    ),
    aboutHome: mapAboutHome(about.data?.[0]),
    socialLinks: mapSocialLinks(socials.data ?? [], allowFallback),
    musicPlatforms: mapMusicPlatforms(platforms.data ?? [], allowFallback),
    soundcloudTracks: mapSoundcloudTracks(tracks.data ?? [], allowFallback),
    bio: {
      ...bioProfileContent,
      galleryImages: mapBioGalleryImages(gallery.data ?? [], allowFallback),
      paragraphs: mapBioParagraphs(paragraphs.data ?? [], allowFallback),
    },
    galleryImages: mapGalleryImages(galleryImages.data ?? [], allowFallback),
    galleryPresentation: mapGalleryPresentation(
      galleryPresentation.data?.[0],
      galleryPresentationAsset.data?.[0]?.metadata
    ),
    videoPresentation: mapVideoPresentation(
      videoPresentationAsset.data?.[0]?.metadata
    ),
    videos: mapVideos(videos.data ?? [], allowFallback),
    actorResume: mapActorResume(actorResume.data?.[0]),
    actorCredits: mapActorCredits(actorCredits.data ?? [], allowFallback),
  };
}

function isLoopbackSiteUrl(value?: string) {
  if (!value) return false;

  try {
    const url = new URL(
      /^https?:\/\//i.test(value) ? value : `http://${value}`
    );
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    return (
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname === "127.0.0.1" ||
      hostname === "::1"
    );
  } catch {
    return false;
  }
}

function canUseFallbackContent() {
  if (process.env.NODE_ENV !== "production") return true;
  if (process.env.VERCEL === "1" || process.env.VERCEL_ENV) return false;
  if (process.env.ALLOW_FALLBACK_CONTENT !== "true") return false;

  const configuredUrls = [
    process.env.SITE_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
  ].filter((value): value is string => Boolean(value));

  return (
    configuredUrls.length > 0 && configuredUrls.every(isLoopbackSiteUrl)
  );
}

export const getPortfolioContent = cache(async (): Promise<PortfolioContent> => {
  const supabase = createPublicContentClient();
  const allowFallback = canUseFallbackContent();

  if (!supabase) {
    if (allowFallback) return FALLBACK_CONTENT;
    throw new Error(
      "Published portfolio content is unavailable because Supabase is not configured."
    );
  }

  try {
    return await readSupabaseContent(supabase, allowFallback);
  } catch (error) {
    if (allowFallback) return FALLBACK_CONTENT;
    console.error("Unable to load published portfolio content.", error);
    throw new Error("Published portfolio content is temporarily unavailable.");
  }
});

export type {
  ActorCredit,
  ActorCreditType,
  ActorResume,
  AboutHomeContent,
  BioGalleryImage,
  BioParagraph,
  FooterEffect,
  GalleryImage,
  GalleryPresentation,
  HeroContent,
  HomeUpdate,
  HomePresentation,
  MusicPlatformLink,
  PageSlug,
  PortfolioContent,
  PortfolioType,
  SiteSettings,
  SocialLink,
  SoundcloudTrack,
  VideoItem,
  VideoPresentation,
  VideoType,
};

export { ACTOR_CREDIT_TYPES, VIDEO_TYPES };
