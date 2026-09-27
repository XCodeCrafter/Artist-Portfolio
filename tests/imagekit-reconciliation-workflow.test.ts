import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createImageKitReconciliationWorkflow, type ImageKitReconciliationAdmission,
  type ImageKitReconciliationResult } from "@/lib/admin/imagekit-reconciliation-workflow";
import type { observeImageKitUpload } from "@/lib/admin/imagekit-reconciliation-observation";
import type { ImageKitObservationBudget } from "@/lib/admin/imagekit-observation-contracts";

const intentId = "123e4567-e89b-42d3-a456-426614174000";
const assetId = `imagekit-${intentId}`;
const credentials = { imageKitId: "fictional_artist", urlEndpoint: "https://ik.imagekit.io/fictional_artist",
  publicKey: "public_fictional_test_key", privateKey: "private_fictional_test_key" };
const workerId = "fixture:worker-one";
const actorId = "00000000-0000-4000-8000-000000000001";
const approval = { version: 1 as const, storageContainer: credentials.imageKitId, urlEndpoint: credentials.urlEndpoint,
  credentialBinding: "b".repeat(64), revision: "00000000-0000-4000-8000-000000000004", expiresAt: "2026-09-22T13:21:00.000Z" };
const authorization = { p_actor_id: actorId, p_storage_container: credentials.imageKitId, p_url_endpoint: credentials.urlEndpoint,
  p_credential_binding: approval.credentialBinding, p_approval_revision: approval.revision, p_worker_id: workerId };
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
let admit: ReturnType<typeof vi.fn<(budget: ImageKitObservationBudget) => Promise<ImageKitReconciliationAdmission>>>;
let revalidate: ReturnType<typeof vi.fn<(budget: ImageKitObservationBudget) => Promise<boolean>>>;
let observe: ReturnType<typeof vi.fn<typeof observeImageKitUpload>>;
let workflow: ReturnType<typeof createImageKitReconciliationWorkflow>;
let time: number;
let monotonicTime: number;
let results: ImageKitReconciliationResult[];
let allowMockedProvider: boolean;
const calls = () => rpc.mock.calls.map(([name]) => name);
const queue = (...values: unknown[]) => values.forEach(data => rpc.mockResolvedValueOnce({ data, error: null }));
const successfulQueue = (state = "pending") => queue(ready, [lease], ready, finish(state));
const admission = (): Extract<ImageKitReconciliationAdmission, { ok: true }> => ({
  ok: true, actorId, workerId, credentials, approval, client: { rpc }, revalidate,
});
async function run() {
  const value = await workflow.runOnce(); results.push(value); return value;
}

