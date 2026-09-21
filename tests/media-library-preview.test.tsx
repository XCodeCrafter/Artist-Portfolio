import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import MediaLibraryPreview from "@/components/admin/v2/MediaLibraryPreview";
import type { MediaAsset } from "@/lib/admin/media";

const video: MediaAsset = {
  id: "clip", label: "Stage clip", src: "/videos/clip.mp4", alt: "", mediaType: "video", usageKey: "",
  sortOrder: 1, isPublished: true, storageBucket: "", storagePath: "", fileSize: 100,
  mimeType: "video/mp4", metadata: {}, createdAt: "", updatedAt: "", deletedAt: "", deletedBy: "",
};
describe("Media library previews", () => {
  it("uses only a lazy saved poster image in video grid tiles", () => {
    const html = renderToStaticMarkup(<MediaLibraryPreview asset={video} poster="/images/stage.jpg" />);
    expect(html).toContain('src="/images/stage.jpg"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain("Video poster");
    expect(html).not.toContain("<video");
    expect(html).not.toContain(video.src);
    expect(html).not.toContain('rel="preload"');
  });
  it.each(["", "https://tracker.example/poster.jpg", "//tracker.example/a.jpg", "data:image/png;base64,abc", "javascript:alert(1)"])("falls back without fetching an absent or untrusted poster: %s", (poster) => {
    const html = renderToStaticMarkup(<MediaLibraryPreview asset={video} poster={poster} />);
    expect(html).toContain("No saved poster");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<video");
  });
  it("only allows playback in the selected inspector, with no preload or autoplay", () => {
    const html = renderToStaticMarkup(<MediaLibraryPreview asset={video} poster="/images/stage.jpg" large />);
    expect(html).toContain("<video");
    expect(html).toContain('preload="none"');
    expect(html).toContain('poster="/images/stage.jpg"');
    expect(html).toContain('aria-label="Preview Stage clip"');
    expect(html).toContain("controls");
    expect(html).not.toContain("autoPlay");
  });
  it("does not fetch an untrusted selected video URL", () => {
    const html = renderToStaticMarkup(<MediaLibraryPreview asset={{ ...video, src: "https://untrusted.example/clip.mp4" }} large />);
    expect(html).not.toContain("<video");
    expect(html).not.toContain("untrusted.example");
  });
});
