import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveSiteSharingV2 } from "@/app/admin/v2/settings/sharing/actions";
import { DEFAULT_SHARING_METADATA } from "@/lib/content/site-sharing";
import { INITIAL_SHARING_SAVE_STATE } from "@/lib/admin/site-sharing-editor";
const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), origin: vi.fn(), client: vi.fn(), audit: vi.fn(), revalidate: vi.fn(), rpc: vi.fn(), abort: vi.fn() }));
vi.mock("@/lib/admin/auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/admin/action-security", () => ({ verifyAdminActionOrigin: mocks.origin }));
vi.mock("@/lib/admin/service", () => ({ createAdminServiceClient: mocks.client }));
vi.mock("@/lib/admin/audit", () => ({ writeAuditLog: mocks.audit }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
const versions = { updatedAt: "2026-09-29T10:00:00.123456+00:00" };
const nextVersions = { updatedAt: "2026-09-29T10:00:01.123456+00:00" };
function form(payload: unknown = DEFAULT_SHARING_METADATA, version: unknown = versions) {
  const data = new FormData(); data.set("payload", JSON.stringify(payload)); data.set("versions", JSON.stringify(version)); return data;
}
const save = (data = form()) => saveSiteSharingV2(INITIAL_SHARING_SAVE_STATE, data);
beforeEach(() => {
  vi.clearAllMocks(); mocks.requireAdmin.mockResolvedValue({ id: "admin-1" }); mocks.origin.mockResolvedValue(true);
  mocks.client.mockReturnValue({ rpc: mocks.rpc }); mocks.audit.mockResolvedValue({ ok: true });
  mocks.rpc.mockReturnValue({ abortSignal: mocks.abort });
  mocks.abort.mockResolvedValue({ data: { canonical: DEFAULT_SHARING_METADATA, versions: nextVersions }, error: null });
});
describe("Sharing settings save boundary", () => {
  it("authenticates before parsing and client creation", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("unauthorized")); await expect(save(new FormData())).rejects.toThrow("unauthorized");
    expect(mocks.client).not.toHaveBeenCalled(); expect(mocks.origin).not.toHaveBeenCalled();
  });
  it("rejects ambiguous, malformed, oversized and invalid contracts before database access", async () => {
    const duplicate = form(); duplicate.append("payload", "{}");
    const malformed = form(); malformed.set("versions", "{");
    const oversized = form(); oversized.set("payload", "x".repeat(12_001));
    for (const data of [duplicate, malformed, oversized, form(null), form({ ...DEFAULT_SHARING_METADATA, extra: true }), form(DEFAULT_SHARING_METADATA, { updatedAt: "bad" })]) expect((await save(data)).status).toBe("invalid");
    expect(mocks.client).not.toHaveBeenCalled(); expect(mocks.origin).not.toHaveBeenCalled();
  });
  it("requires same-origin verified admin action before service access", async () => {
    mocks.origin.mockResolvedValue(false); expect((await save()).status).toBe("security-error");
    expect(mocks.origin).toHaveBeenCalledWith("admin-1", "site-sharing-v2:main"); expect(mocks.client).not.toHaveBeenCalled();
  });
  it("does not write without service configuration", async () => {
    mocks.client.mockReturnValue(null); expect((await save()).status).toBe("missing-service"); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each([[{ code: "40001" }, "conflict"], [{ code: "PGRST202", message: "save_site_sharing_v2" }, "migration-required"],
    [{ code: "22023" }, "invalid"], [{ code: "23514" }, "invalid"], [{ code: "XX000" }, "error"]])("classifies database error safely", async (error, status) => {
    vi.spyOn(console, "error").mockImplementation(() => {}); mocks.abort.mockResolvedValue({ data: null, error });
    expect((await save()).status).toBe(status); expect(mocks.audit).not.toHaveBeenCalled(); expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("treats transport loss as unknown outcome and never retries", async () => {
    mocks.abort.mockRejectedValue(new Error("network")); const result = await save();
    expect(result.status).toBe("error"); expect(result.message).toContain("may have saved"); expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.audit).not.toHaveBeenCalled();
  });
  it.each([null, {}, { canonical: DEFAULT_SHARING_METADATA, versions }])("refuses unconfirmed or unchanged canonical responses", async data => {
    mocks.abort.mockResolvedValue({ data, error: null }); expect((await save()).status).toBe("error"); expect(mocks.audit).not.toHaveBeenCalled();
  });
  it("sends exact CAS and returns canonical owner content after auditing metadata only", async () => {
    const result = await save(); expect(result).toMatchObject({ status: "saved", canonical: DEFAULT_SHARING_METADATA, versions: nextVersions });
    expect(mocks.rpc).toHaveBeenCalledWith("save_site_sharing_v2", { p_site_id: "main", p_expected_updated_at: versions.updatedAt, p_payload: DEFAULT_SHARING_METADATA });
    expect(mocks.audit).toHaveBeenCalledWith({ actorId: "admin-1", action: "site_sharing_v2_save", tableName: "site_sharing_config", recordId: "main", metadata: { customImage: false } });
    expect(mocks.revalidate).toHaveBeenCalledWith("/", "layout"); expect(mocks.revalidate).toHaveBeenCalledWith("/opengraph-image");
  });
  it("retains a confirmed write and new CAS if post-save audit/cache refresh fails", async () => {
    mocks.audit.mockRejectedValue(new Error("audit")); mocks.revalidate.mockImplementation(() => { throw new Error("cache"); });
    expect(await save()).toMatchObject({ status: "saved", versions: nextVersions, message: expect.stringContaining("cache") });
  });
});
