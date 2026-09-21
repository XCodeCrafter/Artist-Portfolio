import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import AdaptiveHero from "@/components/AdaptiveHero";
import HeroCinematic from "@/components/HeroCinematic";
import HeroMedia from "@/components/HeroMedia";
import VideoHero from "@/components/VideoHero";
import type { HeroContent } from "@/lib/content";
import type { HeroFraming } from "@/lib/content/hero-framing";

const framing: HeroFraming = {
  desktop: { fit: "contain", x: 22, y: 15, zoom: 1.2 },
  mobile: { fit: "cover", x: 64, y: 8, zoom: 1.5 },
};

const content: HeroContent = {
  title: "EXAMPLE ARTIST",
  subtitle: "Music and screen",
  ctaLabel: "Explore",
  ctaHref: "#work",
  backgroundSrc: "/images/hero.jpg",
  posterSrc: "/images/poster.jpg",
  mediaType: "image",
};

function mediaTag(markup: string, kind: "img" | "video") {
  const tag = markup.match(new RegExp(`<${kind}\\b[^>]*>`))?.[0];
  expect(tag).toBeDefined();
  return tag!;
}

function customProperties(tag: string) {
  return tag.match(/--hero-[^:;]+:[^;"<]+/g);
}

describe("responsive Hero framing rendering", () => {
  it("forwards one saved frame through AdaptiveHero to an image", () => {
    const html = renderToStaticMarkup(<AdaptiveHero {...content} framing={framing} />);
    expect(html).toContain('data-hero-framing="custom"');
    expect(html.match(/<img\b/g)).toHaveLength(1);
    expect(html).not.toContain("<video");
    expect(html).toContain('href="#work"');
    expect(html).toContain("Explore");
    expect(html).toContain("min-h-[60svh]");
  });

  it("uses real responsive CSS with independent fit, position and zoom on the same element", () => {
    const html = renderToStaticMarkup(<HeroMedia backgroundSrc={content.backgroundSrc} framing={framing} mediaType="image" />);
    const tag = mediaTag(html, "img");
    expect(tag).toContain("--hero-fit-mobile:cover");
    expect(tag).toContain("--hero-fit-desktop:contain");
    expect(tag).toContain("--hero-position-mobile:64% 8%");
    expect(tag).toContain("--hero-position-desktop:22% 15%");
    expect(tag).toContain("--hero-origin-mobile:64% 8%");
    expect(tag).toContain("--hero-origin-desktop:22% 15%");
    expect(tag).toContain("--hero-transform-mobile:scale(1.5)");
    expect(tag).toContain("--hero-transform-desktop:scale(1.2)");
    for (const property of ["fit", "position"]) {
      expect(tag).toContain(`[object-${property}:var(--hero-${property}-mobile)]`);
      expect(tag).toContain(`sm:[object-${property}:var(--hero-${property}-desktop)]`);
    }
    expect(tag).toContain("[transform:var(--hero-transform-mobile)]");
    expect(tag).toContain("sm:[transform:var(--hero-transform-desktop)]");
    expect(html).toContain("overflow-hidden bg-black");
  });

  it("preserves a single silent looping public player including its poster", () => {
    const html = renderToStaticMarkup(<AdaptiveHero {...content} backgroundSrc="/media/hero.mp4" framing={framing} mediaType="video" />);
    expect(html.match(/<video\b/g)).toHaveLength(1);
    expect(html).not.toContain("<img");
    const tag = mediaTag(html, "video");
    for (const attribute of ['autoPlay=""', 'loop=""', 'muted=""', 'playsInline=""', 'preload="metadata"', 'poster="/images/poster.jpg"', 'tabindex="-1"']) {
      expect(tag.toLowerCase()).toContain(attribute.toLowerCase());
    }
    expect(tag).not.toMatch(/\scontrols=/);
    expect(html).toContain("min-h-[50svh]");
    expect(html).toContain('href="#work"');
  });

  it("applies the identical responsive framing to the static poster and live video", () => {
    const publicHtml = renderToStaticMarkup(<AdaptiveHero {...content} backgroundSrc="/media/hero.mp4" framing={framing} mediaType="video" />);
    const previewHtml = renderToStaticMarkup(<AdaptiveHero {...content} backgroundSrc="/media/hero.mp4" framing={framing} mediaType="video" staticPreview />);
    expect(previewHtml).not.toContain("<video");
    expect(previewHtml).not.toContain("/media/hero.mp4");
    expect(previewHtml.match(/<img\b/g)).toHaveLength(1);
    expect(customProperties(mediaTag(previewHtml, "img"))).toEqual(customProperties(mediaTag(publicHtml, "video")));
  });

  it("never starts or mounts a video to substitute a missing static-preview poster", () => {
    const html = renderToStaticMarkup(<AdaptiveHero {...content} backgroundSrc="/media/hero.mp4" framing={framing} mediaType="video" posterSrc="" staticPreview />);
    expect(html).not.toContain("<video");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("/media/hero.mp4");
    expect(html).toContain('data-hero-framing="custom"');
  });

  it.each(["desktop", "mobile"] as const)("lets the framing editor force %s independently of its sidebar width", (deviceOverride) => {
    const html = renderToStaticMarkup(<HeroMedia backgroundSrc={content.backgroundSrc} deviceOverride={deviceOverride} framing={framing} mediaType="image" />);
    const frame = framing[deviceOverride];
    const tag = mediaTag(html, "img");
    expect(tag).toContain(`object-fit:${frame.fit}`);
    expect(tag).toContain(`object-position:${frame.x}% ${frame.y}%`);
    expect(tag).toContain(`transform-origin:${frame.x}% ${frame.y}%`);
    expect(tag).toContain(`transform:scale(${frame.zoom})`);
    expect(tag).not.toContain("--hero-");
  });

  it("loads only video metadata without autoplay when the framing editor requests paused media", () => {
    const html = renderToStaticMarkup(<HeroMedia backgroundSrc="/media/hero.mp4" framing={framing} mediaType="video" paused />);
    const tag = mediaTag(html, "video");
    expect(tag).not.toMatch(/\sautoplay[= >]/i);
    expect(tag).toContain('preload="metadata"');
    expect(tag).not.toContain('poster=""');
    expect(html.match(/<video\b/g)).toHaveLength(1);
  });

  it.each([undefined, null])("preserves the unconfigured image's original layers and focal points (%s)", (value) => {
    const html = renderToStaticMarkup(<AdaptiveHero {...content} framing={value} />);
    expect(html).not.toContain("data-hero-framing");
    expect(html.match(/<img\b/g)).toHaveLength(2);
    expect(html).toContain("object-position:50% 20%");
    expect(html).toContain("object-position:50% 50%");
    expect(html).toContain("scale-100 sm:scale-[1.02] lg:scale-[1.04]");
  });

  it("preserves legacy explicit focal-point props when framing is not configured", () => {
    const image = renderToStaticMarkup(<HeroCinematic {...content} bgPosMobile="25% 10%" bgPosDesktop="60% 30%" />);
    expect(image).toContain("object-position:25% 10%");
    expect(image).toContain("object-position:60% 30%");
    const video = renderToStaticMarkup(<VideoHero {...content} videoPosMobile="35% 5%" videoPosDesktop="65% 40%" />);
    expect(video.match(/<video\b/g)).toHaveLength(1);
    expect(video).toContain("--video-position-mobile:35% 5%");
    expect(video).toContain("--video-position-desktop:65% 40%");
    expect(video).toContain("sm:scale-[1.02]");
    expect(video).toContain("lg:scale-[1.04]");
  });

  it.each([
    { desktop: framing.desktop },
    { ...framing, desktop: { ...framing.desktop, fit: "fill" } },
    { ...framing, mobile: { ...framing.mobile, x: Number.NaN } },
    { ...framing, desktop: { ...framing.desktop, zoom: Number.POSITIVE_INFINITY } },
    { ...framing, desktop: { ...framing.desktop, zoom: 0.5 } },
    { ...framing, mobile: { ...framing.mobile, y: "20%; color:red" } },
    { ...framing, unexpected: true },
  ])("falls back to legacy rendering for malformed saved framing", (value) => {
    const html = renderToStaticMarkup(<AdaptiveHero {...content} framing={value as HeroFraming} />);
    expect(html).not.toContain("data-hero-framing");
    expect(html).not.toContain("--hero-");
    expect(html).not.toContain("color:red");
    expect(html).not.toContain("NaN");
    expect(html).not.toContain("Infinity");
    expect(html.match(/<img\b/g)).toHaveLength(2);
  });
});
