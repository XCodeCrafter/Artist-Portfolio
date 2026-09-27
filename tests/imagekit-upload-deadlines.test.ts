import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createImageKitUploadWorkflow, type ImageKitUploadAdmission } from "@/lib/admin/imagekit-upload-workflow";
import { createImageKitUploadAuthority } from "@/lib/admin/imagekit-upload";
import type { verifyImageKitObject } from "@/lib/admin/imagekit-object-verification";

vi.mock("@/lib/admin/media-action-shared", () => ({ revalidateMediaSurfaces: vi.fn() }));

type Dependencies = Parameters<typeof createImageKitUploadWorkflow>[0];
type Operation = "issue" | "finalize";
type Reply = { data: unknown; error: unknown };
const intentId = "123e4567-e89b-42d3-a456-426614174000";
const actorId = "00000000-0000-4000-8000-000000000001";
const assetId = `imagekit-${intentId}`;
const initialClock = Date.parse("2026-09-24T12:00:02.000Z");
const initialCredentials = {
  imageKitId: "fictional_artist", urlEndpoint: "https://ik.imagekit.io/fictional_artist",
  publicKey: "public_fictional_test_key", privateKey: "private_fictional_test_key",
};
const base = {
  intentId, assetId, physicalObjectId: "00000000-0000-4000-8000-000000000002",
  storageProvider: "imagekit", storageContainer: initialCredentials.imageKitId,
  objectKey: `media/source/${assetId}/${intentId}.jpg`, mediaType: "image", mimeType: "image/jpeg",
  expectedByteSize: 1024, expectedChecksumSha256: "a".repeat(64), expiresAt: "2026-09-24T12:10:00.000Z",
  status: "prepared", issuedAt: null, authorityExpiresAt: null, fileId: null, versionId: null,
  versionToken: null, sourceVariantId: null, cleanupState: "not_needed",
};
const issued = { ...base, issuedAt: "2026-09-24T12:00:00.000Z", authorityExpiresAt: "2026-09-24T12:05:00.000Z" };
const consumed = { ...issued, status: "consumed", fileId: "file_one", versionId: "version_one", versionToken: "token_one",
  sourceVariantId: "00000000-0000-4000-8000-000000000003" };
const proof = { storageProvider: "imagekit" as const, storageContainer: initialCredentials.imageKitId, objectKey: base.objectKey,
  fileId: "file_one", versionId: "version_one", versionToken: "token_one",
  deliveryUrl: `${initialCredentials.urlEndpoint}/${base.objectKey}`, mimeType: "image/jpeg", byteSize: 1024,
  checksumSha256: base.expectedChecksumSha256 };
const ready = { version: 1, ready: true };
const ok = (data: unknown): Reply => ({ data, error: null });
const unconfirmed = { ok: false, code: "unconfirmed" };
const durations = { issue: 15_000, finalize: 60_000 };
let wall: number;
let monotonic: number;
let credentials: typeof initialCredentials;
let rpc: ReturnType<typeof vi.fn<(name: string, args?: Record<string, unknown>) => Promise<Reply>>>;
let admit: ReturnType<typeof vi.fn<Dependencies["admit"]>>;
let sign: ReturnType<typeof vi.fn<typeof createImageKitUploadAuthority>>;
let verify: ReturnType<typeof vi.fn<typeof verifyImageKitObject>>;
let revalidate: ReturnType<typeof vi.fn<() => void | Promise<void>>>;
let workflow: ReturnType<typeof createImageKitUploadWorkflow>;
let admitted: Extract<ImageKitUploadAdmission, { ok: true }>;