beforeEach(() => {
  time = Date.parse("2026-09-22T13:11:00.000Z");
  monotonicTime = 0;
  results = []; allowMockedProvider = false;
  rpc = vi.fn().mockRejectedValue(new Error("Unexpected RPC with secret provider details"));
  revalidate = vi.fn().mockResolvedValue(true);
  admit = vi.fn().mockResolvedValue(admission());
  observe = vi.fn<typeof observeImageKitUpload>().mockResolvedValue({ observation: "absent" });
  workflow = createImageKitReconciliationWorkflow({ admit, observe, now: () => time, monotonicNow: () => monotonicTime });
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("No real provider network permitted"); }));
});
afterEach(() => {
  if (!allowMockedProvider) expect(fetch).not.toHaveBeenCalled();
  expect(calls().every(name => ["get_imagekit_upload_readiness_v1", "claim_imagekit_observation_v1", "finish_imagekit_observation_v1"].includes(name))).toBe(true);
  expect(calls().filter(name => name === "claim_imagekit_observation_v1").length).toBeLessThanOrEqual(1);
  expect(calls().filter(name => name === "finish_imagekit_observation_v1").length).toBeLessThanOrEqual(1);
  for (const result of results) {
    for (const secret of [credentials.privateKey, credentials.publicKey, credentials.imageKitId, lease.objectKey,
      lease.leaseId, lease.physicalObjectId, lease.expectedChecksumSha256, workerId, actorId, approval.revision,
      approval.credentialBinding, "secret provider details"]) {
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
    admit.mockResolvedValue({ ...admission(), workerId: value });
    expect(await run()).toEqual({ ok: false, code: "not-admitted" });
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each([
    { privateKey: "" }, { publicKey: "public_short" }, { imageKitId: "other" },
    { urlEndpoint: "https://ik.imagekit.io/fictional_artist/" }, { urlEndpoint: "https://evil.test/fictional_artist" },
    { privateKey: "private_fictional_test_key\n" }, { extra: true },
  ])("rejects incomplete or foreign account config %j", async changes => {
    admit.mockResolvedValue({ ...admission(), credentials: { ...credentials, ...changes } });
    expect(await run()).toEqual({ ok: false, code: "not-admitted" });
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each([0, -1, NaN, Infinity, 1.5])("rejects invalid clock %j before SQL", async value => {
    time = value;
    expect(await run()).toEqual({ ok: false, code: "not-admitted" });
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each(["", "not-an-actor", actorId.toUpperCase().replace("00000000", "AAAAAAAA"), "00000000-0000-1000-8000-000000000001"])("rejects invalid actor %j", async value => {
    admit.mockResolvedValue({ ...admission(), actorId: value });
    expect(await run()).toEqual({ ok: false, code: "not-admitted" });
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each([
    undefined, null, {}, { ...approval, version: 2 }, { ...approval, storageContainer: "other" },
    { ...approval, urlEndpoint: `${approval.urlEndpoint}/` }, { ...approval, credentialBinding: "unbound" },
    { ...approval, revision: "unapproved" }, { ...approval, extra: "not-a-proof" },
    { ...approval, expiresAt: "2026-09-22T13:11:34.999Z" },
    { ...approval, expiresAt: "2026-09-22T13:10:00.000Z" },
    { ...approval, expiresAt: "2026-09-24T13:11:00.000Z" },
  ])("rejects absent, foreign or expired account approval %j", async value => {
    admit.mockResolvedValue({ ...admission(), approval: value } as ImageKitReconciliationAdmission);
    expect(await run()).toEqual({ ok: false, code: "not-admitted" });
    expect(rpc).not.toHaveBeenCalled(); expect(observe).not.toHaveBeenCalled();
  });
  it("requires a server revalidation function, not an approved flag", async () => {
    admit.mockResolvedValue({ ...admission(), revalidate: undefined, approved: true } as unknown as ImageKitReconciliationAdmission);
    expect(await run()).toEqual({ ok: false, code: "not-admitted" });
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
    expect(rpc).toHaveBeenLastCalledWith("claim_imagekit_observation_v1", authorization);
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
  it.each(["claim", "provider", "finish"])("stops at %s when session, approval or credential binding was revoked", async phase => {
    successfulQueue();
    const index = ["claim", "provider", "finish"].indexOf(phase);
    for (let step = 0; step < index; step++) revalidate.mockResolvedValueOnce(true);
    revalidate.mockResolvedValueOnce(false);
    expect(await run()).toEqual({ ok: false, code: "not-admitted" });
    expect(rpc).toHaveBeenCalledTimes([1, 2, 3][index]);
    expect(observe).toHaveBeenCalledTimes(index === 2 ? 1 : 0);
    expect(calls()).not.toContain("finish_imagekit_observation_v1");
  });
  it.each([undefined, null, 1, "true", {}])("requires literal successful revalidation %j", async value => {
    queue(ready); revalidate.mockResolvedValue(value as boolean);
    expect(await run()).toEqual({ ok: false, code: "not-admitted" });
    expect(rpc).toHaveBeenCalledTimes(1); expect(observe).not.toHaveBeenCalled();
  });
  it("does not downgrade to the legacy global claim if account approval SQL is unavailable", async () => {
    queue(ready); rpc.mockResolvedValueOnce({ data: null, error: { code: "PGRST202", message: "scoped migration unavailable" } });
    expect(await run()).toEqual({ ok: false, code: "unconfirmed" });
    expect(calls()).toEqual(["get_imagekit_upload_readiness_v1", "claim_imagekit_observation_v1"]);
    expect(observe).not.toHaveBeenCalled();
  });
  it("copies actor, account, revision and credentials before asynchronous boundaries", async () => {
    const initial = { ...admission(), credentials: { ...credentials }, approval: { ...approval } };
    admit.mockResolvedValue(initial);
    revalidate.mockImplementation(async () => {
      initial.actorId = "00000000-0000-4000-8000-000000000009";
      initial.approval.revision = "00000000-0000-4000-8000-000000000010";
      initial.credentials.privateKey = "private_mutated_test_key";
      return true;
    });
    successfulQueue();
    expect(await run()).toEqual({ ok: true, state: "observed", observation: "absent", queueState: "pending" });
    expect(rpc.mock.calls[1]).toEqual(["claim_imagekit_observation_v1", authorization]);
    expect(rpc.mock.calls[3][1]).toMatchObject(authorization);
    expect(observe.mock.calls[0][0]).toMatchObject({ credentials });
  });
  it.each([
    ["absent", "pending"], ["retry", "pending"], ["unsafe", "attention"],
    ["absent", "attention"], ["retry", "attention"],
  ] as const)("records %s as %s, never complete/deleted", async (observation, state) => {
    observe.mockResolvedValue({ observation }); successfulQueue(state);
    expect(await run()).toEqual({ ok: true, state: "observed", observation, queueState: state });
    expect(observe).toHaveBeenCalledExactlyOnceWith({ credentials, intent: {
      intentId, assetId, storageContainer: credentials.imageKitId, objectKey: lease.objectKey,
      mimeType: lease.mimeType, expectedByteSize: lease.expectedByteSize, expectedChecksumSha256: lease.expectedChecksumSha256,
    } }, { signal: expect.any(AbortSignal) });
    expect(revalidate).toHaveBeenCalledTimes(3);
    expect(rpc).toHaveBeenLastCalledWith("finish_imagekit_observation_v1", {
      ...authorization, p_intent_id: intentId, p_lease_id: lease.leaseId, p_result: observation,
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
    queue(ready, [{ ...lease, leaseExpiresAt: "2026-09-22T13:11:31.000Z" }]);
    observe.mockImplementation(async () => { time += 26_000; return { observation: "absent" }; });
    expect(await run()).toEqual({ ok: false, code: "lease-expired" }); expect(rpc).toHaveBeenCalledTimes(2);
  });
  it("does not probe when account revalidation consumed the lease safety margin", async () => {
    queue(ready, [{ ...lease, leaseExpiresAt: "2026-09-22T13:11:31.000Z" }]);
    revalidate.mockResolvedValueOnce(true).mockImplementationOnce(async () => { time += 26_000; return true; });
    expect(await run()).toEqual({ ok: false, code: "lease-expired" });
    expect(observe).not.toHaveBeenCalled(); expect(rpc).toHaveBeenCalledTimes(2);
  });
  it("rechecks readiness after provider latency", async () => {
    queue(ready, [lease], { version: 1, ready: false });
    expect(await run()).toEqual({ ok: false, code: "not-ready" }); expect(rpc).toHaveBeenCalledTimes(3);
  });
  it("rechecks lease time after readiness latency", async () => {
    queue(ready, [{ ...lease, leaseExpiresAt: "2026-09-22T13:11:31.000Z" }]);
    rpc.mockImplementationOnce(async () => { time += 26_000; return { data: ready, error: null }; });
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
  it.each(["admission", "readiness", "revalidation", "claim", "observe", "finish"])("bounds a hanging %s", async phase => {
    vi.useFakeTimers();
    const never = new Promise<never>(() => {});
    if (phase === "admission") admit.mockReturnValue(never);
    else if (phase === "readiness") rpc.mockReturnValueOnce(never);
    else if (phase === "revalidation") { queue(ready); revalidate.mockReturnValueOnce(never); }
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
  it("rejects wall-clock forward jumps before starting the next external operation", async () => {
    queue(ready);
    revalidate.mockImplementationOnce(async () => { time += 30_001; return true; });
    expect(await run()).toEqual({ ok: false, code: "unconfirmed" });
    expect(rpc).toHaveBeenCalledTimes(1); expect(observe).not.toHaveBeenCalled();
  });
  it("rejects monotonic deadline exhaustion while the wall clock is frozen", async () => {
    queue(ready, [lease]);
    observe.mockImplementationOnce(async () => { monotonicTime += 30_001; return { observation: "absent" }; });
    expect(await run()).toEqual({ ok: false, code: "unconfirmed" });
    expect(rpc).toHaveBeenCalledTimes(2);
  });
  it("aborts the observation adapter at the shared deadline and never acknowledges a late result", async () => {
    vi.useFakeTimers(); queue(ready, [lease]);
    let resolve!: (value: { observation: "absent" }) => void;
    observe.mockReturnValueOnce(new Promise(done => { resolve = done; }));
    const pending = run(); await vi.advanceTimersByTimeAsync(30_001);
    expect(await pending).toEqual({ ok: false, code: "unconfirmed" });
    expect(observe.mock.calls[0][1]?.signal?.aborted).toBe(true);
    resolve({ observation: "absent" }); await vi.advanceTimersByTimeAsync(0);
    expect(rpc).toHaveBeenCalledTimes(2); expect(vi.getTimerCount()).toBe(0);
  });
  it("never starts a claim when a timed-out revalidation eventually succeeds", async () => {
    vi.useFakeTimers(); queue(ready);
    let resolve!: (value: boolean) => void;
    revalidate.mockReturnValueOnce(new Promise(done => { resolve = done; }));
    const pending = run(); await vi.advanceTimersByTimeAsync(30_001);
    expect(await pending).toEqual({ ok: false, code: "unconfirmed" });
    resolve(true); await vi.advanceTimersByTimeAsync(0);
    expect(rpc).toHaveBeenCalledTimes(1); expect(observe).not.toHaveBeenCalled();
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
    workflow = createImageKitReconciliationWorkflow({ admit, now: () => time, monotonicNow: () => monotonicTime }); successfulQueue();
    expect(await run()).toEqual({ ok: true, state: "observed", observation: "absent", queueState: "pending" });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toMatch(/^https:\/\/api\.imagekit\.io\/v1\/files\?/);
    expect(vi.mocked(fetch).mock.calls[0][1]?.method).toBe("GET");
  });
});

it("keeps direct worker imports out of application UI/routes and has no destructive provider call", () => {
  const files = (path: string): string[] => readdirSync(path, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? files(join(path, entry.name)) : /\.[cm]?[jt]sx?$/.test(entry.name) ? [join(path, entry.name)] : []);
  // Only the reviewed server action may reach the gated entry; UI/routes never
  // import the worker/provider adapters directly or provide their own admission.
  for (const file of files("app")) expect(readFileSync(file, "utf8")).not.toMatch(/imagekit-reconciliation-(?:workflow|observation|contracts)["']/);
  const source = readFileSync("lib/admin/imagekit-reconciliation-workflow.ts", "utf8");
  expect(source).not.toMatch(/['"]use server['"]|method:\s*['"](?:DELETE|POST|PUT|PATCH)['"]|createImageKitUploadAuthority/);
  expect(source).not.toMatch(/claim_imagekit_upload_cleanup_v1|finish_imagekit_upload_cleanup_v1/);
});
