import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPhotoSaveCall, isMissingPhotoFramingSchemaError, loadPhotoEditorSnapshot, reloadPhotoArchiveSection } from "@/lib/admin/photo-framing";
import { loadPublicPhotoFramings } from "@/lib/content/photo-framing.server";
import { getDefaultHeroFraming } from "@/lib/content/hero-framing";
import * as home from "@/lib/admin/home-editor";
import * as bio from "@/lib/admin/bio-editor";
import * as music from "@/lib/admin/music-editor";
import * as gallery from "@/lib/admin/gallery-editor";
import * as showreel from "@/lib/admin/showreel-editor";
import { saveHomeSectionV2 } from "@/app/admin/v2/pages/home/actions";
import { saveBioSectionV2 } from "@/app/admin/v2/pages/bio/actions";
import { saveMusicSectionV2 } from "@/app/admin/v2/pages/music/actions";
import { saveGallerySectionV2 } from "@/app/admin/v2/pages/gallery/actions";
import { saveShowreelSectionV2 } from "@/app/admin/v2/pages/showreel/actions";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), origin: vi.fn(), service: vi.fn(), audit: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/admin/auth", () => ({ requireAdmin: mocks.auth }));
vi.mock("@/lib/admin/action-security", () => ({ verifyAdminActionOrigin: mocks.origin }));
vi.mock("@/lib/admin/service", () => ({ createAdminServiceClient: mocks.service, hasAdminServiceEnv: () => true }));
vi.mock("@/lib/admin/audit", () => ({ writeAuditLog: mocks.audit }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));

const framing = getDefaultHeroFraming("image");
const pages = ["home", "bio", "music", "gallery", "video"] as const;
function clientFor(response: unknown) {
  const abortSignal = vi.fn().mockResolvedValue(response);
  const rpc = vi.fn(() => ({ abortSignal }));
  return { client: { rpc } as unknown as SupabaseClient, rpc, abortSignal };
}
function snapshot(page: typeof pages[number], value: unknown = framing) {
  const hero = { framing: null };
  const sections = page === "home" ? { hero, about: { framing: value }, feature: { posterFraming: value }, stories: { images: [{ framing: value }] } }
    : page === "bio" ? { hero, biography: { galleryImages: [{ framing: value }] } }
      : page === "music" ? { hero, platforms: [{ framing: value }] }
        : page === "gallery" ? { hero, frames: { items: [{ framing: value }] } }
          : { hero, works: { items: [{ framing: value }] } };
  return { ...(page === "home" ? { draft: sections } : sections), photoFramingAvailable: true };
}
beforeEach(() => { vi.clearAllMocks(); mocks.auth.mockResolvedValue({ id: "fixture-admin" }); mocks.origin.mockResolvedValue(true); mocks.audit.mockResolvedValue({ ok: true }); });

