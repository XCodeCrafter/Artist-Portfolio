import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ShowreelWorks, { getLightboxLayout } from "@/components/ShowreelWorks";
import ShowreelPageView, {
  type ShowreelPageViewData,
} from "@/components/video/ShowreelPageView";
import type { VideoItem, VideoPresentation } from "@/lib/content";

const presentation: VideoPresentation = {
  sectionEyebrow: "Selected work",
  sectionTitle: "Showreels and scenes",
  sectionBody: "Screen work and selected performances.",
  featuredLabel: "Featured",
  featuredFallback: "Featured reel",
  libraryEyebrow: "Library",
  libraryTitle: "Scenes and clips",
  emptyText: "More work is coming soon.",
};

const videos: VideoItem[] = [
  {
    id: "direct-reel",
    title: "Direct reel",
    description: "Uploaded reel",
    embedUrl: "/uploads/reel.mp4",
    platform: "direct",
    thumbnailSrc: "",
    videoType: "showreel",
    isFeatured: true,
  },
  {
    id: "youtube-scene",
    title: "YouTube scene",
    description: "Embedded scene",
    embedUrl: "https://www.youtube.com/watch?v=abcdefghijk",
    platform: "YouTube",
    thumbnailSrc: "",
    videoType: "scene",
    isFeatured: false,
  },
];

const pageData: ShowreelPageViewData = {
  hero: {
    title: "Showreel",
    subtitle: "Actor",
    ctaLabel: "Watch",
    ctaHref: "#videos",
    backgroundSrc: "/uploads/hero.mp4",
    posterSrc: "/images/showreel-poster.jpg",
    mediaType: "video",
  },
  presentation,
  videos,
  footer: {
    artistName: "Example Artist",
    contactBlurb: "Bookings",
    footerEffect: "soul",
    location: "Amsterdam",
    socialLinks: [],
    tagline: "Actor and musician",
  },
};

