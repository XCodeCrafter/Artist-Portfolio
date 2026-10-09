import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import BioPageView from "@/components/bio/BioPageView";
import { createBioPageViewDataFromEditor, createFallbackBioEditorSnapshot, getDirtyBioSections, parseBioSectionSubmission } from "@/lib/admin/bio-editor";
import { FALLBACK_CONTENT } from "@/lib/content/fallback";
import { createBioJsonLd, createPageMetadata, getPageSeo } from "@/lib/seo";
import { createMixedReviewNavigationConfig, getVisiblePublicNavigationItems } from "@/lib/content/navigation";

vi.mock("@/components/AdaptiveHero", () => ({ default: () => <header>Bio hero</header> }));
vi.mock("@/components/BioScrollGallery", () => ({ default: ({ children }: { children: ReactNode }) => <section>{children}</section> }));
vi.mock("@/components/NewsletterBlock", () => ({ default: () => <footer>Footer</footer> }));

function setup(enabled: boolean) {
  const snapshot = createFallbackBioEditorSnapshot();
  snapshot.draft.visibility.resumeCreditsEnabled = enabled;
  snapshot.draft.resume.headline = "Saved professional profile";
  snapshot.draft.credits.items[0].title = "Saved theatre project";
  return { snapshot, data: createBioPageViewDataFromEditor(snapshot.draft, snapshot.footer, snapshot.hasResumeDetails) };
}

describe("whole Bio Resume & Credits visibility", () => {
  it("removes both blocks from the public page while preserving biography and saved data", () => {
    const { snapshot, data } = setup(false);
    const before = structuredClone(snapshot);
    const html = renderToStaticMarkup(<BioPageView data={data} />);
    expect(html).not.toContain('id="resume"');
    expect(html).not.toContain("Saved professional profile");
    expect(html).not.toContain("Saved theatre project");
    expect(html).not.toContain("hidden in this preview");
    expect(html).toContain("Bio hero");
    expect(html).toContain(snapshot.draft.biography.paragraphs[0].body);
    expect(html).toContain("Footer");
    expect(snapshot).toEqual(before);
  });

  it("restores the same content when re-enabled", () => {
    const { snapshot } = setup(false);
    const saved = structuredClone(snapshot.draft);
    snapshot.draft.visibility.resumeCreditsEnabled = true;
    const data = createBioPageViewDataFromEditor(snapshot.draft, snapshot.footer);
    const html = renderToStaticMarkup(<BioPageView data={data} />);
    expect(html).toContain('id="resume"');
    expect(html).toContain("Saved professional profile");
    expect(html).toContain("Saved theatre project");
    expect(snapshot.draft.resume).toEqual(saved.resume);
    expect(snapshot.draft.credits).toEqual(saved.credits);
    expect(getDirtyBioSections(saved, snapshot.draft)).toEqual(["visibility"]);
  });

  it("shows a selectable placeholder only in the hidden admin preview", () => {
    const { data } = setup(false);
    const html = renderToStaticMarkup(<BioPageView data={data} mode="preview" selectedSection="visibility" />);
    expect(html).toContain("hidden in this preview");
    expect(html).toContain("Your saved content is kept.");
    expect(html).toContain('aria-label="Edit Resume &amp; Credits visibility"');
    expect(html).toContain('data-bio-preview-section="visibility"');
    expect(html).not.toContain("Saved theatre project");
    expect(html).not.toContain("Saved professional profile");
  });

  it.each([true, false])("accepts explicit boolean %s with a saved version", enabled => {
    expect(parseBioSectionSubmission("visibility", { resumeCreditsEnabled: enabled }, { updatedAt: "2026-10-08T10:00:00.000Z" }).success).toBe(true);
  });

  it.each([{}, { resumeCreditsEnabled: "false" }, { resumeCreditsEnabled: 0 }, { resumeCreditsEnabled: null }, { resumeCreditsEnabled: false, resume: {} }])("rejects missing, coerced or extra visibility fields %#", payload => {
    expect(parseBioSectionSubmission("visibility", payload, { updatedAt: "2026-10-08T10:00:00.000Z" }).success).toBe(false);
  });

  it("keeps legacy pages visible until the new setting exists", () => {
    const { data } = setup(true);
    delete (data as { resumeCreditsEnabled?: boolean }).resumeCreditsEnabled;
    expect(renderToStaticMarkup(<BioPageView data={data} />)).toContain('id="resume"');
  });

  it("removes claims of a visible resume from Bio metadata and structured data", () => {
    const content = { ...FALLBACK_CONTENT, settings: { ...FALLBACK_CONTENT.settings, bioResumeCreditsEnabled: false } };
    const seo = getPageSeo(content, "bio");
    expect(seo.label).toBe("Biography");
    expect(seo.description).not.toMatch(/resume|credits/i);
    const metadata = createPageMetadata(content, "bio");
    expect(metadata.openGraph).toMatchObject({ title: seo.title, description: seo.description });
    expect(createBioJsonLd(content)["@graph"][0]).toMatchObject({ name: seo.title, description: seo.description });
    expect(getPageSeo({ ...content, settings: { ...content.settings, bioResumeCreditsEnabled: true } }, "bio").label).toBe("Biography, Resume & Credits");
  });

  it("omits the resume anchor without changing the saved navigation choice", () => {
    const navigation = createMixedReviewNavigationConfig();
    const item = navigation.items.find(item => item.key === "bio.resume")!;
    item.isVisible = true;
    const context = { hasPublishedCncPrograms: false, hasResumeContent: false };
    expect(getVisiblePublicNavigationItems(navigation.items, context).some(item => item.key === "bio.resume")).toBe(false);
    expect(getVisiblePublicNavigationItems(navigation.items, { ...context, hasResumeContent: true }).some(item => item.key === "bio.resume")).toBe(true);
    expect(item.isVisible).toBe(true);
    const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
    expect(layout).toContain("content.settings.bioResumeCreditsEnabled !== false");
  });
});
