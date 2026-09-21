import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import GalleryFooter from "@/components/GalleryFooter";
import FooterContentProvider from "@/components/FooterContentProvider";
import { DEFAULT_FOOTER_CONTENT, footerContentSchema, isSafeFooterHref, normalizeFooterContent } from "@/lib/content/footer";
import { getMixedPublicCopy, getOptionalPublicCopy } from "@/lib/content/public-copy";
import { createFallbackAppearanceEditorSnapshot, parseAppearanceSubmission } from "@/lib/admin/site-appearance-editor";

const versions = createFallbackAppearanceEditorSnapshot().versions;
const props = { artistName: "Owner", location: "Prague", tagline: "Music producer", contactBlurb: "Music bookings", socialLinks: [] };
describe("Editable public footer contract", () => {
  it("keeps intentionally empty optional Contact copy hidden in public and preview footers", () => {
    for (const preview of [false, true]) {
      const html = renderToStaticMarkup(<GalleryFooter {...props} location={" \t "} contactBlurb={" \n "} preview={preview} />);
      expect(html).not.toContain("Based in");
      expect(html).not.toContain("available worldwide");
      expect(html).not.toContain("For acting, music, productions, bookings, and creative collaborations.");
      expect(html).toContain("Music producer");
      expect(html).toContain(DEFAULT_FOOTER_CONTENT.primaryLabel);
    }
    expect(getOptionalPublicCopy(undefined, "Default")).toBe("Default");
    expect(getOptionalPublicCopy(null, "Default")).toBe("Default");
    expect(getOptionalPublicCopy(" \n ", "Default")).toBe("");
    expect(getOptionalPublicCopy("Music  bookings", "Default")).toBe("Music bookings");
  });
  it("accepts safe links and rejects active content, credentials and protocol-relative URLs", () => {
    for (const href of ["", "/", "/music", "/media/resume.pdf", "#contact", "https://example.com/a?q=1"]) expect(isSafeFooterHref(href)).toBe(true);
    for (const href of ["//evil.example", "/\\evil.example", "javascript:alert(1)", "data:text/html,test", "http://example.com", "https://user:pass@example.com", "https://example.com:8080/x", "/my file", "https://example.com\n"]) expect(isSafeFooterHref(href)).toBe(false);
  });
  it("requires paired CTA fields, bounded copy and no unexpected fields", () => {
    expect(footerContentSchema.safeParse(DEFAULT_FOOTER_CONTENT).success).toBe(true);
    for (const change of [{ primaryHref: "" }, { secondaryLabel: "" }, { heading: "" }, { eyebrow: "x".repeat(221) }, { html: "<script>" }]) expect(footerContentSchema.safeParse({ ...DEFAULT_FOOTER_CONTENT, ...change }).success).toBe(false);
    expect(footerContentSchema.safeParse({ ...DEFAULT_FOOTER_CONTENT, primaryHref: "", primaryLabel: "" }).success).toBe(true);
    expect(normalizeFooterContent(null)).toEqual(DEFAULT_FOOTER_CONTENT);
  });
  it("keeps owner-supplied single-discipline text unchanged", () => {
    for (const text of ["Music producer", "Music bookings", "Acting for film", "A creative person"]) expect(getMixedPublicCopy(text, "Fallback")).toBe(text);
    expect(getMixedPublicCopy("   ", "Fallback")).toBe("Fallback");
    const html = renderToStaticMarkup(<GalleryFooter {...props} />);
    expect(html).toContain("Music producer"); expect(html).toContain("Music bookings");
    expect(html).not.toContain("admin panel");
  });
  it("propagates shared saved copy and supports inert draft overrides", () => {
    const shared = { ...DEFAULT_FOOTER_CONTENT, heading: "Hear the next chapter", primaryLabel: "Listen", primaryHref: "/music" };
    const publicHtml = renderToStaticMarkup(<FooterContentProvider content={shared}><GalleryFooter {...props} /></FooterContentProvider>);
    expect(publicHtml).toContain("Hear the next chapter"); expect(publicHtml).toContain('href="/music"');
    const previewHtml = renderToStaticMarkup(<FooterContentProvider content={shared}><GalleryFooter {...props} content={{ ...shared, heading: "Unpublished draft" }} preview onSelectRegion={() => {}} /></FooterContentProvider>);
    expect(previewHtml).toContain("Unpublished draft"); expect(previewHtml).toContain('inert=""');
    expect(previewHtml.match(/data-footer-preview-region=/g)).toHaveLength(3);
    expect(publicHtml).not.toContain("data-footer-preview-region");
  });
  it("lets authors hide CTA buttons and never renders unsafe unsaved hrefs", () => {
    const content = { ...DEFAULT_FOOTER_CONTENT, primaryLabel: "", primaryHref: "", secondaryHref: "javascript:alert(1)" };
    const html = renderToStaticMarkup(<GalleryFooter {...props} content={content} preview />);
    expect(html).not.toContain('href="/booking"'); expect(html).not.toContain("javascript:");
  });
  it("validates identity and footer sections independently", () => {
    expect(parseAppearanceSubmission("identity", { tagline: "Musician", description: "My music", location: "Prague", contactBlurb: "Bookings" }, versions).success).toBe(true);
    expect(parseAppearanceSubmission("identity", { tagline: "x", description: "x", location: "x", contactBlurb: "x", artistName: "Changed" }, versions).success).toBe(false);
    expect(parseAppearanceSubmission("footer", DEFAULT_FOOTER_CONTENT, versions).success).toBe(true);
  });
});
