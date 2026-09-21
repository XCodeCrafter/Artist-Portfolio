import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getHeroSaveCall, isMissingHeroFramingSchemaError, loadHeroEditorSnapshot } from "@/lib/admin/hero-framing";
import { getDefaultHeroFraming } from "@/lib/content/hero-framing";
import { saveHomeSectionV2 } from "@/app/admin/v2/pages/home/actions";
import { saveBioSectionV2 } from "@/app/admin/v2/pages/bio/actions";
import { saveMusicSectionV2 } from "@/app/admin/v2/pages/music/actions";
import { saveGallerySectionV2 } from "@/app/admin/v2/pages/gallery/actions";
import { saveShowreelSectionV2 } from "@/app/admin/v2/pages/showreel/actions";
import { saveContactSectionV2 } from "@/app/admin/v2/pages/contact/actions";
import { INITIAL_HOME_SAVE_STATE } from "@/lib/admin/home-editor";
import { INITIAL_BIO_SAVE_STATE } from "@/lib/admin/bio-editor";
import { INITIAL_MUSIC_SAVE_STATE } from "@/lib/admin/music-editor";
import { INITIAL_GALLERY_SAVE_STATE } from "@/lib/admin/gallery-editor";
import { INITIAL_SHOWREEL_SAVE_STATE } from "@/lib/admin/showreel-editor";
import { INITIAL_CONTACT_SAVE_STATE } from "@/lib/admin/contact-editor";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), origin: vi.fn(), service: vi.fn(), audit: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/admin/auth", () => ({ requireAdmin: mocks.auth }));
vi.mock("@/lib/admin/action-security", () => ({ verifyAdminActionOrigin: mocks.origin }));
vi.mock("@/lib/admin/service", () => ({ createAdminServiceClient: mocks.service, hasAdminServiceEnv: () => true }));
vi.mock("@/lib/admin/audit", () => ({ writeAuditLog: mocks.audit }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));

const framing = getDefaultHeroFraming("image");
const hero = { title: "Artist", subtitle: "Musician and actor", ctaLabel: "Explore", ctaHref: "#work", backgroundSrc: "/images/hero.jpg", posterSrc: "", mediaType: "image" };
const versions = { updatedAt: "2026-09-21T12:00:00.123456Z" };
const nextVersions = { updatedAt: "2026-09-21T12:00:01.654321Z" };
const pages = ["home", "bio", "music", "gallery", "video", "booking"] as const;
const cases = [
  { page: "home", legacy: "save_home_section_v2", run: (form: FormData) => saveHomeSectionV2(INITIAL_HOME_SAVE_STATE, form) },
  { page: "bio", legacy: "save_bio_hero_v2", run: (form: FormData) => saveBioSectionV2(INITIAL_BIO_SAVE_STATE, form) },
  { page: "music", legacy: "save_music_hero_v2", run: (form: FormData) => saveMusicSectionV2(INITIAL_MUSIC_SAVE_STATE, form) },
  { page: "gallery", legacy: "save_gallery_hero_v2", run: (form: FormData) => saveGallerySectionV2(INITIAL_GALLERY_SAVE_STATE, form) },
  { page: "video", legacy: "save_showreel_hero_v2", run: (form: FormData) => saveShowreelSectionV2(INITIAL_SHOWREEL_SAVE_STATE, form) },
  { page: "booking", legacy: "save_contact_hero_v2", run: (form: FormData) => saveContactSectionV2(INITIAL_CONTACT_SAVE_STATE, form) },
] as const;
function form(payload: unknown) {
  const value = new FormData(); value.set("section", "hero"); value.set("payload", JSON.stringify(payload)); value.set("versions", JSON.stringify(versions)); return value;
}
function clientFor(response: unknown) {
  const abortSignal = vi.fn().mockResolvedValue(response);
  const rpc = vi.fn(() => ({ abortSignal }));
  return { client: { rpc } as unknown as SupabaseClient, rpc, abortSignal };
}
beforeEach(() => { vi.clearAllMocks(); mocks.auth.mockResolvedValue({ id: "admin-id" }); mocks.origin.mockResolvedValue(true); mocks.audit.mockResolvedValue({ ok: true }); });

