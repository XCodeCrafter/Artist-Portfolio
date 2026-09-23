import Image from "next/image";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import FramedImage, { FramedVideoPoster, observeVideoPlaybackFrame } from "@/components/FramedImage";
import AboutHome from "@/components/AboutHome";
import BioPageView from "@/components/bio/BioPageView";
import GalleryShowcase from "@/components/GalleryShowcase";
import HomePageView from "@/components/home/HomePageView";
import MusicPlatformsExt from "@/components/MusicPlatforms_ext";
import ShowreelWorks from "@/components/ShowreelWorks";
import { createHomeDraftFromContent } from "@/lib/admin/home-editor";
import { FALLBACK_CONTENT } from "@/lib/content/fallback";
import type { HeroFraming } from "@/lib/content/hero-framing";

const framing: HeroFraming = {
  desktop: { fit: "contain", x: 22, y: 15, zoom: 1.2 },
  mobile: { fit: "cover", x: 64, y: 8, zoom: 1.5 },
};
const imageProps = { alt: "An artist portrait", src: "/images/about.jpg", fill: true, sizes: "50vw", className: "object-cover opacity-90 transition-transform group-hover:scale-[1.02]" };
const footer = { artistName: "Artist", contactBlurb: "Contact", footerEffect: "soul" as const, location: "Prague", socialLinks: [], tagline: "Music" };

function mediaTag(markup: string, tag = "img") {
  const result = markup.match(new RegExp(`<${tag}\\b[^>]*>`))?.[0];
  expect(result).toBeDefined();
  return result!;
}

