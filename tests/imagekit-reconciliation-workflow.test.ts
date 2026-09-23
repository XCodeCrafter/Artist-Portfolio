import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createImageKitReconciliationWorkflow, type ImageKitReconciliationAdmission,
  type ImageKitReconciliationResult } from "@/lib/admin/imagekit-reconciliation-workflow";
import type { observeImageKitUpload } from "@/lib/admin/imagekit-reconciliation-observation";

const intentId = "123e4567-e89b-42d3-a456-426614174000";
const assetId = `imagekit-${intentId}`;
const credentials = { imageKitId: "fictional_artist", urlEndpoint: "https://ik.imagekit.io/fictional_artist",
  publicKey: "public_fictional_test_key", privateKey: "private_fictional_test_key" };
const workerId = "fixture:worker-one";
const lease = {
  intentId, assetId, physicalObjectId: "00000000-0000-4000-8000-000000000002",
  storageProvider: "imagekit", storageContainer: credentials.imageKitId,
  objectKey: `media/source/${assetId}/${intentId}.jpg`, mediaType: "image", mimeType: "image/jpeg",
  expectedByteSize: 1024, expectedChecksumSha256: "a".repeat(64), expiresAt: "2026-09-22T12:10:00.000Z",
  status: "cancelled", issuedAt: "2026-09-22T12:00:00.000Z", authorityExpiresAt: "2026-09-22T12:05:00.000Z",
  fileId: null, versionId: null, versionToken: null, sourceVariantId: null, cleanupState: "leased",
  leaseId: "00000000-0000-4000-8000-000000000003", leaseExpiresAt: "2026-09-22T13:16:00.000Z",
};
const finish = (cleanupState = "pending", changes = {}) => {
  const { leaseId: _id, leaseExpiresAt: _expiry, ...base } = lease;
  void _id; void _expiry;
  return { ...base, cleanupState, ...changes };
};
const ready = { version: 1, ready: true };
type Reply = { data: unknown; error: unknown };
let rpc: ReturnType<typeof vi.fn<(name: string, args?: Record<string, unknown>) => Promise<Reply>>>;
let admit: ReturnType<typeof vi.fn<() => Promise<ImageKitReconciliationAdmission>>>;
let observe: ReturnType<typeof vi.fn<typeof observeImageKitUpload>>;
let workflow: ReturnType<typeof createImageKitReconciliationWorkflow>;
let time: number;
let results: ImageKitReconciliationResult[];
let allowMockedProvider: boolean;
const calls = () => rpc.mock.calls.map(([name]) => name);
const queue = (...values: unknown[]) => values.forEach(data => rpc.mockResolvedValueOnce({ data, error: null }));
const successfulQueue = (state = "pending") => queue(ready, [lease], ready, finish(state));
async function run() {
  const value = await workflow.runOnce(); results.push(value); return value;
}

beforeEach(() => {
  time = Date.parse("2026-09-22T13:11:00.000Z");
  results = []; allowMockedProvider = false;
  rpc = vi.fn().mockRejectedValue(new Error("Unexpected RPC with secret provider details"));
  admit = vi.fn().mockResolvedValue({ ok: true, workerId, credentials, client: { rpc } });
  observe = vi.fn<typeof observeImageKitUpload>().mockResolvedValue({ observation: "absent" });
  workflow = createImageKitReconciliationWorkflow({ admit, observe, now: () => time });
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("No real provider network permitted"); }));
});
afterEach(() => {
  if (!allowMockedProvider) expect(fetch).not.toHaveBeenCalled();
  expect(calls().every(name => ["get_imagekit_upload_readiness_v1", "claim_imagekit_upload_cleanup_v1", "finish_imagekit_upload_cleanup_v1"].includes(name))).toBe(true);
  expect(calls().filter(name => name === "claim_imagekit_upload_cleanup_v1").length).toBeLessThanOrEqual(1);
  expect(calls().filter(name => name === "finish_imagekit_upload_cleanup_v1").length).toBeLessThanOrEqual(1);
  for (const result of results) {
    for (const secret of [credentials.privateKey, credentials.publicKey, credentials.imageKitId, lease.objectKey,
      lease.leaseId, lease.physicalObjectId, lease.expectedChecksumSha256, workerId, "secret provider details"]) {
      expect(JSON.stringify(result)).not.toContain(secret);
    }
  }
  vi.useRealTimers(); vi.unstubAllGlobals();
});

