import type {
  FooterEffect,
  HeroContent,
  MusicPlatformLink,
  PortfolioContent,
  SocialLink,
  SoundcloudTrack,
} from "./types";
import { normalizeSoundcloudPlaylistUrl, parseMusicTrackUrl } from "@/lib/music-embeds";

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
    provider?: "spotify" | "soundcloud";
    soundcloudPlaylistUrl?: string;
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

export type MusicPublicSectionVisibility = Record<
  Exclude<MusicPreviewSection, "hero">,
  boolean
>;

const MUSIC_SECTION_ANCHORS = {
  platforms: "#music-platforms",
  spotify: "#spotify-releases",
  soundcloud: "#soundcloud-mixes",
} as const satisfies Record<keyof MusicPublicSectionVisibility, string>;

export function getMusicPublicSectionVisibility(
  data: MusicPageViewData
): MusicPublicSectionVisibility {
  return {
    platforms: data.platforms.some((platform) => platform.href.trim()),
    spotify: data.spotify.provider === "soundcloud"
      ? Boolean(normalizeSoundcloudPlaylistUrl(data.spotify.soundcloudPlaylistUrl || ""))
      : Boolean(data.spotify.embedUrl.trim() || data.spotify.artistUrl.trim()),
    soundcloud: data.soundcloud.tracks.some((track) => parseMusicTrackUrl(track.embedUrl) !== null),
  };
}

/**
 * A saved Hero CTA may still point at a section the owner has since emptied.
 * Keep external and unrelated local targets intact, but retarget known hidden
 * Music anchors to the first section visitors can actually reach.
 */
export function resolveMusicHeroCtaHref(
  href: string,
  visibility: MusicPublicSectionVisibility
) {
  const trimmedHref = href.trim();
  const hash = trimmedHref.startsWith("#")
    ? trimmedHref
    : /^\/music#[^#]+$/i.test(trimmedHref)
      ? trimmedHref.slice("/music".length)
      : "";
  const hiddenTarget = Object.entries(MUSIC_SECTION_ANCHORS).find(
    ([section, anchor]) =>
      anchor === hash && !visibility[section as keyof MusicPublicSectionVisibility]
  );

  if (!hiddenTarget) return href;

  const firstVisibleSection = (
    Object.keys(MUSIC_SECTION_ANCHORS) as Array<
      keyof MusicPublicSectionVisibility
    >
  ).find((section) => visibility[section]);

  return firstVisibleSection
    ? MUSIC_SECTION_ANCHORS[firstVisibleSection]
    : "#music";
}

export function preparePublicMusicPageViewData(
  data: MusicPageViewData
): MusicPageViewData {
  const publicData: MusicPageViewData = {
    ...data,
    platforms: data.platforms
      .filter((platform) => platform.href.trim())
      .map((platform) => ({
        ...platform,
        href: platform.href.trim(),
      })),
    spotify: {
      ...data.spotify,
      artistUrl: data.spotify.artistUrl.trim(),
      embedUrl: data.spotify.embedUrl.trim(),
      provider: data.spotify.provider === "soundcloud" ? "soundcloud" : "spotify",
      soundcloudPlaylistUrl: normalizeSoundcloudPlaylistUrl(data.spotify.soundcloudPlaylistUrl || ""),
    },
    soundcloud: {
      ...data.soundcloud,
      tracks: data.soundcloud.tracks.flatMap((track) => {
        const player = parseMusicTrackUrl(track.embedUrl);
        return player ? [{ ...track, embedUrl: player.sourceUrl }] : [];
      }),
    },
  };
  const visibility = getMusicPublicSectionVisibility(publicData);

  return {
    ...publicData,
    hero: {
      ...publicData.hero,
      ctaHref: resolveMusicHeroCtaHref(publicData.hero.ctaHref, visibility),
    },
  };
}

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
      provider: content.musicPresentation.releaseProvider ?? "spotify",
      soundcloudPlaylistUrl: content.musicPresentation.soundcloudPlaylistUrl ?? "",
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
