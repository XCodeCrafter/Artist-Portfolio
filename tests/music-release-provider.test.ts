import { describe, expect, it } from "vitest";
import { deriveSoundcloudPlaylistEmbedUrl, normalizeSoundcloudPlaylistUrl } from "@/lib/music-embeds";
import {
  createFallbackMusicEditorSnapshot, createMusicPageViewDataFromEditor,
  parseMusicPreviewUpdateMessage, parseMusicSpotifyDraft, MUSIC_PREVIEW_UPDATE_MESSAGE,
} from "@/lib/admin/music-editor";
import { getMusicPublicSectionVisibility, preparePublicMusicPageViewData } from "@/lib/content/music";

const playlist = "https://soundcloud.com/acceptance-artist/sets/live-sessions";
const spotify = {
  releasesHeading: "Releases",
  artistUrl: "https://open.spotify.com/artist/Artist1",
  embedUrl: "https://open.spotify.com/embed/album/Album1",
};

describe("main Music release provider", () => {
  it.each([playlist, `${playlist}/`, `${playlist}?si=shared&utm_source=clipboard#listen`,
    playlist.replace("soundcloud.com", "www.soundcloud.com:443")])("normalizes the public playlist %s", (input) => {
    expect(normalizeSoundcloudPlaylistUrl(input)).toBe(playlist);
  });

  it.each([
    "http://soundcloud.com/artist/sets/playlist", "https://soundcloud.com.evil.test/artist/sets/list",
    "https://user:pass@soundcloud.com/artist/sets/list", "https://soundcloud.com:444/artist/sets/list",
    "https://on.soundcloud.com/short", "https://api.soundcloud.com/playlists/123",
    "https://soundcloud.com/artist/track", "https://soundcloud.com/artist",
    `${playlist}/s-private`, `${playlist}?secret_token=s-private`,
    "https://soundcloud.com/user/sets/../playlist", "https://soundcloud.com/user/sets/%2e%2e/playlist",
    "https://soundcloud.com/user\\sets\\playlist", "https://%73oundcloud.com/user/sets/playlist",
    '<iframe src="https://w.soundcloud.com/player/"></iframe>', "javascript:alert(1)",
    `${playlist}\n`, `${playlist}?q=\u0001`, `${playlist}?${"x".repeat(2048)}`,
  ])("rejects untrusted or non-playlist source %s", (input) => {
    expect(normalizeSoundcloudPlaylistUrl(input)).toBe("");
    expect(deriveSoundcloudPlaylistEmbedUrl(input)).toBe("");
  });

  it("generates one fixed-host, no-autoplay playlist widget", () => {
    const url = new URL(deriveSoundcloudPlaylistEmbedUrl(`${playlist}?utm_source=clipboard`));
    expect(url.origin).toBe("https://w.soundcloud.com");
    expect(url.pathname).toBe("/player/");
    expect(url.searchParams.get("url")).toBe(playlist);
    expect(url.searchParams.get("auto_play")).toBe("false");
    expect(url.searchParams.get("visual")).toBe("false");
    expect(url.searchParams.get("single_active")).toBe("true");
  });

  it("defaults old drafts to Spotify without changing their existing links", () => {
    expect(parseMusicSpotifyDraft(spotify)).toEqual({ success: true, data: {
      ...spotify, provider: "spotify", soundcloudPlaylistUrl: "",
    } });
  });

  it("saves SoundCloud without erasing the inactive Spotify configuration", () => {
    expect(parseMusicSpotifyDraft({ ...spotify, provider: "soundcloud", soundcloudPlaylistUrl: `${playlist}?si=share` }))
      .toEqual({ success: true, data: { ...spotify, provider: "soundcloud", soundcloudPlaylistUrl: playlist } });
    expect(parseMusicSpotifyDraft({ ...spotify, provider: "spotify", soundcloudPlaylistUrl: playlist }).success).toBe(true);
  });

  it("requires a valid playlist only when SoundCloud is chosen and rejects unknown fields/providers", () => {
    expect(parseMusicSpotifyDraft({ ...spotify, provider: "soundcloud" }).success).toBe(false);
    expect(parseMusicSpotifyDraft({ ...spotify, provider: "youtube" }).success).toBe(false);
    expect(parseMusicSpotifyDraft({ ...spotify, arbitrary: true }).success).toBe(false);
    expect(parseMusicSpotifyDraft({ ...spotify, soundcloudPlaylistUrl: "https://example.com/evil" }).success).toBe(false);
    expect(parseMusicSpotifyDraft({ ...spotify, artistUrl: "", embedUrl: "" }).success).toBe(true);
  });

  it("round-trips the provider through the editor preview and public visibility", () => {
    const snapshot = createFallbackMusicEditorSnapshot();
    snapshot.draft.spotify = { ...spotify, provider: "soundcloud", soundcloudPlaylistUrl: playlist };
    const message = parseMusicPreviewUpdateMessage({
      type: MUSIC_PREVIEW_UPDATE_MESSAGE, draft: snapshot.draft, footer: snapshot.footer,
      selectedSection: "spotify", focusRequestId: 1,
    });
    expect(message?.draft.spotify).toMatchObject({ provider: "soundcloud", soundcloudPlaylistUrl: playlist });
    const view = createMusicPageViewDataFromEditor(message!.draft, snapshot.footer);
    expect(preparePublicMusicPageViewData(view).spotify).toMatchObject({
      provider: "soundcloud", soundcloudPlaylistUrl: playlist, embedUrl: spotify.embedUrl,
    });
    expect(getMusicPublicSectionVisibility(view).spotify).toBe(true);
    view.spotify.soundcloudPlaylistUrl = "";
    expect(getMusicPublicSectionVisibility(view).spotify).toBe(false);
    view.spotify.provider = "spotify";
    expect(getMusicPublicSectionVisibility(view).spotify).toBe(true);
  });
});
