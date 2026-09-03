import type { PortfolioType } from "./types";

export const SOCIAL_PLATFORM_DEFINITIONS = [
  {
    key: "spotify",
    label: "Spotify",
    hrefPlaceholder: "https://open.spotify.com/artist/...",
    hosts: ["spotify.com"],
  },
  {
    key: "soundcloud",
    label: "SoundCloud",
    hrefPlaceholder: "https://soundcloud.com/...",
    hosts: ["soundcloud.com"],
  },
  {
    key: "instagram",
    label: "Instagram",
    hrefPlaceholder: "https://instagram.com/...",
    hosts: ["instagram.com", "instagr.am"],
  },
  {
    key: "youtube",
    label: "YouTube",
    hrefPlaceholder: "https://youtube.com/@...",
    hosts: ["youtube.com", "youtu.be", "youtube-nocookie.com"],
  },
  {
    key: "bandcamp",
    label: "Bandcamp",
    hrefPlaceholder: "https://artist.bandcamp.com",
    hosts: ["bandcamp.com"],
  },
  {
    key: "beatport",
    label: "Beatport",
    hrefPlaceholder: "https://beatport.com/artist/...",
    hosts: ["beatport.com"],
  },
  {
    key: "apple-music",
    label: "Apple Music",
    hrefPlaceholder: "https://music.apple.com/artist/...",
    hosts: ["music.apple.com"],
  },
  {
    key: "vimeo",
    label: "Vimeo",
    hrefPlaceholder: "https://vimeo.com/...",
    hosts: ["vimeo.com"],
  },
  {
    key: "imdb",
    label: "IMDb",
    hrefPlaceholder: "https://imdb.com/name/...",
    hosts: ["imdb.com"],
  },
  {
    key: "tiktok",
    label: "TikTok",
    hrefPlaceholder: "https://tiktok.com/@...",
    hosts: ["tiktok.com"],
  },
  {
    key: "facebook",
    label: "Facebook",
    hrefPlaceholder: "https://facebook.com/...",
    hosts: ["facebook.com", "fb.com"],
  },
  {
    key: "linkedin",
    label: "LinkedIn",
    hrefPlaceholder: "https://linkedin.com/in/...",
    hosts: ["linkedin.com"],
  },
  {
    key: "twitter",
    label: "X / Twitter",
    hrefPlaceholder: "https://x.com/...",
    hosts: ["x.com", "twitter.com"],
  },
  {
    key: "website",
    label: "Website / other",
    hrefPlaceholder: "https://...",
    hosts: [],
  },
] as const;

export type SocialPlatformKey =
  (typeof SOCIAL_PLATFORM_DEFINITIONS)[number]["key"];

const musicianOrder: SocialPlatformKey[] = [
  "spotify",
  "soundcloud",
  "apple-music",
  "youtube",
  "beatport",
  "bandcamp",
  "instagram",
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
  "apple-music",
  "beatport",
  "bandcamp",
];

const hintPatterns: Array<{
  key: Exclude<SocialPlatformKey, "website">;
  patterns: RegExp[];
}> = [
  { key: "apple-music", patterns: [/\bapple[\s_-]*music\b/i, /^apple$/i] },
  { key: "soundcloud", patterns: [/\bsound[\s_-]*cloud\b/i] },
  { key: "instagram", patterns: [/\binstagram\b/i] },
  { key: "youtube", patterns: [/\byou[\s_-]*tube\b/i] },
  { key: "bandcamp", patterns: [/\bbandcamp\b/i] },
  { key: "beatport", patterns: [/\bbeatport\b/i] },
  { key: "spotify", patterns: [/\bspotify\b/i] },
  { key: "vimeo", patterns: [/\bvimeo\b/i] },
  { key: "imdb", patterns: [/\bimdb\b/i] },
  { key: "tiktok", patterns: [/\btik[\s_-]*tok\b/i] },
  { key: "facebook", patterns: [/\bfacebook\b/i] },
  { key: "linkedin", patterns: [/\blinked[\s_-]*in\b/i] },
  { key: "twitter", patterns: [/\btwitter\b/i, /^x$/i, /^x\s*\/\s*twitter$/i] },
];

function normalizedHostname(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return null;
  }
}

function matchesHost(hostname: string, expectedHost: string) {
  return hostname === expectedHost || hostname.endsWith(`.${expectedHost}`);
}

function isUrlCandidate(value: string) {
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(value)) return true;

  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Detects a platform only from the parsed URL hostname. Paths, query strings,
 * credentials, and lookalike hostnames never influence the result.
 */
export function detectSocialPlatformFromUrl(
  value: string | null | undefined
): SocialPlatformKey {
  const hostname = normalizedHostname(value?.trim() || "");
  if (!hostname) return "website";

  for (const definition of SOCIAL_PLATFORM_DEFINITIONS) {
    if (
      definition.hosts.some((expectedHost) =>
        matchesHost(hostname, expectedHost)
      )
    ) {
      return definition.key;
    }
  }

  return "website";
}

/**
 * URL hostnames win over stored hints so changing a destination updates its
 * icon automatically. Non-URL values remain useful for legacy icon keys and
 * human-readable labels.
 */
export function detectSocialPlatform(
  ...values: Array<string | null | undefined>
): SocialPlatformKey {
  const normalizedValues = values
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);
  const urlValues = normalizedValues.filter(isUrlCandidate);

  for (const value of urlValues) {
    const detected = detectSocialPlatformFromUrl(value);
    if (detected !== "website") return detected;
  }

  if (urlValues.length > 0) return "website";

  const textHints = normalizedValues.filter((value) => !isUrlCandidate(value));
  for (const hint of textHints) {
    for (const platform of hintPatterns) {
      if (platform.patterns.some((pattern) => pattern.test(hint))) {
        return platform.key;
      }
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
