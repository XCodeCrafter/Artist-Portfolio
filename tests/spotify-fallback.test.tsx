import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import SpotifyEmbed from "@/components/SpotifyEmbed";

// Exercise the actual iOS branch without making any player/network requests.
vi.mock("react", async (original) => {
  const react = await original<typeof import("react")>();
  return { ...react, useSyncExternalStore: () => true };
});

describe("Spotify iOS fallback", () => {
  it.each(["", "https://open.spotify.com/artist/profile"])("opens the chosen playlist instead of the profile (%s)", (openUrl) => {
    const html = renderToStaticMarkup(<SpotifyEmbed embedUrl="https://open.spotify.com/embed/playlist/chosen?theme=0" openUrl={openUrl} />);
    expect(html).toContain('href="https://open.spotify.com/playlist/chosen"');
    expect(html).not.toContain('href="https://open.spotify.com/artist/profile"');
    expect(html).not.toContain("<iframe");
  });
  it("keeps the profile-only choice usable and rejects unsafe fallback links", () => {
    expect(renderToStaticMarkup(<SpotifyEmbed embedUrl="" openUrl="https://open.spotify.com/artist/profile" />))
      .toContain('href="https://open.spotify.com/artist/profile"');
    const html = renderToStaticMarkup(<SpotifyEmbed embedUrl="https://example.com/embed/track/bad" openUrl="javascript:alert(1)" />);
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("href=");
  });
});
