import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LatestReleaseSection, PressReviewsSection, SelectedWorkSection, formatHomeAudioTime } from "@/components/home/HomeEditorialSections";
import { createHomeEditorialDefaults, type HomePressItem } from "@/lib/admin/home-editorial";
import { getDefaultHeroFraming } from "@/lib/content/hero-framing";

const componentSource = readFileSync(new URL("../components/home/HomeEditorialSections.tsx", import.meta.url), "utf8");
const stylesheet = readFileSync(new URL("../components/home/HomeEditorialSections.module.css", import.meta.url), "utf8");

function pressItem(overrides: Partial<HomePressItem> = {}): HomePressItem {
  return {
    id: "01234567-1234-4234-8234-123456789012", kind: "review", title: "A real review", quote: "A thoughtful record.",
    publication: "An actual publication", date: "2026-09-29", href: "https://example.com/review", visible: true,
    image: { src: "/images/home-editorial/press.webp", alt: "Press clipping", framing: null }, ...overrides,
  };
}

describe("Home editorial public sections", () => {
  it("shares the existing Home palette, content width and section rhythm instead of a separate editorial theme", () => {
    for (const token of ["--home-surface", "--home-ink", "--home-muted", "--home-accent", "--home-content-width", "--home-gutter", "--home-section-space", "--home-heading-size", "--home-body-size"]) {
      expect(stylesheet).toContain(`var(${token},`);
    }
    expect(stylesheet).toContain("padding: var(--home-section-space, 56px) var(--home-gutter, 20px)");
    // Keep every responsive section on the same left edge, not a private mobile gutter.
    expect(stylesheet).not.toMatch(/\.inner\s*\{[^}]*(?:padding-left|padding-right|padding-top|padding-bottom)/);
    expect(stylesheet).not.toContain("max-width: 1480px");
    for (const sepia of ["#eeeae2", "#b0aaa2", "#d5cdbd", "#c4beb6", "#b6b1a4"]) expect(stylesheet).not.toContain(sepia);
  });

  it("keeps readable body and card copy, a restrained secondary button and a contrast-safe filled action", () => {
    expect(stylesheet).toMatch(/\.body\s*\{[^}]*var\(--home-body-size/);
    expect(stylesheet).toMatch(/\.cardHeading\s*\{[^}]*\.8125rem/);
    expect(stylesheet).toMatch(/\.cardBody\s*\{[^}]*font-size: \.875rem/);
    expect(stylesheet).toMatch(/\.button\s*\{[^}]*max-width: 100%[^}]*background: transparent[^}]*\.75rem/);
    expect(stylesheet).toContain("--editorial-button: color-mix(in srgb, var(--editorial-red) 68%, #000)");
    expect(stylesheet).toMatch(/\.primary\s*\{[^}]*background: var\(--editorial-button\)[^}]*color: #fff/);
    // The three-line Work heading remains deliberately smaller; Release and Press share the main scale.
    expect(stylesheet).toMatch(/\.work \.heading\s*\{[^}]*font-size: clamp\(/);
    expect(stylesheet).not.toMatch(/\.press \.heading\s*\{[^}]*font-size/);
  });

  it("renders the original selected-work composition with four destinations and only one red panel", () => {
    const { work } = createHomeEditorialDefaults();
    const page = renderToStaticMarkup(<SelectedWorkSection data={work} />);
    expect(page).toContain("STORIES IN\nDIFFERENT\nFORMS.");
    expect(page.match(/data-accent="mono"/g)).toHaveLength(3);
    expect(page.match(/data-accent="red"/g)).toHaveLength(1);
    for (const href of ["/music", "/gallery", "/video", "/booking#events"]) expect(page).toContain(`href="${href}"`);
    expect(page).not.toContain("ARTIST FREELANCER LIFE");
  });

  it("keeps custom crops attached to the exact image placement", () => {
    const { work } = createHomeEditorialDefaults();
    work.background.framing = null;
    work.cards.forEach(card => { card.image.framing = null; });
    work.cards[2].image.framing = getDefaultHeroFraming("image");
    work.cards[2].image.framing.desktop.y = 13;
    const page = renderToStaticMarkup(<SelectedWorkSection data={work} />);
    expect(page.match(/data-photo-framing="custom"/g)).toHaveLength(1);
    expect(page).toContain("--photo-position-desktop:50% 13%");
  });

  it("never overrides custom contain framing with an unlayered descendant cover rule", () => {
    const { release, work, press } = createHomeEditorialDefaults();
    const contain = getDefaultHeroFraming("image");
    contain.desktop.fit = "contain";
    contain.mobile.fit = "contain";
    release.background.framing = contain;
    release.cover.framing = contain;
    release.releaseTitle = "Visible cover";
    work.cards[0].image.framing = contain;
    press.items = [pressItem({ image: { src: "/images/home-editorial/press.webp", alt: "Full clipping", framing: contain } })];
    const page = renderToStaticMarkup(<><LatestReleaseSection data={release} /><SelectedWorkSection data={work} /><PressReviewsSection data={press} /></>);
    expect(page.match(/--photo-fit-desktop:contain/g)).toHaveLength(4);
    for (const placement of ["backdrop", "cover", "workPhoto", "clipping"]) {
      // Legacy FramedImage is a direct img; custom framing adds a span wrapper.
      expect(stylesheet).toContain(`.${placement} > img { object-fit: cover; }`);
      expect(stylesheet).not.toMatch(new RegExp(`\\.${placement} img\\s*\\{[^}]*object-fit`));
    }
  });

  it("renders a native direct-audio player without contacting the host or starting playback on page entry", () => {
    const { release } = createHomeEditorialDefaults();
    release.releaseTitle = "The real release";
    release.artist = "Franky Fugazi";
    release.playback = { kind: "audio", url: "https://audio.example.com/real-track.mp3" };
    const page = renderToStaticMarkup(<LatestReleaseSection data={release} />);
    expect(page).toContain('<audio preload="none"');
    expect(page).toContain('aria-label="Play The real release"');
    expect(page).toContain('aria-label="Seek audio"');
    expect(page).not.toContain("https://audio.example.com/real-track.mp3");
    expect(page).not.toMatch(/autoplay/i);
    expect(componentSource).toContain('if (!audio.getAttribute("src")) audio.src = source');
  });

  it.each([
    ["spotify", "https://open.spotify.com/track/0123456789012345678901", "Spotify"],
    ["youtube", "https://youtu.be/abcdefghijk", "YouTube"],
  ] as const)("waits for an explicit click and privacy consent before loading %s", (kind, url, name) => {
    const { release } = createHomeEditorialDefaults();
    release.playback = { kind, url };
    const page = renderToStaticMarkup(<LatestReleaseSection data={release} />);
    expect(page).toContain(`aria-label="Play using ${name} player"`);
    expect(page).not.toContain("<iframe");
    expect(page).not.toContain(url);
    expect(componentSource).toContain("<ExternalMediaGate provider={provider}>");
  });

  it("does not load audio or iframes in the editing preview", () => {
    const { release } = createHomeEditorialDefaults();
    release.playback = { kind: "audio", url: "/uploads/record.mp3" };
    const page = renderToStaticMarkup(<LatestReleaseSection data={release} staticPreview />);
    expect(page).toContain("Player preview");
    expect(page).not.toContain("<audio");
    expect(page).not.toContain("<iframe");
  });

  it("keeps a coverless audio player full width at every responsive breakpoint", () => {
    const { release } = createHomeEditorialDefaults();
    release.cover = { src: "", alt: "", framing: null };
    release.playback = { kind: "audio", url: "/uploads/record.mp3" };
    const page = renderToStaticMarkup(<LatestReleaseSection data={release} />);
    expect(page).toContain('data-has-cover="false"');
    // More specific than the .release .record mobile cover-column overrides.
    expect(stylesheet).toContain('.release .record[data-has-cover="false"] { grid-template-columns: minmax(0, 1fr); }');
  });

  it("never renders an unsafe legacy playback URL or work destination", () => {
    const { release, work } = createHomeEditorialDefaults();
    release.playback = { kind: "audio", url: "javascript:alert(1)" };
    work.cards[0].href = "javascript:alert(1)";
    const page = renderToStaticMarkup(<><LatestReleaseSection data={release} /><SelectedWorkSection data={work} /></>);
    expect(page).not.toContain("javascript:");
    expect(page).not.toContain("<audio");
    expect(page).not.toContain("<iframe");
  });

  it("omits empty press sections and all invisible entries instead of inventing endorsements", () => {
    const { press } = createHomeEditorialDefaults();
    expect(renderToStaticMarkup(<PressReviewsSection data={press} />)).toBe("");
    press.items = [pressItem({ visible: false, quote: "Private quote", image: { src: "/images/private-scan.jpg", alt: "Private", framing: null } })];
    expect(renderToStaticMarkup(<PressReviewsSection data={press} />)).toBe("");
  });

  it("renders the chosen published citation, a collage and a reader trigger without a duplicate gallery page", () => {
    const { press } = createHomeEditorialDefaults();
    const hidden = pressItem({ id: "01234567-1234-4234-8234-123456789013", quote: "Hidden review", visible: false });
    const featured = pressItem({ id: "01234567-1234-4234-8234-123456789014", quote: "Selected honest words." });
    press.items = [hidden, pressItem(), featured];
    press.featuredId = featured.id;
    const page = renderToStaticMarkup(<PressReviewsSection data={press} />);
    expect(page).toContain("Selected honest words.");
    expect(page).toContain("An actual publication");
    expect(page).toContain('aria-haspopup="dialog"');
    expect(page).toContain('data-collage="true"');
    expect(page).not.toContain("Hidden review");
    expect(page).not.toContain('href="/press"');
    expect(page).not.toContain("<dialog");
  });

  it("keeps a text-only citation readable without requiring a scan", () => {
    const { press } = createHomeEditorialDefaults();
    press.items = [pressItem({ image: { src: "", alt: "", framing: null } })];
    const page = renderToStaticMarkup(<PressReviewsSection data={press} />);
    expect(page).toContain('data-collage="false"');
    expect(page).toContain("A thoughtful record.");
  });

  it("uses native modal focus management, manual navigation and an uncropped zoomable original", () => {
    expect(componentSource).toContain("dialog.showModal()");
    expect(componentSource).toContain('document.body.style.overflow = "hidden"');
    expect(componentSource).toContain("document.body.style.overflow = previousOverflow");
    expect(componentSource).toContain("previousFocus?.focus({ preventScroll: true })");
    expect(componentSource).toContain('event.key === "ArrowLeft"');
    expect(componentSource).toContain('event.key === "ArrowRight"');
    expect(componentSource).toContain("onTouchEnd=");
    expect(componentSource).toContain("onCancel=");
    expect(componentSource).toContain('aria-label="Close press reader"');
    expect(componentSource).toContain('aria-label="Previous press item"');
    expect(componentSource).toContain('aria-label="Next press item"');
    expect(componentSource).toContain('type="range" min="100" max="250"');
    const scanComponent = componentSource.slice(componentSource.indexOf("function PressScan"), componentSource.indexOf("function PressReader"));
    expect(scanComponent).toContain("<Image");
    expect(scanComponent).not.toContain("<FramedImage");
    expect(componentSource).not.toContain("setInterval");
  });

  it.each([[NaN, "0:00"], [Infinity, "0:00"], [-1, "0:00"], [0, "0:00"], [61.7, "1:01"], [222, "3:42"]])("formats audio time %s without invalid labels", (seconds, expected) => {
    expect(formatHomeAudioTime(Number(seconds))).toBe(expected);
  });
});
