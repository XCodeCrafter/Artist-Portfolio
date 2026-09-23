import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prepareImageKitReservation, resolveImageKitReservation, cancelImageKitReservation } from "@/lib/admin/imagekit-reservation-actions";

const mocks = vi.hoisted(() => ({
  admin: vi.fn(), headers: vi.fn(), origin: vi.fn(), pilot: vi.fn(), secret: vi.fn(),
  digest: vi.fn(), limit: vi.fn(), service: vi.fn(), rpc: vi.fn(),
}));
vi.mock("@/lib/admin/auth", () => ({ requireAdmin: mocks.admin }));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("@/lib/admin/action-security", () => ({ verifyAdminActionOrigin: mocks.origin }));
vi.mock("@/lib/admin/media-upload-config", () => ({ getImageKitPilotUploadCredentials: mocks.pilot }));
vi.mock("@/lib/admin/security-secret", () => ({ hasAuthSecuritySecret: mocks.secret, keyedDigest: mocks.digest }));
vi.mock("@/lib/security/rate-limit", () => ({ consumeDatabaseRateLimit: mocks.limit }));
vi.mock("@/lib/admin/service", () => ({ createAdminServiceClient: mocks.service }));

const intentId = "123e4567-e89b-42d3-a456-426614174000";
const actorId = "00000000-0000-4000-8000-000000000001";
const assetId = `imagekit-${intentId}`;
const request = { intentId, label: "Portrait", alt: "Artist", usageKey: "gallery", sortOrder: 0, isPublished: true,
  mimeType: "image/jpeg", sizeBytes: 1024, checksumSha256: "a".repeat(64) };
const credentials = { imageKitId: "test_artist", urlEndpoint: "https://ik.imagekit.io/test_artist", publicKey: "public_do_not_return", privateKey: "private_do_not_return" };
const snapshot = {
  intentId, assetId, physicalObjectId: "00000000-0000-4000-8000-000000000002",
  storageProvider: "imagekit", storageContainer: "test_artist",
  objectKey: `media/source/${assetId}/${intentId}.jpg`, mediaType: "image", mimeType: "image/jpeg",
  expectedByteSize: 1024, expectedChecksumSha256: "a".repeat(64), expiresAt: "2026-09-22T12:10:00+00:00",
  status: "prepared", issuedAt: null, authorityExpiresAt: null, fileId: null, versionId: null,
  versionToken: null, sourceVariantId: null, cleanupState: "not_needed",
};
const methods = [
  ["prepare", prepareImageKitReservation, request],
  ["resolve", resolveImageKitReservation, { intentId }],
  ["cancel", cancelImageKitReservation, { intentId }],
] as const;
beforeEach(() => {
  vi.resetAllMocks();
  mocks.admin.mockResolvedValue({ id: actorId, hasActiveProfile: true });
  mocks.headers.mockResolvedValue(new Headers({ origin: "http://localhost:3101" }));
  mocks.origin.mockResolvedValue(true);
  mocks.pilot.mockReturnValue({ isAvailable: true, credentials });
  mocks.secret.mockReturnValue(true);
  mocks.digest.mockReturnValue("f".repeat(64));
  mocks.limit.mockResolvedValue({ allowed: true, configured: true });
  mocks.service.mockReturnValue({ rpc: mocks.rpc });
  mocks.rpc.mockResolvedValue({ data: snapshot, error: null });
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("No provider call allowed"); }));
});
afterEach(() => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });

