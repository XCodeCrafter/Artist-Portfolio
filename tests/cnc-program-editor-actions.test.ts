import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveCncProgramsV2 } from "@/app/admin/v2/pages/home/programs/actions";
import { INITIAL_CNC_PROGRAMS_SAVE_STATE } from "@/lib/admin/cnc-program-editor";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(), origin: vi.fn(), client: vi.fn(), rpc: vi.fn(),
  load: vi.fn(), audit: vi.fn(), revalidate: vi.fn(),
}));
vi.mock("@/lib/admin/auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/admin/action-security", () => ({ verifyAdminActionOrigin: mocks.origin }));
vi.mock("@/lib/admin/service", () => ({ createAdminServiceClient: mocks.client }));
vi.mock("@/lib/admin/cnc-programs", () => ({ getEditableCncPrograms: mocks.load }));
vi.mock("@/lib/admin/audit", () => ({ writeAuditLog: mocks.audit }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
const program = { id: "cnc-one", title: "Sample", fileName: "SAMPLE.NC", description: "", dialect: "iso", source: "G0 X0\nM30", previewLineCount: 6, isPublished: true };
const timestamp = "2026-09-20T10:00:00.000001Z";
function save(payload: unknown = { programs: [program], expectedVersions: { "cnc-one": timestamp } }) {
  const form = new FormData();
  form.set("payload", typeof payload === "string" ? payload : JSON.stringify(payload));
  return saveCncProgramsV2(INITIAL_CNC_PROGRAMS_SAVE_STATE, form);
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdmin.mockResolvedValue({ id: "admin-one" });
  mocks.origin.mockResolvedValue(true);
  mocks.client.mockReturnValue({ rpc: mocks.rpc });
  mocks.rpc.mockResolvedValue({ error: null });
  mocks.load.mockResolvedValue({ isConfigured: true, migrationRequired: false, programs: [{ ...program, sortOrder: 10, updatedAt: "2026-09-20T10:01:00.000003Z" }] });
  mocks.audit.mockResolvedValue(undefined);
});
describe("CNC V2 program actions", () => {
  it("requires admin and trusted origin before mutation", async () => {
    mocks.origin.mockResolvedValue(false);
    expect((await save()).status).toBe("security-error");
    expect(mocks.requireAdmin).toHaveBeenCalledOnce();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("uses the existing atomic RPC and returns confirmed versions", async () => {
    const result = await save();
    expect(result.status).toBe("saved");
    expect(mocks.rpc).toHaveBeenCalledWith("replace_cnc_programs", {
      p_expected_versions: { "cnc-one": timestamp },
      p_programs: [{ id: program.id, title: program.title, description: "", file_name: program.fileName, dialect: "iso", source_code: program.source, preview_line_count: 6, sort_order: 10, is_published: true }],
    });
    expect(result.snapshot?.expectedVersions["cnc-one"]).toBe("2026-09-20T10:01:00.000003Z");
    expect(mocks.audit).toHaveBeenCalledOnce();
    expect(mocks.revalidate).toHaveBeenCalledWith("/admin/v2-preview/home");
  });
  it("rejects malformed and excessive serialized drafts before contacting the database", async () => {
    expect((await save("{")).status).toBe("invalid");
    expect((await save("x".repeat(750001))).status).toBe("invalid");
    expect((await save({ programs: [{ ...program, fileName: "../bad" }], expectedVersions: {} })).status).toBe("invalid");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("retains conflicts without pretending success or refetching", async () => {
    mocks.rpc.mockResolvedValue({ error: { code: "40001", message: "cnc_programs_changed" } });
    expect((await save()).status).toBe("conflict");
    expect(mocks.load).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });
  it("does not adopt a concurrent writer's content as the current user's save", async () => {
    mocks.load.mockResolvedValue({ isConfigured: true, migrationRequired: false, programs: [{ ...program, title: "Concurrent writer", sortOrder: 10, updatedAt: timestamp }] });
    expect(await save()).toMatchObject({ status: "error", requiresReload: true });
  });
  it("reports a failed confirmation distinctly from an unsaved mutation", async () => {
    mocks.load.mockResolvedValue({ isConfigured: true, migrationRequired: false, loadError: "Unavailable", programs: [] });
    const result = await save();
    expect(result).toMatchObject({ status: "error", requiresReload: true });
    expect(result.message).toContain("save completed");
  });
  it("can remove the complete collection only through the same versioned RPC", async () => {
    mocks.load.mockResolvedValue({ isConfigured: true, migrationRequired: false, programs: [] });
    expect((await save({ programs: [], expectedVersions: { "cnc-one": timestamp } })).status).toBe("saved");
    expect(mocks.rpc).toHaveBeenCalledWith("replace_cnc_programs", { p_expected_versions: { "cnc-one": timestamp }, p_programs: [] });
  });
});
