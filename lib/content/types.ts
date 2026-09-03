export type PageSlug =
  | "home"
  | "bio"
  | "gallery"
  | "music"
  | "video"
  | "booking";

export type PortfolioType = "musician" | "actor";

export const FOOTER_EFFECTS = ["soul", "red-light"] as const;
export type FooterEffect = (typeof FOOTER_EFFECTS)[number];

export function normalizeFooterEffect(value?: string | null): FooterEffect {
  return value === "red-light" ? "red-light" : "soul";
}

import type {
  BodyFontKey,
  DisplayFontKey,
  UiFontKey,
} from "./fonts";
import type {
  NavigationConfig,
  NavigationConfigVersion,
} from "./navigation";

export const VIDEO_TYPES = [
  "showreel",
  "scene",
  "self_tape",
  "interview",
  "music_video",
  "behind_scenes",
  "other",
] as const;

export type VideoType = (typeof VIDEO_TYPES)[number];

export const ACTOR_CREDIT_TYPES = [
  "film",
  "television",
  "theatre",
  "commercial",
  "voiceover",
  "training",
  "other",
] as const;

export type ActorCreditType = (typeof ACTOR_CREDIT_TYPES)[number];

export type HeroContent = {
  title: string;
  subtitle: string;
  ctaLabel: string;
  ctaHref: string;
  backgroundSrc: string;
  posterSrc: string;
  mediaType: "image" | "video";
};

export type SiteSettings = {
  portfolioType: PortfolioType;
  navigationConfigVersion: NavigationConfigVersion;
  hiddenNavPageSlugs: PageSlug[];
  footerEffect: FooterEffect;
  artistName: string;
  displayFont: DisplayFontKey;
  bodyFont: BodyFontKey;
  uiFont: UiFontKey;
  tagline: string;
  description: string;
  location: string;
  spotifyArtistUrl: string;
  spotifyEmbedUrl: string;
  contactBlurb: string;
};

export type HomeUpdate = {
  id: string;
  text: string;
  linkLabel?: string;
  href?: string;
  avatarSrc: string;
};

export type AboutHomeContent = {
  heading: string;
  body: string;
  ctaLabel: string;
  ctaHref: string;
  imageSrc: string;
  imageAlt: string;
};

export type SocialLink = {
  id: string;
  label: string;
  platform: string;
  href: string;
  iconKey: string;
};

export type MusicPlatformLink = {
  id: string;
  title: string;
  label: string;
  href: string;
  iconKey: string;
  imageSrc: string;
};

export type SoundcloudTrack = {
  id: string;
  title?: string;
  embedUrl: string;
};

export type MusicPresentation = {
  releasesHeading: string;
  mixesHeading: string;
};

export type BioGalleryImage = {
  id: string;
  src: string;
  alt: string;
};

export type GalleryImage = {
  id: string;
  title: string;
  src: string;
  alt: string;
  caption: string;
  category: string;
  isMosaic: boolean;
  isFreelanceStory: boolean;
  freelanceStoryOrder: number;
};

export type BioParagraph = {
  id: string;
  body: string;
  revealDelay: number;
};

export type BioContent = {
  topLabel: string;
  introText: string;
  caption: string;
  galleryImages: BioGalleryImage[];
  paragraphs: BioParagraph[];
};

export type VideoItem = {
  id: string;
  title: string;
  description: string;
  embedUrl: string;
  platform: string;
  thumbnailSrc: string;
  videoType: VideoType;
  isFeatured: boolean;
};

export type ActorResume = {
  headline: string;
  summary: string;
  location: string;
  playingAge: string;
  height: string;
  eyes: string;
  hair: string;
  languages: string;
  skills: string;
  representation: string;
  resumeUrl: string;
};

export type ActorCredit = {
  id: string;
  creditType: ActorCreditType;
  title: string;
  role: string;
  production: string;
  director: string;
  year: string;
  href: string;
};

export type GalleryPresentation = {
  introEyebrow: string;
  introTitle: string;
  interludeLabel: string;
  interludeMeta: string;
  interludeEyebrow: string;
  interludeTitle: string;
  interludeVideoSrc: string;
  interludePosterSrc: string;
  storyLabel: string;
  storyScrollLabel: string;
};

export type VideoPresentation = {
  sectionEyebrow: string;
  sectionTitle: string;
  sectionBody: string;
  featuredLabel: string;
  featuredFallback: string;
  libraryEyebrow: string;
  libraryTitle: string;
  emptyText: string;
};

export type HomePresentation = {
  updatesHeading: string;
  updatesImageSrc: string;
  updatesImageAlt: string;
  updatesCtaLabel: string;
  updatesCtaHref: string;
  featureTitle: string;
  featureBody: string;
  featureCtaLabel: string;
  featureCtaHref: string;
  featureImageSrc: string;
  featureImageAlt: string;
  featureVideoSrc: string;
  featurePosterSrc: string;
  storyTitle: string;
  storyBody: string;
  storyCtaLabel: string;
  storyCtaHref: string;
  storyImage1Src: string;
  storyImage1Title: string;
  storyImage1Body: string;
  storyImage2Src: string;
  storyImage2Title: string;
  storyImage2Body: string;
  storyImage3Src: string;
  storyImage3Title: string;
  storyImage3Body: string;
  storyImage4Src: string;
  storyImage4Title: string;
  storyImage4Body: string;
};

export type PortfolioContent = {
  settings: SiteSettings;
  navigation: NavigationConfig;
  heroes: Record<PageSlug, HeroContent>;
  homeUpdates: HomeUpdate[];
  homePresentation: HomePresentation;
  aboutHome: AboutHomeContent;
  socialLinks: SocialLink[];
  musicPlatforms: MusicPlatformLink[];
  musicPresentation: MusicPresentation;
  soundcloudTracks: SoundcloudTrack[];
  bio: BioContent;
  galleryPresentation: GalleryPresentation;
  galleryImages: GalleryImage[];
  videoPresentation: VideoPresentation;
  videos: VideoItem[];
  /** True only when a real resume record exists (or local fallback is active). */
  hasActorResume: boolean;
  actorResume: ActorResume;
  actorCredits: ActorCredit[];
};