describe("Photo framing additive snapshot admission", () => {
  it.each(pages)("reads %s through the time-bounded additive RPC", async page => {
    const response = { data: snapshot(page), error: null }; const test = clientFor(response);
    expect(await loadPhotoEditorSnapshot(test.client, page, "legacy_snapshot")).toBe(response);
    expect(test.rpc).toHaveBeenCalledExactlyOnceWith("get_photo_editor_with_framing_v2", { p_page: page, p_site_id: "main" });
    expect(test.abortSignal).toHaveBeenCalledExactlyOnceWith(expect.any(AbortSignal));
  });
  it.each(pages)("accepts explicit original framing for %s", async page => {
    const response = { data: snapshot(page, null), error: null }; const test = clientFor(response);
    expect(await loadPhotoEditorSnapshot(test.client, page, "legacy_snapshot")).toBe(response);
  });
  it.each(["PGRST202", "42883"])("falls back to Hero snapshot only for an absent photo RPC (%s)", async code => {
    const legacy = { data: { hero: { framing: null } }, error: null };
    const rpc = vi.fn((name: string) => ({ abortSignal: vi.fn().mockResolvedValue(name === "get_photo_editor_with_framing_v2"
      ? { data: null, error: { code, message: "get_photo_editor_with_framing_v2 was not found" } } : legacy) }));
    expect(await loadPhotoEditorSnapshot({ rpc } as unknown as SupabaseClient, "bio", "legacy_snapshot")).toBe(legacy);
    expect(rpc.mock.calls.map(call => call[0])).toEqual(["get_photo_editor_with_framing_v2", "get_hero_editor_with_framing_v2"]);
  });
  it("leaves Booking on the existing Hero route", async () => {
    const response = { data: { hero: { framing: null } }, error: null }; const test = clientFor(response);
    expect(await loadPhotoEditorSnapshot(test.client, "booking", "legacy_booking")).toBe(response);
    expect(test.rpc).toHaveBeenCalledExactlyOnceWith("get_hero_editor_with_framing_v2", { p_page: "booking", p_site_id: "main" });
  });
  it.each([
    { code: "42501", message: "permission denied" }, { code: "57014", message: "timeout" },
    { code: "42883", message: "unrelated_function was not found" },
    { code: "PGRST202", message: "unrelated_function was not found" },
    { code: "23514", message: "get_photo_editor_with_framing_v2 failed constraints" },
  ])("does not silently strip crops after another database failure", async error => {
    const response = { data: null, error }; const test = clientFor(response);
    expect(await loadPhotoEditorSnapshot(test.client, "bio", "legacy_snapshot")).toBe(response);
    expect(test.rpc).toHaveBeenCalledTimes(1);
    expect(isMissingPhotoFramingSchemaError(error)).toBe(false);
  });
  it("redacts thrown transport details and never retries another read", async () => {
    const test = clientFor(null); test.abortSignal.mockRejectedValueOnce(new Error("private-provider-debug"));
    const result = await loadPhotoEditorSnapshot(test.client, "bio", "legacy_snapshot");
    expect(result).toMatchObject({ data: null, error: { code: "PHOTO_FRAMING_SNAPSHOT_UNAVAILABLE" } });
    expect(JSON.stringify(result)).not.toContain("private-provider-debug"); expect(test.rpc).toHaveBeenCalledTimes(1);
  });
  it.each(["save_photo_section_with_framing_v2", "get_public_photo_framings_v1"])("does not downgrade the editor when a different photo RPC is missing (%s)", name => {
    const response = { data: null, error: { code: "42883", message: `function public.${name} does not exist` } };
    const test = clientFor(response);
    return loadPhotoEditorSnapshot(test.client, "bio", "legacy_snapshot").then(result => {
      expect(result).toBe(response); expect(test.rpc).toHaveBeenCalledTimes(1);
    });
  });
  it.each(pages)("fails closed when %s returns an invalid promised photo crop", async page => {
    const test = clientFor({ data: snapshot(page, "invalid-crop"), error: null });
    expect(await loadPhotoEditorSnapshot(test.client, page, "legacy_snapshot")).toMatchObject({ error: { code: "INVALID_PHOTO_FRAMING_SNAPSHOT" } });
    expect(test.rpc).toHaveBeenCalledTimes(1);
  });
  it.each([false, undefined, "true"])("requires exact capability true, not %j", capability => {
    const test = clientFor({ data: { ...snapshot("bio"), photoFramingAvailable: capability }, error: null });
    return expect(loadPhotoEditorSnapshot(test.client, "bio", "legacy_snapshot")).resolves.toMatchObject({ error: { code: "INVALID_PHOTO_FRAMING_SNAPSHOT" } });
  });
  it.each(["bio", "music", "gallery", "video"] as const)("retains %s capability even with an empty collection", async page => {
    const data = page === "bio" ? { hero: { framing: null }, biography: { galleryImages: [] }, photoFramingAvailable: true }
      : page === "music" ? { hero: { framing: null }, platforms: [], photoFramingAvailable: true }
        : { hero: { framing: null }, [page === "gallery" ? "frames" : "works"]: { items: [] }, photoFramingAvailable: true };
    const response = { data, error: null }; const test = clientFor(response);
    expect(await loadPhotoEditorSnapshot(test.client, page, "legacy_snapshot")).toBe(response);
  });
});

