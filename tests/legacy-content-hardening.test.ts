import { beforeEach, describe, expect, it, vi } from "vitest";
import * as actions from "@/app/admin/content/actions";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(async () => ({ id: "admin" })),
  verifyOrigin: vi.fn(async () => true),
  createClient: vi.fn<() => unknown>(),
  audit: vi.fn(async () => ({ ok: true })),
  parse: vi.fn((value: unknown) => value === "valid" ? {} : null),
}));
vi.mock("@/lib/admin/auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/admin/action-security", () => ({ verifyAdminActionOrigin: mocks.verifyOrigin }));
vi.mock("@/lib/admin/service", () => ({ createAdminServiceClient: mocks.createClient }));
vi.mock("@/lib/admin/audit", () => ({ writeAuditLog: mocks.audit }));
vi.mock("@/lib/admin/bio-editor", () => ({ parseBioEditorSnapshot: mocks.parse }));
vi.mock("@/lib/admin/music-editor", () => ({ parseMusicEditorSnapshot: mocks.parse }));
vi.mock("@/lib/admin/gallery-editor", () => ({ parseGalleryEditorSnapshot: mocks.parse }));
vi.mock("@/lib/admin/navbar-social-links-editor", () => ({ parseNavbarSocialLinksSnapshot: mocks.parse }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (url: string): never => { throw new Error(url); } }));

function form(values: Record<string, string>) {
  const result = new FormData();
  for (const [key, value] of Object.entries(values)) result.set(key, value);
  return result;
}
const VERSION = "2026-09-21T10:00:00.000Z";
const hero = { title: "Opening", mediaType: "image", backgroundSrc: "/images/hero.jpg", sortOrder: "0" };
const cases: Array<{ label: string; action: (form: FormData) => Promise<void>; values: Record<string, string>; route: string }> = [
  { label: "Bio hero", action: actions.updatePageHero, values: { ...hero, pageSlug: "bio" }, route: "pages/bio" },
  { label: "Bio introduction", action: actions.updateBioProfile, values: { topLabel: "Bio" }, route: "pages/bio" },
  { label: "Bio portrait", action: actions.saveBioGalleryImage, values: { id: "portrait", src: "/images/bio.jpg", sortOrder: "0" }, route: "pages/bio" },
  { label: "Bio paragraph", action: actions.saveBioParagraph, values: { id: "paragraph", body: "Text", revealDelay: "0", sortOrder: "0" }, route: "pages/bio" },
  { label: "Bio bulk paragraphs", action: actions.saveBioParagraphs, values: { paragraphsJson: "[]" }, route: "pages/bio" },
  { label: "Actor resume", action: actions.updateActorResume, values: {}, route: "pages/bio" },
  { label: "Actor credit", action: actions.saveActorCredit, values: { id: "credit", title: "Film", creditType: "other", sortOrder: "0" }, route: "pages/bio" },
  { label: "Bio portrait delete", action: actions.deleteBioGalleryImage, values: { id: "portrait" }, route: "pages/bio" },
  { label: "Bio paragraph delete", action: actions.deleteBioParagraph, values: { id: "paragraph" }, route: "pages/bio" },
  { label: "Actor credit delete", action: actions.deleteActorCredit, values: { id: "credit" }, route: "pages/bio" },
  { label: "Music hero", action: actions.updatePageHero, values: { ...hero, pageSlug: "music" }, route: "pages/music" },
  { label: "Spotify settings", action: actions.updateMusicSettings, values: {}, route: "pages/music" },
  { label: "Music platform", action: actions.saveMusicPlatformLink, values: { id: "platform", title: "Music", href: "https://example.com", sortOrder: "0" }, route: "pages/music" },
  { label: "SoundCloud track", action: actions.saveSoundcloudTrack, values: { id: "track", embedUrl: "https://w.soundcloud.com/player", sortOrder: "0" }, route: "pages/music" },
  { label: "Music platform delete", action: actions.deleteMusicPlatformLink, values: { id: "platform" }, route: "pages/music" },
  { label: "SoundCloud track delete", action: actions.deleteSoundcloudTrack, values: { id: "track" }, route: "pages/music" },
  { label: "Gallery hero", action: actions.updatePageHero, values: { ...hero, pageSlug: "gallery" }, route: "pages/gallery" },
  { label: "Gallery image", action: actions.saveGalleryImage, values: { id: "image", title: "Photo", src: "/images/gallery.jpg", sortOrder: "0" }, route: "pages/gallery" },
  { label: "Gallery delete", action: actions.deleteGalleryImage, values: { id: "image" }, route: "pages/gallery" },
  { label: "Social link", action: actions.saveSocialLink, values: { id: "social", platform: "spotify", label: "Spotify", href: "https://open.spotify.com/artist/example", sortOrder: "0" }, route: "navigation" },
  { label: "Social delete", action: actions.deleteSocialLink, values: { id: "social" }, route: "navigation" },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verifyOrigin.mockResolvedValue(true);
});

