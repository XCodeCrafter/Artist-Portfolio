import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MusicReleasePlayer from "@/components/MusicReleasePlayer";
import MusicPageView from "@/components/music/MusicPageView";
import { selectMusicPageViewData } from "@/lib/content/music";
import { FALLBACK_CONTENT } from "@/lib/content/fallback";

const consent = vi.hoisted(() => ({ ready: false, externalMedia: false }));
vi.mock("@/components/privacy/PrivacyProvider", () => ({
  usePrivacyConsent: () => ({
    ...consent,
    allowExternalMedia: vi.fn(),
    openPreferences: vi.fn(),
  }),
}));

const PLAYER = {
  embedUrl: "https://open.spotify.com/playlist/Ab123",
  artistUrl: "https://open.spotify.com/artist/ArtistA",
  soundcloudPlaylistUrl: "https://soundcloud.com/artist/sets/release?si=shared",
};
beforeEach(() => { consent.ready = false; consent.externalMedia = false; });

describe("Main release player", () => {
  it.each(["spotify", "soundcloud"] as const)("requires consent for the %s player", provider => {
    const html = renderToStaticMarkup(<MusicReleasePlayer {...PLAYER} provider={provider} />);
    expect(html).toContain("Allow external players");
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain('src="https://');
    if (provider === "soundcloud") {
      expect(html).toContain('href="https://soundcloud.com/artist/sets/release"');
      expect(html).toContain("Open on SoundCloud");
    }
  });

  it("renders only the chosen SoundCloud playlist after consent, without autoplay", () => {
    consent.ready = consent.externalMedia = true;
    const html = renderToStaticMarkup(<MusicReleasePlayer {...PLAYER} provider="soundcloud" />);
    expect(html.match(/<iframe\b/g)).toHaveLength(1);
    expect(html).toContain('src="https://w.soundcloud.com/player/?url=https%3A%2F%2Fsoundcloud.com%2Fartist%2Fsets%2Frelease');
    expect(html).toContain("auto_play=false");
    expect(html).not.toContain('allow="autoplay');
    expect(html).not.toContain("open.spotify.com");
    expect(html).not.toContain("si=shared");
    expect(html).toContain('title="SoundCloud Releases"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain("h-[352px]");
    expect(html).toContain("sm:h-[520px]");
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('referrerPolicy="strict-origin-when-cross-origin"');
  });

  it("preserves the existing Spotify player when no provider is stored", () => {
    consent.ready = consent.externalMedia = true;
    const html = renderToStaticMarkup(<MusicReleasePlayer {...PLAYER} />);
    expect(html).toContain('src="https://open.spotify.com/embed/playlist/Ab123"');
    expect(html).toContain("--spotify-mobile-height:352px");
    expect(html).toContain("--spotify-desktop-height:520px");
    expect(html).not.toContain("w.soundcloud.com");
    expect(html).not.toContain("Open on SoundCloud");
  });

  it.each(["spotify", "soundcloud"] as const)("renders static %s preview even after consent", provider => {
    consent.ready = consent.externalMedia = true;
    const html = renderToStaticMarkup(
      <MusicReleasePlayer {...PLAYER} provider={provider} interactionMode="preview" />
    );
    expect(html).toContain("External players stay off while editing.");
    expect(html).toContain("h-[352px]");
    expect(html).toContain("sm:h-[520px]");
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("Allow external players");
    expect(html).not.toContain('src="https://');
    expect(html).not.toContain('href="https://');
  });

  it.each(["", "https://evil.test/artist/sets/release", "https://soundcloud.com/artist/track"])(
    "never falls back to saved Spotify or an unsafe link for invalid playlist %j",
    soundcloudPlaylistUrl => {
      consent.ready = consent.externalMedia = true;
      expect(renderToStaticMarkup(
        <MusicReleasePlayer {...PLAYER} provider="soundcloud" soundcloudPlaylistUrl={soundcloudPlaylistUrl} />
      )).toBe("");
      const preview = renderToStaticMarkup(
        <MusicReleasePlayer {...PLAYER} provider="soundcloud" soundcloudPlaylistUrl={soundcloudPlaylistUrl} interactionMode="preview" />
      );
      expect(preview).toContain("Add a SoundCloud link");
      expect(preview).not.toContain("<iframe");
    }
  );
});

describe("Shared Music page main-player wiring", () => {
  function data() {
    const view = selectMusicPageViewData(FALLBACK_CONTENT);
    view.platforms = [];
    view.soundcloud.tracks = [];
    view.spotify = {
      heading: "OWNER RELEASES",
      ...PLAYER,
      provider: "soundcloud",
    };
    return view;
  }

  it("keeps the established anchor, heading and main slot for SoundCloud", () => {
    consent.ready = consent.externalMedia = true;
    const html = renderToStaticMarkup(<MusicPageView data={data()} />);
    expect(html).toContain('id="spotify-releases"');
    expect(html).toContain("OWNER RELEASES");
    expect(html).toContain('title="SoundCloud Releases"');
    expect(html).not.toContain('title="Spotify Releases"');
    expect(html).not.toContain('id="soundcloud-mixes"');
  });

  it("keeps preview selection under the compatible section key without loading a player", () => {
    consent.ready = consent.externalMedia = true;
    const html = renderToStaticMarkup(
      <MusicPageView data={data()} mode="preview" selectedSection="spotify" />
    );
    expect(html).toContain('data-music-preview-section="spotify"');
    expect(html).toContain('aria-label="Edit Releases"');
    expect(html).toContain('aria-label="SoundCloud release player preview"');
    expect(html).not.toContain("<iframe");
  });
});