describe("additive Hero framing snapshot bridge", () => {
  it.each(pages)("loads %s framing from its authorized, time-bounded snapshot", async page => {
    const data = page === "home" ? { draft: { hero: { ...hero, framing } } } : { hero: { ...hero, framing } };
    const response = { data, error: null }; const test = clientFor(response);
    expect(await loadHeroEditorSnapshot(test.client, page, "legacy_snapshot")).toBe(response);
    expect(test.rpc).toHaveBeenCalledExactlyOnceWith("get_hero_editor_with_framing_v2", { p_page: page, p_site_id: "main" });
    expect(test.abortSignal).toHaveBeenCalledExactlyOnceWith(expect.any(AbortSignal));
  });
  it("accepts explicit null to retain the original public rendering", async () => {
    const response = { data: { hero: { framing: null } }, error: null }; const test = clientFor(response);
    expect(await loadHeroEditorSnapshot(test.client, "bio", "legacy_snapshot")).toBe(response);
  });
  it.each(["PGRST202", "42883"])("falls back only for the missing additive RPC (%s)", async code => {
    const data = { hero }; const legacy = { data, error: null };
    const rpc = vi.fn((name: string) => name === "get_hero_editor_with_framing_v2"
      ? { abortSignal: vi.fn().mockResolvedValue({ data: null, error: { code, message: "function public.get_hero_editor_with_framing_v2 does not exist" } }) }
      : { abortSignal: vi.fn().mockResolvedValue(legacy) });
    expect(await loadHeroEditorSnapshot({ rpc } as unknown as SupabaseClient, "bio", "get_bio_page_v2_snapshot")).toBe(legacy);
    expect(rpc).toHaveBeenCalledTimes(2); expect(rpc).toHaveBeenLastCalledWith("get_bio_page_v2_snapshot", { p_site_id: "main" });
  });
  it.each([
    { code: "42501", message: "permission denied" },
    { code: "57014", message: "timeout" },
    { code: "42883", message: "function public.unrelated_rpc does not exist" },
    { code: "PGRST202", message: "unrelated missing RPC" },
    { code: "23503", message: "bio_page_snapshot_missing" },
  ])("never loses an existing crop by falling back after another read failure", async error => {
    const response = { data: null, error }; const test = clientFor(response);
    expect(await loadHeroEditorSnapshot(test.client, "bio", "legacy_snapshot")).toBe(response); expect(test.rpc).toHaveBeenCalledTimes(1);
  });
  it("turns a rejected read into a private failed state without falling back", async () => {
    const test = clientFor(null); test.abortSignal.mockRejectedValueOnce(new Error("private connection string"));
    const response = await loadHeroEditorSnapshot(test.client, "bio", "legacy_snapshot");
    expect(response).toMatchObject({ data: null, error: { code: "HERO_FRAMING_SNAPSHOT_UNAVAILABLE" } }); expect(JSON.stringify(response)).not.toContain("private connection string"); expect(test.rpc).toHaveBeenCalledTimes(1);
  });
  it.each([undefined, {}, { hero }, { hero: null }, { hero: { framing: undefined } }, { hero: { framing: { ...framing, mobile: { ...framing.mobile, zoom: 9 } } } }, { hero: { framing: { ...framing, extra: true } } }])("fails closed for an incomplete additive snapshot", async data => {
    const test = clientFor({ data, error: null });
    expect(await loadHeroEditorSnapshot(test.client, "bio", "legacy_snapshot")).toMatchObject({ data: null, error: { code: "INVALID_HERO_FRAMING_SNAPSHOT" } }); expect(test.rpc).toHaveBeenCalledTimes(1);
  });
  it("requires the HOME framing inside its nested draft, not a sibling hero", async () => {
    const test = clientFor({ data: { hero: { framing } }, error: null });
    expect(await loadHeroEditorSnapshot(test.client, "home", "legacy_snapshot")).toMatchObject({ error: { code: "INVALID_HERO_FRAMING_SNAPSHOT" } });
  });
});

describe("Hero framing write routing", () => {
  it.each(pages)("routes explicit %s framing with only the common CAS arguments", page => {
    const args = { p_site_id: "main", p_section: "hero", p_expected_updated_at: versions.updatedAt, p_payload: { ...hero, framing } };
    expect(getHeroSaveCall(page, "hero", "legacy", args)).toEqual({ name: "save_hero_with_framing_v2", args: { p_page: page, p_site_id: "main", p_expected_updated_at: versions.updatedAt, p_payload: args.p_payload } });
  });
  it("keeps old clients and unrelated sections on their original RPC", () => {
    const args = { p_payload: hero }; expect(getHeroSaveCall("bio", "hero", "legacy", args)).toEqual({ name: "legacy", args });
    const other = { p_payload: { framing } }; expect(getHeroSaveCall("home", "layout", "legacy", other)).toEqual({ name: "legacy", args: other });
  });
  it.each([null, undefined, { code: "23514", message: "save_hero_with_framing_v2 invalid" }, { code: "42883", message: "unrelated function" }])("does not mislabel unrelated failures as migration 0046", error => { expect(isMissingHeroFramingSchemaError(error)).toBe(false); });
});

