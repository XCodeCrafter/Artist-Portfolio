import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getImageKitReconciliationOverview, parseImageKitReconciliationOverview } from "@/lib/admin/imagekit-reconciliation-overview";
import type { ImageKitReconciliationStage } from "@/lib/admin/imagekit-reconciliation-overview-types";

const mocks = vi.hoisted(() => ({ admin: vi.fn(), client: vi.fn(), rpc: vi.fn(), abort: vi.fn() }));
vi.mock("@/lib/admin/auth", () => ({ requireAdmin: mocks.admin }));
vi.mock("@/lib/admin/service", () => ({ createAdminServiceClient: mocks.client }));
const actorId = "00000000-0000-4000-8000-000000000001";
const generatedAt = "2026-09-22T12:00:00+00:00";
const before = "2026-09-22T11:59:00+00:00", after = "2026-09-22T12:01:00+00:00";
const counts = () => ({ uploading: 0, waiting: 0, due: 0, checking: 0, attention: 0 });
const row = (stage: ImageKitReconciliationStage = "attention", index = 1) => ({
  intentId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`, label: `Fictional upload ${index}`,
  mediaType: "image" as const, sizeBytes: 1024, stage, attempts: 1,
  lastObservation: "unsafe" as const, nextCheckAt: stage === "attention" ? null : stage === "due" ? before : after,
  updatedAt: before,
});
const empty = () => ({ version: 1, generatedAt, total: 0, counts: counts(), items: [], hasMore: false });
const overview = (stage: ImageKitReconciliationStage = "attention", total = 1, limit = 20) => ({
  ...empty(), total, counts: { ...counts(), [stage]: total },
  items: Array.from({ length: Math.min(total, limit) }, (_, index) => row(stage, index + 1)), hasMore: total > limit,
});

describe("reconciliation overview safe display contract", () => {
  it("accepts an explicitly verified empty overview", () => {
    expect(parseImageKitReconciliationOverview(empty())).toEqual(empty());
  });
  it.each(["uploading", "waiting", "due", "checking", "attention"] as const)("accepts consistent %s rows", stage => {
    expect(parseImageKitReconciliationOverview(overview(stage))).toEqual(overview(stage));
  });
  it("accepts the exact boundary for due timestamps", () => {
    const data = overview("due"); data.items[0].nextCheckAt = generatedAt;
    expect(parseImageKitReconciliationOverview(data)).toEqual(data);
  });
  it("accepts a bounded list with honest total/hasMore", () => {
    expect(parseImageKitReconciliationOverview(overview("attention", 300))).toEqual(overview("attention", 300));
  });
  it.each([1, 20, 50])("honors explicit bounded limit %i", limit => {
    expect(parseImageKitReconciliationOverview(overview("attention", 51, limit), limit)).not.toBeNull();
  });
  it.each([0, -1, 51, NaN, Infinity, 1.5])("rejects invalid caller limit %j", limit => {
    expect(parseImageKitReconciliationOverview(empty(), limit)).toBeNull();
  });
  it.each([null, undefined, [], {}, false, 0, "{}", { ...empty(), version: 2 },
    { ...empty(), generatedAt: "yesterday" }, { ...empty(), generatedAt: "2026-09-22" },
    { ...empty(), extra: "provider secret" }, { ...empty(), hasMore: true },
    { ...empty(), total: -1 }, { ...empty(), total: "0" }, { ...empty(), total: 0.5 },
    { ...empty(), counts: { ...counts(), attention: -1 } },
    { ...empty(), counts: { ...counts(), leakedAccount: "private" } },
    { ...empty(), counts: { ...counts(), uploading: Number.MAX_SAFE_INTEGER, waiting: 1 } },
  ])("rejects malformed/inconsistent envelopes %j", input => {
    expect(parseImageKitReconciliationOverview(input)).toBeNull();
  });
  it.each([
    { intentId: "other" }, { intentId: actorId.toUpperCase() + "x" }, { label: "" }, { label: "x".repeat(221) },
    { mediaType: "audio" }, { sizeBytes: 0 }, { sizeBytes: 0.5 }, { sizeBytes: "1024" }, { sizeBytes: 10 * 1024 * 1024 + 1 },
    { mediaType: "video", sizeBytes: 95_000_001 }, { stage: "complete" }, { attempts: -1 }, { attempts: 6 },
    { attempts: 0.5 }, { lastObservation: "deleted" }, { nextCheckAt: after }, { updatedAt: "wrong" },
    { fileId: "private_file" }, { objectKey: "private/object.jpg" }, { leaseId: actorId }, { workerId: "secret" },
    { checksum: "a".repeat(64) }, { storageContainer: "private-account" },
  ])("rejects malformed or over-shared items %j", changes => {
    const input = overview();
    expect(parseImageKitReconciliationOverview({ ...input, items: [{ ...input.items[0], ...changes }] })).toBeNull();
  });
  it.each(["uploading", "waiting", "checking"] as const)("refuses stale %s classification", stage => {
    const input = overview(stage);
    expect(parseImageKitReconciliationOverview({ ...input, items: [{ ...input.items[0], nextCheckAt: generatedAt }] })).toBeNull();
  });
  it("refuses a due row with a future check", () => {
    const input = overview("due"); input.items[0].nextCheckAt = after;
    expect(parseImageKitReconciliationOverview(input)).toBeNull();
  });
  it("refuses any non-attention row without a deadline", () => {
    const input = overview("due"); input.items[0].nextCheckAt = null;
    expect(parseImageKitReconciliationOverview(input)).toBeNull();
  });
  it("refuses hidden rows, duplicate IDs and dishonest stage counts", () => {
    const input = overview("attention", 2);
    expect(parseImageKitReconciliationOverview({ ...input, items: [input.items[0]] })).toBeNull();
    expect(parseImageKitReconciliationOverview({ ...input, items: [input.items[0], input.items[0]] })).toBeNull();
    expect(parseImageKitReconciliationOverview({ ...input, counts: { ...counts(), uploading: 2 } })).toBeNull();
  });
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.admin.mockResolvedValue({ id: actorId, hasActiveProfile: true, role: "owner" });
  mocks.client.mockReturnValue({ rpc: mocks.rpc });
  mocks.rpc.mockReturnValue({ abortSignal: mocks.abort });
  mocks.abort.mockResolvedValue({ data: empty(), error: null });
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("No provider calls allowed"); }));
});
afterEach(() => {
  expect(fetch).not.toHaveBeenCalled();
  expect(mocks.rpc.mock.calls.every(([name]) => name === "get_imagekit_reconciliation_overview_v1")).toBe(true);
  expect(mocks.rpc.mock.calls.length).toBeLessThanOrEqual(1);
  vi.useRealTimers(); vi.unstubAllGlobals();
});

describe("authenticated read-only overview loader", () => {
  it("authenticates before constructing a privileged client and preserves redirects", async () => {
    const error = new Error("NEXT_REDIRECT:/admin/mfa"); mocks.admin.mockRejectedValue(error);
    await expect(getImageKitReconciliationOverview()).rejects.toBe(error);
    expect(mocks.client).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each([{ id: actorId, hasActiveProfile: false }, { id: "spoofed", hasActiveProfile: true }])("requires an active trusted actor %j", async admin => {
    mocks.admin.mockResolvedValue(admin);
    expect(await getImageKitReconciliationOverview()).toEqual({ status: "unavailable", reason: "unavailable" });
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it("returns verified data using only the fixed read RPC and server actor", async () => {
    expect(await getImageKitReconciliationOverview()).toEqual({ status: "available", overview: empty() });
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("get_imagekit_reconciliation_overview_v1", { p_actor_id: actorId, p_limit: 20 });
    expect(mocks.abort).toHaveBeenCalledWith(expect.any(AbortSignal));
    expect(mocks.abort.mock.calls[0][0].aborted).toBe(true);
  });
  it("does not confuse missing configuration with no pending files", async () => {
    mocks.client.mockReturnValue(null);
    expect(await getImageKitReconciliationOverview()).toEqual({ status: "unavailable", reason: "not-configured" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each([
    ["PGRST202", "migration-required"], ["42883", "migration-required"], ["55000", "not-ready"],
    ["42501", "unavailable"], ["XX000", "unavailable"], ["", "unavailable"],
  ])("maps %s safely to %s without private error details", async (code, reason) => {
    mocks.abort.mockResolvedValue({ data: empty(), error: { code, message: "secret provider key" } });
    expect(await getImageKitReconciliationOverview()).toEqual({ status: "unavailable", reason });
  });
  it.each([null, {}, [], { ...empty(), leaseId: actorId }, { ...empty(), total: 1 }])("does not render corrupt reads as empty %j", async data => {
    mocks.abort.mockResolvedValue({ data, error: null });
    expect(await getImageKitReconciliationOverview()).toEqual({ status: "unavailable", reason: "unavailable" });
  });
  it.each(["create", "rpc", "response"])("redacts exceptions at %s", async phase => {
    const error = new Error("private_database_url");
    if (phase === "create") mocks.client.mockImplementationOnce(() => { throw error; });
    if (phase === "rpc") mocks.rpc.mockImplementationOnce(() => { throw error; });
    if (phase === "response") mocks.abort.mockRejectedValueOnce(error);
    expect(await getImageKitReconciliationOverview()).toEqual({ status: "unavailable", reason: "unavailable" });
  });
  it("bounds an ignored abort and never substitutes a late response", async () => {
    vi.useFakeTimers();
    let resolve!: (value: unknown) => void;
    mocks.abort.mockReturnValue(new Promise(done => { resolve = done; }));
    const pending = getImageKitReconciliationOverview();
    await vi.advanceTimersByTimeAsync(5001);
    expect(await pending).toEqual({ status: "unavailable", reason: "unavailable" });
    expect(mocks.abort.mock.calls[0][0].aborted).toBe(true);
    resolve({ data: empty(), error: null }); await vi.advanceTimersByTimeAsync(0);
    expect(mocks.rpc).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
  });
});
