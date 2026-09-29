import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAdminSharingData, isMissingSharingSchemaError } from "@/lib/admin/site-sharing";
import { getPublicSiteSharing, loadPublicSiteSharing } from "@/lib/content/site-sharing.server";
import { DEFAULT_SHARING_METADATA } from "@/lib/content/site-sharing";
const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), service: vi.fn(), publicClient: vi.fn(), rpc: vi.fn(), abort: vi.fn() }));
vi.mock("@/lib/admin/auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/admin/service", () => ({ createAdminServiceClient: mocks.service }));
vi.mock("@/lib/content/supabase", () => ({ createPublicContentClient: mocks.publicClient }));
vi.mock("react", () => ({ cache: <T,>(fn: T) => fn }));
const snapshot = { draft: DEFAULT_SHARING_METADATA, versions: { updatedAt: "2026-09-29T10:00:00.123456+00:00" } };
const client = { rpc: mocks.rpc };
beforeEach(() => {
  vi.clearAllMocks(); mocks.requireAdmin.mockResolvedValue({ id: "admin" });
  mocks.rpc.mockReturnValue({ abortSignal: mocks.abort }); mocks.abort.mockResolvedValue({ data: snapshot, error: null });
  mocks.service.mockReturnValue(client); mocks.publicClient.mockReturnValue(client);
});
describe("Sharing settings readers", () => {
  it("authenticates before creating service client", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("unauthorized")); await expect(getAdminSharingData()).rejects.toThrow("unauthorized");
    expect(mocks.service).not.toHaveBeenCalled();
  });
  it("returns canonical private editor snapshot with deadline", async () => {
    expect(await getAdminSharingData()).toEqual({ snapshot, isConfigured: true, migrationRequired: false });
    expect(mocks.rpc).toHaveBeenCalledWith("get_site_sharing_editor_v2", { p_site_id: "main" });
    expect(mocks.abort).toHaveBeenCalledWith(expect.any(AbortSignal));
  });
  it("never enables editing from fallback data", async () => {
    mocks.service.mockReturnValueOnce(null); expect(await getAdminSharingData()).toMatchObject({ isConfigured: false });
    mocks.abort.mockResolvedValueOnce({ error: { code: "PGRST202", message: "get_site_sharing_editor_v2" } });
    expect(await getAdminSharingData()).toMatchObject({ migrationRequired: true });
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.abort.mockResolvedValueOnce({ data: {}, error: null }); expect(await getAdminSharingData()).toHaveProperty("loadError");
    mocks.abort.mockRejectedValueOnce(new Error("offline")); expect(await getAdminSharingData()).toHaveProperty("loadError");
    expect(isMissingSharingSchemaError({ code: "PGRST202", message: "unrelated_rpc" })).toBe(false);
  });
  it("public reader uses anonymous exact projection only", async () => {
    mocks.abort.mockResolvedValue({ data: DEFAULT_SHARING_METADATA, error: null });
    expect(await getPublicSiteSharing()).toEqual(DEFAULT_SHARING_METADATA);
    expect(mocks.rpc).toHaveBeenCalledWith("get_public_site_sharing_v2");
    expect(mocks.service).not.toHaveBeenCalled(); expect(mocks.requireAdmin).not.toHaveBeenCalled();
  });
  it("only missing named additive RPC is optional", async () => {
    mocks.abort.mockResolvedValueOnce({ error: { code: "PGRST202", message: "get_public_site_sharing_v2" } });
    expect(await loadPublicSiteSharing(client as never)).toBeNull();
    for (const error of [{ code: "PGRST202", message: "other_rpc" }, { code: "42501" }, { code: "XX000" }]) {
      mocks.abort.mockResolvedValueOnce({ error }); await expect(loadPublicSiteSharing(client as never)).rejects.toThrow("could not be loaded");
    }
  });
  it.each([null, {}, { ...DEFAULT_SHARING_METADATA, versions: snapshot.versions }])("rejects malformed or private projection", async data => {
    mocks.abort.mockResolvedValue({ data, error: null }); await expect(loadPublicSiteSharing(client as never)).rejects.toThrow("Invalid public");
    expect(await getPublicSiteSharing()).toEqual(DEFAULT_SHARING_METADATA);
  });
  it("clears an obsolete image origin without breaking public copy", async () => {
    mocks.abort.mockResolvedValue({ data: { title: "Owner copy", description: "Still valid", imageSrc: "https://unmanaged.example/cover.jpg", imageAlt: "Old cover" }, error: null });
    expect(await loadPublicSiteSharing(client as never)).toEqual({ title: "Owner copy", description: "Still valid", imageSrc: "", imageAlt: "" });
  });
  it("allows the owner to recover an obsolete cover with exact original CAS", async () => {
    mocks.abort.mockResolvedValue({ data: { ...snapshot, draft: { title: "Owner copy", description: "Still valid", imageSrc: "https://unmanaged.example/cover.jpg", imageAlt: "Old cover" } }, error: null });
    expect(await getAdminSharingData()).toMatchObject({ snapshot: { draft: { title: "Owner copy", description: "Still valid", imageSrc: "", imageAlt: "" }, versions: snapshot.versions }, loadWarning: expect.any(String), isConfigured: true, migrationRequired: false });
  });
});
