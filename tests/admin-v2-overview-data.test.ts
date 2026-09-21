import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAdminV2OverviewData } from "@/lib/admin/v2-overview";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), navigation: vi.fn(), home: vi.fn(), bio: vi.fn(), gallery: vi.fn(), showreel: vi.fn(),
  music: vi.fn(), contact: vi.fn(), inbox: vi.fn(), appearance: vi.fn(), media: vi.fn(), readiness: vi.fn(),
}));
vi.mock("@/lib/admin/auth", () => ({ requireAdmin: mocks.auth }));
vi.mock("@/lib/admin/navigation", () => ({ getAdminNavigationData: mocks.navigation }));
vi.mock("@/lib/admin/home", () => ({ getAdminHomeEditorData: mocks.home }));
vi.mock("@/lib/admin/bio", () => ({ getAdminBioEditorData: mocks.bio }));
vi.mock("@/lib/admin/gallery", () => ({ getAdminGalleryEditorData: mocks.gallery }));
vi.mock("@/lib/admin/showreel", () => ({ getAdminShowreelEditorData: mocks.showreel }));
vi.mock("@/lib/admin/music", () => ({ getAdminMusicEditorData: mocks.music }));
vi.mock("@/lib/admin/contact", () => ({ getAdminContactEditorData: mocks.contact }));
vi.mock("@/lib/admin/inquiries", () => ({ getAdminNewInquiryCount: mocks.inbox }));
vi.mock("@/lib/admin/site-appearance", () => ({ getAdminAppearanceData: mocks.appearance }));
vi.mock("@/lib/admin/media-library", () => ({ getMediaLibraryV2Data: mocks.media }));
vi.mock("@/lib/admin/readiness", () => ({ getProductionReadiness: mocks.readiness }));
vi.mock("@/lib/admin/navigation-editor", () => ({
  createNavigationEditorModel: () => ({ items: [{ itemType: "known", kind: "page", key: "home", isVisible: true }], blockingIssues: [] }),
  toPreviewNavigationItems: () => [],
}));
vi.mock("@/lib/content/navigation", () => ({ getVisiblePublicPageNavigationItems: () => [] }));
const ready = { isConfigured: true, migrationRequired: false };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ id: "admin" });
  for (const loader of [mocks.home, mocks.bio, mocks.gallery, mocks.showreel, mocks.music]) loader.mockResolvedValue(ready);
  mocks.navigation.mockResolvedValue({ ...ready, configVersion: 1, navigation: [], availability: {} });
  mocks.contact.mockResolvedValue({ ...ready, delivery: { emailConfigured: true, webhookConfigured: true } });
  mocks.inbox.mockResolvedValue({ isConfigured: true, count: 0 });
  mocks.appearance.mockResolvedValue({ ...ready, footerMigrationRequired: false, snapshot: { privateDraft: "not-for-client" } });
  mocks.media.mockResolvedValue({ isConfigured: true, assets: [{ id: "not-for-client", storagePath: "private-path" }], usage: {} });
  mocks.readiness.mockResolvedValue({ checks: [] });
});

