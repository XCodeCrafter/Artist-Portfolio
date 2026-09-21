import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPreparedClassicDestination as destination } from "@/lib/admin/cutover-routes";
import { ADMIN_ENTRY_PATH } from "@/lib/admin/entry-routes";

describe("prepared Classic bookmark mapping (not active redirects)", () => {
  it("keeps the authenticated entry path stable", () => {
    expect(ADMIN_ENTRY_PATH).toBe("/admin/v2");
    expect(destination("/admin")).toBe(ADMIN_ENTRY_PATH);
    expect(destination("/admin/")).toBe(ADMIN_ENTRY_PATH);
  });

  it.each([
    ["home", "home"], ["heroes", "home"], ["updates", "home"],
    ["home-hero", "home"], ["home-about", "home"],
    ["home-interlude", "home"], ["home-freelancer-life", "home"],
    ["home-cnc", "home/programs"],
    ["bio", "bio"], ["bio-hero", "bio"], ["bio-intro", "bio"],
    ["bio-gallery", "bio"], ["bio-paragraphs", "bio"],
    ["bio-paragraphs-panel", "bio"], ["actor-resume", "bio"], ["actor-credits", "bio"],
    ["music-links", "music"], ["music-links-hero", "music"],
    ["music-settings", "music"], ["music-platforms", "music"], ["tracks", "music"],
    ["booking", "contact"], ["booking-hero", "contact"], ["contact-settings", "contact"],
  ])("maps content #%s to its real V2 workspace", (hash, page) => {
    expect(destination(`/admin/content#${hash}`)).toBe(`/admin/v2/pages/${page}`);
  });

  it.each(["navigation", "navigation-settings", "socials", "socials-links"])(
    "maps shared navigation #%s", (hash) => {
      expect(destination(`/admin/content#${hash}`)).toBe("/admin/v2/navigation");
    },
  );

  it.each(["settings", "settings-identity", "settings-typography", "settings-footer-effect"])(
    "maps appearance #%s", (hash) => {
      expect(destination(`/admin/content#${hash}`)).toBe("/admin/v2/settings/appearance");
    },
  );

  it.each([
    ["", "/admin/v2/pages/gallery"], ["?view=studio", "/admin/v2/pages/gallery"],
    ["?view=showreel", "/admin/v2/pages/showreel"], ["?view=library", "/admin/v2/media"],
    ["?view=unknown", "/admin/v2/pages/gallery"],
    ["?view=library&view=showreel", "/admin/v2/pages/gallery"],
  ])("preserves Classic media mode %s", (query, expected) => {
    expect(destination(`/admin/media${query}`)).toBe(expected);
  });

  it.each([
    ["overview", "overview"], ["acquisition", "visitors"], ["content", "popular-pages"],
    ["engagement", "interactions"], ["events", "recent-activity"], ["health", "data-health"],
  ])("maps real Insights tab #%s and preserves supported range", (oldHash, newHash) => {
    expect(destination(`/admin/analytics?range=90#${oldHash}`))
      .toBe(`/admin/v2/insights?range=90#${newHash}`);
  });

  it.each(["7", "30", "90", "180"])("preserves supported range %s", (range) => {
    expect(destination(`/admin/analytics?range=${range}`)).toBe(`/admin/v2/insights?range=${range}`);
  });

  it.each(["365", "NaN", "-7", "30.0", "030", "1e2", "30&range=90"])("drops unsupported range %s", (range) => {
    expect(destination(`/admin/analytics?range=${range}`)).toBe("/admin/v2/insights");
  });

  it("moves the Inbox hash to Inbox and translates only supported paging", () => {
    expect(destination("/admin/analytics?inquiryPage=3&range=90&status=saved&next=https://evil.test#inquiries"))
      .toBe("/admin/v2/inbox?page=3&status=saved#messages");
    expect(destination("/admin/analytics#inquiries")).toBe("/admin/v2/inbox#messages");
    expect(destination("/admin/analytics?inquiryPage=999999#inquiries")).toBe("/admin/v2/inbox?page=10000#messages");
    expect(destination("/admin/analytics?inquiryPage=invalid#inquiries")).toBe("/admin/v2/inbox?page=1#messages");
    expect(destination("/admin/analytics?inquiryPage=2&inquiryPage=3#inquiries")).toBe("/admin/v2/inbox#messages");
    expect(destination("/admin/analytics?inquiryPage=3&range=30")).toBe("/admin/v2/insights?range=30");
  });

  it("honors the explicit upload destination instead of Classic's default studio", () => {
    expect(destination("/admin/media#upload")).toBe("/admin/v2/media#upload");
    expect(destination("/admin/media?view=studio#upload")).toBe("/admin/v2/media#upload");
  });

  it.each([
    ["health", "configuration"], ["allowlist", "configuration"],
    ["configuration", "configuration"], ["admin-profiles", "access"], ["access", "access"],
    ["threats", "activity"], ["activity", "activity"], ["audit", "audit"], ["overview", "overview"],
  ])("keeps the real Security hash %s", (oldHash, newHash) => {
    expect(destination(`/admin/security?status=saved-audit-warning#${oldHash}`))
      .toBe(`/admin/v2/security?status=saved-audit-warning#${newHash}`);
  });

  it("preserves allowlisted action results, not arbitrary or duplicated status text", () => {
    expect(destination("/admin/security?status=mfa-reset#admin-profiles")).toBe("/admin/v2/security?status=mfa-reset#access");
    expect(destination("/admin/security?status=deleted&status=saved#access")).toBe("/admin/v2/security#access");
    expect(destination("/admin/security?status=You%20are%20hacked#access")).toBe("/admin/v2/security#access");
    expect(destination("/admin/analytics?status=saved&status=deleted#inquiries")).toBe("/admin/v2/inbox#messages");
    expect(destination("/admin/analytics?status=mfa-reset#inquiries")).toBe("/admin/v2/inbox#messages");
    expect(destination("/admin/analytics?inquiryPage=2&status=write-conflict#inquiries"))
      .toBe("/admin/v2/inbox?page=2&status=write-conflict#messages");
  });

  it("handles safe encoded fragments but never reflects arbitrary fragments or query keys", () => {
    expect(destination("/admin/content#home%2Dcnc")).toBe("/admin/v2/pages/home/programs");
    for (const hash of ["unknown", "constructor", "__proto__", "%", "//evil.test", "<script>"]) {
      expect(destination(`/admin/content?next=//evil.test#${hash}`)).toBe("/admin/v2/pages/home");
      expect(destination(`/admin/analytics#${hash}`)).toBe("/admin/v2/insights");
    }
    expect(destination("/admin/security?status=untrusted#unknown")).toBe("/admin/v2/security");
    expect(destination("/admin/settings?next=//evil.test")).toBe("/admin/v2/settings");
  });

  it.each([
    "https://evil.test/admin", "//evil.test/admin", "javascript:alert(1)",
    "/admin\\content", "/admin/../admin/content", "/admin/%2e%2e/admin/content",
    "/admin%2fcontent", "/admin//content", "/admin/content//", "/admin/content/../media",
    "/admin/login", "/admin/auth/callback", "/admin/reset-password", "/admin/mfa", "/admin/v2",
    "/admin/v2/pages/home", "/admin/export", "/administrator", "/admin\n", " /admin",
    "/admin?long=" + "x".repeat(2048),
  ])("does not map unrecognized or unsafe input %s", (input) => {
    expect(destination(input)).toBeNull();
  });

  it("leaves Classic entry pages in place behind requireAdmin without activating the mapper", () => {
    for (const page of ["app/admin/page.tsx", "app/admin/content/page.tsx", "app/admin/media/page.tsx", "app/admin/security/page.tsx", "app/admin/analytics/page.tsx"]) {
      const source = readFileSync(page, "utf8");
      expect(source).toContain("requireAdmin");
      expect(source).not.toContain("getPreparedClassicDestination");
    }
  });
});