describe.each(cases)("$page Hero framing server action", ({ page, legacy, run }) => {
  it.each([framing, null])("saves the configured frame or explicit reset through the atomic wrapper", async crop => {
    const payload = { ...hero, framing: crop }; const rpc = vi.fn().mockResolvedValue({ data: { canonicalSection: payload, versions: nextVersions }, error: null }); mocks.service.mockReturnValue({ rpc });
    expect(await run(form(payload))).toMatchObject({ status: "saved", canonicalSection: payload, versions: nextVersions });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("save_hero_with_framing_v2", { p_page: page, p_site_id: "main", p_expected_updated_at: versions.updatedAt, p_payload: payload });
    expect(mocks.audit).toHaveBeenCalledTimes(1); expect(mocks.revalidate).toHaveBeenCalled();
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain("framing");
  });
  it("does not switch a legacy Hero draft to the new write API", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { canonicalSection: hero, versions: nextVersions }, error: null }); mocks.service.mockReturnValue({ rpc });
    expect(await run(form(hero))).toMatchObject({ status: "saved", canonicalSection: hero });
    expect(rpc).toHaveBeenCalledExactlyOnceWith(legacy, expect.objectContaining({ p_payload: hero, p_expected_updated_at: versions.updatedAt }));
  });
  it.each([
    { ...framing, desktop: { ...framing.desktop, zoom: 3.01 } },
    { ...framing, mobile: { ...framing.mobile, x: -1 } },
    { ...framing, mobile: { ...framing.mobile, y: 101 } },
    { ...framing, mobile: { ...framing.mobile, fit: "fill" } },
    { ...framing, desktop: { ...framing.desktop, x: "0;position:fixed" } },
    { ...framing, extra: true },
  ])("rejects invalid framing before database access", async crop => {
    expect(await run(form({ ...hero, framing: crop }))).toMatchObject({ status: "invalid", section: "hero" }); expect(mocks.service).not.toHaveBeenCalled(); expect(mocks.audit).not.toHaveBeenCalled();
  });
  it("authenticates and rejects cross-origin writes before creating a service client", async () => {
    mocks.auth.mockRejectedValueOnce(new Error("unauthorized")); await expect(run(form({ ...hero, framing }))).rejects.toThrow("unauthorized"); expect(mocks.service).not.toHaveBeenCalled();
    mocks.origin.mockResolvedValueOnce(false); expect(await run(form({ ...hero, framing }))).toMatchObject({ status: "security-error" }); expect(mocks.service).not.toHaveBeenCalled();
  });
  it("asks for 0046 without falling back to a write that could drop the crop", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "PGRST202", message: "Could not find save_hero_with_framing_v2 in schema cache" } }); mocks.service.mockReturnValue({ rpc });
    const result = await run(form({ ...hero, framing })); expect(result).toMatchObject({ status: "migration-required", section: "hero" }); expect(result.message).toContain("0046"); expect(rpc).toHaveBeenCalledTimes(1); expect(mocks.audit).not.toHaveBeenCalled(); expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("keeps the draft after an exact-version conflict without publication or retry", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "40001", message: "hero changed" } }); mocks.service.mockReturnValue({ rpc });
    expect(await run(form({ ...hero, framing }))).toMatchObject({ status: "conflict" }); expect(rpc).toHaveBeenCalledTimes(1); expect(mocks.audit).not.toHaveBeenCalled(); expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("does not retry an ambiguous transport failure on the legacy save endpoint", async () => {
    const rpc = vi.fn().mockRejectedValue(new Error("connection interrupted")); mocks.service.mockReturnValue({ rpc });
    await expect(run(form({ ...hero, framing }))).rejects.toThrow("connection interrupted"); expect(rpc).toHaveBeenCalledTimes(1); expect(mocks.audit).not.toHaveBeenCalled(); expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});
