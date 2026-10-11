import { deriveSpotifyEmbedUrl, getSpotifyOpenUrl } from "@/lib/spotify";

export type MusicTrackProvider = "spotify" | "soundcloud";
export type MusicTrackEmbed = {
  provider: MusicTrackProvider;
  sourceUrl: string;
  embedUrl: string;
  openUrl: string;
};

const SOUNDCLOUD_HOSTS = new Set([
  "api.soundcloud.com", "on.soundcloud.com", "soundcloud.com", "www.soundcloud.com",
]);

/** Classify known music links without fetching metadata, following redirects or accepting iframe HTML. */
export function parseMusicTrackUrl(value: string): MusicTrackEmbed | null {
  if (/[\\\u0000-\u001f\u007f]/.test(value)) return null;
  const source = value.trim();
  if (!source || source.length > 2_048 || /[\\\s\u0000-\u001f\u007f]/.test(source)) return null;
  try {
    const url = new URL(source);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;

    if (url.hostname === "open.spotify.com") {
      const embedUrl = deriveSpotifyEmbedUrl(source);
      if (!embedUrl || embedUrl.length > 2_048 || !/^\/embed\/(track|album|playlist)\/[A-Za-z0-9]+\/?$/.test(new URL(embedUrl).pathname)) return null;
      return { provider: "spotify", sourceUrl: embedUrl, embedUrl, openUrl: getSpotifyOpenUrl(embedUrl, "") };
    }

    // Keep stored SoundCloud links literal and compatible with the database validator.
    // URL() alone would also accept repaired slashes or percent-encoded hostnames.
    if (!SOUNDCLOUD_HOSTS.has(url.hostname) || !/^https:\/\/(api\.soundcloud\.com|on\.soundcloud\.com|soundcloud\.com|www\.soundcloud\.com)(:443)?([/?#]|$)/i.test(source)) return null;
    const params = new URLSearchParams({
      url: source,
      color: "#ff3b1f",
      auto_play: "false",
      hide_related: "true",
      show_comments: "false",
      show_user: "true",
      show_reposts: "false",
      show_teaser: "false",
      visual: "true",
    });
    return { provider: "soundcloud", sourceUrl: source, embedUrl: `https://w.soundcloud.com/player/?${params.toString()}`, openUrl: source };
  } catch {
    return null;
  }
}
