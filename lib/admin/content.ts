import { FALLBACK_CONTENT } from "@/lib/content/fallback";
import { PAGE_SLUGS } from "@/lib/content/modules";
import {
  normalizeBodyFont,
  normalizeDisplayFont,
  normalizeUiFont,
} from "@/lib/content/fonts";
import { normalizePortfolioType } from "@/lib/content/profile";
import {
  ACTOR_CREDIT_TYPES,
  VIDEO_TYPES,
  normalizeFooterEffect,
} from "@/lib/content/types";
import type {
  ActorCredit,
  ActorCreditType,
  ActorResume,
  AboutHomeContent,
  BioGalleryImage,
  BioParagraph,
  GalleryImage,
  GalleryPresentation,
  HeroContent,
  HomeUpdate,
  HomePresentation,
  MusicPlatformLink,
  PageSlug,
  SiteSettings,
  SocialLink,
  SoundcloudTrack,
  VideoItem,
  VideoPresentation,
  VideoType,
} from "@/lib/content/types";
import {
  createAdminServiceClient,
  hasAdminServiceEnv,
} from "@/lib/admin/service";

export type EditableHeroContent = HeroContent & {
  pageSlug: PageSlug;
  sortOrder: number;
};

export type PublishableMeta = {
  sortOrder: number;
  isPublished: boolean;
};

export type EditableHomeUpdate = HomeUpdate &
  PublishableMeta & {
    linkLabel: string;
    href: string;
  };

export type EditableSocialLink = SocialLink & PublishableMeta;

export type EditableMusicPlatformLink = MusicPlatformLink & PublishableMeta;

export type EditableSoundcloudTrack = SoundcloudTrack &
  PublishableMeta & {
    title: string;
  };

export type EditableBioGalleryImage = BioGalleryImage & PublishableMeta;

export type EditableGalleryImage = GalleryImage & PublishableMeta;

export type EditableBioParagraph = BioParagraph & PublishableMeta;

export type EditableVideoItem = VideoItem & PublishableMeta;

export type EditableActorCredit = ActorCredit & PublishableMeta;

export type EditablePortfolioContent = {
  settings: SiteSettings;
  heroes: EditableHeroContent[];
  homeUpdates: EditableHomeUpdate[];
  homePresentation: HomePresentation;
  aboutHome: AboutHomeContent;
  socialLinks: EditableSocialLink[];
  musicPlatforms: EditableMusicPlatformLink[];
  soundcloudTracks: EditableSoundcloudTrack[];
  bio: {
    topLabel: string;
    introText: string;
    caption: string;
    galleryImages: EditableBioGalleryImage[];
    paragraphs: EditableBioParagraph[];
  };
  galleryPresentation: GalleryPresentation;
  galleryImages: EditableGalleryImage[];
  videoPresentation: VideoPresentation;
  videos: EditableVideoItem[];
  actorResume: ActorResume;
  actorCredits: EditableActorCredit[];
};

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
  page_slug: PageSlug;
  title: string;
  subtitle: string;
  cta_label: string;
  cta_href: string;
  background_src: string;
  poster_src: string;
  media_type: "image" | "video";
  sort_order: number;
};

type HomeUpdateRow = {
  id: string;
  text: string;
  link_label: string;
  href: string;
  avatar_src: string;
  sort_order: number;
  is_published: boolean;
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
  sort_order: number;
  is_published: boolean;
};

type MusicPlatformRow = {
  id: string;
  title: string;
  label: string;
  href: string;
  icon_key: string;
  image_src: string;
  sort_order: number;
  is_published: boolean;
};

type SoundcloudTrackRow = {
  id: string;
  title: string;
  embed_url: string;
  sort_order: number;
  is_published: boolean;
};

type BioGalleryImageRow = {
  id: string;
  src: string;
  alt: string;
  sort_order: number;
  is_published: boolean;
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
  sort_order: number;
  is_published: boolean;
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
  sort_order: number;
  is_published: boolean;
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
  sort_order: number;
  is_published: boolean;
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
  sort_order: number;
  is_published: boolean;
};

function mapFallbackHeroes(): EditableHeroContent[] {
  return PAGE_SLUGS.map((pageSlug, index) => ({
    pageSlug,
    ...FALLBACK_CONTENT.heroes[pageSlug],
    sortOrder: (index + 1) * 10,
  }));
}

function withFallbackMeta<T extends { id: string }>(
  items: T[]
): Array<T & PublishableMeta> {
  return items.map((item, index) => ({
    ...item,
    sortOrder: (index + 1) * 10,
    isPublished: true,
  }));
}

