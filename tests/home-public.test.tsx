import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import HomePageView from "@/components/home/HomePageView";
import { createHomeDraftFromContent } from "@/lib/admin/home-editor";
import { FALLBACK_CONTENT } from "@/lib/content/fallback";
import { CNC_PROGRAMS } from "@/lib/content/cnc-programs";
import { withHomeSeoContent } from "@/lib/content/home-seo";

describe("HOME public and preview layout", () => {
  it("renders exactly enabled sections in saved order without loading hidden media", () => {
    const data = createHomeDraftFromContent(FALLBACK_CONTENT);
    data.hero.backgroundSrc = "/uploads/hidden-hero.mp4";
    data.feature.videoSrc = "/uploads/hidden-feature.mp4";
    data.about.imageSrc = "/images/visible-about.jpg";
    data.layout = [
      { id: "stories", enabled: true },
      { id: "hero", enabled: false },
      { id: "about", enabled: true },
      { id: "cnc", enabled: false },
      { id: "feature", enabled: false },
    ];
    const page = renderToStaticMarkup(<HomePageView data={data} programs={[...CNC_PROGRAMS]} />);
    expect([...page.matchAll(/data-home-section="([^"]+)"/g)].map((match) => match[1])).toEqual(["stories", "about"]);
    expect(page).not.toContain("hidden-hero.mp4");
    expect(page).not.toContain("hidden-feature.mp4");
    expect(page).not.toContain("cnc-code");
    expect(page).not.toContain("inert");
    expect(page).toContain("visible-about.jpg");
  });

  it("keeps hidden sections selectable in preview without rendering their media", () => {
    const data = createHomeDraftFromContent(FALLBACK_CONTENT);
    data.layout = data.layout.map((section) => ({ ...section, enabled: false }));
    data.hero.backgroundSrc = "/uploads/hidden-hero.mp4";
    data.about.imageSrc = "/uploads/hidden-about.jpg";
    const preview = renderToStaticMarkup(<HomePageView data={data} programs={[]} mode="preview" selectedSection="about" />);
    expect([...preview.matchAll(/data-home-preview-section="([^"]+)"/g)]).toHaveLength(5);
    expect(preview).toContain("Hidden on the website");
    expect(preview).toContain('aria-pressed="true"');
    expect(preview).toContain("inert");
    expect(preview).not.toContain("hidden-hero.mp4");
    expect(preview).not.toContain("hidden-about.jpg");
    expect(preview).not.toContain("<video");
  });

  it("renders posters instead of downloading videos in the editing preview", () => {
    const data = createHomeDraftFromContent(FALLBACK_CONTENT);
    data.hero.mediaType = "video";
    data.hero.backgroundSrc = "/uploads/hero.mp4";
    data.feature.videoSrc = "/uploads/feature.mp4";
    const preview = renderToStaticMarkup(<HomePageView data={data} programs={[]} mode="preview" />);
    const page = renderToStaticMarkup(<HomePageView data={data} programs={[]} />);
    expect(preview).not.toContain("<video");
    expect(page).toContain('src="/uploads/hero.mp4"');
    expect(page).toContain('src="/uploads/feature.mp4"');
  });

  it("renders custom CNC copy and allows feature and stories to be independently ordered", () => {
    const data = createHomeDraftFromContent(FALLBACK_CONTENT);
    data.cnc = { eyebrow: "CUSTOM EYEBROW", title: "CUSTOM CNC TITLE", body: "CUSTOM CNC BODY" };
    data.layout = [
      { id: "cnc", enabled: true }, { id: "stories", enabled: true },
      { id: "feature", enabled: true }, { id: "about", enabled: false }, { id: "hero", enabled: false },
    ];
    const page = renderToStaticMarkup(<HomePageView data={data} programs={[...CNC_PROGRAMS]} />);
    expect([...page.matchAll(/data-home-section="([^"]+)"/g)].map((match) => match[1])).toEqual(["cnc", "stories", "feature"]);
    expect(page).toContain("CUSTOM CNC TITLE");
    expect(page).toContain("CUSTOM CNC BODY");
    expect(page).toContain("CUSTOM EYEBROW");
    expect(page.match(/id="home-stories"/g)).toHaveLength(1);
    expect(page.match(/id="home-feature"/g)).toHaveLength(1);
  });

  it("omits empty CNC and stories on the public page but explains them in preview", () => {
    const data = createHomeDraftFromContent(FALLBACK_CONTENT);
    data.stories.images = data.stories.images.map((image) => ({ ...image, src: "" }));
    const page = renderToStaticMarkup(<HomePageView data={data} programs={[]} />);
    const preview = renderToStaticMarkup(<HomePageView data={data} programs={[]} mode="preview" />);
    expect(page).not.toContain('data-home-section="cnc"');
    expect(page).not.toContain('data-home-section="stories"');
    expect(preview).toContain("No published CNC programs yet");
    expect(preview).toContain("Add a story image to display this section");
  });

  it("uses edited HOME metadata but excludes media for hidden sections", () => {
    const data = createHomeDraftFromContent(FALLBACK_CONTENT);
    data.hero.title = "New identity";
    expect(withHomeSeoContent(FALLBACK_CONTENT, data).heroes.home.title).toBe("New identity");
    data.layout = data.layout.map((section) => ({ ...section, enabled: false }));
    const content = withHomeSeoContent(FALLBACK_CONTENT, data);
    expect(content.heroes.home).toMatchObject({ title: "", backgroundSrc: "", posterSrc: "" });
    expect(content.aboutHome.imageSrc).toBe("");
    expect(FALLBACK_CONTENT.heroes.home.title).not.toBe("");
  });
});