function options(changes: Partial<Dependencies> = {}): Dependencies {
  return { admit, sign, verify, revalidate, now: () => wall, monotonicNow: () => monotonic, ...changes };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function queue(...values: unknown[]) { for (const value of values) rpc.mockResolvedValueOnce(ok(value)); }
function issueQueue() { queue(ready, base, { ...issued, outcome: "issued" }, issued); }
function finalizeQueue() { queue(ready, issued, issued, { ...consumed, outcome: "consumed" }); }
const run = (operation: Operation) => workflow[operation](operation === "issue" ? { intentId } : { intentId, fileId: proof.fileId });
const calls = () => rpc.mock.calls.map(([name]) => name);
async function flush() { await vi.advanceTimersByTimeAsync(0); }

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(initialClock);
  wall = initialClock; monotonic = 10_000; credentials = { ...initialCredentials };
  rpc = vi.fn().mockRejectedValue(new Error("Unexpected database operation"));
  admitted = { ok: true, actorId, credentials, client: { rpc } };
  admit = vi.fn<Dependencies["admit"]>().mockResolvedValue(admitted);
  sign = vi.fn(createImageKitUploadAuthority);
  verify = vi.fn<typeof verifyImageKitObject>().mockResolvedValue({ ok: true, object: proof });
  revalidate = vi.fn(); workflow = createImageKitUploadWorkflow(options());
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("No provider network permitted"); }));
});
afterEach(() => {
  expect(fetch).not.toHaveBeenCalled();
  expect(calls().every(name => ["get_imagekit_upload_readiness_v1", "resolve_imagekit_upload_v1", "claim_imagekit_upload_v1", "finalize_imagekit_upload_v1"].includes(name))).toBe(true);
  expect(calls().filter(name => name === "claim_imagekit_upload_v1").length).toBeLessThanOrEqual(1);
  expect(calls().filter(name => name === "finalize_imagekit_upload_v1").length).toBeLessThanOrEqual(1);
  expect(vi.getTimerCount()).toBe(0);
  vi.useRealTimers(); vi.unstubAllGlobals();
});

