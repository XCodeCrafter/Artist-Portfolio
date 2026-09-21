const SPOTIFY_ORIGIN = "https://open.spotify.com";

function parseSpotifyLink(value: string) {
  // URL() otherwise silently repairs backslashes and removes control characters.
  if (/[\\\u0000-\u001f\u007f]/.test(value)) return null;
  try {
    const url = new URL(value.trim());
    if (url.origin !== SPOTIFY_ORIGIN || url.username || url.password) return null;
    const match = url.pathname.match(
      /^\/(embed\/|intl-[a-zA-Z-]+\/)?(artist|album|playlist|track|show|episode)\/([A-Za-z0-9]+)\/?$/
    );
    if (!match) return null;
    return { url, embedded: match[1] === "embed/", kind: match[2], id: match[3] };
  } catch {
    return null;
  }
}

/** Accept normal share links or player URLs, never HTML/iframes or arbitrary hosts. */
export function deriveSpotifyEmbedUrl(value: string) {
  const link = parseSpotifyLink(value);
  if (!link) return "";
  // Keep saved player options; ordinary share tokens are not player options.
  const options = link.embedded ? link.url.search + link.url.hash : "";
  return `${SPOTIFY_ORIGIN}/embed/${link.kind}/${link.id}${options}`;
}

export function normalizeSpotifyArtistUrl(value: string) {
  const link = parseSpotifyLink(value);
  if (!link || link.embedded || link.kind !== "artist") return "";
  return `${SPOTIFY_ORIGIN}/artist/${link.id}${link.url.search}${link.url.hash}`;
}

/** iOS opens the actual selected release, even when no artist profile is set. */
export function getSpotifyOpenUrl(playerUrl: string, artistUrl: string) {
  const player = parseSpotifyLink(playerUrl);
  if (player) return `${SPOTIFY_ORIGIN}/${player.kind}/${player.id}`;
  return normalizeSpotifyArtistUrl(artistUrl);
}
