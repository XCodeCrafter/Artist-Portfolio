import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMediaLibraryV2Data } from "@/lib/admin/media-library";
import MediaLibraryPage from "@/app/admin/v2/media/page";

const mocks = vi.hoisted(() => ({ media: vi.fn(), client: vi.fn(), rpc: vi.fn(), admin: vi.fn(), posters: vi.fn() }));
vi.mock("@/lib/admin/media", () => ({ getMediaAssets: mocks.media }));
vi.mock("@/lib/admin/service", () => ({ createAdminServiceClient: mocks.client }));
vi.mock("@/lib/admin/media-library-posters", () => ({ getMediaLibraryPosters: mocks.posters }));
vi.mock("@/lib/admin/auth", () => ({ requireAdmin: mocks.admin }));
vi.mock("@/components/admin/v2/MediaLibraryEditor", () => ({ default: () => null }));
const assets = [{ id: "portrait" }, { id: "old", deletedAt: "2026-09-20T11:00:00Z" }];
beforeEach(() => {
  vi.clearAllMocks();
  mocks.admin.mockResolvedValue({ id: "verified-admin" });
  mocks.media.mockResolvedValue({ assets, isConfigured: true });
  mocks.client.mockReturnValue({ rpc: mocks.rpc });
  mocks.rpc.mockResolvedValue({ data: [], error: null });
  mocks.posters.mockResolvedValue({});
});

describe("Media library V2 server data boundary", () => {
  it("authenticates the route before requesting privileged assets or usage", async () => {
    mocks.admin.mockRejectedValue(new Error("unauthorized"));
    await expect(MediaLibraryPage()).rejects.toThrow("unauthorized");
    expect(mocks.media).not.toHaveBeenCalled();
    expect(mocks.client).not.toHaveBeenCalled();
    expect(mocks.posters).not.toHaveBeenCalled();
  });
  it("loads recoverable Trash and groups validated usage rows", async () => {
    mocks.rpc.mockResolvedValue({ data: [
      { asset_id: "portrait", reference_label: "Bio gallery", reference_count: "2" },
      { asset_id: "portrait", reference_label: "Home V2", reference_count: 1 },
    ], error: null });
    const result = await getMediaLibraryV2Data();
    expect(mocks.media).toHaveBeenCalledWith({ includeDeleted: true });
    expect(mocks.rpc).toHaveBeenCalledWith("get_media_library_v2_usage");
    expect(result.assets).toEqual(assets);
    expect(result.usage).toEqual({ portrait: [{ label: "Bio gallery", count: 2 }, { label: "Home V2", count: 1 }] });
    expect(result.usageError).toBeUndefined();
  });
  it("treats an empty successful usage result as verified rather than unavailable", async () => {
    expect(await getMediaLibraryV2Data()).toMatchObject({ isConfigured: true, usage: {}, usageError: undefined });
  });
  it("groups IDs safely even when they coincide with object prototype names", async () => {
    mocks.rpc.mockResolvedValue({ data: [
      { asset_id: "constructor", reference_label: "Bio", reference_count: 1 },
      { asset_id: "__proto__", reference_label: "Home", reference_count: 1 },
    ], error: null });
    const result = await getMediaLibraryV2Data();
    expect(Object.hasOwn(result.usage, "__proto__")).toBe(true);
    expect(result.usage.constructor).toEqual([{ label: "Bio", count: 1 }]);
    expect(Object.getPrototypeOf(result.usage)).toBe(Object.prototype);
  });
  it.each([
    null,
    [{ asset_id: "portrait", reference_label: "Bio", reference_count: 0 }],
    [{ asset_id: "portrait", reference_label: "Bio", reference_count: -1 }],
    [{ asset_id: "portrait", reference_label: "Bio", reference_count: 1.5 }],
    [{ asset_id: "portrait", reference_label: "Bio", reference_count: "unverified" }],
    [{ asset_id: "portrait", reference_count: 1 }],
  ])("fails closed instead of presenting malformed usage as unused", async (data) => {
    mocks.rpc.mockResolvedValue({ data, error: null });
    const result = await getMediaLibraryV2Data();
    expect(result.assets).toEqual(assets);
    expect(result.usage).toEqual({});
    expect(result.usageError).toContain("Delete and restore are disabled");
  });
  it.each(["PGRST202", "42883"])("explains missing migration %s without disabling existing uploads", async (code) => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code, message: "backend private detail" } });
    const result = await getMediaLibraryV2Data();
    expect(result.isConfigured).toBe(true);
    expect(result.loadError).toBeUndefined();
    expect(result.usageError).toContain("0040");
    expect(result.usageError).toContain("Upload and file details remain available");
    expect(result.usageError).not.toContain("backend private detail");
  });
  it("does not query usage when media loading failed", async () => {
    mocks.media.mockResolvedValue({ assets: [], isConfigured: true, loadError: "Assets unavailable" });
    const result = await getMediaLibraryV2Data();
    expect(result.loadError).toBe("Assets unavailable");
    expect(result.usageError).toContain("disabled");
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.posters).not.toHaveBeenCalled();
  });
  it("handles missing service configuration without inventing zero usage", async () => {
    mocks.media.mockResolvedValue({ assets: [], isConfigured: false });
    mocks.client.mockReturnValue(null);
    expect(await getMediaLibraryV2Data()).toMatchObject({ isConfigured: false, usage: {}, usageError: expect.stringContaining("could not be verified") });
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.posters).not.toHaveBeenCalled();
  });
  it("returns optional saved posters alongside verified usage", async () => {
    mocks.posters.mockResolvedValue({ portrait: "/images/poster.jpg" });
    const result = await getMediaLibraryV2Data();
    expect(result.posters).toEqual({ portrait: "/images/poster.jpg" });
    expect(mocks.posters).toHaveBeenCalledWith({ rpc: mocks.rpc }, assets);
    expect(result.usageError).toBeUndefined();
  });
  it("retains safe optional posters but fails closed when the usage request rejects", async () => {
    mocks.rpc.mockRejectedValue(new Error("private backend detail"));
    mocks.posters.mockResolvedValue({ portrait: "/images/poster.jpg" });
    const result = await getMediaLibraryV2Data();
    expect(result.assets).toEqual(assets);
    expect(result.posters).toEqual({ portrait: "/images/poster.jpg" });
    expect(result.usage).toEqual({});
    expect(result.usageError).toContain("Delete and restore are disabled");
    expect(result.usageError).not.toContain("private backend detail");
  });
});
