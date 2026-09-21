import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import SpotifyEmbed from "@/components/SpotifyEmbed";
import SoundcloudCarousel from "@/components/SoundcloudCarousel";
import ExternalMediaGate from "@/components/privacy/ExternalMediaGate";
import PrivacyPreferences from "@/components/privacy/PrivacyPreferences";

describe("Privacy-first initial HTML", () => {
  it("never sends optional player iframe URLs in initial HTML", () => {
    const markup = renderToStaticMarkup(<><SpotifyEmbed embedUrl="https://open.spotify.com/embed/album/test" openUrl="https://open.spotify.com/album/test" /><SoundcloudCarousel items={[{ embedUrl: "https://api.soundcloud.com/tracks/test", title: "Test mix" }]} /><ExternalMediaGate provider="YouTube"><iframe src="https://www.youtube-nocookie.com/embed/test" /></ExternalMediaGate></>);
    expect(markup).not.toContain("<iframe");
    expect(markup).not.toContain("src=\"https://");
    expect(markup).toContain("Allow external players");
    expect(markup).toContain("PLAYER ON STANDBY");
  });
  it("has granular unselected purposes, equal accept/reject controls and no tracking marker on its dialog", () => {
    const markup = renderToStaticMarkup(<PrivacyPreferences analytics={false} externalMedia={false} onClose={() => {}} onSave={() => {}} />);
    expect(markup).toContain("Reject optional");
    expect(markup).toContain("Accept all");
    expect(markup).toContain("Save my choices");
    expect(markup).not.toContain("checked=");
    expect(markup).toContain('aria-label="Audience insights"');
    expect(markup).toContain('aria-label="External players"');
    expect(markup).toContain("Always on");
    expect(markup).not.toContain("data-analytics-open");
  });
});
