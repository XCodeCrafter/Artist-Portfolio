import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { finalizeMediaUpload, prepareMediaUpload, updateMediaAsset } from "@/app/admin/media/actions";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(async () => ({ id: "admin-one" })),
  verifyOrigin: vi.fn(async () => true),
  createClient: vi.fn<() => unknown>(),
  audit: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/admin/auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/admin/action-security", () => ({ verifyAdminActionOrigin: mocks.verifyOrigin }));
vi.mock("@/lib/admin/service", () => ({ createAdminServiceClient: mocks.createClient, hasAdminServiceEnv: () => true }));
vi.mock("@/lib/admin/audit", () => ({ writeAuditLog: mocks.audit }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (url: string): never => { throw new Error(url); } }));

const PNG_BYTES = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const details = {
  id: "existing-asset", label: "Portrait", alt: "Artist", usageKey: "portrait",
  sortOrder: 0, isPublished: true, fileName: "portrait.png", fileSize: 8, mimeType: "image/png",
};
function setupClient() {
  const insert = vi.fn<(row: Record<string, unknown>) => Promise<{
    error: null | { code: string; message: string };
  }>>().mockResolvedValue({ error: null });
  const maybeSingle = vi.fn(async () => ({
    data: null as Record<string, unknown> | null,
    error: null as { code: string; message: string } | null,
  }));
  const lookup = { select: vi.fn(), eq: vi.fn(), maybeSingle };
  lookup.select.mockReturnValue(lookup);
  lookup.eq.mockReturnValue(lookup);
  const storage = {
    createSignedUploadUrl: vi.fn(async () => ({ data: { token: "signed-upload" }, error: null })),
    list: vi.fn(async (_folder: string, options: { search: string }) => ({ data: [{ name: options.search, metadata: { size: 8 } }], error: null })),
    getPublicUrl: vi.fn((path: string) => ({ data: { publicUrl: `https://storage.example.invalid/${path}` } })),
    remove: vi.fn(),
  };
  const client = {
    from: vi.fn(() => ({ insert, ...lookup })),
    storage: { listBuckets: vi.fn(async () => ({ data: [{ name: "portfolio-media" }], error: null })), from: vi.fn(() => storage) },
  };
  mocks.createClient.mockReturnValue(client);
  return { client, storage, insert, lookup };
}
async function prepare() {
  const result = await prepareMediaUpload(details);
  if (!result.ok) throw new Error(result.error);
  return result.ticket;
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("AUTH_SECURITY_SECRET", "upload-unit-test-secret-32-characters-minimum");
  vi.stubEnv("SUPABASE_MEDIA_BUCKET", "portfolio-media");
  mocks.requireAdmin.mockResolvedValue({ id: "admin-one" });
  mocks.verifyOrigin.mockResolvedValue(true);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.stubGlobal("fetch", vi.fn(async () => new Response(PNG_BYTES, { status: 206, headers: { "content-range": "bytes 0-7/8" } })));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("Supabase upload finalization authority", () => {
  it("uses a unique server-owned identity and a signed, user-bound ticket", async () => {
    const { insert, storage } = setupClient();
    const ticket = await prepare();
    expect(ticket.id).not.toBe(details.id);
    expect(ticket.id).toMatch(/^existing-asset-[a-f0-9-]{36}$/);
    expect(ticket.uploadProof).toMatch(/^[a-f0-9]{64}$/);
    expect(await finalizeMediaUpload(ticket)).toEqual({ ok: true });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ id: ticket.id, file_size: 8 }));
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it.each([
    { fileSize: 9 }, { id: "existing-asset" }, { storagePath: "image/existing-asset.png" },
    { storagePath: "image/../existing-asset.png" }, { mimeType: "image/jpeg" },
  ])("rejects a forged ticket before reading or deleting storage", async (tampered) => {
    const { storage, insert } = setupClient();
    const ticket = await prepare();
    expect((await finalizeMediaUpload({ ...ticket, ...tampered })).ok).toBe(false);
    expect(storage.list).not.toHaveBeenCalled();
    expect(storage.remove).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it("does not let another admin claim the uploader's ticket", async () => {
    const { storage } = setupClient();
    const ticket = await prepare();
    mocks.requireAdmin.mockResolvedValue({ id: "admin-two" });
    expect((await finalizeMediaUpload(ticket)).ok).toBe(false);
    expect(storage.list).not.toHaveBeenCalled();
  });

  it("rejects expired tickets", async () => {
    const { storage } = setupClient();
    const ticket = await prepare();
    vi.useFakeTimers();
    vi.setSystemTime(ticket.uploadExpiresAt + 1);
    expect((await finalizeMediaUpload(ticket)).ok).toBe(false);
    expect(storage.list).not.toHaveBeenCalled();
  });

  it("reconciles an exact registered object when a successful finalization is replayed", async () => {
    const { storage, insert, lookup } = setupClient();
    const ticket = await prepare();
    expect((await finalizeMediaUpload(ticket)).ok).toBe(true);
    const registered = { ...insert.mock.calls[0][0], deleted_at: null };
    lookup.maybeSingle.mockResolvedValue({ data: registered, error: null });
    insert.mockResolvedValue({ error: { code: "23505", message: "duplicate key" } });
    // Metadata may legitimately differ since the first finalization. Replays
    // must not overwrite a renamed, hidden or differently described asset.
    expect(await finalizeMediaUpload({ ...ticket, label: "Stale client title", isPublished: false })).toEqual({ ok: true });
    expect(lookup.eq).toHaveBeenCalledWith("id", ticket.id);
    expect(mocks.audit).toHaveBeenCalledTimes(1);
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it.each([
    ["id", "another-id"], ["src", "https://elsewhere.invalid/photo.png"],
    ["storage_bucket", "another-bucket"], ["storage_path", "image/another.png"],
    ["file_size", 99], ["mime_type", "image/jpeg"], ["media_type", "video"],
    ["deleted_at", "2026-09-20T10:00:00Z"],
  ])("never accepts a duplicate with mismatched %s or revives trash", async (key, value) => {
    const { storage, insert, lookup } = setupClient();
    const ticket = await prepare();
    expect((await finalizeMediaUpload(ticket)).ok).toBe(true);
    const registered = { ...insert.mock.calls[0][0], deleted_at: null, [key]: value };
    lookup.maybeSingle.mockResolvedValue({ data: registered, error: null });
    insert.mockResolvedValue({ error: { code: "23505", message: "duplicate key" } });
    expect(await finalizeMediaUpload(ticket)).toEqual({ ok: false, error: "Uploaded media could not be added to the library." });
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it.each([null, { code: "network", message: "lookup failed" }])("fails closed when a duplicate cannot be verified", async (error) => {
    const { storage, insert, lookup } = setupClient();
    const ticket = await prepare();
    insert.mockResolvedValue({ error: { code: "23505", message: "duplicate key" } });
    lookup.maybeSingle.mockResolvedValue({ data: null, error });
    expect((await finalizeMediaUpload(ticket)).ok).toBe(false);
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it("does not swallow other insert errors as idempotent success", async () => {
    const { storage, insert, lookup } = setupClient();
    const ticket = await prepare();
    insert.mockResolvedValue({ error: { code: "23514", message: "check constraint failed" } });
    expect((await finalizeMediaUpload(ticket)).ok).toBe(false);
    expect(lookup.maybeSingle).not.toHaveBeenCalled();
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it("reports content mismatches without blind destructive cleanup", async () => {
    const { storage, insert } = setupClient();
    const ticket = await prepare();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>not an image</html>", { status: 200 })));
    expect((await finalizeMediaUpload(ticket)).ok).toBe(false);
    expect(insert).not.toHaveBeenCalled();
    expect(storage.remove).not.toHaveBeenCalled();
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "security_admin_media_upload_rejected" }));
  });

  it("checks admin access before preparing or finalizing even malformed input", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("unauthorized"));
    await expect(prepareMediaUpload(null)).rejects.toThrow("unauthorized");
    await expect(finalizeMediaUpload(null)).rejects.toThrow("unauthorized");
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it.each([NaN, Infinity, 1.5, -1])("rejects invalid file size %s before signing a URL", async (fileSize) => {
    const { storage } = setupClient();
    expect((await prepareMediaUpload({ ...details, fileSize })).ok).toBe(false);
    expect(storage.createSignedUploadUrl).not.toHaveBeenCalled();
  });
});

describe("media metadata concurrency", () => {
  it.each([null, { id: "portrait" }])("conditionally updates a live asset without reviving trash", async (data) => {
    const query = { update: vi.fn(), eq: vi.fn(), is: vi.fn(), select: vi.fn(), maybeSingle: vi.fn(async () => ({ data, error: null })) };
    for (const method of [query.update, query.eq, query.is, query.select]) method.mockReturnValue(query);
    mocks.createClient.mockReturnValue({ from: vi.fn(() => query) });
    const input = new FormData();
    const version = "2026-09-21T12:30:00.123456Z";
    for (const [key, value] of Object.entries({ id: "portrait", label: "Artist portrait", alt: "Portrait", sortOrder: "0", expectedUpdatedAt: version })) input.set(key, value);
    await expect(updateMediaAsset(input)).rejects.toThrow(data ? "status=updated" : "status=media-write-conflict");
    expect(query.eq).toHaveBeenCalledWith("updated_at", version);
    expect(query.is).toHaveBeenCalledWith("deleted_at", null);
    if (!data) expect(mocks.audit).not.toHaveBeenCalled();
  });
});
