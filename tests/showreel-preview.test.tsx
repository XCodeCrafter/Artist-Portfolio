import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ShowreelWorks from "@/components/ShowreelWorks";
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

  it("does not offer an unbounded Other embed provider in the V2 inspector", () => {
    const editor = readFileSync(
      new URL("../components/admin/v2/ShowreelEditor.tsx", import.meta.url),
      "utf8"
    );

    expect(editor).not.toContain('<option value="Other">');
    expect(editor).not.toContain("Other supported embed");
  });
});
