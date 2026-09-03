import type {
  FooterEffect,
  HeroContent,
  MusicPlatformLink,
  PortfolioContent,
  SocialLink,
  SoundcloudTrack,
} from "./types";

export type MusicPreviewSection =
  | "hero"
  | "platforms"
  | "spotify"
  | "soundcloud";

export type MusicPageViewData = {
  hero: HeroContent;
  platforms: MusicPlatformLink[];
  spotify: {
    heading: string;
    artistUrl: string;
    embedUrl: string;
  };
  soundcloud: {
    heading: string;
    tracks: SoundcloudTrack[];
  };
  footer: {
    artistName: string;
    contactBlurb: string;
    footerEffect: FooterEffect;
    location: string;
    socialLinks: SocialLink[];
    tagline: string;
  };
};

/**
 * Keep the public Music page and its visual editor on one presentation contract.
 * The selector deliberately contains no admin-only metadata such as row ids,
 * ordering values, or optimistic-lock versions.
 */
export function selectMusicPageViewData(
  content: PortfolioContent
): MusicPageViewData {
  return {
    hero: content.heroes.music,
    platforms: content.musicPlatforms,
    spotify: {
      heading: content.musicPresentation.releasesHeading,
      artistUrl: content.settings.spotifyArtistUrl,
      embedUrl: content.settings.spotifyEmbedUrl,
    },
    soundcloud: {
      heading: content.musicPresentation.mixesHeading,
      tracks: content.soundcloudTracks,
    },
    footer: {
      artistName: content.settings.artistName,
      contactBlurb: content.settings.contactBlurb,
      footerEffect: content.settings.footerEffect,
      location: content.settings.location,
      socialLinks: content.socialLinks,
      tagline: content.settings.tagline,
    },
  };
}
