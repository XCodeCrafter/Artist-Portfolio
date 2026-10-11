import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SoundcloudCarousel from "@/components/SoundcloudCarousel";
import SpotifyEmbed from "@/components/SpotifyEmbed";
import { getMusicPublicSectionVisibility, preparePublicMusicPageViewData, selectMusicPageViewData } from "@/lib/content/music";
import { FALLBACK_CONTENT } from "@/lib/content/fallback";

const consent = vi.hoisted(() => ({ ready: false, externalMedia: false }));
vi.mock("@/components/privacy/PrivacyProvider", () => ({ usePrivacyConsent: () => ({ ...consent, allowExternalMedia: vi.fn(), openPreferences: vi.fn() }) }));

const tracks = [
  { id: "sc-one", title: "First SoundCloud track", embedUrl: "https://soundcloud.com/artist/track" },
  { id: "sp-one", title: "Spotify single", embedUrl: "https://open.spotify.com/track/Ab123?si=shared" },
];
beforeEach(() => { consent.ready = false; consent.externalMedia = false; });

describe("Mixed small music players", () => {
  it("keeps both providers behind consent without iframe or media requests in initial HTML", () => {
    const html = renderToStaticMarkup(<SoundcloudCarousel items={tracks} />);
    expect(html).toContain("SoundCloud");
    expect(html).toContain("Spotify");
    expect(html.match(/>Allow external players<\/button>/g)).toHaveLength(2);
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain('src="https://');
  });

  it("renders the correct lazy player for each provider after consent", () => {
    consent.ready = consent.externalMedia = true;
    const html = renderToStaticMarkup(<SoundcloudCarousel items={tracks} />);
    expect(html).toContain('src="https://open.spotify.com/embed/track/Ab123"');
    expect(html).toContain('src="https://w.soundcloud.com/player/?url=https%3A%2F%2Fsoundcloud.com%2Fartist%2Ftrack');
    expect(html).toContain('title="Spotify: Spotify single"');
    expect(html).toContain('title="SoundCloud: First SoundCloud track"');
    expect(html.match(/loading="lazy"/g)).toHaveLength(2);
    expect(html).toContain('aria-label="Activate Spotify embed: Spotify single"');
    expect(html).toContain('aria-label="Activate SoundCloud embed: First SoundCloud track"');
    expect(html).toContain("h-[352px]");
    expect(html).toContain("h-[240px]");
  });

  it.each([false, true])("uses static preview cards with external consent=%s, including an unfinished URL", externalMedia => {
    consent.ready = true; consent.externalMedia = externalMedia;
    const html = renderToStaticMarkup(<SoundcloudCarousel items={[...tracks, { title: "Unfinished", embedUrl: "https://open.spotify.com/tr" }]} interactionMode="preview" />);
    expect(html).toContain('aria-label="Spotify player preview"');
    expect(html).toContain('aria-label="SoundCloud player preview"');
    expect(html).toContain("Spotify single");
    expect(html).toContain("Unfinished");
    expect(html).toContain("Add a Spotify or SoundCloud link");
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain('src="https://');
    expect(html).not.toContain("Allow external players");
  });

  it("never renders an unsupported public player even with consent", () => {
    consent.ready = consent.externalMedia = true;
    expect(renderToStaticMarkup(<SoundcloudCarousel items={[{ embedUrl: "https://evil.test/embed" }]} />)).toBe("");
  });

  it("keeps the large Spotify player's default loading and dimensions unchanged", () => {
    consent.ready = consent.externalMedia = true;
    const html = renderToStaticMarkup(<SpotifyEmbed embedUrl={tracks[1].embedUrl} openUrl="" />);
    expect(html).toContain('loading="eager"');
    expect(html).toContain("--spotify-mobile-height:352px");
    expect(html).toContain("--spotify-desktop-height:520px");
  });

  it("filters invalid public tracks and normalizes both providers without changing saved data", () => {
    const data = selectMusicPageViewData(FALLBACK_CONTENT);
    data.soundcloud.tracks = [...tracks, { id: "bad", embedUrl: "https://evil.test/song" }];
    const before = structuredClone(data);
    const publicData = preparePublicMusicPageViewData(data);
    expect(publicData.soundcloud.tracks.map(track => track.id)).toEqual(["sc-one", "sp-one"]);
    expect(publicData.soundcloud.tracks[1].embedUrl).toBe("https://open.spotify.com/embed/track/Ab123");
    expect(getMusicPublicSectionVisibility(publicData).soundcloud).toBe(true);
    expect(data).toEqual(before);
    data.soundcloud.tracks = [{ id: "bad", embedUrl: "https://evil.test/song" }];
    expect(getMusicPublicSectionVisibility(data).soundcloud).toBe(false);
    expect(before.soundcloud.tracks[1].embedUrl).toBe(tracks[1].embedUrl);
  });
});
