import { beforeEach, describe, expect, it, vi } from "vitest";
import { mutateMediaAssetV2, saveMediaDetailsV2 } from "@/app/admin/v2/media/actions";
const mocks = vi.hoisted(() => ({ admin: vi.fn(), origin: vi.fn(), service: vi.fn(), audit: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/admin/auth", () => ({ requireAdmin: mocks.admin }));
vi.mock("@/lib/admin/action-security", () => ({ verifyAdminActionOrigin: mocks.origin }));
vi.mock("@/lib/admin/service", () => ({ createAdminServiceClient: mocks.service }));
vi.mock("@/lib/admin/audit", () => ({ writeAuditLog: mocks.audit }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
const details = { id: "photo", expectedUpdatedAt: "2026-09-20T10:00:00.123456Z", label: "Portrait", alt: "", usageKey: "", isPublished: true };
const mutation = { id: details.id, expectedUpdatedAt: details.expectedUpdatedAt, operation: "replace_and_trash", replacementId: "replacement" };
beforeEach(() => { vi.resetAllMocks(); mocks.admin.mockResolvedValue({ id: "verified-admin" }); mocks.origin.mockResolvedValue(true); });
function clientWithCandidate(rpc: ReturnType<typeof vi.fn>, src = "/media/next.jpg") {
  const query = { select: vi.fn(), eq: vi.fn(), is: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data: { src, updated_at: details.expectedUpdatedAt }, error: null }) };
  for (const key of ["select", "eq", "is"] as const) query[key].mockReturnValue(query);
  return { rpc, from: vi.fn().mockReturnValue(query) };
}

describe("Media library V2 server boundary", () => {
  it.each([saveMediaDetailsV2, mutateMediaAssetV2])("authenticates malformed input before touching service access", async (action) => {
    mocks.admin.mockRejectedValue(new Error("unauthorized"));
    await expect(action(null)).rejects.toThrow("unauthorized");
    expect(mocks.service).not.toHaveBeenCalled();
  });
  it.each([saveMediaDetailsV2, mutateMediaAssetV2])("blocks cross-origin writes before service access", async (action) => {
    mocks.origin.mockResolvedValue(false);
    expect(await action(details)).toMatchObject({ ok: false }); expect(mocks.service).not.toHaveBeenCalled();
  });
  it("rejects unknown update columns and malicious operations", async () => {
    expect(await saveMediaDetailsV2({ ...details, storagePath: "arbitrary" })).toMatchObject({ ok: false });
    expect(await mutateMediaAssetV2({ ...mutation, operation: "purge" })).toMatchObject({ ok: false });
    expect(mocks.service).not.toHaveBeenCalled();
  });
  it("writes only metadata, requiring the exact snapshot and an untrashed row", async () => {
    const query = { update: vi.fn(), eq: vi.fn(), is: vi.fn(), select: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data: { id: details.id }, error: null }) };
    for (const key of ["update", "eq", "is", "select"] as const) query[key].mockReturnValue(query);
    mocks.service.mockReturnValue({ from: vi.fn().mockReturnValue(query) });
    expect(await saveMediaDetailsV2(details)).toMatchObject({ ok: true });
    expect(query.update).toHaveBeenCalledWith({ label: details.label, alt: "", usage_key: "", is_published: true });
    expect(query.eq).toHaveBeenCalledWith("updated_at", details.expectedUpdatedAt);
    expect(query.is).toHaveBeenCalledWith("deleted_at", null);
    query.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect(await saveMediaDetailsV2(details)).toMatchObject({ ok: false, conflict: true });
  });
  it("delegates atomic lifecycle changes to the service-only RPC with verified actor and version", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { outcome: "replaced_and_trashed" }, error: null });
    mocks.service.mockReturnValue(clientWithCandidate(rpc));
    expect(await mutateMediaAssetV2(mutation)).toMatchObject({ ok: true });
    expect(rpc).toHaveBeenCalledWith("mutate_media_asset_v2", { p_asset_id: details.id, p_expected_updated_at: details.expectedUpdatedAt, p_actor_id: "verified-admin", p_operation: "replace_and_trash", p_replacement_id: "replacement", p_replacement_expected_updated_at: details.expectedUpdatedAt });
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "media_v2_replaced_and_trashed", recordId: details.id }));
    expect(mocks.revalidate).toHaveBeenCalledWith("/", "layout");
  });
  it.each(["conflict", "missing", "in_use", "invalid_replacement", "pipeline_busy", "unknown"])("never claims success or writes a success audit for %s", async (outcome) => {
    mocks.service.mockReturnValue(clientWithCandidate(vi.fn().mockResolvedValue({ data: { outcome }, error: null })));
    expect(await mutateMediaAssetV2(mutation)).toMatchObject({ ok: false }); expect(mocks.audit).not.toHaveBeenCalled(); expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("reports missing migrations and does not expose backend details", async () => {
    mocks.service.mockReturnValue(clientWithCandidate(vi.fn().mockResolvedValue({ data: null, error: { code: "PGRST202", message: "internal-secret-details" } })));
    const result = await mutateMediaAssetV2(mutation);
    expect(result.message).toContain("0040"); expect(result.message).not.toContain("internal-secret-details");
  });
  it("rejects replacements outside configured media origins before any mutation", async () => {
    const rpc = vi.fn(); mocks.service.mockReturnValue(clientWithCandidate(rpc, "https://untrusted.example/photo.jpg"));
    expect(await mutateMediaAssetV2(mutation)).toMatchObject({ ok: false }); expect(rpc).not.toHaveBeenCalled();
  });
});
