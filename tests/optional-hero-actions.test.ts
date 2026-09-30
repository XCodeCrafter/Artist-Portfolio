import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveHomeSectionV2 } from "@/app/admin/v2/pages/home/actions";
import { saveBioSectionV2 } from "@/app/admin/v2/pages/bio/actions";
import { saveGallerySectionV2 } from "@/app/admin/v2/pages/gallery/actions";
import { saveMusicSectionV2 } from "@/app/admin/v2/pages/music/actions";
import { saveShowreelSectionV2 } from "@/app/admin/v2/pages/showreel/actions";
import { saveContactSectionV2 } from "@/app/admin/v2/pages/contact/actions";

const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), origin: vi.fn(), service: vi.fn(), audit: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/admin/auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/admin/action-security", () => ({ verifyAdminActionOrigin: mocks.origin }));
vi.mock("@/lib/admin/service", () => ({ createAdminServiceClient: mocks.service, hasAdminServiceEnv: () => true }));
vi.mock("@/lib/admin/audit", () => ({ writeAuditLog: mocks.audit }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));

const oldVersion = "2026-09-30T10:00:00.000001Z";
const versions = { updatedAt: "2026-09-30T10:00:00.000002Z" };
const hero = { title: "", subtitle: "Supporting text", ctaLabel: "View", ctaHref: "#work", backgroundSrc: "/images/hero.jpg", posterSrc: "", mediaType: "image" };
const initial = { status: "idle" as const, message: "", eventId: "" };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireAdmin.mockResolvedValue({ id: "admin-id" });
  mocks.origin.mockResolvedValue(true);
  mocks.audit.mockResolvedValue({ ok: true });
});

describe("Saving optional hero headings", () => {
  it.each([
    ["Home", saveHomeSectionV2, "save_home_section_v2"],
    ["Bio", saveBioSectionV2, "save_bio_hero_v2"],
    ["Gallery", saveGallerySectionV2, "save_gallery_hero_v2"],
    ["Music", saveMusicSectionV2, "save_music_hero_v2"],
    ["Showreel", saveShowreelSectionV2, "save_showreel_hero_v2"],
    ["Contact", saveContactSectionV2, "save_contact_hero_v2"],
  ] as const)("%s sends one exact-version write and accepts its empty canonical title", async (_page, save, rpcName) => {
    const response = { data: { canonicalSection: hero, versions }, error: null };
    const rpc = vi.fn(() => Object.assign(Promise.resolve(response), { abortSignal: vi.fn().mockResolvedValue(response) }));
    mocks.service.mockReturnValue({ rpc });
    const form = new FormData();
    form.set("section", "hero");
    form.set("payload", JSON.stringify({ ...hero, title: " \t\n " }));
    form.set("versions", JSON.stringify({ updatedAt: oldVersion }));
    expect(await save(initial, form)).toMatchObject({ status: "saved", section: "hero", canonicalSection: hero, versions });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith(rpcName, expect.objectContaining({ p_payload: hero, p_expected_updated_at: oldVersion }));
    expect(mocks.requireAdmin).toHaveBeenCalled();
    expect(mocks.origin).toHaveBeenCalled();
    expect(mocks.audit).toHaveBeenCalledTimes(1);
  });
});