describe("Showreel inert preview regression", () => {
  it.each(["public", "preview"] as const)("renders an empty %s catalog without demo players", (mode) => {
    const markup = renderToStaticMarkup(<ShowreelWorks mode={mode} presentation={presentation} videos={[]} />);
    expect(markup).toContain(presentation.emptyText);
    expect(markup).not.toContain("<video");
    expect(markup).not.toContain("<iframe");
    expect(markup).not.toContain("Direct reel");
  });

  it("does not mount video or iframe resources inside editor preview regions", () => {
    const markup = renderToStaticMarkup(
      <ShowreelWorks
        mode="preview"
        presentation={presentation}
        selectedSection="works"
        videos={videos}
      />
    );

    expect(markup).not.toContain("<video");
    expect(markup).not.toContain("<iframe");
    expect(markup).toContain('data-showreel-preview-section="works"');
  });

  it("keeps the complete preview static when the Hero source is a video", () => {
    const previewMarkup = renderToStaticMarkup(
      <ShowreelPageView data={pageData} mode="preview" />
    );
    const publicMarkup = renderToStaticMarkup(
      <ShowreelPageView data={pageData} />
    );

    expect(previewMarkup).not.toContain("<video");
    expect(previewMarkup).not.toContain("<iframe");
    expect(previewMarkup).toContain("showreel-poster.jpg");
    expect(publicMarkup).toContain("<video");
  });

  it("still mounts visitor playback on the real public page", () => {
    const markup = renderToStaticMarkup(
      <ShowreelWorks presentation={presentation} videos={videos} />
    );

    expect(markup).toContain("<video");
    expect(readFileSync(
      new URL("../components/ShowreelWorks.tsx", import.meta.url),
      "utf8"
    )).toContain("<iframe");
  });
  it("constrains mobile grid tracks instead of deriving width from cinematic minimum height", () => {
    const markup = renderToStaticMarkup(<ShowreelWorks presentation={presentation} videos={videos} />);
    // 18rem × 16/7 previously forced a ~658px intrinsic track on a 390px phone.
    expect(markup).toContain("grid grid-cols-1 gap-x-5");
    expect(markup.match(/<article class="min-w-0 /g)).toHaveLength(videos.length);
    expect(markup).toContain("aspect-video lg:aspect-[16/7] lg:min-h-72");
    expect(markup).not.toContain("aspect-[16/7] min-h-72");
    expect(markup).toContain('preload="metadata"');
    expect(markup).toContain("playsInline");
  });

  it("does not offer an unbounded Other embed provider in the V2 inspector", () => {
    const editor = readFileSync(
      new URL("../components/admin/v2/ShowreelEditor.tsx", import.meta.url),
      "utf8"
    );

    expect(editor).not.toContain('<option value="Other">');
    expect(editor).not.toContain("Other supported embed");
  });
});

describe("Showreel playback on phones and touch screens", () => {
  const directVideoTag = (markup: string) =>
    markup.match(/<video\b[^>]*>/)?.[0] ?? "";

  it("omits an empty poster attribute and keeps a saved thumbnail", () => {
    const withoutPoster = renderToStaticMarkup(
      <ShowreelWorks presentation={presentation} videos={videos} />
    );
    expect(directVideoTag(withoutPoster)).not.toContain("poster=");

    const withPoster = renderToStaticMarkup(
      <ShowreelWorks
        presentation={presentation}
        videos={[{ ...videos[0], thumbnailSrc: "/images/reel-poster.jpg" }]}
      />
    );
    expect(directVideoTag(withPoster)).toContain(
      'poster="/images/reel-poster.jpg"'
    );
  });

  it("words the preview hint for hover, touch and reduced motion without hydration-dependent text", () => {
    const markup = renderToStaticMarkup(
      <ShowreelWorks presentation={presentation} videos={videos} />
    );
    expect(markup).toContain(
      '<span class="hidden motion-safe:[@media(hover:hover)]:inline">Hover to play</span>'
    );
    expect(markup).toContain(
      '<span class="hidden motion-safe:[@media(hover:none)]:inline">Tap to watch</span>'
    );
    expect(markup).toContain('<span class="motion-safe:hidden">Watch video</span>');
    // The hint must not wrap over a long title on narrow two-column cards.
    expect(markup).toContain("shrink-0 whitespace-nowrap");
    expect(markup).not.toContain("Click to edit");
  });

  it("keeps the editor preview label unchanged", () => {
    const markup = renderToStaticMarkup(
      <ShowreelWorks mode="preview" presentation={presentation} videos={videos} />
    );
    expect(markup).toContain("Click to edit");
    expect(markup).not.toContain("Hover to play");
  });

  it("fits an upright clip to the viewport instead of letterboxing it into 16:9", () => {
    const upright = getLightboxLayout(576 / 1024);
    expect(upright.frameClassName).toBe("");
    expect(upright.frameStyle).toEqual({ aspectRatio: "0.5625" });
    expect(upright.panelStyle).toEqual({
      width: "min(100%, calc(72svh * 0.5625))",
    });

    const landscape = getLightboxLayout(16 / 9);
    expect(landscape.frameStyle).toEqual({ aspectRatio: "1.7778" });
  });

  it.each([undefined, 0, Number.NaN, Number.POSITIVE_INFINITY, 0.1, 12])(
    "falls back to the 16:9 frame for an unknown or implausible ratio (%s)",
    (ratio) => {
      expect(getLightboxLayout(ratio)).toEqual({ frameClassName: "aspect-video" });
    }
  );

  it("offers the Escape hint only to pointer devices", () => {
    const source = readFileSync(
      new URL("../components/ShowreelWorks.tsx", import.meta.url),
      "utf8"
    );
    expect(source).toMatch(
      /className="hidden shrink-0 items-center gap-2 text-xs text-white\/45 \[@media\(hover:hover\)\]:flex"><FaPause \/> Esc to close/
    );
  });
});
