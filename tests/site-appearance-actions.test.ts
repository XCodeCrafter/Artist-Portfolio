import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveSiteAppearanceV2 } from "@/app/admin/v2/settings/appearance/actions";
import { createFallbackAppearanceEditorSnapshot, INITIAL_APPEARANCE_SAVE_STATE } from "@/lib/admin/site-appearance-editor";

const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), origin: vi.fn(), service: vi.fn(), audit: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/admin/auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/admin/action-security", () => ({ verifyAdminActionOrigin: mocks.origin }));
vi.mock("@/lib/admin/service", () => ({ createAdminServiceClient: mocks.service, hasAdminServiceEnv: () => true }));
vi.mock("@/lib/admin/audit", () => ({ writeAuditLog: mocks.audit }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));

const draft = createFallbackAppearanceEditorSnapshot().draft;
const versions = { updatedAt: "2026-09-20T10:00:00.123456+00:00" };
const updatedAt = "2026-09-20T10:00:01.123456+00:00";
function form(section: string, payload: unknown) {
  const data = new FormData();
  data.set("section", section); data.set("payload", JSON.stringify(payload)); data.set("versions", JSON.stringify(versions));
  return data;
}
function database(response: { data: unknown; error: unknown }) {
  const query = { update: vi.fn(), eq: vi.fn(), select: vi.fn(), maybeSingle: vi.fn().mockResolvedValue(response) };
  query.update.mockReturnValue(query); query.eq.mockReturnValue(query); query.select.mockReturnValue(query);
  const client = { from: vi.fn().mockReturnValue(query) };
  mocks.service.mockReturnValue(client);
  return { query, client };
}
beforeEach(() => {
  vi.resetAllMocks(); mocks.requireAdmin.mockResolvedValue({ id: "admin-id" }); mocks.origin.mockResolvedValue(true);
});

describe("Site appearance V2 server action", () => {
  it("authenticates even malformed input before service access", async () => {
    mocks.requireAdmin.mockRejectedValueOnce(new Error("unauthorized"));
    await expect(saveSiteAppearanceV2(INITIAL_APPEARANCE_SAVE_STATE, new FormData())).rejects.toThrow("unauthorized");
    expect(mocks.origin).not.toHaveBeenCalled(); expect(mocks.service).not.toHaveBeenCalled();
  });
  it("blocks cross-origin writes without opening service access", async () => {
    mocks.origin.mockResolvedValue(false);
    expect(await saveSiteAppearanceV2(INITIAL_APPEARANCE_SAVE_STATE, form("name", draft.name))).toMatchObject({ status: "security-error" });
    expect(mocks.service).not.toHaveBeenCalled();
  });
  it("rejects malformed JSON, unknown fields, fonts and section names without writes", async () => {
    const malformed = form("name", draft.name); malformed.set("payload", "{");
    for (const input of [
      malformed, new FormData(), form("name", { ...draft.name, location: "changed" }),
      form("appearance", { ...draft.appearance, bodyFont: "unknown" }), form("contact", {}),
    ]) expect(await saveSiteAppearanceV2(INITIAL_APPEARANCE_SAVE_STATE, input)).toMatchObject({ status: "invalid" });
    expect(mocks.service).not.toHaveBeenCalled();
  });
  it("saves only the owner name with the exact version and canonical database result", async () => {
    const { query, client } = database({ data: { artist_name: "Canonical owner", updated_at: updatedAt }, error: null });
    const response = await saveSiteAppearanceV2(INITIAL_APPEARANCE_SAVE_STATE, form("name", { artistName: "  New owner  " }));
    expect(client.from).toHaveBeenCalledExactlyOnceWith("site_settings");
    expect(query.update).toHaveBeenCalledExactlyOnceWith({ artist_name: "New owner" });
    expect(query.eq.mock.calls).toEqual([["id", "main"], ["updated_at", versions.updatedAt]]);
    expect(query.select).toHaveBeenCalledWith("artist_name,updated_at");
    expect(response).toMatchObject({ status: "saved", section: "name", canonicalSection: { artistName: "Canonical owner" }, versions: { updatedAt } });
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ tableName: "site_settings", metadata: { section: "name", fields: ["artist_name"] } }));
    expect(mocks.revalidate).toHaveBeenCalledWith("/", "layout");
    expect(mocks.revalidate).toHaveBeenCalledWith("/admin/v2/navigation");
  });
  it("appearance changes are limited to three font roles and footer effect", async () => {
    const values = { display_font: "prata", body_font: "dm-sans", ui_font: "urbanist", footer_effect: "red-light" };
    const { query } = database({ data: { ...values, updated_at: updatedAt }, error: null });
    const payload = { displayFont: "prata", bodyFont: "dm-sans", uiFont: "urbanist", footerEffect: "red-light" };
    expect(await saveSiteAppearanceV2(INITIAL_APPEARANCE_SAVE_STATE, form("appearance", payload))).toMatchObject({ status: "saved", section: "appearance", canonicalSection: payload, versions: { updatedAt } });
    expect(query.update).toHaveBeenCalledExactlyOnceWith(values);
    expect(query.eq.mock.calls).toEqual([["id", "main"], ["updated_at", versions.updatedAt]]);
    expect(mocks.revalidate).toHaveBeenCalledWith("/admin/v2/settings/appearance");
  });
  it("treats zero affected rows as conflict rather than reporting false success", async () => {
    database({ data: null, error: null });
    expect(await saveSiteAppearanceV2(INITIAL_APPEARANCE_SAVE_STATE, form("name", draft.name))).toMatchObject({ status: "conflict" });
    expect(mocks.audit).not.toHaveBeenCalled(); expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it.each([
    [{ code: "40001", message: "concurrent update" }, "conflict"],
    [{ code: "42703", message: "column site_settings.footer_effect does not exist" }, "migration-required"],
    [{ code: "23514", message: "constraint failed" }, "invalid"],
    [{ code: "42501", message: "permission denied" }, "error"],
  ])("reports rejected database writes without success audit or revalidation %#", async (error, status) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    database({ data: null, error });
    expect(await saveSiteAppearanceV2(INITIAL_APPEARANCE_SAVE_STATE, form("appearance", draft.appearance))).toMatchObject({ status });
    expect(mocks.audit).not.toHaveBeenCalled(); expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("does not claim success when the canonical response is missing its version", async () => {
    database({ data: { artist_name: "Owner" }, error: null });
    expect(await saveSiteAppearanceV2(INITIAL_APPEARANCE_SAVE_STATE, form("name", draft.name))).toMatchObject({ status: "error" });
    expect(mocks.audit).not.toHaveBeenCalled();
  });
  it("does not fall back to a weaker client when service access is missing", async () => {
    mocks.service.mockReturnValue(null);
    expect(await saveSiteAppearanceV2(INITIAL_APPEARANCE_SAVE_STATE, form("name", draft.name))).toMatchObject({ status: "missing-service" });
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});
