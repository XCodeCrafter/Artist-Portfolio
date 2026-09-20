import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAdminAppearanceData, isMissingSiteAppearanceSchemaError } from "@/lib/admin/site-appearance";

const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), service: vi.fn(), configured: vi.fn() }));
vi.mock("@/lib/admin/auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/admin/service", () => ({ createAdminServiceClient: mocks.service, hasAdminServiceEnv: mocks.configured }));
const row = { artist_name: "Owner", display_font: "prata", body_font: "inter", ui_font: "manrope", footer_effect: "red-light", updated_at: "2026-09-20T10:00:00.123456+00:00" };
function database(data: unknown, error: unknown = null) {
  const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data, error }) };
  query.select.mockReturnValue(query); query.eq.mockReturnValue(query);
  const client = { from: vi.fn().mockReturnValue(query) }; mocks.service.mockReturnValue(client);
  return { query, client };
}
beforeEach(() => { vi.resetAllMocks(); mocks.requireAdmin.mockResolvedValue({ id: "admin" }); mocks.configured.mockReturnValue(true); });
describe("Site appearance V2 data", () => {
  it("authenticates before any privileged reads", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("unauthorized"));
    await expect(getAdminAppearanceData()).rejects.toThrow("unauthorized");
    expect(mocks.service).not.toHaveBeenCalled();
  });
  it("returns an explicit read-only fallback without configured admin access", async () => {
    mocks.configured.mockReturnValue(false);
    expect(await getAdminAppearanceData()).toMatchObject({ isConfigured: false, migrationRequired: false });
    expect(mocks.service).not.toHaveBeenCalled();
  });
  it("loads only the known main-site fields and preserves the database version", async () => {
    const { query, client } = database(row);
    expect(await getAdminAppearanceData()).toMatchObject({
      isConfigured: true, migrationRequired: false,
      snapshot: { draft: { name: { artistName: "Owner" }, appearance: { displayFont: "prata", bodyFont: "inter", uiFont: "manrope", footerEffect: "red-light" } }, versions: { updatedAt: row.updated_at } },
    });
    expect(client.from).toHaveBeenCalledExactlyOnceWith("site_settings");
    expect(query.select).toHaveBeenCalledExactlyOnceWith("artist_name,display_font,body_font,ui_font,footer_effect,updated_at");
    expect(query.eq).toHaveBeenCalledExactlyOnceWith("id", "main");
  });
  it("never supplies a writable draft when legacy columns are missing", async () => {
    database(null, { code: "PGRST204", message: "Could not find display_font column of site_settings in the schema cache" });
    expect(await getAdminAppearanceData()).toMatchObject({ isConfigured: true, migrationRequired: true, loadError: expect.any(String) });
  });
  it.each([null, { ...row, display_font: "unsupported-font" }, { ...row, updated_at: null }])("marks missing or malformed snapshots read-only %#", async (data) => {
    database(data);
    expect(await getAdminAppearanceData()).toMatchObject({ isConfigured: true, migrationRequired: false, loadError: expect.any(String) });
  });
  it("distinguishes permission failures from missing schema", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const error = { code: "42501", message: "permission denied for site_settings" };
    expect(isMissingSiteAppearanceSchemaError(error)).toBe(false);
    database(null, error);
    expect(await getAdminAppearanceData()).toMatchObject({ migrationRequired: false, loadError: expect.any(String) });
  });
});