describe("dormant reconciliation admission and bounded claims", () => {
  it.each([false, null, undefined, {}, { ok: false }])("denies malformed/unapproved admission %j", async value => {
    admit.mockResolvedValue(value as ImageKitReconciliationAdmission);
    expect(await run()).toEqual({ ok: false, code: "not-admitted" });
    expect(rpc).not.toHaveBeenCalled(); expect(observe).not.toHaveBeenCalled();
  });
  it("redacts admission exceptions", async () => {
    admit.mockRejectedValue(new Error(credentials.privateKey));
    expect(await run()).toEqual({ ok: false, code: "not-admitted" });
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each(["", "bad worker", "w".repeat(129), "../worker", "worker\n"]) ("rejects worker identity %j", async value => {
    admit.mockResolvedValue({ ok: true, workerId: value, credentials, client: { rpc } });
    expect(await run()).toEqual({ ok: false, code: "not-admitted" });
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each([
    { privateKey: "" }, { publicKey: "public_short" }, { imageKitId: "other" },
    { urlEndpoint: "https://ik.imagekit.io/fictional_artist/" }, { urlEndpoint: "https://evil.test/fictional_artist" },
    { privateKey: "private_fictional_test_key\n" }, { extra: true },
  ])("rejects incomplete or foreign account config %j", async changes => {
    admit.mockResolvedValue({ ok: true, workerId, credentials: { ...credentials, ...changes }, client: { rpc } });
    expect(await run()).toEqual({ ok: false, code: "not-admitted" });
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each([0, -1, NaN, Infinity, 1.5])("rejects invalid clock %j before SQL", async value => {
    time = value;
    expect(await run()).toEqual({ ok: false, code: "unconfirmed" });
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each([null, [], {}, { version: 1, ready: false }, { version: 2, ready: true }, { ...ready, extra: true }])("requires exact readiness %j", async value => {
    queue(value);
    expect(await run()).toEqual({ ok: false, code: "not-ready" });
    expect(calls()).toEqual(["get_imagekit_upload_readiness_v1"]);
  });
  it("returns idle without asserting the whole queue is clear", async () => {
    queue(ready, []);
    expect(await run()).toEqual({ ok: true, state: "idle" });
    expect(rpc).toHaveBeenLastCalledWith("claim_imagekit_upload_cleanup_v1", { p_worker_id: workerId, p_limit: 1 });
    expect(observe).not.toHaveBeenCalled();
  });
  it.each([null, {}, lease, [lease, lease], [null]])("refuses unexpected claim shape %j", async value => {
    queue(ready, value);
    expect(await run()).toEqual({ ok: false, code: "invalid-lease" });
    expect(observe).not.toHaveBeenCalled(); expect(rpc).toHaveBeenCalledTimes(2);
  });
  it.each([
    { storageContainer: "foreign_account" }, { status: "prepared" }, { status: "consumed" },
    { issuedAt: null }, { fileId: "file_from_browser" }, { cleanupState: "pending" },
    { leaseId: "not-a-lease" }, { leaseExpiresAt: "2026-09-22T13:11:20.000Z" },
    { expiresAt: "2026-09-22T13:05:00.000Z" }, { objectKey: "../../../other/file.jpg" },
  ])("does not probe or finish an invalid/unsafe lease %j", async changes => {
    queue(ready, [{ ...lease, ...changes }]);
    expect(await run()).toEqual({ ok: false, code: "invalid-lease" });
    expect(observe).not.toHaveBeenCalled(); expect(rpc).toHaveBeenCalledTimes(2);
  });
});

describe("observations retain uncertainty and lease fencing", () => {
  it.each([
    ["absent", "pending"], ["retry", "pending"], ["unsafe", "attention"],
    ["absent", "attention"], ["retry", "attention"],
  ] as const)("records %s as %s, never complete/deleted", async (observation, state) => {
    observe.mockResolvedValue({ observation }); successfulQueue(state);
    expect(await run()).toEqual({ ok: true, state: "observed", observation, queueState: state });
    expect(observe).toHaveBeenCalledExactlyOnceWith({ credentials, intent: {
      intentId, assetId, storageContainer: credentials.imageKitId, objectKey: lease.objectKey,
      mimeType: lease.mimeType, expectedByteSize: lease.expectedByteSize, expectedChecksumSha256: lease.expectedChecksumSha256,
    } });
    expect(rpc).toHaveBeenLastCalledWith("finish_imagekit_upload_cleanup_v1", {
      p_intent_id: intentId, p_lease_id: lease.leaseId, p_worker_id: workerId, p_result: observation,
    });
  });
  it.each([null, {}, { observation: "deleted" }, { observation: "absent", fileId: "client_file" }, { observation: "unsafe", extra: true }])("rejects malformed observation %j", async value => {
    queue(ready, [lease]); observe.mockResolvedValue(value as Awaited<ReturnType<typeof observeImageKitUpload>>);
    expect(await run()).toEqual({ ok: false, code: "unconfirmed" }); expect(rpc).toHaveBeenCalledTimes(2);
  });
  it("does not acknowledge a thrown observation", async () => {
    queue(ready, [lease]); observe.mockRejectedValue(new Error(credentials.privateKey));
    expect(await run()).toEqual({ ok: false, code: "unconfirmed" }); expect(rpc).toHaveBeenCalledTimes(2);
  });
  it("keeps a lease unacknowledged on backward clock movement", async () => {
    queue(ready, [lease]); observe.mockImplementation(async () => { time -= 1; return { observation: "absent" }; });
    expect(await run()).toEqual({ ok: false, code: "unconfirmed" }); expect(rpc).toHaveBeenCalledTimes(2);
  });
  it("does not finish after observation exhausts the lease", async () => {
    queue(ready, [lease]); observe.mockImplementation(async () => { time += 295_000; return { observation: "absent" }; });
    expect(await run()).toEqual({ ok: false, code: "lease-expired" }); expect(rpc).toHaveBeenCalledTimes(2);
  });
  it("rechecks readiness after provider latency", async () => {
    queue(ready, [lease], { version: 1, ready: false });
    expect(await run()).toEqual({ ok: false, code: "not-ready" }); expect(rpc).toHaveBeenCalledTimes(3);
  });
  it("rechecks lease time after readiness latency", async () => {
    queue(ready, [lease]);
    rpc.mockImplementationOnce(async () => { time += 295_000; return { data: ready, error: null }; });
    expect(await run()).toEqual({ ok: false, code: "lease-expired" }); expect(rpc).toHaveBeenCalledTimes(3);
  });
  it.each([
    null, {}, finish("leased"), finish("not_needed"), finish("pending", { status: "consumed" }),
    finish("pending", { expectedByteSize: 1 }), finish("pending", { leaseId: lease.leaseId }),
    finish("pending", { issuedAt: "2026-09-22T11:59:00.000Z" }),
  ])("does not report a malformed/drifted finish as success %j", async value => {
    queue(ready, [lease], ready, value);
    expect(await run()).toEqual({ ok: false, code: "unconfirmed" }); expect(rpc).toHaveBeenCalledTimes(4);
  });
  it("requires manual attention for unsafe observations", async () => {
    observe.mockResolvedValue({ observation: "unsafe" }); successfulQueue();
    expect(await run()).toEqual({ ok: false, code: "unconfirmed" });
  });
  it.each(["readiness", "claim", "recheck", "finish"])("does not replay an ambiguous %s RPC", async phase => {
    const index = ["readiness", "claim", "recheck", "finish"].indexOf(phase);
    for (const data of [ready, [lease], ready, finish()].slice(0, index)) queue(data);
    rpc.mockRejectedValueOnce(new Error(credentials.privateKey));
    expect(await run()).toEqual({ ok: false, code: "unconfirmed" }); expect(rpc).toHaveBeenCalledTimes(index + 1);
  });
  it.each(["claim", "finish"])("does not retry a returned %s error", async phase => {
    queue(ready); if (phase === "finish") queue([lease], ready);
    rpc.mockResolvedValueOnce({ data: phase === "finish" ? finish() : [lease], error: { code: "40001", message: credentials.privateKey } });
    expect(await run()).toEqual({ ok: false, code: "unconfirmed" });
    expect(rpc).toHaveBeenCalledTimes(phase === "claim" ? 2 : 4);
  });
});

describe("bounded execution without background continuation", () => {
  it.each(["admission", "readiness", "claim", "observe", "finish"])("bounds a hanging %s", async phase => {
    vi.useFakeTimers();
    const never = new Promise<never>(() => {});
    if (phase === "admission") admit.mockReturnValue(never);
    else if (phase === "readiness") rpc.mockReturnValueOnce(never);
    else {
      queue(ready);
      if (phase === "claim") rpc.mockReturnValueOnce(never);
      else {
        queue([lease]);
        if (phase === "observe") observe.mockReturnValueOnce(never);
        else { queue(ready); rpc.mockReturnValueOnce(never); }
      }
    }
    const pending = run();
    await vi.advanceTimersByTimeAsync(30_001);
    expect(await pending).toEqual({ ok: false, code: phase === "admission" ? "not-admitted" : "unconfirmed" });
    expect(vi.getTimerCount()).toBe(0);
  });
  it("does not probe if a lost claim eventually responds after timeout", async () => {
    vi.useFakeTimers(); queue(ready);
    let resolve!: (value: Reply) => void;
    rpc.mockReturnValueOnce(new Promise(done => { resolve = done; }));
    const pending = run(); await vi.advanceTimersByTimeAsync(30_001);
    expect(await pending).toEqual({ ok: false, code: "unconfirmed" });
    resolve({ data: [lease], error: null }); await vi.advanceTimersByTimeAsync(0);
    expect(observe).not.toHaveBeenCalled(); expect(rpc).toHaveBeenCalledTimes(2);
  });
  it("wires the default read-only observer with mocked HTTP only", async () => {
    allowMockedProvider = true;
    const response = new Response("[]", { headers: { "content-type": "application/json" } });
    const query = new URLSearchParams({ path: `/media/source/${assetId}/`, type: "all", limit: "2", skip: "0" });
    Object.defineProperty(response, "url", { value: `https://api.imagekit.io/v1/files?${query}` });
    vi.mocked(fetch).mockResolvedValue(response);
    workflow = createImageKitReconciliationWorkflow({ admit, now: () => time }); successfulQueue();
    expect(await run()).toEqual({ ok: true, state: "observed", observation: "absent", queueState: "pending" });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toMatch(/^https:\/\/api\.imagekit\.io\/v1\/files\?/);
    expect(vi.mocked(fetch).mock.calls[0][1]?.method).toBe("GET");
  });
});

it("has no application route/action/UI imports or destructive provider call", () => {
  const files = (path: string): string[] => readdirSync(path, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? files(join(path, entry.name)) : /\.[cm]?[jt]sx?$/.test(entry.name) ? [join(path, entry.name)] : []);
  // A read-only overview is allowed; the worker and provider adapters remain dormant.
  for (const file of files("app")) expect(readFileSync(file, "utf8")).not.toMatch(/imagekit-reconciliation-(?:workflow|observation|contracts)["']/);
  const source = readFileSync("lib/admin/imagekit-reconciliation-workflow.ts", "utf8");
  expect(source).not.toMatch(/['"]use server['"]|method:\s*['"](?:DELETE|POST|PUT|PATCH)['"]|createImageKitUploadAuthority/);
});
