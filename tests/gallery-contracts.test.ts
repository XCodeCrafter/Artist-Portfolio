import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const publicGalleryPage = readFileSync(
  new URL("../app/gallery/page.tsx", import.meta.url),
  "utf8"
);
const sharedGalleryView = readFileSync(
  new URL("../components/gallery/GalleryPageView.tsx", import.meta.url),
  "utf8"
);
const galleryPreviewFrame = readFileSync(
  new URL("../components/admin/v2/GalleryPreviewFrame.tsx", import.meta.url),
  "utf8"
);
const galleryPreviewRuntime = readFileSync(
  new URL("../components/admin/v2/GalleryPreviewRuntime.tsx", import.meta.url),
  "utf8"
);
const proxySource = readFileSync(new URL("../proxy.ts", import.meta.url), "utf8");
const publicContentLoader = readFileSync(
  new URL("../lib/content/index.ts", import.meta.url),
  "utf8"
);

describe("Gallery visual editor presentation contract", () => {
  it("renders the public page and preview through the same GalleryPageView", () => {
    expect(publicGalleryPage).toContain(
      'from "@/components/gallery/GalleryPageView"'
    );
    expect(publicGalleryPage).toContain("<GalleryPageView data={data} />");
    expect(galleryPreviewRuntime).toContain("<GalleryPageView");
    expect(sharedGalleryView).toContain("<AdaptiveHero {...data.hero} />");
    expect(sharedGalleryView).toContain("<GalleryShowcase");
    expect(sharedGalleryView).toContain("<GalleryFooter {...data.footer} />");
    expect(sharedGalleryView).toContain("Gallery images are coming soon.");
  });

  it("exposes the three agreed click and keyboard edit regions", () => {
    expect(sharedGalleryView).toContain("data-gallery-preview-section={section}");
    expect(sharedGalleryView).toContain(
      "data-gallery-preview-section={region.section}"
    );
    expect(sharedGalleryView).toContain(
      '(["introduction", "frames"] as const)'
    );
    expect(sharedGalleryView).toContain("aria-pressed={selected}");
    expect(sharedGalleryView).toContain("GALLERY_PREVIEW_SELECTION_MESSAGE");
    expect(sharedGalleryView).toContain("new ResizeObserver(measure)");
    expect(sharedGalleryView).not.toContain("top-[290px]");
  });

  it("keeps visitor controls inert in preview and synchronizes safely", () => {
    expect(sharedGalleryView).toContain('mode?: PreviewMode');
    expect(sharedGalleryView).toContain(
      'className="pointer-events-none" inert'
    );
    expect(sharedGalleryView).toContain("<PreviewOnlyInertContent mode={mode}>");
    expect(galleryPreviewRuntime).toContain("event.source !== window.parent");
    expect(galleryPreviewRuntime).toContain("window.parent.postMessage(");
    expect(galleryPreviewFrame).toContain(
      "event.source !== frameRef.current?.contentWindow"
    );
    expect(galleryPreviewFrame).toContain(
      "onSelectSectionRef.current(event.data.section);"
    );
  });

  it("uses the agreed desktop/mobile viewports and same-origin frame route", () => {
    expect(galleryPreviewFrame).toContain(
      "desktop: { width: 1440, height: 900 }"
    );
    expect(galleryPreviewFrame).toContain(
      "mobile: { width: 390, height: 844 }"
    );
    expect(galleryPreviewRuntime).toContain("scrollIntoView");
    expect(galleryPreviewFrame).toContain("focusRequestId");
    expect(proxySource).toContain('"/admin/v2-preview/gallery"');
    expect(proxySource).toContain('"/admin/v2-preview/gallery/"');
  });

  it("does not resurrect fallback frames after a successful empty query", () => {
    const start = publicContentLoader.indexOf("function mapGalleryImages");
    const next = publicContentLoader.indexOf("\nfunction ", start + 1);
    const mapper = publicContentLoader.slice(
      start,
      next < 0 ? undefined : next
    );

    expect(start).toBeGreaterThanOrEqual(0);
    expect(mapper).toContain("if (!rows.length) return [];");
    expect(mapper).not.toContain("allowFallback");
    expect(publicContentLoader).toContain(
      "galleryImages: mapGalleryImages(galleryImages.data ?? [])"
    );
  });
});