describe("dormant upload admission shares the operation deadline", () => {
  it.each<Operation>(["issue", "finalize"])("bounds stalled %s admission and rejects its late success without further work", async operation => {
    const late = deferred<ImageKitUploadAdmission>(); admit.mockReturnValue(late.promise);
    const pending = run(operation); await flush();
    expect(admit).toHaveBeenCalledTimes(1);
    const budget = admit.mock.calls[0][1]; expect(budget.signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(durations[operation] + 1);
    expect(await pending).toEqual(unconfirmed); expect(budget.signal.aborted).toBe(true);
    late.resolve(admitted); await flush();
    expect(rpc).not.toHaveBeenCalled(); expect(sign).not.toHaveBeenCalled(); expect(verify).not.toHaveBeenCalled();
  });
  it.each<Operation>(["issue", "finalize"])("preserves a live %s auth redirect and closes its budget", async operation => {
    const redirect = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/admin/mfa;307;" });
    admit.mockRejectedValue(redirect);
    await expect(run(operation)).rejects.toBe(redirect);
    expect(admit.mock.calls[0][1].signal.aborted).toBe(true); expect(rpc).not.toHaveBeenCalled();
  });
  it.each<Operation>(["issue", "finalize"])("sanitizes unexpected %s admission errors instead of forwarding credential material", async operation => {
    admit.mockRejectedValue(new Error(`Provider setup rejected ${credentials.privateKey}`));
    expect(await run(operation)).toEqual(unconfirmed); expect(rpc).not.toHaveBeenCalled();
    expect(admit.mock.calls[0][1].signal.aborted).toBe(true);
  });
  it.each<Operation>(["issue", "finalize"])("does not treat a message-only NEXT_REDIRECT error as %s auth control flow", async operation => {
    admit.mockRejectedValue(new Error("NEXT_REDIRECT:/admin/mfa"));
    expect(await run(operation)).toEqual(unconfirmed); expect(rpc).not.toHaveBeenCalled();
  });
  it.each([
    ["issue", "wall"], ["issue", "monotonic"], ["finalize", "wall"], ["finalize", "monotonic"],
  ] as const)("sanitizes a real %s redirect after the %s deadline even before the timer dispatches", async (operation, clock) => {
    admit.mockImplementation(async () => {
      if (clock === "wall") wall += durations[operation] + 1;
      else monotonic += durations[operation] + 1;
      throw Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/admin/mfa;307;" });
    });
    expect(await run(operation)).toEqual(unconfirmed);
    expect(admit.mock.calls[0][1].signal.aborted).toBe(true);
    expect(rpc).not.toHaveBeenCalled(); expect(sign).not.toHaveBeenCalled(); expect(verify).not.toHaveBeenCalled();
  });
  it.each<Operation>(["issue", "finalize"])("ignores late %s admission failure after the safe timeout response", async operation => {
    const late = deferred<ImageKitUploadAdmission>(); admit.mockReturnValue(late.promise);
    const pending = run(operation); await vi.advanceTimersByTimeAsync(durations[operation] + 1);
    expect(await pending).toEqual(unconfirmed);
    late.reject(new Error("late private auth details")); await flush(); expect(rpc).not.toHaveBeenCalled();
  });
  it.each<Operation>(["issue", "finalize"])("does not even call %s admission for a pre-aborted request", async operation => {
    const controller = new AbortController(); controller.abort(); workflow = createImageKitUploadWorkflow(options({ signal: controller.signal }));
    expect(await run(operation)).toEqual(unconfirmed); expect(admit).not.toHaveBeenCalled(); expect(rpc).not.toHaveBeenCalled();
  });
});

describe("bounded database calls never replay or continue after uncertainty", () => {
  const issueStages = [
    { name: "readiness", before: [], late: ready, count: 1, signed: 0 },
    { name: "initial resolve", before: [ready], late: base, count: 2, signed: 0 },
    { name: "claim", before: [ready, base], late: { ...issued, outcome: "issued" }, count: 3, signed: 0 },
    { name: "post-sign resolve", before: [ready, base, { ...issued, outcome: "issued" }], late: issued, count: 4, signed: 1 },
  ];
  it.each(issueStages)("stops issue after stalled $name and never releases a late authority", async stage => {
    const late = deferred<Reply>(); queue(...stage.before); rpc.mockReturnValueOnce(late.promise);
    const pending = run("issue"); await flush(); expect(rpc).toHaveBeenCalledTimes(stage.count);
    await vi.advanceTimersByTimeAsync(15_001); expect(await pending).toEqual(unconfirmed);
    late.resolve(ok(stage.late)); await flush(); expect(rpc).toHaveBeenCalledTimes(stage.count);
    expect(sign).toHaveBeenCalledTimes(stage.signed); expect(revalidate).not.toHaveBeenCalled();
  });
  const finalizeStages = [
    { name: "readiness", before: [], late: ready, count: 1, verified: 0 },
    { name: "initial resolve", before: [ready], late: issued, count: 2, verified: 0 },
    { name: "post-verification resolve", before: [ready, issued], late: issued, count: 3, verified: 1 },
    { name: "finalizer", before: [ready, issued, issued], late: { ...consumed, outcome: "consumed" }, count: 4, verified: 1 },
  ];
  it.each(finalizeStages)("stops finalize after stalled $name even when its late SQL response says consumed", async stage => {
    const late = deferred<Reply>(); queue(...stage.before); rpc.mockReturnValueOnce(late.promise);
    const pending = run("finalize"); await flush(); expect(rpc).toHaveBeenCalledTimes(stage.count);
    await vi.advanceTimersByTimeAsync(60_001); expect(await pending).toEqual(unconfirmed);
    late.resolve(ok(stage.late)); await flush(); expect(rpc).toHaveBeenCalledTimes(stage.count);
    expect(verify).toHaveBeenCalledTimes(stage.verified); expect(revalidate).not.toHaveBeenCalled();
  });
  it("passes the same abort signal to supported query builders and closes it on success", async () => {
    const signals: AbortSignal[] = [];
    for (const value of [ready, base, { ...issued, outcome: "issued" }, issued]) {
      const promise = Promise.resolve(ok(value));
      rpc.mockReturnValueOnce(Object.assign(promise, { abortSignal(signal: AbortSignal) { signals.push(signal); return promise; } }));
    }
    expect(await run("issue")).toMatchObject({ ok: true, state: "issued" });
    expect(signals).toHaveLength(4); expect(new Set(signals).size).toBe(1);
    expect(signals[0]).toBe(admit.mock.calls[0][1].signal); expect(signals[0].aborted).toBe(true);
  });
  it("caller cancellation while a claim is pending cannot sign or retry a late claim", async () => {
    const controller = new AbortController(); workflow = createImageKitUploadWorkflow(options({ signal: controller.signal }));
    const late = deferred<Reply>(); queue(ready, base); rpc.mockReturnValueOnce(late.promise);
    const pending = run("issue"); await flush(); controller.abort();
    expect(await pending).toEqual(unconfirmed); late.resolve(ok({ ...issued, outcome: "issued" })); await flush();
    expect(sign).not.toHaveBeenCalled(); expect(rpc).toHaveBeenCalledTimes(3);
  });
});

describe("verification and committed publication honor bounded waiting", () => {
  it("returns reservation expired, not operation timeout, when issue loses its short intent window", async () => {
    const expiresAt = new Date(initialClock + 5000).toISOString(); queue(ready);
    rpc.mockImplementationOnce(async () => {
      wall += 5000; monotonic += 5000;
      return ok({ ...base, expiresAt });
    });
    expect(await run("issue")).toEqual({ ok: false, code: "expired" });
    expect(rpc).toHaveBeenCalledTimes(2); expect(sign).not.toHaveBeenCalled();
  });
  it("returns reservation expired within a live finalize budget instead of publishing expired evidence", async () => {
    const expiresAt = new Date(initialClock + 35_000).toISOString();
    const authorityExpiresAt = new Date(initialClock + 33_000).toISOString();
    queue(ready, { ...issued, expiresAt, authorityExpiresAt });
    verify.mockImplementation(async () => {
      wall += 35_000; monotonic += 35_000;
      return { ok: true, object: proof };
    });
    expect(await run("finalize")).toEqual({ ok: false, code: "expired" });
    expect(rpc).toHaveBeenCalledTimes(2); expect(verify).toHaveBeenCalledTimes(1); expect(revalidate).not.toHaveBeenCalled();
  });
  it("propagates the shared deadline signal to verification and ignores evidence arriving after it", async () => {
    const late = deferred<Awaited<ReturnType<typeof verifyImageKitObject>>>();
    queue(ready, issued); verify.mockReturnValue(late.promise);
    const pending = run("finalize"); await flush();
    const signal = verify.mock.calls[0][1]?.signal;
    expect(signal).toBe(admit.mock.calls[0][1].signal); expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(60_001); expect(await pending).toEqual(unconfirmed); expect(signal?.aborted).toBe(true);
    late.resolve({ ok: true, object: proof }); await flush();
    expect(rpc).toHaveBeenCalledTimes(2); expect(revalidate).not.toHaveBeenCalled();
  });
  it("propagates explicit caller cancellation to a running verifier", async () => {
    const controller = new AbortController(); workflow = createImageKitUploadWorkflow(options({ signal: controller.signal }));
    const late = deferred<Awaited<ReturnType<typeof verifyImageKitObject>>>(); queue(ready, issued); verify.mockReturnValue(late.promise);
    const pending = run("finalize"); await flush(); controller.abort();
    expect(await pending).toEqual(unconfirmed); expect(verify.mock.calls[0][1]?.signal?.aborted).toBe(true);
    late.resolve({ ok: true, object: proof }); await flush(); expect(rpc).toHaveBeenCalledTimes(2);
  });
  it.each(["completed", "already-completed"] as const)("retains confirmed %s when cache revalidation never responds", async state => {
    if (state === "completed") finalizeQueue(); else queue(ready, consumed);
    const late = deferred<void>(); revalidate.mockReturnValue(late.promise);
    const pending = run("finalize"); await flush(); expect(revalidate).toHaveBeenCalledTimes(1);
    const requestCount = rpc.mock.calls.length;
    await vi.advanceTimersByTimeAsync(60_001);
    expect(await pending).toMatchObject({ ok: true, state });
    late.reject(new Error("late cache error")); await flush();
    expect(rpc).toHaveBeenCalledTimes(requestCount); expect(revalidate).toHaveBeenCalledTimes(1);
  });
  it("limits cache waiting to the original remaining budget instead of starting another minute", async () => {
    const finalReply = deferred<Reply>(); queue(ready, issued, issued); rpc.mockReturnValueOnce(finalReply.promise);
    revalidate.mockReturnValue(new Promise<void>(() => {}));
    const pending = run("finalize"); await flush();
    wall += 59_000; monotonic += 59_000; await vi.advanceTimersByTimeAsync(59_000);
    finalReply.resolve(ok({ ...consumed, outcome: "consumed" })); await flush(); expect(revalidate).toHaveBeenCalledTimes(1);
    let settled = false; void pending.then(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(999); expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    expect(settled).toBe(true); expect(await pending).toMatchObject({ ok: true, state: "completed" });
    expect(rpc).toHaveBeenCalledTimes(4);
  });
  it("never starts cache invalidation after final-result decoding consumes the last budget", async () => {
    const finalReply = { ...consumed, outcome: "consumed" };
    let decoded = false;
    Object.defineProperty(finalReply, "outcome", { enumerable: true, get() {
      if (!decoded) { wall += 60_001; monotonic += 60_001; decoded = true; }
      return "consumed";
    } });
    queue(ready, issued, issued, finalReply);
    expect(await run("finalize")).toMatchObject({ ok: true, state: "completed" });
    expect(revalidate).not.toHaveBeenCalled(); expect(rpc).toHaveBeenCalledTimes(4);
  });
});

describe("immutable execution context and non-resettable clocks", () => {
  it("retains the service client's method receiver when snapshotting its RPC", async () => {
    const marker = Symbol("fictional service client");
    const client = {
      marker,
      rpc(this: { marker: symbol }, name: string, args?: Record<string, unknown>) {
        expect(this.marker).toBe(marker);
        return rpc(name, args);
      },
    };
    admitted.client = client;
    issueQueue(); expect(await run("issue")).toMatchObject({ ok: true, state: "issued" });
    expect(rpc).toHaveBeenCalledTimes(4);
  });
  it("copies credentials and actor identity, and binds the original RPC before a later mutation", async () => {
    const first = deferred<Reply>(); rpc.mockReturnValueOnce(first.promise); queue(base, { ...issued, outcome: "issued" }, issued);
    const originalRpc = rpc; const replacement = vi.fn().mockRejectedValue(new Error("Mutable RPC was substituted"));
    const pending = run("issue"); await flush();
    credentials.privateKey = "private_changed_after_admission"; credentials.urlEndpoint = "https://ik.imagekit.io/another";
    admitted.actorId = "00000000-0000-4000-8000-000000000099"; admitted.client.rpc = replacement;
    first.resolve(ok(ready));
    expect(await pending).toMatchObject({ ok: true, state: "issued" }); expect(replacement).not.toHaveBeenCalled();
    expect(sign.mock.calls[0][0].credentials).toEqual(initialCredentials);
    expect(sign.mock.calls[0][0].credentials).not.toBe(credentials);
    expect(Object.isFrozen(sign.mock.calls[0][0].credentials)).toBe(true);
    for (const [, args] of originalRpc.mock.calls.slice(1)) expect(args?.p_actor_id).toBe(actorId);
  });
  it("captures factory dependencies rather than accepting substitutions during a request", async () => {
    const dependencies = options(); workflow = createImageKitUploadWorkflow(dependencies); issueQueue();
    dependencies.admit = vi.fn().mockResolvedValue({ ok: false });
    dependencies.sign = vi.fn().mockReturnValue({ ok: false });
    dependencies.now = () => Number.NaN; dependencies.monotonicNow = () => Number.NaN;
    expect(await run("issue")).toMatchObject({ ok: true, state: "issued" });
    expect(admit).toHaveBeenCalledTimes(1); expect(sign).toHaveBeenCalledTimes(1);
  });
  it.each<Operation>(["issue", "finalize"])("rejects a backwards wall clock during %s before another privileged call", async operation => {
    rpc.mockImplementationOnce(async () => { wall -= 1; return ok(ready); });
    expect(await run(operation)).toEqual(unconfirmed); expect(rpc).toHaveBeenCalledTimes(1);
    expect(sign).not.toHaveBeenCalled(); expect(verify).not.toHaveBeenCalled();
  });
  it.each<Operation>(["issue", "finalize"])("rejects a backwards monotonic clock during %s", async operation => {
    rpc.mockImplementationOnce(async () => { monotonic -= 1; return ok(ready); });
    expect(await run(operation)).toEqual(unconfirmed); expect(rpc).toHaveBeenCalledTimes(1);
  });
  it.each<Operation>(["issue", "finalize"])("a frozen wall clock cannot extend the %s monotonic deadline", async operation => {
    rpc.mockImplementationOnce(async () => { monotonic += durations[operation] + 1; return ok(ready); });
    expect(await run(operation)).toEqual(unconfirmed); expect(rpc).toHaveBeenCalledTimes(1);
    expect(sign).not.toHaveBeenCalled(); expect(verify).not.toHaveBeenCalled();
  });
});
