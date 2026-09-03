import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import TopNav from "@/components/TopNav";
import { createMixedReviewNavigationConfig } from "@/lib/content/navigation";

vi.mock("next/navigation", () => ({
  usePathname: () => "/music",
}));

describe("public top navigation", () => {
  const navigationItems = createMixedReviewNavigationConfig().items.filter(
    (item) => item.isVisible
  );

  it("renders only page destinations even when section destinations are supplied", () => {
    const html = renderToStaticMarkup(
      <TopNav
        artistName="Test Artist"
        navigationItems={navigationItems}
      />
    );

    expect(html).toContain('href="/"');
    expect(html).toContain('href="/bio"');
    expect(html).toContain('href="/gallery"');
    expect(html).toContain('href="/music"');
    expect(html).toContain('href="/video"');
    expect(html).toContain('href="/booking"');
    expect(html).not.toContain("/#home-about");
    expect(html).not.toContain("/#cnc-code");
    expect(html).not.toContain("/bio#resume");
    expect(html).not.toContain("/music#music-platforms");
    expect(html).not.toContain("/music#spotify-releases");
    expect(html).not.toContain("/music#soundcloud-mixes");
  });

  it("keeps the artist centered with desktop links and platform shortcuts on its sides", () => {
    const html = renderToStaticMarkup(
      <TopNav
        artistName="Test Artist"
        navigationItems={navigationItems}
        socialLinks={[
          {
            id: "spotify",
            label: "Spotify",
            platform: "spotify",
            href: "https://open.spotify.com/artist/example",
            iconKey: "spotify",
          },
        ]}
      />
    );

    expect(html).toContain(
      "xl:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]"
    );
    expect(html).toContain("hidden min-w-0 justify-self-start gap-4 xl:flex");
    expect(html).toContain("col-start-2 inline-flex");
    expect(html).toContain('href="https://open.spotify.com/artist/example"');
    expect(html).toMatch(/aria-label="Open menu"[^>]*xl:hidden/);
  });
});
