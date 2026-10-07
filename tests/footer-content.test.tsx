import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import GalleryFooter from "@/components/GalleryFooter";
import FooterContentProvider from "@/components/FooterContentProvider";
import { DEFAULT_FOOTER_CONTENT, footerContentSchema, getFooterContactLabel, isSafeFooterHref, normalizeFooterContent } from "@/lib/content/footer";
import { getMixedPublicCopy, getOptionalPublicCopy } from "@/lib/content/public-copy";
import { createFallbackAppearanceEditorSnapshot, parseAppearanceEditorSnapshot, parseAppearanceSubmission } from "@/lib/admin/site-appearance-editor";

const versions = createFallbackAppearanceEditorSnapshot().versions;
const props = { artistName: "Owner", location: "Prague", tagline: "Music producer", contactBlurb: "Music bookings", socialLinks: [] };
describe("Editable public footer contract", () => {
  it("keeps the compact public and preview footer free of optional profile copy", () => {
    for (const preview of [false, true]) {
      const html = renderToStaticMarkup(<GalleryFooter {...props} location={" \t "} contactBlurb={" \n "} preview={preview} />);
      expect(html).not.toContain("Based in");
      expect(html).not.toContain("available worldwide");
      expect(html).not.toContain("For acting, music, productions, bookings, and creative collaborations.");
      expect(html).not.toContain("Music producer");
      expect(html).toContain("Owner");
      expect(html).toContain("Bookings &amp; enquiries");
      expect(html).toContain('href="/privacy"');
      expect(html).toContain('href="/terms"');
      expect(html).toContain('data-privacy-ui="true"');
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
  it("retains owner-supplied profile copy without displaying it in the signature footer", () => {
    for (const text of ["Music producer", "Music bookings", "Acting for film", "A creative person"]) expect(getMixedPublicCopy(text, "Fallback")).toBe(text);
    expect(getMixedPublicCopy("   ", "Fallback")).toBe("Fallback");
    const html = renderToStaticMarkup(<GalleryFooter {...props} />);
    for (const oldCopy of [props.tagline, props.location, props.contactBlurb, DEFAULT_FOOTER_CONTENT.eyebrow, DEFAULT_FOOTER_CONTENT.heading, DEFAULT_FOOTER_CONTENT.secondaryLabel, DEFAULT_FOOTER_CONTENT.socialEyebrow, DEFAULT_FOOTER_CONTENT.socialHeading]) {
      expect(html).not.toContain(oldCopy);
    }
    expect(html).not.toContain('href="/video"');
    expect(html).not.toContain("admin panel");
  });
  it("propagates shared saved copy and supports inert draft overrides", () => {
    const shared = { ...DEFAULT_FOOTER_CONTENT, heading: "Hear the next chapter", primaryLabel: "Listen", primaryHref: "/music" };
    const publicHtml = renderToStaticMarkup(<FooterContentProvider content={shared}><GalleryFooter {...props} /></FooterContentProvider>);
    expect(publicHtml).toContain("Listen"); expect(publicHtml).toContain('href="/music"');
    expect(publicHtml).not.toContain("Hear the next chapter");
    const previewHtml = renderToStaticMarkup(<FooterContentProvider content={shared}><GalleryFooter {...props} content={{ ...shared, primaryLabel: "Unpublished contact", primaryHref: "/booking" }} preview onSelectRegion={() => {}} /></FooterContentProvider>);
    expect(previewHtml).toContain("Unpublished contact"); expect(previewHtml).toContain('href="/booking"');
    expect(previewHtml).toContain('inert=""');
    expect(previewHtml.match(/data-footer-preview-region=/g)).toHaveLength(2);
    expect(publicHtml).not.toContain("data-footer-preview-region");
    expect(shared.heading).toBe("Hear the next chapter");
  });
  it("lets authors hide the contact link and never renders unsafe unsaved hrefs", () => {
    const content = { ...DEFAULT_FOOTER_CONTENT, primaryLabel: "", primaryHref: "", secondaryHref: "javascript:alert(1)" };
    const html = renderToStaticMarkup(<GalleryFooter {...props} content={content} preview />);
    expect(html).not.toContain('href="/booking"'); expect(html).not.toContain("javascript:");
    const unsafe = renderToStaticMarkup(<GalleryFooter {...props} content={{ ...DEFAULT_FOOTER_CONTENT, primaryHref: "javascript:alert(1)" }} preview />);
    expect(unsafe).not.toContain("javascript:");
  });
  it("renders configured platform icons with accessible labels and no visible names or arrows", () => {
    const socialLinks = [
      { id: "soundcloud", label: "SoundCloud", platform: "soundcloud", iconKey: "soundcloud", href: "https://soundcloud.com/owner" },
      { id: "custom-port", label: "Artist archive", platform: "website", iconKey: "website", href: "https://artist.example:8443/profile" },
      { id: "empty", label: "Empty profile", platform: "website", iconKey: "website", href: " " },
    ];
    const html = renderToStaticMarkup(<GalleryFooter {...props} socialLinks={socialLinks} />);
    expect(html).toContain('href="https://soundcloud.com/owner"');
    expect(html).toContain('aria-label="SoundCloud — opens in a new tab"');
    expect(html).toContain('title="SoundCloud"');
    expect(html).toContain('href="https://artist.example:8443/profile"');
    expect(html).toContain('target="_blank"');
    expect(html).not.toContain("Empty profile");
    expect(html).not.toContain("data-footer-social-card");
    expect(html).not.toContain("Official profile");
    const profiles = html.match(/<nav[^>]*aria-label="Music and social profiles"[^>]*>(.*?)<\/nav>/)?.[1];
    expect(profiles).toBeDefined();
    expect(profiles!.replace(/<[^>]*>/g, "").trim()).toBe("");
    expect(profiles!.match(/<svg\b/g)).toHaveLength(2);
  });
  it("refreshes only the legacy default contact label while preserving all saved footer fields", () => {
    const legacy = { ...DEFAULT_FOOTER_CONTENT, primaryLabel: "Work together", heading: "Saved invitation", secondaryLabel: "Watch my film", secondaryHref: "/video", socialHeading: "Saved social heading" };
    const expected = { ...legacy, primaryLabel: "Bookings & enquiries" };
    expect(getFooterContactLabel(legacy)).toBe("Bookings & enquiries");
    expect(normalizeFooterContent(legacy)).toEqual(expected);
    const snapshot = createFallbackAppearanceEditorSnapshot();
    snapshot.draft.footer = legacy;
    expect(parseAppearanceEditorSnapshot(snapshot)).toEqual({ ...snapshot, draft: { ...snapshot.draft, footer: expected } });
    expect(snapshot.draft.footer).toEqual(legacy);
    for (const custom of [
      { ...legacy, primaryLabel: "Get in touch" },
      { ...legacy, primaryHref: "/music" },
      { ...legacy, primaryLabel: "", primaryHref: "" },
    ]) {
      expect(getFooterContactLabel(custom)).toBe(custom.primaryLabel);
      expect(normalizeFooterContent(custom)).toEqual(custom);
      expect(parseAppearanceEditorSnapshot({ ...snapshot, draft: { ...snapshot.draft, footer: custom } })?.draft.footer).toEqual(custom);
    }
  });
  it("validates identity and footer sections independently", () => {
    expect(parseAppearanceSubmission("identity", { tagline: "Musician", description: "My music", location: "Prague", contactBlurb: "Bookings" }, versions).success).toBe(true);
    expect(parseAppearanceSubmission("identity", { tagline: "x", description: "x", location: "x", contactBlurb: "x", artistName: "Changed" }, versions).success).toBe(false);
    expect(parseAppearanceSubmission("footer", DEFAULT_FOOTER_CONTENT, versions).success).toBe(true);
  });
});