describe("Overview workspace readiness", () => {
  it("includes Appearance and Media reads but returns only presentation-safe status", async () => {
    const result = await getAdminV2OverviewData();
    expect(mocks.appearance).toHaveBeenCalledOnce();
    expect(mocks.media).toHaveBeenCalledOnce();
    expect(mocks.readiness).toHaveBeenCalledExactlyOnceWith({ includeSchema: false });
    expect(result.issues).toEqual([]);
    expect(result.pages).toHaveLength(6);
    expect(JSON.stringify(result)).not.toContain("not-for-client");
    expect(JSON.stringify(result)).not.toContain("private-path");
  });
  it("reports pending footer migration even when every public page editor is ready", async () => {
    mocks.appearance.mockResolvedValue({ ...ready, footerMigrationRequired: true });
    const result = await getAdminV2OverviewData();
    expect(result.pages.every(page => page.editorState === "ready")).toBe(true);
    expect(result.issues).toContainEqual(expect.objectContaining({ id: "footer-migration", href: "/admin/v2/settings/appearance", detail: expect.stringContaining("0039") }));
  });
  it("reports unavailable Media usage/removal without claiming uploads are broken", async () => {
    mocks.media.mockResolvedValue({ isConfigured: true, usageError: "Media usage and safe removal need migration 0040. Upload and file details remain available." });
    const result = await getAdminV2OverviewData();
    expect(result.issues).toContainEqual(expect.objectContaining({ id: "media-usage-unavailable", href: "/admin/v2/media", detail: expect.stringContaining("0040") }));
    expect(result.issues.some(issue => issue.id === "media-unavailable")).toBe(false);
  });
  it("surfaces failed workspace reads as errors instead of healthy empty content", async () => {
    mocks.appearance.mockResolvedValue({ ...ready, loadError: "Settings could not be loaded" });
    mocks.media.mockResolvedValue({ isConfigured: true, loadError: "Files could not be loaded", usageError: "Usage unknown" });
    const result = await getAdminV2OverviewData();
    expect(result.issues).toContainEqual(expect.objectContaining({ id: "appearance-unavailable", tone: "error" }));
    expect(result.issues).toContainEqual(expect.objectContaining({ id: "media-unavailable", tone: "error" }));
    expect(result.issues.some(issue => issue.id === "media-usage-unavailable")).toBe(false);
  });
  it("cannot claim setup readiness when a new workspace has no configured service", async () => {
    mocks.media.mockResolvedValue({ isConfigured: false, usageError: "Not configured" });
    expect((await getAdminV2OverviewData()).issues).toContainEqual(expect.objectContaining({ id: "admin-data-unavailable", tone: "error" }));
  });
  it("authenticates before reading additional workspaces", async () => {
    mocks.auth.mockRejectedValue(new Error("Unauthorized"));
    await expect(getAdminV2OverviewData()).rejects.toThrow("Unauthorized");
    expect(mocks.appearance).not.toHaveBeenCalled();
    expect(mocks.media).not.toHaveBeenCalled();
    expect(mocks.readiness).not.toHaveBeenCalled();
  });

  it("shows critical deployment failures and unknowns without optional setup clutter", async () => {
    mocks.readiness.mockResolvedValue({ checks: [
      { id: "site-url", label: "Production URL", status: "fail", critical: true, detail: "Set the HTTPS domain." },
      { id: "public-signup", label: "Public signup disabled", status: "unknown", critical: true, detail: "Settings could not be read. Retry the check." },
      { id: "media-storage", label: "Media storage", status: "pass", critical: true },
      { id: "media-processor", label: "Media optimizer", status: "fail", critical: false },
    ] });
    const result = await getAdminV2OverviewData();
    expect(result.issues).toEqual([
      expect.objectContaining({ id: "production-site-url", tone: "error", href: "/admin/v2/security#configuration" }),
      expect.objectContaining({ id: "production-public-signup", tone: "warning", title: "Public signup disabled: not verified" }),
    ]);
    expect(JSON.stringify(result)).not.toContain("Disable signup");
  });

  it("keeps editor access when deployment verification fails unexpectedly", async () => {
    mocks.readiness.mockRejectedValue(new Error("private upstream details"));
    const result = await getAdminV2OverviewData();
    expect(result.pages.every(page => page.editorState === "ready")).toBe(true);
    expect(result.issues).toContainEqual(expect.objectContaining({ id: "readiness-unavailable", tone: "warning" }));
    expect(JSON.stringify(result)).not.toContain("private upstream details");
  });

  it("does not duplicate the existing Contact setup card", async () => {
    mocks.contact.mockResolvedValue({ ...ready, delivery: { emailConfigured: false, webhookConfigured: false } });
    mocks.readiness.mockResolvedValue({ checks: [{ id: "email", label: "Contact delivery", status: "fail", critical: true }] });
    const result = await getAdminV2OverviewData();
    expect(result.issues.filter(issue => issue.id === "contact-delivery-setup")).toHaveLength(1);
    expect(result.issues.some(issue => issue.id === "production-email")).toBe(false);
  });
});