function getFallbackEditableContent(): EditablePortfolioContent {
  return {
    settings: FALLBACK_CONTENT.settings,
    heroes: mapFallbackHeroes(),
    homeUpdates: withFallbackMeta(
      FALLBACK_CONTENT.homeUpdates.map((item) => ({
        ...item,
        linkLabel: item.linkLabel || "",
        href: item.href || "",
      }))
    ),
    homePresentation: FALLBACK_CONTENT.homePresentation,
    aboutHome: FALLBACK_CONTENT.aboutHome,
    socialLinks: withFallbackMeta(FALLBACK_CONTENT.socialLinks),
    musicPlatforms: withFallbackMeta(FALLBACK_CONTENT.musicPlatforms),
    soundcloudTracks: withFallbackMeta(
      FALLBACK_CONTENT.soundcloudTracks.map((item) => ({
        ...item,
        title: item.title || "",
      }))
    ),
    bio: {
      topLabel: FALLBACK_CONTENT.bio.topLabel,
      introText: FALLBACK_CONTENT.bio.introText,
      caption: FALLBACK_CONTENT.bio.caption,
      galleryImages: withFallbackMeta(FALLBACK_CONTENT.bio.galleryImages),
      paragraphs: withFallbackMeta(FALLBACK_CONTENT.bio.paragraphs),
    },
    galleryImages: withFallbackMeta(FALLBACK_CONTENT.galleryImages),
    galleryPresentation: FALLBACK_CONTENT.galleryPresentation,
    videoPresentation: FALLBACK_CONTENT.videoPresentation,
    videos: withFallbackMeta(FALLBACK_CONTENT.videos),
    actorResume: FALLBACK_CONTENT.actorResume,
    actorCredits: withFallbackMeta(FALLBACK_CONTENT.actorCredits),
  };
}

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

function mapHeroes(rows: PageHeroRow[]): EditableHeroContent[] {
  if (!rows.length) return mapFallbackHeroes();

  const fallbackBySlug = new Map(
    mapFallbackHeroes().map((hero) => [hero.pageSlug, hero])
  );

  for (const row of rows) {
    fallbackBySlug.set(row.page_slug, {
      pageSlug: row.page_slug,
      title: row.title,
      subtitle: row.subtitle,
      ctaLabel: row.cta_label,
      ctaHref: row.cta_href,
      backgroundSrc: row.background_src,
      posterSrc: row.poster_src,
      mediaType: row.media_type,
      sortOrder: row.sort_order,
    });
  }

  return PAGE_SLUGS.map((slug) => fallbackBySlug.get(slug)).filter(
    Boolean
  ) as EditableHeroContent[];
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

function mapHomeUpdates(rows: HomeUpdateRow[]): EditableHomeUpdate[] {
  if (!rows.length) return getFallbackEditableContent().homeUpdates;

  return rows.map((row) => ({
    id: row.id,
    text: row.text,
    linkLabel: row.link_label,
    href: row.href,
    avatarSrc: row.avatar_src,
    sortOrder: row.sort_order,
    isPublished: row.is_published,
  }));
}

function mapSocialLinks(rows: SocialLinkRow[]): EditableSocialLink[] {
  if (!rows.length) return getFallbackEditableContent().socialLinks;

  return rows.map((row) => ({
    id: row.id,
    label: row.label,
    platform: row.platform,
    href: row.href,
    iconKey: row.icon_key,
    sortOrder: row.sort_order,
    isPublished: row.is_published,
  }));
}

function mapMusicPlatforms(
  rows: MusicPlatformRow[]
): EditableMusicPlatformLink[] {
  if (!rows.length) return getFallbackEditableContent().musicPlatforms;

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    label: row.label,
    href: row.href,
    iconKey: row.icon_key,
    imageSrc: row.image_src,
    sortOrder: row.sort_order,
    isPublished: row.is_published,
  }));
}

function mapSoundcloudTracks(
  rows: SoundcloudTrackRow[]
): EditableSoundcloudTrack[] {
  if (!rows.length) return getFallbackEditableContent().soundcloudTracks;

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    embedUrl: row.embed_url,
    sortOrder: row.sort_order,
    isPublished: row.is_published,
  }));
}

function mapBioGalleryImages(
  rows: BioGalleryImageRow[]
): EditableBioGalleryImage[] {
  if (!rows.length) return getFallbackEditableContent().bio.galleryImages;

  return rows.map((row) => ({
    id: row.id,
    src: row.src,
    alt: row.alt,
    sortOrder: row.sort_order,
    isPublished: row.is_published,
  }));
}