describe.each(cases)("classic $label respects V2 ownership", ({ action, values, route }) => {
  it.each([
    { response: { data: "valid", error: null }, destination: `/admin/v2/${route}?from=classic` },
    { response: { data: null, error: null }, destination: "status=v2-unavailable" },
    { response: { data: null, error: { code: "42501", message: "permission denied" } }, destination: "status=v2-unavailable" },
  ])("never writes through a migrated or unverified editor", async ({ response, destination }) => {
    const from = vi.fn();
    mocks.createClient.mockReturnValue({ rpc: vi.fn(async () => response), from });
    await expect(action(form(values))).rejects.toThrow(destination);
    expect(from).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});

describe("pre-migration classic write", () => {
  it("still saves a Bio introduction when its snapshot RPC is definitely absent", async () => {
    const upsert = vi.fn(async () => ({ error: null }));
    mocks.createClient.mockReturnValue({
      rpc: vi.fn(async () => ({ error: { code: "PGRST202" } })),
      from: vi.fn(() => ({ upsert })),
    });
    await expect(actions.updateBioProfile(form({ introText: "Legacy biography" }))).rejects.toThrow("status=saved-bio");
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ intro_text: "Legacy biography" }));
  });
});

const settingsCases: Array<{ label: string; action: (data: FormData) => Promise<void>; values: Record<string, string>; status: string }> = [
  { label: "identity", action: actions.updateBrandIdentitySettings, values: { portfolioType: "musician", artistName: "Artist" }, status: "saved-brand-settings" },
  { label: "fonts", action: actions.updateTypographySettings, values: { displayFont: "playfair-display", bodyFont: "inter", uiFont: "manrope" }, status: "saved-typography-settings" },
  { label: "footer", action: actions.updateFooterEffectSettings, values: { footerEffect: "soul" }, status: "saved-footer-effect-settings" },
];
describe.each(settingsCases)("classic $label compare-and-swap", ({ action, values, status }) => {
  function client(data: unknown) {
    const query = { update: vi.fn(), eq: vi.fn(), select: vi.fn(), maybeSingle: vi.fn(async () => ({ data, error: null })) };
    query.update.mockReturnValue(query); query.eq.mockReturnValue(query); query.select.mockReturnValue(query);
    const from = vi.fn(() => query);
    mocks.createClient.mockReturnValue({ from });
    return { from, query };
  }
  it("requires a loaded version; old browser forms cannot overwrite newer V2 settings", async () => {
    const { from } = client({ id: "main" });
    await expect(action(form(values))).rejects.toThrow("settings-write-conflict");
    expect(from).not.toHaveBeenCalled();
  });
  it("uses the original exact timestamp and reports conflicts without auditing a save", async () => {
    const { query } = client(null);
    await expect(action(form({ ...values, expectedUpdatedAt: VERSION }))).rejects.toThrow("settings-write-conflict");
    expect(query.eq).toHaveBeenCalledWith("updated_at", VERSION);
    expect(mocks.audit).not.toHaveBeenCalled();
  });
  it("saves only when its timestamp matches the current row", async () => {
    const { query } = client({ id: "main" });
    await expect(action(form({ ...values, expectedUpdatedAt: VERSION }))).rejects.toThrow(`status=${status}`);
    expect(query.eq).toHaveBeenCalledWith("updated_at", VERSION);
    expect(mocks.audit).toHaveBeenCalledOnce();
  });
});