describe("non-destructive photo placement framing", () => {
  it.each([undefined, null])("preserves automatic Next/Image markup exactly for %s", (value) => {
    expect(renderToStaticMarkup(<FramedImage {...imageProps} framing={value} />))
      .toBe(renderToStaticMarkup(<Image {...imageProps} alt={imageProps.alt} />));
  });

  it.each([
    { desktop: framing.desktop },
    { ...framing, mobile: { ...framing.mobile, zoom: 0.5 } },
    { ...framing, desktop: { ...framing.desktop, x: Number.NaN } },
    { ...framing, desktop: { ...framing.desktop, fit: "fill" } },
    { ...framing, mobile: { ...framing.mobile, y: "0%; color:red" } },
    { ...framing, injected: true },
  ])("ignores malformed persisted crop data", (value) => {
    expect(renderToStaticMarkup(<FramedImage {...imageProps} framing={value as HeroFraming} />))
      .toBe(renderToStaticMarkup(<Image {...imageProps} alt={imageProps.alt} />));
  });

  it("separates existing hover/effect transforms from the inner saved crop", () => {
    const html = renderToStaticMarkup(<FramedImage {...imageProps} framing={framing} />);
    const image = mediaTag(html);
    expect(html).toContain(`class="${imageProps.className}" data-photo-framing="custom"`);
    expect(html).toContain("overflow:hidden;background-color:black;position:absolute;inset:0");
    expect(image).not.toContain("group-hover:scale");
    expect(image).not.toContain("opacity-90");
    expect(image).toContain('alt="An artist portrait"');
    expect(html.match(/<img\b/g)).toHaveLength(1);
    expect(image).toContain("--photo-fit-mobile:cover");
    expect(image).toContain("--photo-fit-desktop:contain");
    expect(image).toContain("--photo-position-mobile:64% 8%");
    expect(image).toContain("--photo-position-desktop:22% 15%");
    expect(image).toContain("--photo-origin-mobile:64% 8%");
    expect(image).toContain("--photo-transform-desktop:scale(1.2)");
    expect(image).toContain("[transform:var(--photo-transform-mobile)]");
    expect(image).toContain("sm:[transform:var(--photo-transform-desktop)]");
  });

  it.each(["desktop", "mobile"] as const)("supports an explicit %s preview independent from inspector width", (deviceOverride) => {
    const image = mediaTag(renderToStaticMarkup(<FramedImage {...imageProps} deviceOverride={deviceOverride} framing={framing} />));
    const frame = framing[deviceOverride];
    expect(image).toContain(`object-fit:${frame.fit}`);
    expect(image).toContain(`object-position:${frame.x}% ${frame.y}%`);
    expect(image).toContain(`transform-origin:${frame.x}% ${frame.y}%`);
    expect(image).toContain(`transform:scale(${frame.zoom})`);
    expect(image).not.toContain("--photo-");
  });

  it("also keeps intrinsic non-fill sizing", () => {
    const html = renderToStaticMarkup(<FramedImage src="/images/about.jpg" alt="Portrait" width={400} height={600} framing={framing} />);
    expect(html).toContain("overflow:hidden;background-color:black;position:relative");
    expect(mediaTag(html)).toContain('width="400" height="600"');
  });

  it("frames About without changing its text or alt", () => {
    const html = renderToStaticMarkup(<AboutHome content={{ ...FALLBACK_CONTENT.aboutHome, framing }} />);
    expect(html).toContain('data-photo-framing="custom"');
    expect(html).toContain(FALLBACK_CONTENT.aboutHome.heading);
  });

  it("preserves Bio portrait crop through the page projection", () => {
    const html = renderToStaticMarkup(<BioPageView mode="preview" data={{
      hero: FALLBACK_CONTENT.heroes.bio, bio: { ...FALLBACK_CONTENT.bio, galleryImages: [{ id: "portrait", src: imageProps.src, alt: imageProps.alt, framing }] },
      resume: FALLBACK_CONTENT.actorResume, hasResumeDetails: false, credits: [], footer,
    }} />);
    expect(html).toContain('data-photo-framing="custom"');
    expect(html).toContain('alt="An artist portrait"');
  });

  it("frames the Gallery mosaic and preserves parallax and hover layers", () => {
    const html = renderToStaticMarkup(<GalleryShowcase presentation={FALLBACK_CONTENT.galleryPresentation} images={[{
      id: "frame", src: imageProps.src, alt: imageProps.alt, title: "Portrait", caption: "", category: "Portraits", isMosaic: true, isFreelanceStory: false, freelanceStoryOrder: 0, framing,
    }]} />);
    expect(html).toContain('data-photo-framing="custom"');
    expect(html).toContain("gallery-mask-media object-cover transition");
    expect(html).toContain("group-hover:scale-[1.04]");
    expect(html).toContain("inset:-2rem 0");
  });

  it("retains the original uncropped Gallery lightbox", () => {
    const source = readFileSync(new URL("../components/GalleryShowcase.tsx", import.meta.url), "utf8");
    expect(source).toMatch(/<Image\s+alt=\{activeImage\.alt \|\| activeImage\.title\}\s+className="object-contain"/);
  });

  it.each(["public", "preview"] as const)("forwards Home stories crop to desktop and mobile frames in %s", (mode) => {
    const draft = createHomeDraftFromContent(FALLBACK_CONTENT);
    draft.layout = [{ id: "stories", enabled: true }];
    draft.stories.images = draft.stories.images.map((image, index) => ({ ...image, src: index ? "" : imageProps.src, framing }));
    const html = renderToStaticMarkup(<HomePageView data={draft} mode={mode} programs={[]} />);
    expect(html.match(/data-photo-framing="custom"/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it.each(["public", "preview"] as const)("frames platform cover in %s", (interactionMode) => {
    const html = renderToStaticMarkup(<MusicPlatformsExt interactionMode={interactionMode} cards={[{
      id: "spotify", title: "Spotify", label: "Listen", href: "https://open.spotify.com/artist/test", iconKey: "spotify", imageSrc: imageProps.src, framing,
    }]} />);
    expect(html).toContain('data-photo-framing="custom"');
    expect(html).toContain("group-hover:scale-[1.02]");
    expect(html).toContain("Spotify");
  });

  it.each(["direct", "YouTube"])("frames %s Showreel thumbnails without loading preview players", (platform) => {
    const html = renderToStaticMarkup(<ShowreelWorks mode="preview" presentation={FALLBACK_CONTENT.videoPresentation} videos={[{
      id: "video", title: "Video", description: "", embedUrl: platform === "direct" ? "/media/clip.mp4" : "https://www.youtube.com/watch?v=example", platform, thumbnailSrc: imageProps.src, videoType: "showreel", isFeatured: true, framing,
    }]} />);
    expect(html).toContain('data-photo-framing="custom"');
    expect(html).not.toContain("<video");
    expect(html).not.toContain("<iframe");
  });

  it("overlays direct Showreel poster while leaving the video crop and playback unchanged", () => {
    const html = renderToStaticMarkup(<ShowreelWorks presentation={FALLBACK_CONTENT.videoPresentation} videos={[{
      id: "video", title: "Video", description: "", embedUrl: "/media/clip.mp4", platform: "direct", thumbnailSrc: imageProps.src, videoType: "showreel", isFeatured: true, framing,
    }]} />);
    expect(html.match(/<video\b/g)).toHaveLength(1);
    expect(html).toContain('data-framed-video-poster="true"');
    expect(mediaTag(html, "video")).not.toContain("--photo-");
    expect(mediaTag(html, "video")).toContain('preload="metadata"');
    expect(mediaTag(html, "video")).toContain('poster="/images/about.jpg"');
  });

  it.each(["public", "preview"] as const)("uses cropped Home feature poster in %s without cropping video", (mode) => {
    const draft = createHomeDraftFromContent(FALLBACK_CONTENT);
    draft.layout = [{ id: "feature", enabled: true }];
    draft.feature.videoSrc = "/media/feature.mp4";
    draft.feature.posterSrc = imageProps.src;
    draft.feature.posterFraming = framing;
    const html = renderToStaticMarkup(<HomePageView data={draft} mode={mode} programs={[]} />);
    expect(html).toContain('data-photo-framing="custom"');
    if (mode === "public") {
      expect(html.match(/<video\b/g)).toHaveLength(1);
      expect(html).toContain('data-framed-video-poster="true"');
      expect(mediaTag(html, "video")).not.toContain("--photo-");
    } else {
      expect(html).not.toContain("<video");
    }
  });
});

function videoFixture(withVideoFrames = true) {
  let nextFrame: (() => void) | undefined;
  const listeners = new Map<string, () => void>();
  const state = { paused: true, ended: false, readyState: 0, src: "/media/video.mp4" };
  const cancelVideo = vi.fn();
  const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => { nextFrame = () => callback(0); return 31; });
  const cancelAnimationFrame = vi.fn();
  const video = {
    get paused() { return state.paused; }, get ended() { return state.ended; }, get readyState() { return state.readyState; },
    getAttribute: () => state.src,
    addEventListener: (name: string, handler: () => void) => listeners.set(name, handler),
    removeEventListener: (name: string) => listeners.delete(name),
    requestVideoFrameCallback: withVideoFrames ? vi.fn((callback: () => void) => { nextFrame = callback; return 22; }) : undefined,
    cancelVideoFrameCallback: cancelVideo,
    play: vi.fn(), pause: vi.fn(),
  };
  const ready = () => { state.paused = false; state.readyState = 2; listeners.get("playing")?.(); };
  return { video: video as unknown as HTMLVideoElement, raw: video, state, listeners, ready, present: () => nextFrame?.(), animation: { requestAnimationFrame, cancelAnimationFrame }, cancelVideo };
}

describe("native video poster handover", () => {
  it("starts a fresh playback component for each hover cycle and source change", () => {
    const props = { ...imageProps, framing, videoRef: { current: null }, videoSrc: "/media/first.mp4" };
    const inactive = FramedVideoPoster({ ...props, active: false });
    const active = FramedVideoPoster({ ...props, active: true });
    const replaced = FramedVideoPoster({ ...props, active: true, videoSrc: "/media/second.mp4" });
    expect(inactive.key).not.toBe(active.key);
    expect(active.key).not.toBe(replaced.key);
    expect(FramedVideoPoster(props).key).toBe(active.key);
  });

  it("does not hide a poster on metadata or play intent; waits for presented frame", () => {
    const fixture = videoFixture();
    const presented = vi.fn();
    const dispose = observeVideoPlaybackFrame(fixture.video, fixture.state.src, presented, fixture.animation);
    fixture.listeners.get("loadeddata")?.();
    expect(presented).not.toHaveBeenCalled();
    fixture.ready();
    expect(presented).not.toHaveBeenCalled();
    fixture.present();
    expect(presented).toHaveBeenCalledOnce();
    expect(fixture.raw.play).not.toHaveBeenCalled();
    expect(fixture.raw.pause).not.toHaveBeenCalled();
    expect(fixture.animation.requestAnimationFrame).not.toHaveBeenCalled();
    dispose();
  });

  it.each(["paused", "ended", "changed source", "missing frame data"])("keeps the poster if %s before callback", (condition) => {
    const fixture = videoFixture();
    const presented = vi.fn();
    const dispose = observeVideoPlaybackFrame(fixture.video, fixture.state.src, presented, fixture.animation);
    fixture.ready();
    if (condition === "paused") fixture.state.paused = true;
    if (condition === "ended") fixture.state.ended = true;
    if (condition === "changed source") fixture.state.src = "/media/other.mp4";
    if (condition === "missing frame data") fixture.state.readyState = 1;
    fixture.present();
    expect(presented).not.toHaveBeenCalled();
    dispose();
  });

  it.each([true, false])("cancels pending callbacks/listeners on unmount (native frames: %s)", (nativeFrames) => {
    const fixture = videoFixture(nativeFrames);
    const presented = vi.fn();
    const dispose = observeVideoPlaybackFrame(fixture.video, fixture.state.src, presented, fixture.animation);
    fixture.ready();
    dispose();
    fixture.present();
    expect(presented).not.toHaveBeenCalled();
    expect(fixture.listeners.size).toBe(0);
    expect(nativeFrames ? fixture.cancelVideo : fixture.animation.cancelAnimationFrame).toHaveBeenCalledOnce();
  });

  it("uses decoded-data plus an animation frame on browsers without video-frame callbacks", () => {
    const fixture = videoFixture(false);
    const presented = vi.fn();
    const dispose = observeVideoPlaybackFrame(fixture.video, fixture.state.src, presented, fixture.animation);
    fixture.ready();
    fixture.listeners.get("loadeddata")?.();
    expect(fixture.animation.requestAnimationFrame).toHaveBeenCalledOnce();
    expect(presented).not.toHaveBeenCalled();
    fixture.present();
    expect(presented).toHaveBeenCalledOnce();
    dispose();
  });
});
