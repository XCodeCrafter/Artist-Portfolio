import { describe, expect, it } from "vitest";
import { FALLBACK_CONTENT } from "@/lib/content/fallback";
import { HERO_PAGE_SLUGS, PAGE_SLUGS, getProfilePublicModules } from "@/lib/content/modules";
import { createLegacyNavigationConfig, getActiveNavigationKey, getVisiblePublicPageNavigationItems, PUBLIC_PORTFOLIO_PATHS, resolveNavigationConfig } from "@/lib/content/navigation";
import { filterAdminV2Destinations } from "@/lib/admin/v2-destinations";
import { getAdminV2ActiveItem } from "@/lib/admin/v2-shell";
import { createPageMetadata } from "@/lib/seo";
import { createFallbackHomeEditorSnapshot, parseHomeEditorDraft, parseHomeSectionSubmission } from "@/lib/admin/home-editor";

describe("standalone Press integration", () => {
  it("keeps legacy layout data readable but refuses to publish an empty Home using its retired Press slot", () => {
    const snapshot = createFallbackHomeEditorSnapshot();
    snapshot.draft.layout = snapshot.draft.layout.map(row => ({ ...row, enabled: row.id === "press" }));
    expect(parseHomeEditorDraft(snapshot.draft)).not.toBeNull();
    expect(parseHomeSectionSubmission("layout", snapshot.draft.layout, snapshot.versions).success).toBe(false);
    snapshot.draft.layout = snapshot.draft.layout.map(row => row.id === "hero" ? { ...row, enabled: true } : row);
    expect(parseHomeSectionSubmission("layout", snapshot.draft.layout, snapshot.versions).success).toBe(true);
  });

  it.each(["actor", "musician"] as const)("links Press in the %s fallback navigation", profile => {
    const config = createLegacyNavigationConfig(profile);
    const items = getVisiblePublicPageNavigationItems(config.items, { hasPublishedCncPrograms: false, hasResumeContent: false });
    expect(items.find(item => item.key === "press")).toMatchObject({ href: "/press", defaultLabel: "PRESS" });
    expect(getActiveNavigationKey(items, "/press/", "")).toBe("press");
    expect(getProfilePublicModules(profile).find(item => item.key === "press")?.href).toBe("/press");
  });

  it("respects saved Press visibility while keeping the canonical page published", () => {
    const config = resolveNavigationConfig({ version: 1, portfolioType: "musician", rows: [
      { destination_key: "home", is_visible: true, sort_order: 10 },
      { destination_key: "press", is_visible: false, sort_order: 20 },
    ] });
    expect(getVisiblePublicPageNavigationItems(config.items, { hasPublishedCncPrograms: false, hasResumeContent: false }).some(item => item.key === "press")).toBe(false);
    expect(PUBLIC_PORTFOLIO_PATHS).toContain("/press");
    expect(createLegacyNavigationConfig("musician", ["press"]).items.find(item => item.key === "press")?.isVisible).toBe(false);
  });

  it("routes press and review searches to their own editor", () => {
    for (const query of ["press", "reviews", "recenze", "interview"]) {
      expect(filterAdminV2Destinations(query)[0]).toMatchObject({ id: "press", href: "/admin/v2/pages/press" });
    }
    expect(getAdminV2ActiveItem("/admin/v2/pages/press").key).toBe("press");
  });

  it("publishes Press metadata without inventing a second hero record", () => {
    expect(PAGE_SLUGS).toContain("press");
    expect(HERO_PAGE_SLUGS).not.toContain("press");
    const metadata = createPageMetadata(FALLBACK_CONTENT, "press");
    expect(metadata.alternates).toEqual({ canonical: "/press" });
    expect(metadata.openGraph).toMatchObject({ url: "/press", title: expect.stringContaining("Press & Reviews") });
    expect(metadata.description).toContain(FALLBACK_CONTENT.settings.artistName);
    expect(metadata.twitter).toMatchObject({ title: expect.stringContaining("Press & Reviews") });
  });
});
