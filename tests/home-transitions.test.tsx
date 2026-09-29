import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import postcss from "postcss";
import { describe, expect, it } from "vitest";
import HomePageView from "@/components/home/HomePageView";
import { createHomeDraftFromContent } from "@/lib/admin/home-editor";
import { FALLBACK_CONTENT } from "@/lib/content/fallback";

const css = readFileSync(new URL("../styles/home-transitions.css", import.meta.url), "utf8");

describe("Optional Home section transitions", () => {
  it.each(["public", "preview"] as const)("changes only the opt-in marker in %s, preserving every section and word", mode => {
    const data = createHomeDraftFromContent(FALLBACK_CONTENT);
    data.about.body = "Keep this complete owner-authored biography. No excerpt or read-more.";
    data.layout.reverse();
    const before = structuredClone(data);
    const off = renderToStaticMarkup(<HomePageView data={data} programs={[]} mode={mode} />);
    const on = renderToStaticMarkup(<HomePageView data={data} programs={[]} mode={mode} sectionTransitionsEnabled />);
    expect(on.replace(' data-home-transitions="on"', "")).toBe(off);
    expect(off).not.toContain('data-home-transitions="on"');
    expect(on).toContain(data.about.body);
    expect(data).toEqual(before);
  });

  it("preserves explicit OFF and covers image and video backgrounds without touching About", () => {
    for (const mediaType of ["image", "video"] as const) {
      const data = createHomeDraftFromContent(FALLBACK_CONTENT);
      data.hero.mediaType = mediaType;
      const markup = renderToStaticMarkup(<HomePageView data={data} programs={[]} sectionTransitionsEnabled={false} />);
      expect(markup).not.toContain('data-home-transitions="on"');
      expect(markup).toContain('data-home-transition-media=""');
    }
    const aboutSource = readFileSync(new URL("../components/AboutHome.tsx", import.meta.url), "utf8");
    expect(aboutSource).not.toContain("data-home-transition-media");
    expect(aboutSource).toContain("mask-radial");
    expect(aboutSource).toContain("{content.body}");
  });

  it("limits the entire stylesheet to background masks and border colors behind an explicit opt-in", () => {
    const sheet = postcss.parse(css);
    const allowed = new Set(["--home-transition-depth", "-webkit-mask-image", "mask-image", "border-top-color", "border-bottom-color"]);
    sheet.walkDecls(declaration => expect(allowed.has(declaration.prop), declaration.toString()).toBe(true));
    sheet.walkRules(rule => expect(rule.selector).toContain('[data-home-transitions="on"]'));
    expect(css).toContain('[data-home-section]:first-child');
    expect(css).toContain('[data-home-preview-section]:first-child');
    // The existing interlude border uses an ID selector; opt-in must win
    // without removing the border width (which would change panel geometry).
    expect(css).toContain('.home-sections[data-home-transitions="on"] #home-feature .home-interlude-panel');
    expect(css).toContain('@supports');
    expect(css).not.toMatch(/opacity:|filter:|animation:|transform:|padding:|margin:|height:|width:|order:|\.parallax-shards/);
  });

  it("connects the saved flag to the public Home and its admin preview only", () => {
    for (const relative of ["../app/page.tsx", "../app/admin/v2-preview/home/page.tsx"]) {
      expect(readFileSync(new URL(relative, import.meta.url), "utf8"))
        .toContain("sectionTransitionsEnabled={content.settings.homeSectionTransitionsEnabled}");
    }
    const runtime = readFileSync(new URL("../components/admin/v2/HomePreviewRuntime.tsx", import.meta.url), "utf8");
    expect(runtime).toContain("sectionTransitionsEnabled={sectionTransitionsEnabled}");
  });
});