describe("ImageKit authenticated reservation boundary (no upload authority)", () => {
  it.each(methods)("%s preserves login/MFA redirects before all other work", async (_name, action) => {
    mocks.admin.mockRejectedValue(new Error("NEXT_REDIRECT:/admin/mfa"));
    await expect(action(null)).rejects.toThrow("NEXT_REDIRECT");
    for (const call of [mocks.headers, mocks.origin, mocks.pilot, mocks.limit, mocks.service]) expect(call).not.toHaveBeenCalled();
  });
  it.each([null, "null", "https://site.test/path", "https://site.test/", "https://user:password@site.test", "https://site.test:443", "HTTPS://SITE.TEST"])("rejects noncanonical or absent Origin %s even with a Referer", async origin => {
    const headers = new Headers({ referer: "http://localhost:3101/admin/v2" });
    if (origin !== null) headers.set("origin", origin);
    mocks.headers.mockResolvedValue(headers);
    expect(await resolveImageKitReservation({ intentId })).toMatchObject({ ok: false, code: "origin-blocked" });
    expect(mocks.pilot).not.toHaveBeenCalled(); expect(mocks.service).not.toHaveBeenCalled();
  });
  it.each(methods)("%s checks the configured-origin allowlist before configuration/DB", async (_name, action, input) => {
    mocks.origin.mockResolvedValue(false);
    expect(await action(input)).toMatchObject({ ok: false, code: "origin-blocked" });
    expect(mocks.origin).toHaveBeenCalledWith(actorId, "imagekit:reservation");
    expect(mocks.pilot).not.toHaveBeenCalled(); expect(mocks.limit).not.toHaveBeenCalled(); expect(mocks.service).not.toHaveBeenCalled();
  });
  it.each(methods)("%s stays closed when the pilot gate is unavailable", async (_name, action, input) => {
    mocks.pilot.mockReturnValue({ isAvailable: false, reason: "pilot-disabled" });
    expect(await action(input)).toMatchObject({ ok: false, code: "pilot-unavailable" });
    expect(mocks.limit).not.toHaveBeenCalled(); expect(mocks.service).not.toHaveBeenCalled();
  });
  it("does not accept an allowlist-only admin without an active DB profile", async () => {
    mocks.admin.mockResolvedValue({ id: actorId, hasActiveProfile: false });
    expect(await prepareImageKitReservation(request)).toMatchObject({ ok: false, code: "pilot-unavailable" });
    expect(mocks.service).not.toHaveBeenCalled();
  });
  it("requires a security secret before consuming any DB quota", async () => {
    mocks.secret.mockReturnValue(false);
    expect(await resolveImageKitReservation({ intentId })).toMatchObject({ ok: false, code: "service-unavailable" });
    expect(mocks.limit).not.toHaveBeenCalled(); expect(mocks.service).not.toHaveBeenCalled();
  });
  it.each([{ allowed: false, configured: true }, { allowed: true, configured: false }])("denies unreliable or exhausted limits: %j", async rate => {
    mocks.limit.mockResolvedValue(rate);
    expect(await prepareImageKitReservation(request)).toMatchObject({ ok: false, code: "rate-limited" });
    expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.service).not.toHaveBeenCalled();
  });
  it.each(methods)("%s uses a fixed actor-hashed, fail-closed quota", async (name, action, input) => {
    await action(input);
    expect(mocks.digest).toHaveBeenCalledWith("imagekit-reservation-actor", actorId);
    expect(mocks.limit).toHaveBeenCalledExactlyOnceWith({ bucket: `admin-imagekit:${name}`, identifierHash: "f".repeat(64),
      limit: name === "prepare" ? 10 : 60, windowSeconds: name === "prepare" ? 600 : 60, failClosed: true });
  });
  it.each(["missing", "throws"])("handles %s service configuration without exposing its error", async mode => {
    if (mode === "missing") mocks.service.mockReturnValue(null);
    else mocks.service.mockImplementation(() => { throw new Error(credentials.privateKey); });
    expect(await resolveImageKitReservation({ intentId })).toMatchObject({ ok: false, code: "service-unavailable" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each(methods)("%s rejects client-controlled authority/unknown fields", async (_name, action, input) => {
    for (const extra of [{ actorId: "another" }, { storageContainer: "foreign" }, { objectKey: "foreign" }, { token: "fake" }, { evidence: {} }, { assetId: "existing" }]) {
      expect(await action({ ...input, ...extra })).toMatchObject({ ok: false, code: "invalid-request" });
    }
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("prepares an actor-bound canonical reservation with exact declared facts and server TTL", async () => {
    const result = await prepareImageKitReservation(request);
    expect(result).toEqual({ ok: true, upload: { intentId, assetId, status: "prepared", expiresAt: snapshot.expiresAt, issued: false, cleanupPending: false } });
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("prepare_imagekit_upload_v1", {
      p_actor_id: actorId, p_intent_id: intentId, p_asset_id: assetId, p_asset_metadata: { label: "Portrait", alt: "Artist", usageKey: "gallery", sortOrder: 0, isPublished: true },
      p_storage_container: "test_artist", p_mime_type: "image/jpeg", p_byte_size: 1024, p_checksum_sha256: "a".repeat(64), p_ttl_seconds: 600,
    });
    const serialized = JSON.stringify(result);
    for (const internal of [credentials.publicKey, credentials.privateKey, snapshot.objectKey, snapshot.physicalObjectId, snapshot.expectedChecksumSha256, "versionToken", "fileId"]) expect(serialized).not.toContain(internal);
  });
  it("repeats preparation with the same ID instead of generating another orphan reservation", async () => {
    await prepareImageKitReservation(request); await prepareImageKitReservation(request);
    expect(mocks.rpc.mock.calls[0]).toEqual(mocks.rpc.mock.calls[1]);
  });
  it("resolves only using the authenticated actor and opaque intent ID", async () => {
    expect(await resolveImageKitReservation({ intentId })).toMatchObject({ ok: true });
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("resolve_imagekit_upload_v1", { p_actor_id: actorId, p_intent_id: intentId });
  });
  it("cancels logically with a fixed status and reports reconciliation without deleting anything", async () => {
    mocks.rpc.mockResolvedValue({ data: { ...snapshot, status: "cancelled", issuedAt: "2026-09-22T12:00:00Z", authorityExpiresAt: "2026-09-22T12:05:00Z", cleanupState: "pending" }, error: null });
    expect(await cancelImageKitReservation({ intentId })).toMatchObject({ ok: true, upload: { status: "cancelled", issued: true, cleanupPending: true } });
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("close_imagekit_upload_v1", { p_actor_id: actorId, p_intent_id: intentId, p_status: "cancelled" });
  });
  it("does not claim cancellation when DB returns a still-prepared reservation", async () => {
    expect(await cancelImageKitReservation({ intentId })).toMatchObject({ ok: false, code: "unconfirmed" });
  });
  it.each(["PGRST202", "42883", "42P01", "42501", "23503", "23505", "40001", "XX000"])("maps %s without disclosing backend details", async code => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code, message: credentials.privateKey, details: "private-table" } });
    const result = await resolveImageKitReservation({ intentId });
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain(credentials.privateKey);
    if (["PGRST202", "42883", "42P01"].includes(code)) expect(result).toMatchObject({ code: "migration-required" });
    if (["42501", "23503"].includes(code)) expect(result).toMatchObject({ code: "intent-unavailable" });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it("treats an ambiguous network failure as unconfirmed with no automatic retry/cleanup", async () => {
    mocks.rpc.mockRejectedValue(new Error(credentials.privateKey));
    const result = await prepareImageKitReservation(request);
    expect(result).toMatchObject({ ok: false, code: "unconfirmed" });
    expect(JSON.stringify(result)).not.toContain(credentials.privateKey);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it.each([null, [], { ...snapshot, actorId }, { ...snapshot, intentId: "00000000-0000-4000-8000-000000000000" },
    { ...snapshot, storageContainer: "foreign" }, { ...snapshot, expectedByteSize: 1025 },
    { ...snapshot, expectedChecksumSha256: "b".repeat(64) }])("rejects malformed or mismatched RPC response %j", async data => {
    mocks.rpc.mockResolvedValue({ data, error: null });
    expect(await prepareImageKitReservation(request)).toMatchObject({ ok: false, code: "unconfirmed" });
  });
  it("exposes no issuance/finalize/cleanup worker or provider client from these actions", () => {
    const source = readFileSync(new URL("../lib/admin/imagekit-reservation-actions.ts", import.meta.url), "utf8");
    expect(source.match(/export async function /g)).toHaveLength(3);
    expect(source).not.toMatch(/claim_imagekit|finalize_imagekit|finish_imagekit|imagekit-upload["']|imagekit-object-verification|\bfetch\s*\(/);
    const supabaseSource = readFileSync(new URL("../lib/admin/media-upload-actions.ts", import.meta.url), "utf8");
    expect(supabaseSource).not.toContain("imagekit-reservation-actions");
  });
});
