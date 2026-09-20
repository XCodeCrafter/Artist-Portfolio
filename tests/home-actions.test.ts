import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveHomeSectionV2 } from "@/app/admin/v2/pages/home/actions";
import { HOME_EDITOR_SECTIONS, INITIAL_HOME_SAVE_STATE, createFallbackHomeEditorSnapshot } from "@/lib/admin/home-editor";

const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), origin: vi.fn(), service: vi.fn(), audit: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/admin/auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/admin/action-security", () => ({ verifyAdminActionOrigin: mocks.origin }));
vi.mock("@/lib/admin/service", () => ({ createAdminServiceClient: mocks.service, hasAdminServiceEnv: () => true }));
vi.mock("@/lib/admin/audit", () => ({ writeAuditLog: mocks.audit }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));

const draft = createFallbackHomeEditorSnapshot().draft;
const versions = { updatedAt: "2026-09-20T10:00:00.000Z" };
const nextVersions = { updatedAt: "2026-09-20T10:00:01.000Z" };
function form(section: string, payload: unknown) {
  const data = new FormData();
  data.set("section", section); data.set("payload", JSON.stringify(payload)); data.set("versions", JSON.stringify(versions));
  return data;
}
beforeEach(() => { vi.clearAllMocks(); mocks.requireAdmin.mockResolvedValue({ id: "admin-id" }); mocks.origin.mockResolvedValue(true); });
describe("Home V2 server action", () => {
  it("authenticates before parsing and rejects untrusted origins before opening admin access", async () => {
    mocks.requireAdmin.mockRejectedValueOnce(new Error("unauthorized"));
    await expect(saveHomeSectionV2(INITIAL_HOME_SAVE_STATE, new FormData())).rejects.toThrow("unauthorized");
    expect(mocks.service).not.toHaveBeenCalled();
    mocks.origin.mockResolvedValueOnce(false);
    expect(await saveHomeSectionV2(INITIAL_HOME_SAVE_STATE, form("layout", draft.layout))).toMatchObject({ status: "security-error" });
    expect(mocks.service).not.toHaveBeenCalled();
  });
  it("rejects invalid nested content without database access", async () => {
    expect(await saveHomeSectionV2(INITIAL_HOME_SAVE_STATE, form("stories", { ...draft.stories, images: [] }))).toMatchObject({ status: "invalid" });
    expect(mocks.service).not.toHaveBeenCalled();
  });
  it.each(HOME_EDITOR_SECTIONS)("saves only %s with the global exact version and uses the canonical database response", async (section) => {
    const rpc = vi.fn().mockResolvedValue({ data: { canonicalSection: draft[section], versions: nextVersions }, error: null });
    mocks.service.mockReturnValue({ rpc });
    expect(await saveHomeSectionV2(INITIAL_HOME_SAVE_STATE, form(section, draft[section]))).toMatchObject({ status: "saved", section, canonicalSection: draft[section], versions: nextVersions });
    expect(rpc).toHaveBeenCalledWith("save_home_section_v2", { p_site_id: "main", p_section: section, p_expected_updated_at: versions.updatedAt, p_payload: draft[section] });
    expect(mocks.revalidate).toHaveBeenCalledWith("/");
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ tableName: "home_page_config", metadata: { section } }));
  });
  it.each([
    [{ code: "40001", message: "home_page_changed" }, "conflict"],
    [{ code: "PGRST202", message: "Could not find save_home_section_v2 in schema cache" }, "migration-required"],
    [{ code: "22023", message: "invalid_home_media_source" }, "invalid"],
  ])("preserves the draft after rejected publication %#", async (error, status) => {
    mocks.service.mockReturnValue({ rpc: vi.fn().mockResolvedValue({ data: null, error }) });
    expect(await saveHomeSectionV2(INITIAL_HOME_SAVE_STATE, form("about", draft.about))).toMatchObject({ status });
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("does not claim success when the canonical save response is malformed", async () => {
    mocks.service.mockReturnValue({ rpc: vi.fn().mockResolvedValue({ data: { versions: nextVersions }, error: null }) });
    expect(await saveHomeSectionV2(INITIAL_HOME_SAVE_STATE, form("cnc", draft.cnc))).toMatchObject({ status: "error" });
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});
