import { describe, expect, it } from "vitest";
import { deriveSpotifyEmbedUrl, getSpotifyOpenUrl, normalizeSpotifyArtistUrl } from "@/lib/spotify";

describe("Spotify URL boundaries", () => {
  it.each(["artist", "playlist", "album", "track", "show", "episode"])("accepts shared and embedded %s links", (kind) => {
    expect(deriveSpotifyEmbedUrl(` https://open.spotify.com/intl-cs/${kind}/Ab123?si=shared `))
      .toBe(`https://open.spotify.com/embed/${kind}/Ab123`);
    expect(deriveSpotifyEmbedUrl(`https://open.spotify.com/embed/${kind}/Ab123?theme=0#saved`))
      .toBe(`https://open.spotify.com/embed/${kind}/Ab123?theme=0#saved`);
    expect(getSpotifyOpenUrl(`https://open.spotify.com/embed/${kind}/Ab123?theme=0`, "https://open.spotify.com/artist/Other"))
      .toBe(`https://open.spotify.com/${kind}/Ab123`);
  });

  it.each([
    "javascript:alert(1)", "http://open.spotify.com/album/Ab123",
    "https://open.spotify.com.evil.test/album/Ab123", "https://example.com/embed/album/Ab123",
    "https://user:secret@open.spotify.com/album/Ab123", "https://open.spotify.com@evil.test/album/Ab123",
    "https://open.spotify.com:444/embed/album/Ab123", "//open.spotify.com/album/Ab123",
    "https://open.spotify.com\\album\\Ab123", "https://open.spoti\nfy.com/album/Ab123",
    "https://open.spotify.com/embed/album/Ab123/extra", "https://open.spotify.com/embed/unknown/Ab123",
    "https://open.spotify.com/embed/album/Ab%2F123", "https://open.spotify.com/embed/",
    '<iframe src="https://open.spotify.com/embed/album/Ab123"></iframe>',
  ])("rejects unsupported or unsafe player input: %s", (url) => {
    expect(deriveSpotifyEmbedUrl(url)).toBe("");
    expect(getSpotifyOpenUrl(url, "")).toBe("");
  });

  it("normalizes artist links to the existing database URL contract", () => {
    expect(normalizeSpotifyArtistUrl("https://OPEN.SPOTIFY.COM:443/intl-cs/artist/Ab123/?si=shared"))
      .toBe("https://open.spotify.com/artist/Ab123?si=shared");
    expect(normalizeSpotifyArtistUrl("https://open.spotify.com/playlist/Ab123")).toBe("");
    expect(normalizeSpotifyArtistUrl("https://open.spotify.com/embed/artist/Ab123")).toBe("");
  });

  it("preserves an empty player and only falls back to a safe artist profile for the open link", () => {
    expect(deriveSpotifyEmbedUrl("")).toBe("");
    expect(getSpotifyOpenUrl("", "https://open.spotify.com/artist/Ab123")).toBe("https://open.spotify.com/artist/Ab123");
    expect(getSpotifyOpenUrl("", "javascript:alert(1)")).toBe("");
  });
});
