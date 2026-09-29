import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import HomePageView from "@/components/home/HomePageView";
import GalleryShowcase from "@/components/GalleryShowcase";
import { createHomeDraftFromContent } from "@/lib/admin/home-editor";
import { FALLBACK_CONTENT } from "@/lib/content/fallback";

const css = readFileSync(new URL("../styles/home.css", import.meta.url), "utf8");
const pageSource = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");

describe("Home visual integration", () => {
  it.each(["public", "preview"] as const)("shares styling scope in %s without rewriting About or saved layout", mode => {
    const data = createHomeDraftFromContent(FALLBACK_CONTENT);
    const body = "Owner-authored paragraph. Keep EVERY word — including the ending.";
    data.about.body = body;
    data.layout = data.layout.map(row => ({ ...row, enabled: row.id === "about" || row.id === "work" })).reverse();
    const before = structuredClone(data);
    const html = renderToStaticMarkup(<HomePageView data={data} mode={mode} programs={[]} />);
    expect(html).toContain('<main class="home-sections">');
    expect(html).toContain(body);
    expect(html.indexOf('id="home-work"')).toBeLessThan(html.indexOf('id="home-about"'));
    expect(data).toEqual(before);
  });

  it("scopes shared component and footer overrides to Home, never hero or the entire site", () => {
    expect(pageSource).toContain('<div className="home-page">');
    for (const selector of [".home-section-heading", ".home-interlude-panel", ".home-about-photo", ".cnc-showcase-inner"])
      expect(css).toMatch(new RegExp(`\\.home-sections[^{}]*${selector.replaceAll(".", "\\.")}`));
    expect(css).toContain(".home-page > footer[data-footer-effect]");
    expect(css).toContain(".home-sections #home-feature { padding-inline: 0; }");
    expect(css).toContain(".home-sections #home-feature > .gallery-showcase-inner { max-width: none; }");
    expect(css).not.toMatch(/(?:^|})\s*(?:h[1-6]|body|footer|\.heading-ui)\s*\{/m);
    expect(css).not.toMatch(/hero|line-clamp|text-overflow|order:/i);
  });

  it("uses shared rhythm and honors reduced motion after the scoped footer overrides", () => {
    for (const token of ["--home-surface", "--home-ink", "--home-muted", "--home-accent", "--home-content-width", "--home-gutter", "--home-section-space", "--home-heading-size", "--home-body-size"])
      expect(css).toContain(token);
    expect(css).toContain("--home-content-width: 1400px");
    expect(css).toContain("--home-section-space: 56px");
    expect(css).toContain("--home-section-space: 96px");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain(".home-page > footer .footer-pointer-glow { opacity: 0; }");
  });

  it.each(["public", "preview"] as const)("preserves About's original glass parallax in %s without a Home dimming override", mode => {
    const data = createHomeDraftFromContent(FALLBACK_CONTENT);
    data.layout = data.layout.map(row => ({ ...row, enabled: row.id === "about" }));
    const html = renderToStaticMarkup(<HomePageView data={data} mode={mode} programs={[]} />);
    expect(html).toContain("parallax-shards");
    expect(html).toContain("mask-radial");
    expect(html).toContain(data.about.body);
    // The shared backdrop owns opacity, including its mobile/reduced-motion
    // behavior; Home's visual integration must not suppress the existing glass.
    expect(css).not.toMatch(/[^{}]*\.parallax-shards[^{}]*\{[^}]*\}/);
  });

  it("clips Home Interlude parallax without a scrollport that can displace its shade on focus", () => {
    const panelStyles = css.match(/\.home-sections #home-feature \.home-interlude-panel\s*\{([^}]+)\}/)?.[1];
    expect(panelStyles).toMatch(/overflow:\s*clip\s*;/);
    const data = createHomeDraftFromContent(FALLBACK_CONTENT);
    data.layout = data.layout.map(row => ({ ...row, enabled: row.id === "feature" }));
    const html = renderToStaticMarkup(<HomePageView data={data} mode="public" programs={[]} />);
    expect(html).toContain("home-interlude-shade pointer-events-none absolute inset-0");
    expect(html).toContain('aria-label="Pause interlude"');
  });

  it.each(["public", "preview"] as const)("keeps %s Home Interlude in its container without viewport breakout offsets", mode => {
    const data = createHomeDraftFromContent(FALLBACK_CONTENT);
    data.layout = data.layout.map(row => ({ ...row, enabled: row.id === "feature" }));
    const html = renderToStaticMarkup(<HomePageView data={data} mode={mode} programs={[]} />);
    const panelClasses = html.match(/class="(home-interlude-panel[^"]*)"/)?.[1].split(/\s+/);
    expect(panelClasses).toContain("w-full");
    expect(panelClasses).toContain("max-w-none");
    for (const breakout of ["left-1/2", "-translate-x-1/2", "w-screen", "max-w-[1800px]"]) {
      expect(panelClasses).not.toContain(breakout);
    }
  });

  it("preserves viewport breakout for the legacy narrative outside the dedicated Home feature", () => {
    const html = renderToStaticMarkup(<GalleryShowcase images={[]} mode="narrative" presentation={FALLBACK_CONTENT.galleryPresentation} />);
    const panelClasses = html.match(/class="(home-interlude-panel[^"]*)"/)?.[1].split(/\s+/);
    for (const breakout of ["left-1/2", "-translate-x-1/2", "w-screen", "max-w-[1800px]"]) {
      expect(panelClasses).toContain(breakout);
    }
    expect(panelClasses).not.toContain("w-full");
  });
});