function mapGalleryImages(rows: GalleryImageRow[]): EditableGalleryImage[] {
  if (!rows.length) return getFallbackEditableContent().galleryImages;

  return rows.map((row, index) => ({
    id: row.id,
    title: row.title,
    src: row.src,
    alt: row.alt,
    caption: row.caption,
    category: row.category,
    isMosaic: row.is_mosaic ?? true,
    isFreelanceStory: row.is_freelance_story ?? index < 4,
    freelanceStoryOrder:
      row.freelance_story_order ?? row.sort_order ?? (index + 1) * 10,
    sortOrder: row.sort_order,
    isPublished: row.is_published,
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

function mapBioParagraphs(rows: BioParagraphRow[]): EditableBioParagraph[] {
  if (!rows.length) return getFallbackEditableContent().bio.paragraphs;

  return rows.map((row) => ({
    id: row.id,
    body: row.body,
    revealDelay: row.reveal_delay,
    sortOrder: row.sort_order,
    isPublished: row.is_published,
  }));
}

function mapVideos(rows: VideoRow[]): EditableVideoItem[] {
  if (!rows.length) return getFallbackEditableContent().videos;

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description || "",
    embedUrl: row.embed_url,
    platform: row.platform,
    thumbnailSrc: row.thumbnail_src,
    videoType: normalizeVideoType(row.video_type),
    isFeatured: Boolean(row.is_featured),
    sortOrder: row.sort_order,
    isPublished: row.is_published,
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

function mapActorCredits(rows: ActorCreditRow[]): EditableActorCredit[] {
  if (!rows.length) return getFallbackEditableContent().actorCredits;

  return rows.map((row) => ({
    id: row.id,
    creditType: normalizeActorCreditType(row.credit_type),
    title: row.title,
    role: row.role,
    production: row.production,
    director: row.director,
    year: row.year,
    href: row.href,
    sortOrder: row.sort_order,
    isPublished: row.is_published,
  }));
}

function normalizeActorCreditType(value?: string | null): ActorCreditType {
  return ACTOR_CREDIT_TYPES.includes(value as ActorCreditType)
    ? (value as ActorCreditType)
    : "other";
}

export async function getEditablePortfolioContent(): Promise<{
  content: EditablePortfolioContent;
  isConfigured: boolean;
  loadError?: string;
}> {
  if (!hasAdminServiceEnv()) {
    return {
      content: getFallbackEditableContent(),
      isConfigured: false,
    };
  }

  const supabase = createAdminServiceClient();
  if (!supabase) {
    return {
      content: getFallbackEditableContent(),
      isConfigured: false,
    };
  }

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
    homePresentationAsset,
    videoPresentationAsset,
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
      .order("sort_order", { ascending: true })
      .returns<SocialLinkRow[]>(),
    supabase
      .from("music_platform_links")
      .select("*")
      .order("sort_order", { ascending: true })
      .returns<MusicPlatformRow[]>(),
    supabase
      .from("soundcloud_tracks")
      .select("*")
      .order("sort_order", { ascending: true })
      .returns<SoundcloudTrackRow[]>(),
    supabase
      .from("bio_gallery_images")
      .select("*")
      .order("sort_order", { ascending: true })
      .returns<BioGalleryImageRow[]>(),
    supabase
      .from("gallery_images")
      .select("*")
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
      .eq("id", "home-studio-settings")
      .limit(1)
      .returns<Array<{ metadata: Record<string, unknown> }>>(),
    supabase
      .from("media_assets")
      .select("metadata")
      .eq("id", "showreel-studio-settings")
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
      .order("sort_order", { ascending: true })
      .returns<BioParagraphRow[]>(),
    supabase
      .from("videos")
      .select("*")
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
    bioProfile.error,
    paragraphs.error,
    videos.error,
    actorResume.error,
    actorCredits.error,
  ].filter(Boolean);

  if (errors.length) {
    return {
      content: getFallbackEditableContent(),
      isConfigured: true,
      loadError: "Unable to load editable content from Supabase.",
    };
  }

  const bioProfileContent = mapBioProfile(bioProfile.data?.[0]);

  return {
    content: {
      settings: mapSettings(settings.data?.[0]),
      heroes: mapHeroes(heroes.data ?? []),
      homeUpdates: mapHomeUpdates(updates.data ?? []),
      homePresentation: mapHomePresentation(
        homePresentationAsset.data?.[0]?.metadata
      ),
      aboutHome: mapAboutHome(about.data?.[0]),
      socialLinks: mapSocialLinks(socials.data ?? []),
      musicPlatforms: mapMusicPlatforms(platforms.data ?? []),
      soundcloudTracks: mapSoundcloudTracks(tracks.data ?? []),
      bio: {
        ...bioProfileContent,
        galleryImages: mapBioGalleryImages(gallery.data ?? []),
        paragraphs: mapBioParagraphs(paragraphs.data ?? []),
      },
      galleryImages: mapGalleryImages(galleryImages.data ?? []),
      galleryPresentation: mapGalleryPresentation(
        galleryPresentation.data?.[0],
        galleryPresentationAsset.data?.[0]?.metadata
      ),
      videoPresentation: Object.fromEntries(
        Object.entries(FALLBACK_CONTENT.videoPresentation).map(([key, value]) => [
          key,
          typeof videoPresentationAsset.data?.[0]?.metadata?.[key] === "string"
            ? videoPresentationAsset.data[0].metadata[key]
            : value,
        ])
      ) as VideoPresentation,
      videos: mapVideos(videos.data ?? []),
      actorResume: mapActorResume(actorResume.data?.[0]),
      actorCredits: mapActorCredits(actorCredits.data ?? []),
    },
    isConfigured: true,
  };
}