describe("Photo crop write routing", () => {
  const original = { name: "legacy_save", args: { p_payload: { title: "Keep" }, p_expected_updated_at: "fixture" } };
  const versions = { items: { fixture: "2026-09-23T10:00:00Z" } };
  it.each([
    ["home", "about", { framing }], ["home", "feature", { posterFraming: framing }],
    ["home", "stories", { images: [{ framing }] }], ["bio", "biography", { galleryImages: [{ framing }] }],
    ["music", "platforms", { items: [{ framing }] }], ["gallery", "frames", { items: [{ framing }] }], ["video", "works", { items: [{ framing }] }],
  ] as const)("routes %s/%s atomically with the complete payload and CAS", (page, section, payload) => {
    expect(getPhotoSaveCall(page, section, payload, versions, original)).toEqual({ name: "save_photo_section_with_framing_v2", args: {
      p_page: page, p_section: section, p_site_id: "main", p_payload: payload, p_versions: versions,
    } });
  });
  it("routes an explicit null reset but not a missing field or unrelated section", () => {
    expect(getPhotoSaveCall("home", "about", { framing: null }, versions, original).name).toBe("save_photo_section_with_framing_v2");
    expect(getPhotoSaveCall("home", "about", {}, versions, original)).toBe(original);
    expect(getPhotoSaveCall("home", "layout", { framing }, versions, original)).toBe(original);
    expect(getPhotoSaveCall("gallery", "frames", { items: [] }, versions, original)).toBe(original);
  });
});

describe("Public photo framing read failures", () => {
  it("distinguishes an actually empty map from a missing migration", async () => {
    expect(await loadPublicPhotoFramings(clientFor({ data: {}, error: null }).client)).toEqual({});
    expect(await loadPublicPhotoFramings(clientFor({ data: null, error: { code: "PGRST202", message: "get_public_photo_framings_v1 is absent" } }).client)).toBeNull();
  });
  it.each([
    { code: "42501", message: "permission denied" }, { code: "57014", message: "timeout" },
    { code: "PGRST202", message: "unrelated_missing_rpc" },
  ])("does not invent an empty map after an unrelated error", async error => {
    await expect(loadPublicPhotoFramings(clientFor({ data: null, error }).client)).rejects.toThrow("Photo positioning could not be loaded");
  });
  it.each([null, [], { "home:about": { src: "/photo.jpg", framing: { desktop: framing.desktop } } }])("rejects malformed successful reads", async data => {
    await expect(loadPublicPhotoFramings(clientFor({ data, error: null }).client)).rejects.toThrow("Invalid photo positioning snapshot");
  });
});

function actionCases() {
  const h = home.createFallbackHomeEditorSnapshot(), b = bio.createFallbackBioEditorSnapshot(), m = music.createFallbackMusicEditorSnapshot(),
    g = gallery.createFallbackGalleryEditorSnapshot(), s = showreel.createFallbackShowreelEditorSnapshot();
  s.draft.works.items = [{ id: "showreel:fixture", title: "Fixture reel", description: "", embedUrl: "/media/reel.mp4", platform: "upload", thumbnailSrc: "/images/reel.jpg", videoType: "showreel", isFeatured: true, isPublished: true }];
  s.versions.works.items = { "showreel:fixture": "2026-09-23T10:00:00Z" };
  return [
    { page: "home", section: "about", payload: { ...h.draft.about, framing }, versions: h.versions, run: (form: FormData) => saveHomeSectionV2(home.INITIAL_HOME_SAVE_STATE, form) },
    { page: "bio", section: "biography", payload: { ...b.draft.biography, galleryImages: b.draft.biography.galleryImages.map(item => ({ ...item, framing })) }, versions: b.versions.biography, run: (form: FormData) => saveBioSectionV2(bio.INITIAL_BIO_SAVE_STATE, form) },
    { page: "music", section: "platforms", payload: { items: m.draft.platforms.items.map(item => ({ ...item, framing })) }, versions: m.versions.platforms, run: (form: FormData) => saveMusicSectionV2(music.INITIAL_MUSIC_SAVE_STATE, form) },
    { page: "gallery", section: "frames", payload: { items: g.draft.frames.items.map(item => ({ ...item, framing })) }, versions: g.versions.frames, run: (form: FormData) => saveGallerySectionV2(gallery.INITIAL_GALLERY_SAVE_STATE, form) },
    { page: "video", section: "works", payload: { items: s.draft.works.items.map(item => ({ ...item, framing })) }, versions: s.versions.works, run: (form: FormData) => saveShowreelSectionV2(showreel.INITIAL_SHOWREEL_SAVE_STATE, form) },
  ];
}
describe.each(actionCases())("$page photo framing server action", ({ page, section, payload, versions, run }) => {
  function form() { const data = new FormData(); data.set("section", section); data.set("payload", JSON.stringify(payload)); data.set("versions", JSON.stringify(versions)); return data; }
  it("authenticates and rejects a wrong origin before privileged database access", async () => {
    mocks.auth.mockRejectedValueOnce(new Error("unauthorized")); await expect(run(form())).rejects.toThrow("unauthorized");
    expect(mocks.service).not.toHaveBeenCalled();
    mocks.origin.mockResolvedValueOnce(false); expect(await run(form())).toMatchObject({ status: "security-error" });
    expect(mocks.service).not.toHaveBeenCalled();
  });
  it("uses a single atomic crop write and preserves the normal successful response", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { canonicalSection: payload, versions }, error: null }); mocks.service.mockReturnValue({ rpc });
    expect(await run(form())).toMatchObject({ status: "saved" });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("save_photo_section_with_framing_v2", expect.objectContaining({ p_page: page, p_section: section, p_versions: versions }));
  });
  it("does not retry a missing additive write using a crop-dropping legacy save", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "PGRST202", message: "save_photo_section_with_framing_v2 missing" } }); mocks.service.mockReturnValue({ rpc });
    const result = await run(form()); expect(result).toMatchObject({ status: "migration-required" }); expect(result.message).toContain("0051");
    expect(rpc).toHaveBeenCalledTimes(1); expect(mocks.audit).not.toHaveBeenCalled(); expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("does not retry ambiguous transport errors or publish a success", async () => {
    const rpc = vi.fn().mockRejectedValue(new Error("connection interrupted")); mocks.service.mockReturnValue({ rpc });
    await expect(run(form())).rejects.toThrow("connection interrupted");
    expect(rpc).toHaveBeenCalledTimes(1); expect(mocks.audit).not.toHaveBeenCalled(); expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});

