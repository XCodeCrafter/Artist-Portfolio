import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
function rpcFor(response: unknown) {
  const abortSignal = vi.fn().mockResolvedValue(response);
  const rpc = vi.fn(() => ({ abortSignal }));
  mocks.service.mockReturnValue({ rpc });
  return { rpc, abortSignal };
}
beforeEach(() => { vi.resetAllMocks(); mocks.requireAdmin.mockResolvedValue({ id: "admin-id" }); mocks.origin.mockResolvedValue(true); mocks.audit.mockResolvedValue({ ok: true }); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
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
  it.each(["section", "payload", "versions"])("rejects duplicate %s fields before privileged access", async key => {
    const data = form("about", draft.about); data.append(key, String(data.get(key)));
    expect(await saveHomeSectionV2(INITIAL_HOME_SAVE_STATE, data)).toMatchObject({ status: "invalid" });
    expect(mocks.origin).not.toHaveBeenCalled(); expect(mocks.service).not.toHaveBeenCalled();
  });
  it.each(["section", "payload", "versions"])("rejects file-valued %s fields", async key => {
    const data = form("about", draft.about); data.set(key, new Blob(["private data"]), "input.txt");
    expect(await saveHomeSectionV2(INITIAL_HOME_SAVE_STATE, data)).toMatchObject({ status: "invalid" });
    expect(mocks.service).not.toHaveBeenCalled();
  });
  it("rejects oversized or invalid JSON before privileged access", async () => {
    for (const payload of ["x".repeat(160_001), "{", "null", "[]"]) {
      const data = form("about", draft.about); data.set("payload", payload);
      expect(await saveHomeSectionV2(INITIAL_HOME_SAVE_STATE, data)).toMatchObject({ status: "invalid" });
    }
    expect(mocks.service).not.toHaveBeenCalled();
  });
  it.each(HOME_EDITOR_SECTIONS)("saves only %s with the global exact version and uses the canonical database response", async (section) => {
    const { rpc, abortSignal } = rpcFor({ data: { canonicalSection: draft[section], versions: nextVersions }, error: null });
    expect(await saveHomeSectionV2(INITIAL_HOME_SAVE_STATE, form(section, draft[section]))).toMatchObject({ status: "saved", section, canonicalSection: draft[section], versions: nextVersions });
    expect(rpc).toHaveBeenCalledWith(["layout", "release", "work", "press"].includes(section) ? "save_home_editorial_section_v2" : "save_home_section_v2", { p_site_id: "main", p_section: section, p_expected_updated_at: versions.updatedAt, p_payload: draft[section] });
    expect(abortSignal).toHaveBeenCalledExactlyOnceWith(expect.any(AbortSignal));
    expect(mocks.revalidate).toHaveBeenCalledWith("/");
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ tableName: "home_page_config", metadata: { section } }));
  });
  it.each([
    [{ code: "40001", message: "home_page_changed" }, "conflict"],
    [{ code: "PGRST202", message: "Could not find save_home_section_v2 in schema cache" }, "migration-required"],
    [{ code: "22023", message: "invalid_home_media_source" }, "invalid"],
  ])("preserves the draft after rejected publication %#", async (error, status) => {
    rpcFor({ data: null, error });
    expect(await saveHomeSectionV2(INITIAL_HOME_SAVE_STATE, form("about", draft.about))).toMatchObject({ status });
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("does not claim success when the canonical save response is malformed", async () => {
    rpcFor({ data: { versions: nextVersions }, error: null });
    expect(await saveHomeSectionV2(INITIAL_HOME_SAVE_STATE, form("cnc", draft.cnc))).toMatchObject({ status: "error" });
    expect(mocks.audit).not.toHaveBeenCalled();
  });
  it.each([null, undefined, [], "unreadable"])("does not throw or report success for a malformed RPC envelope %#", async envelope => {
    rpcFor(envelope);
    expect(await saveHomeSectionV2(INITIAL_HOME_SAVE_STATE, form("cnc", draft.cnc))).toMatchObject({ status: "error" });
    expect(mocks.audit).not.toHaveBeenCalled(); expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("identifies missing editorial migration without retrying a legacy write", async () => {
    const { rpc } = rpcFor({ data: null, error: { code: "PGRST202", message: "Could not find the function public.save_home_editorial_section_v2 in the schema cache" } });
    const response = await saveHomeSectionV2(INITIAL_HOME_SAVE_STATE, form("work", draft.work));
    expect(response.status).toBe("migration-required");
    expect(response.message).toContain("0055");
    expect(rpc).toHaveBeenCalledOnce();
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("fails closed when a response repeats the submitted version", async () => {
    rpcFor({ data: { canonicalSection: draft.cnc, versions }, error: null });
    expect(await saveHomeSectionV2(INITIAL_HOME_SAVE_STATE, form("cnc", draft.cnc))).toMatchObject({ status: "error" });
    expect(mocks.audit).not.toHaveBeenCalled(); expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("retains microsecond precision in the exact write version", async () => {
    const data = form("cnc", draft.cnc); data.set("versions", JSON.stringify({ updatedAt: "2026-09-20T10:00:00.000001Z" }));
    const updatedAt = "2026-09-20T10:00:00.000002Z";
    rpcFor({ data: { canonicalSection: draft.cnc, versions: { updatedAt } }, error: null });
    expect(await saveHomeSectionV2(INITIAL_HOME_SAVE_STATE, data)).toMatchObject({ status: "saved", versions: { updatedAt } });
  });
  it.each([new Error("private transport details"), new DOMException("private timeout details", "TimeoutError")])("keeps a thrown transport outcome uncertain without retrying or leaking details", async error => {
    const { rpc, abortSignal } = rpcFor(null); abortSignal.mockRejectedValueOnce(error);
    const response = await saveHomeSectionV2(INITIAL_HOME_SAVE_STATE, form("cnc", draft.cnc));
    expect(response).toMatchObject({ status: "error", section: "cnc" });
    expect(response.message).toContain("may have saved"); expect(JSON.stringify(response)).not.toContain("private");
    expect(rpc).toHaveBeenCalledOnce(); expect(mocks.audit).not.toHaveBeenCalled(); expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("bounds the write to ten seconds with an abort signal", async () => {
    const signal = new AbortController().signal;
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(signal);
    const { abortSignal } = rpcFor({ data: { canonicalSection: draft.cnc, versions: nextVersions }, error: null });
    await saveHomeSectionV2(INITIAL_HOME_SAVE_STATE, form("cnc", draft.cnc));
    expect(timeout).toHaveBeenCalledExactlyOnceWith(10_000);
    expect(abortSignal).toHaveBeenCalledExactlyOnceWith(signal);
  });
  it("does not expose provider error messages or claim a failed transport never saved", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const { rpc } = rpcFor({ data: null, error: { code: "", message: "private submitted content" } });
    const response = await saveHomeSectionV2(INITIAL_HOME_SAVE_STATE, form("cnc", draft.cnc));
    expect(response.status).toBe("error"); expect(response.message).toContain("may have saved");
    expect(JSON.stringify(response)).not.toContain("private"); expect(JSON.stringify(log.mock.calls)).not.toContain("private");
    expect(rpc).toHaveBeenCalledOnce();
  });
  it.each(["returned", "thrown"])("keeps a confirmed save successful after a %s audit failure", async mode => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { rpc } = rpcFor({ data: { canonicalSection: draft.cnc, versions: nextVersions }, error: null });
    if (mode === "returned") mocks.audit.mockResolvedValueOnce({ ok: false, reason: "insert-failed" });
    else mocks.audit.mockRejectedValueOnce(new Error("private audit details"));
    const response = await saveHomeSectionV2(INITIAL_HOME_SAVE_STATE, form("cnc", draft.cnc));
    expect(response).toMatchObject({ status: "saved", canonicalSection: draft.cnc, versions: nextVersions });
    expect(response.message).toContain("audit log could not be recorded"); expect(response.message).not.toContain("private");
    expect(rpc).toHaveBeenCalledOnce(); expect(mocks.revalidate).toHaveBeenCalledTimes(7);
  });
  it("returns the confirmed write after a two-second audit deadline and clears its timer", async () => {
    vi.useFakeTimers();
    rpcFor({ data: { canonicalSection: draft.cnc, versions: nextVersions }, error: null });
    let rejectAudit!: (reason: Error) => void;
    mocks.audit.mockReturnValueOnce(new Promise((_resolve, reject) => { rejectAudit = reject; }));
    const pending = saveHomeSectionV2(INITIAL_HOME_SAVE_STATE, form("cnc", draft.cnc));
    await vi.advanceTimersByTimeAsync(1_999);
    expect(mocks.revalidate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    const response = await pending;
    expect(response).toMatchObject({ status: "saved", canonicalSection: draft.cnc, versions: nextVersions });
    expect(response.message).toContain("Audit confirmation timed out");
    expect(mocks.revalidate).toHaveBeenCalledTimes(7); expect(vi.getTimerCount()).toBe(0);
    // A late network failure remains handled by the race rather than becoming
    // an unhandled rejection after the successful response has been delivered.
    rejectAudit(new Error("private late audit failure"));
    await Promise.resolve();
  });
  it("clears the audit deadline after an immediate successful audit", async () => {
    vi.useFakeTimers();
    rpcFor({ data: { canonicalSection: draft.cnc, versions: nextVersions }, error: null });
    expect((await saveHomeSectionV2(INITIAL_HOME_SAVE_STATE, form("cnc", draft.cnc))).status).toBe("saved");
    expect(vi.getTimerCount()).toBe(0);
  });
  it("keeps the committed version and attempts every cache path after a refresh failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    rpcFor({ data: { canonicalSection: draft.cnc, versions: nextVersions }, error: null });
    mocks.revalidate.mockImplementationOnce(() => { throw new Error("private cache details"); });
    const response = await saveHomeSectionV2(INITIAL_HOME_SAVE_STATE, form("cnc", draft.cnc));
    expect(response).toMatchObject({ status: "saved", canonicalSection: draft.cnc, versions: nextVersions });
    expect(response.message).toContain("cache could not be fully refreshed"); expect(response.message).not.toContain("private");
    expect(mocks.revalidate.mock.calls.map(call => call[0])).toEqual(["/", "/admin/v2/pages/home", "/admin/v2-preview/home", "/admin/v2", "/press", "/admin/v2/pages/press", "/admin/v2-preview/press"]);
  });
});
