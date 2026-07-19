import type { PortfolioType } from "./types";

export const SOCIAL_PLATFORM_DEFINITIONS = [
  { key: "spotify", label: "Spotify", hrefPlaceholder: "https://open.spotify.com/artist/..." },
  { key: "soundcloud", label: "SoundCloud", hrefPlaceholder: "https://soundcloud.com/..." },
  { key: "instagram", label: "Instagram", hrefPlaceholder: "https://instagram.com/..." },
  { key: "youtube", label: "YouTube", hrefPlaceholder: "https://youtube.com/@..." },
  { key: "bandcamp", label: "Bandcamp", hrefPlaceholder: "https://....bandcamp.com" },
  { key: "apple-music", label: "Apple Music", hrefPlaceholder: "https://music.apple.com/artist/..." },
  { key: "vimeo", label: "Vimeo", hrefPlaceholder: "https://vimeo.com/..." },
  { key: "imdb", label: "IMDb", hrefPlaceholder: "https://imdb.com/name/..." },
  { key: "tiktok", label: "TikTok", hrefPlaceholder: "https://tiktok.com/@..." },
  { key: "facebook", label: "Facebook", hrefPlaceholder: "https://facebook.com/..." },
  { key: "linkedin", label: "LinkedIn", hrefPlaceholder: "https://linkedin.com/in/..." },
  { key: "twitter", label: "X / Twitter", hrefPlaceholder: "https://x.com/..." },
  { key: "website", label: "Website / other", hrefPlaceholder: "https://..." },
] as const;

export type SocialPlatformKey =
  (typeof SOCIAL_PLATFORM_DEFINITIONS)[number]["key"];

const musicianOrder: SocialPlatformKey[] = [
  "spotify",
  "soundcloud",
  "instagram",
  "youtube",
  "bandcamp",
  "apple-music",
  "tiktok",
  "facebook",
  "twitter",
  "website",
  "vimeo",
  "imdb",
  "linkedin",
];

const actorOrder: SocialPlatformKey[] = [
  "vimeo",
  "youtube",
  "imdb",
  "instagram",
  "tiktok",
  "facebook",
  "linkedin",
  "twitter",
  "website",
  "spotify",
  "soundcloud",
  "bandcamp",
  "apple-music",
];

const platformPatterns: Array<{
  key: SocialPlatformKey;
  patterns: RegExp[];
}> = [
  { key: "apple-music", patterns: [/apple[\s_-]*music/, /music\.apple\./] },
  { key: "soundcloud", patterns: [/sound[\s_-]*cloud/, /soundcloud\./] },
  { key: "instagram", patterns: [/instagram/, /instagr\.am/] },
  { key: "youtube", patterns: [/youtube/, /youtu\.be/] },
  { key: "bandcamp", patterns: [/bandcamp/] },
  { key: "spotify", patterns: [/spotify/] },
  { key: "vimeo", patterns: [/vimeo/] },
  { key: "imdb", patterns: [/imdb/] },
  { key: "tiktok", patterns: [/tik[\s_-]*tok/] },
  { key: "facebook", patterns: [/facebook/, /fb\.com/] },
  { key: "linkedin", patterns: [/linked[\s_-]*in/] },
  { key: "twitter", patterns: [/twitter/, /(?:^|\W)x\.com(?:\W|$)/] },
];

export function detectSocialPlatform(
  ...values: Array<string | null | undefined>
): SocialPlatformKey {
  const hint = values.filter(Boolean).join(" ").trim().toLowerCase();

  for (const platform of platformPatterns) {
    if (platform.patterns.some((pattern) => pattern.test(hint))) {
      return platform.key;
    }
  }

  return "website";
}

export function getSocialPlatformDefinition(key: SocialPlatformKey) {
  return (
    SOCIAL_PLATFORM_DEFINITIONS.find((platform) => platform.key === key) ??
    SOCIAL_PLATFORM_DEFINITIONS[SOCIAL_PLATFORM_DEFINITIONS.length - 1]
  );
}

export function getSocialPlatformOptions(portfolioType: PortfolioType) {
  const order = portfolioType === "actor" ? actorOrder : musicianOrder;

  return order.map((key) => getSocialPlatformDefinition(key));
}