function archiveCases() {
  const b = bio.createFallbackBioEditorSnapshot(), m = music.createFallbackMusicEditorSnapshot(), g = gallery.createFallbackGalleryEditorSnapshot(), s = showreel.createFallbackShowreelEditorSnapshot();
  const updatedAt = new Date(0).toISOString();
  const stamp = <T extends object>(items: T[]) => items.map(item => ({ ...item, updatedAt }));
  b.draft.biography.galleryImages = b.draft.biography.galleryImages.map(item => ({ ...item, framing }));
  m.draft.platforms.items = m.draft.platforms.items.map(item => ({ ...item, framing }));
  g.draft.frames.items = g.draft.frames.items.map(item => ({ ...item, framing }));
  s.draft.works.items = [{ id: "showreel:fixture", title: "Fixture reel", description: "", embedUrl: "/media/reel.mp4", platform: "upload", thumbnailSrc: "/images/reel.jpg", videoType: "showreel", isFeatured: true, isPublished: true, framing }];
  s.versions.works.items = { "showreel:fixture": updatedAt };
  return [
    { page: "bio" as const, section: "biography", versions: b.versions.biography, payload: b.draft.biography,
      data: { hero: { ...b.draft.hero, updatedAt }, biography: { ...b.draft.biography, profileUpdatedAt: updatedAt, galleryImages: stamp(b.draft.biography.galleryImages), paragraphs: stamp(b.draft.biography.paragraphs) }, resume: { ...b.draft.resume, updatedAt }, credits: stamp(b.draft.credits.items), footer: b.footer, hasResumeDetails: b.hasResumeDetails, photoFramingAvailable: true } },
    { page: "music" as const, section: "platforms", versions: m.versions.platforms, payload: m.draft.platforms,
      data: { hero: { ...m.draft.hero, updatedAt }, spotify: { ...m.draft.spotify, settingsUpdatedAt: updatedAt, presentationUpdatedAt: updatedAt }, platforms: stamp(m.draft.platforms.items), soundcloud: { mixesHeading: m.draft.soundcloud.mixesHeading, presentationUpdatedAt: updatedAt, tracks: stamp(m.draft.soundcloud.items) }, footer: m.footer, photoFramingAvailable: true } },
    { page: "gallery" as const, section: "frames", versions: g.versions.frames, payload: g.draft.frames,
      data: { hero: { ...g.draft.hero, updatedAt }, introduction: { ...g.draft.introduction, updatedAt }, frames: { items: stamp(g.draft.frames.items) }, footer: g.footer, photoFramingAvailable: true } },
    { page: "video" as const, section: "works", versions: s.versions.works, payload: s.draft.works,
      data: { hero: { ...s.draft.hero, updatedAt }, introduction: { ...s.draft.introduction, updatedAt }, works: { items: stamp(s.draft.works.items) }, footer: s.footer, photoFramingAvailable: true } },
  ];
}
function withoutFraming(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutFraming);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([key]) => key !== "framing").map(([key, item]) => [key, withoutFraming(item)]));
  return value;
}
function reverseKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseKeys);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reverseKeys(item)]));
  return value;
}
describe.each(archiveCases())("$page archive crop rehydration", ({ page, section, data, payload, versions }) => {
  const originalPayload = { legacyArchivePayload: true };
  it("rehydrates retained crops only against the exact canonical collection versions", async () => {
    const test = clientFor({ data, error: null });
    expect(await reloadPhotoArchiveSection(test.client, page, section, versions, originalPayload)).toEqual(payload);
    expect(test.rpc).toHaveBeenCalledExactlyOnceWith("get_photo_editor_with_framing_v2", { p_page: page, p_site_id: "main" });
    expect(test.abortSignal).toHaveBeenCalledExactlyOnceWith(expect.any(AbortSignal));
  });
  it("does not confuse object key ordering with a concurrent change", async () => {
    const test = clientFor({ data, error: null });
    expect(await reloadPhotoArchiveSection(test.client, page, section, reverseKeys(versions), originalPayload)).toEqual(payload);
  });
  it("requires reload after a concurrent version change", async () => {
    const test = clientFor({ data, error: null });
    expect(await reloadPhotoArchiveSection(test.client, page, section, {}, originalPayload)).toBeNull();
    expect(test.rpc).toHaveBeenCalledTimes(1);
  });
  it("requires reload when a successful snapshot drops a crop or capability", async () => {
    const missing = clientFor({ data: withoutFraming(data), error: null });
    expect(await reloadPhotoArchiveSection(missing.client, page, section, versions, originalPayload)).toBeNull();
    const old = clientFor({ data: { ...data, photoFramingAvailable: undefined }, error: null });
    expect(await reloadPhotoArchiveSection(old.client, page, section, versions, originalPayload)).toBeNull();
  });
  it.each(["PGRST202", "42883"])("returns original archive payload only before the additive RPC exists (%s)", async code => {
    const test = clientFor({ data: null, error: { code, message: "get_photo_editor_with_framing_v2 is absent" } });
    expect(await reloadPhotoArchiveSection(test.client, page, section, versions, originalPayload)).toBe(originalPayload);
    expect(test.rpc).toHaveBeenCalledTimes(1);
  });
  it.each([
    { code: "42501", message: "permission denied" }, { code: "57014", message: "timeout" },
    { code: "PGRST202", message: "unrelated missing RPC" },
    { code: "42883", message: "save_photo_section_with_framing_v2 does not exist" },
    { code: "42883", message: "get_public_photo_framings_v1 does not exist" },
  ])("does not return a crop-less archive result after another read failure", async error => {
    const test = clientFor({ data: null, error });
    expect(await reloadPhotoArchiveSection(test.client, page, section, versions, originalPayload)).toBeNull();
    expect(test.rpc).toHaveBeenCalledTimes(1);
  });
  it("fails closed and does not retry after a transport rejection", async () => {
    const test = clientFor(null); test.abortSignal.mockRejectedValueOnce(new Error("private-provider-debug"));
    expect(await reloadPhotoArchiveSection(test.client, page, section, versions, originalPayload)).toBeNull();
    expect(test.rpc).toHaveBeenCalledTimes(1);
  });
});
describe("Unrelated archive operations", () => {
  it.each([["bio", "credits"], ["music", "soundcloud"], ["home", "stories"], ["booking", "details"]] as const)("does not load framing for %s/%s", async (page, section) => {
    const test = clientFor(null); const payload = { retained: true };
    expect(await reloadPhotoArchiveSection(test.client, page, section, {}, payload)).toBe(payload);
    expect(test.rpc).not.toHaveBeenCalled();
  });
});
