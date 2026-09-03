import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const publicBioPage = readFileSync(
  new URL("../app/bio/page.tsx", import.meta.url),
  "utf8"
);
const sharedBioView = readFileSync(
  new URL("../components/bio/BioPageView.tsx", import.meta.url),
  "utf8"
);
const bioPreviewFrame = readFileSync(
  new URL("../components/admin/v2/BioPreviewFrame.tsx", import.meta.url),
  "utf8"
);
const bioPreviewRuntime = readFileSync(
  new URL("../components/admin/v2/BioPreviewRuntime.tsx", import.meta.url),
  "utf8"
);
const bioGallery = readFileSync(
  new URL("../components/BioScrollGallery.tsx", import.meta.url),
  "utf8"
);
const proxySource = readFileSync(new URL("../proxy.ts", import.meta.url), "utf8");
const publicContentLoader = readFileSync(
  new URL("../lib/content/index.ts", import.meta.url),
  "utf8"
);

describe("Bio visual editor presentation contract", () => {
  it("renders the public page through the same BioPageView as the preview", () => {
    expect(publicBioPage).toContain(
      'from "@/components/bio/BioPageView"'
    );
    expect(publicBioPage).toContain("<BioPageView data={data} />");
    expect(publicBioPage).toContain("<JsonLd data={createBioJsonLd(content)} />");
    expect(bioPreviewRuntime).toContain("<BioPageView");
    expect(sharedBioView).toContain("<AdaptiveHero {...data.hero} />");
    expect(sharedBioView).toContain("<BioScrollGallery");
    expect(sharedBioView).toContain("hasBody={data.bio.paragraphs.length > 0}");
    expect(sharedBioView).toContain('hasBiographyContent || mode === "preview"');
    expect(sharedBioView).toContain("<NewsletterBlock {...data.footer} />");
  });

  it("exposes four understandable click and keyboard editing regions", () => {
    for (const section of ["hero", "biography", "resume", "credits"]) {
      expect(sharedBioView).toContain(`section="${section}"`);
    }
    expect(sharedBioView).toContain("data-bio-preview-section");
    expect(sharedBioView).toContain("aria-pressed={selected}");
    expect(sharedBioView).toContain("BIO_PREVIEW_SELECTION_MESSAGE");
  });

  it("keeps all public links and footer controls inert inside edit preview", () => {
    expect(sharedBioView).toContain('mode?: "public" | "preview"');
    expect(sharedBioView).toContain('className="pointer-events-none" inert');
    expect(sharedBioView).toContain("<PreviewOnlyInertContent mode={mode}>");
  });

  it("keeps parent and iframe state synchronized with same-origin messages", () => {
    expect(bioPreviewRuntime).not.toContain("setSelectedSection(section);");
    expect(bioPreviewRuntime).toContain("window.parent.postMessage(");
    expect(bioPreviewFrame).toContain("messageRef.current = message;");
    expect(bioPreviewFrame).toContain(
      "onSelectSectionRef.current(event.data.section);"
    );
    expect(bioPreviewFrame).toContain(
      "event.origin !== window.location.origin"
    );
  });

  it("uses the agreed desktop and mobile preview viewports", () => {
    expect(bioPreviewFrame).toContain(
      "desktop: { width: 1440, height: 900 }"
    );
    expect(bioPreviewFrame).toContain(
      "mobile: { width: 390, height: 844 }"
    );
    expect(bioPreviewRuntime).toContain("scrollIntoView");
    expect(bioPreviewFrame).toContain("focusRequestId");
    expect(proxySource).toContain('"/admin/v2-preview/bio"');
    expect(proxySource).toContain('"/admin/v2-preview/bio/"');
  });

  it("clamps a rotating portrait before a shorter live draft is rendered", () => {
    expect(bioGallery).toContain(
      "Math.min(index, images.length - 1)"
    );
    expect(bioGallery).toContain("Math.min(previous, steps - 1)");
    expect(bioGallery).toContain(
      "const current = hasImages ? images[safeIndex] : null;"
    );
    expect(bioGallery).toContain("hasImages && hasBody");
    expect(bioGallery).toContain(
      'hasBody ? "lg:col-span-5" : "w-full"'
    );
    expect(bioGallery).toContain("{hasBody ? (");
  });

  it("does not resurrect hidden Bio rows with demo fallback collections", () => {
    for (const mapper of [
      "mapBioGalleryImages",
      "mapBioParagraphs",
      "mapActorCredits",
    ]) {
      const start = publicContentLoader.indexOf(`function ${mapper}`);
      const next = publicContentLoader.indexOf("\nfunction ", start + 1);
      const source = publicContentLoader.slice(
        start,
        next < 0 ? undefined : next
      );
      expect(start).toBeGreaterThanOrEqual(0);
      expect(source).toContain("if (!rows.length) return [];");
      expect(source).not.toContain("allowFallback");
    }
  });
});
