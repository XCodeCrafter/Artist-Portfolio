import { createHmac } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createImageKitUploadWorkflow, type ImageKitUploadAdmission, type ImageKitUploadWorkflowResult } from "@/lib/admin/imagekit-upload-workflow";
import { createImageKitUploadAuthority } from "@/lib/admin/imagekit-upload";
import type { verifyImageKitObject } from "@/lib/admin/imagekit-object-verification";

vi.mock("@/lib/admin/media-action-shared", () => ({ revalidateMediaSurfaces: vi.fn() }));

const intentId = "123e4567-e89b-42d3-a456-426614174000";
const actorId = "00000000-0000-4000-8000-000000000001";
const assetId = `imagekit-${intentId}`;
const credentials = { imageKitId: "fictional_artist", urlEndpoint: "https://ik.imagekit.io/fictional_artist",
  publicKey: "public_fictional_test_key", privateKey: "private_fictional_test_key" };
const base = {
  intentId, assetId, physicalObjectId: "00000000-0000-4000-8000-000000000002",
  storageProvider: "imagekit", storageContainer: credentials.imageKitId,
  objectKey: `media/source/${assetId}/${intentId}.jpg`, mediaType: "image", mimeType: "image/jpeg",
  expectedByteSize: 1024, expectedChecksumSha256: "a".repeat(64), expiresAt: "2026-09-22T12:10:00.000Z",
  status: "prepared", issuedAt: null, authorityExpiresAt: null, fileId: null, versionId: null,
  versionToken: null, sourceVariantId: null, cleanupState: "not_needed",
};
const issued = { ...base, issuedAt: "2026-09-22T12:00:00.000Z", authorityExpiresAt: "2026-09-22T12:05:00.000Z" };
const consumed = { ...issued, status: "consumed", fileId: "file_one", versionId: "version_one", versionToken: "token_one",
  sourceVariantId: "00000000-0000-4000-8000-000000000003" };
const proof = { storageProvider: "imagekit" as const, storageContainer: credentials.imageKitId, objectKey: base.objectKey,
  fileId: "file_one", versionId: "version_one", versionToken: "token_one",
  deliveryUrl: `${credentials.urlEndpoint}/${base.objectKey}`, mimeType: "image/jpeg", byteSize: 1024,
  checksumSha256: base.expectedChecksumSha256 };
const issueInput = { intentId };
const finalizeInput = { intentId, fileId: proof.fileId };
const readyReply = { version: 1, ready: true };
const closed = (status = "cancelled") => ({ ...issued, status, cleanupState: "pending" });
const ok = (data: unknown) => ({ data, error: null });
type Reply = { data: unknown; error: unknown };

let time: number;
let rpc: ReturnType<typeof vi.fn<(name: string, args?: Record<string, unknown>) => Promise<Reply>>>;
let admit: ReturnType<typeof vi.fn<(operation: "issue" | "finalize") => Promise<ImageKitUploadAdmission>>>;
let sign: ReturnType<typeof vi.fn<typeof createImageKitUploadAuthority>>;
let verify: ReturnType<typeof vi.fn<typeof verifyImageKitObject>>;
let revalidate: ReturnType<typeof vi.fn<() => void | Promise<void>>>;
let workflow: ReturnType<typeof createImageKitUploadWorkflow>;
let results: ImageKitUploadWorkflowResult[];

function queue(...data: unknown[]) { for (const item of data) rpc.mockResolvedValueOnce(ok(item)); }
function issueQueue(initial: unknown = base, claim: unknown = { ...issued, outcome: "issued" }, current: unknown = issued) {
  queue(readyReply, initial, claim, current);
}
function finalizeQueue(initial: unknown = issued, current: unknown = issued, final: unknown = { ...consumed, outcome: "consumed" }) {
  queue(readyReply, initial, current, final);
}
async function run(operation: "issue" | "finalize", input: unknown = operation === "issue" ? issueInput : finalizeInput) {
  const result = await workflow[operation](input);
  results.push(result);
  return result;
}
const calls = () => rpc.mock.calls.map(([name]) => name);

beforeEach(() => {
  time = Date.parse("2026-09-22T12:00:02.123Z");
  results = [];
  rpc = vi.fn().mockRejectedValue(new Error("Unexpected RPC"));
  admit = vi.fn().mockResolvedValue({ ok: true, actorId, credentials, client: { rpc } });
  sign = vi.fn(createImageKitUploadAuthority);
  verify = vi.fn<typeof verifyImageKitObject>().mockResolvedValue({ ok: true, object: proof });
  revalidate = vi.fn();
  workflow = createImageKitUploadWorkflow({ admit, sign, verify, revalidate, now: () => time });
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("No provider network permitted"); }));
});
afterEach(() => {
  expect(fetch).not.toHaveBeenCalled();
  expect(calls().every(name => ["get_imagekit_upload_readiness_v1", "resolve_imagekit_upload_v1", "claim_imagekit_upload_v1", "finalize_imagekit_upload_v1"].includes(name))).toBe(true);
  expect(calls().filter(name => name === "claim_imagekit_upload_v1").length).toBeLessThanOrEqual(1);
  for (const result of results) {
    const text = JSON.stringify(result);
    for (const secret of [credentials.privateKey, base.expectedChecksumSha256, base.physicalObjectId, consumed.sourceVariantId,
      '"versionId"', '"versionToken"', '"fileId"', '"storageContainer"', '"cleanupLeaseId"']) expect(text).not.toContain(secret);
    if (result.ok) expect(Object.keys(result.upload).sort()).toEqual(["assetId", "cleanupPending", "expiresAt", "intentId", "issued", "status"]);
  }
  vi.unstubAllGlobals();
});

describe("ImageKit dormant workflow admission", () => {
  it.each(["issue", "finalize"] as const)("%s preserves auth redirects before any other work", async operation => {
    const redirect = new Error("NEXT_REDIRECT:/admin/mfa");
    admit.mockRejectedValue(redirect);
    await expect(run(operation, null)).rejects.toBe(redirect);
    expect(rpc).not.toHaveBeenCalled(); expect(sign).not.toHaveBeenCalled(); expect(verify).not.toHaveBeenCalled();
  });
  it.each(["issue", "finalize"] as const)("%s denies unavailable admission", async operation => {
    admit.mockResolvedValue({ ok: false });
    expect(await run(operation)).toEqual({ ok: false, code: "not-admitted" });
    expect(rpc).not.toHaveBeenCalled(); expect(admit).toHaveBeenCalledExactlyOnceWith(operation);
  });
  it.each([
    { actorId: "not-an-actor" }, { credentials: { ...credentials, privateKey: "bad" } },
    { credentials: { ...credentials, publicKey: "bad" } }, { credentials: { ...credentials, imageKitId: "../foreign" } },
    { credentials: { ...credentials, urlEndpoint: "https://evil.test" } },
    { credentials: { ...credentials, urlEndpoint: `${credentials.urlEndpoint}/` } },
    { credentials: { ...credentials, extra: true } },
  ])("refuses malformed trusted admission before DB: %j", async patch => {
    admit.mockResolvedValue({ ok: true, actorId, credentials, client: { rpc }, ...patch } as ImageKitUploadAdmission);
    expect(await run("issue")).toEqual({ ok: false, code: "not-admitted" }); expect(rpc).not.toHaveBeenCalled();
  });
  it.each([null, [], "123", {}, { intentId: "bad" }, { intentId, actorId }, { intentId, token: "forged" }, { intentId, evidence: proof }])("rejects untrusted issue input %j", async input => {
    expect(await run("issue", input)).toEqual({ ok: false, code: "invalid-request" }); expect(rpc).not.toHaveBeenCalled();
  });
  it.each([null, [], {}, { intentId }, { intentId, fileId: "../file" }, { ...finalizeInput, evidence: proof },
    { ...finalizeInput, deliveryUrl: proof.deliveryUrl }, { ...finalizeInput, actorId }, { ...finalizeInput, checksumSha256: proof.checksumSha256 },
    { ...finalizeInput, versionId: proof.versionId }])("rejects client proof/authority in finalization %j", async input => {
    expect(await run("finalize", input)).toEqual({ ok: false, code: "invalid-request" }); expect(rpc).not.toHaveBeenCalled();
  });
  it.each([null, {}, { ready: true }, { version: 2, ready: true }, { version: 1, ready: false },
    { version: 1, ready: "true" }, { ...readyReply, extra: true }, [readyReply]])("requires exact readiness response %j", async data => {
    queue(data);
    expect(await run("issue")).toEqual({ ok: false, code: "not-ready" });
    expect(calls()).toEqual(["get_imagekit_upload_readiness_v1"]);
  });
  it("rejects a readiness RPC error without exposing it", async () => {
    rpc.mockResolvedValueOnce({ data: readyReply, error: new Error(credentials.privateKey) });
    expect(await run("finalize")).toEqual({ ok: false, code: "not-ready" });
  });
  it("makes no retries on readiness network ambiguity", async () => {
    expect(await run("issue")).toEqual({ ok: false, code: "unconfirmed" }); expect(rpc).toHaveBeenCalledTimes(1);
  });
});

describe("ImageKit one-shot authority issuance", () => {
  it("uses the real default signer with persisted whole-second clock and exact fields", async () => {
    workflow = createImageKitUploadWorkflow({ admit, verify, revalidate, now: () => time });
    issueQueue();
    const result = await run("issue");
    expect(result).toMatchObject({ ok: true, state: "issued", upload: { issued: true, status: "prepared" } });
    if (!result.ok || result.state !== "issued") throw new Error("Expected signed authority");
    const [header, body, signature] = result.authority.token.split(".");
    expect(JSON.parse(Buffer.from(header, "base64url").toString())).toEqual({ alg: "HS256", typ: "JWT", kid: credentials.publicKey });
    expect(JSON.parse(Buffer.from(body, "base64url").toString())).toEqual({ ...result.authority.uploadParams,
      iat: Date.parse(issued.issuedAt) / 1000, exp: Date.parse(issued.authorityExpiresAt) / 1000 });
    expect(signature).toBe(createHmac("sha256", credentials.privateKey).update(`${header}.${body}`).digest("base64url"));
    expect(result.authority.uploadParams).toMatchObject({ fileName: `${intentId}.jpg`, folder: `/media/source/${assetId}`,
      overwriteFile: "false", useUniqueFileName: "false", checks: '"file.size" = 1024 AND "file.mime" = "image/jpeg"' });
    expect(calls()).toEqual(["get_imagekit_upload_readiness_v1", "resolve_imagekit_upload_v1", "claim_imagekit_upload_v1", "resolve_imagekit_upload_v1"]);
    for (const [, args] of rpc.mock.calls.slice(1)) expect(args).toEqual({ p_intent_id: intentId, p_actor_id: actorId });
    expect(verify).not.toHaveBeenCalled(); expect(revalidate).not.toHaveBeenCalled();
  });
  it("signs only after claim and does not substitute the later application clock", async () => {
    issueQueue();
    sign.mockImplementation(input => {
      expect(calls().at(-1)).toBe("claim_imagekit_upload_v1");
      expect(input.nowSeconds).toBe(Date.parse(issued.issuedAt) / 1000);
      return createImageKitUploadAuthority(input);
    });
    expect(await run("issue")).toMatchObject({ ok: true, state: "issued" }); expect(sign).toHaveBeenCalledTimes(1);
  });
  it.each([
    [issued, "already-issued"], [consumed, "already-completed"],
  ])("does not reconstruct lost authority for %j", async (initial, state) => {
    queue(readyReply, initial);
    expect(await run("issue")).toMatchObject({ ok: true, state });
    expect(sign).not.toHaveBeenCalled(); expect(rpc).toHaveBeenCalledTimes(2);
  });
  it.each(["expired", "cancelled", "failed"])("does not issue a %s reservation", async status => {
    queue(readyReply, closed(status));
    expect(await run("issue")).toEqual({ ok: false, code: "intent-closed" }); expect(sign).not.toHaveBeenCalled();
  });
  it.each([null, [], {}, { ...base, surprise: true }, { ...base, storageContainer: "other" },
    { ...base, objectKey: "media/source/unowned/file.jpg" }])("refuses malformed initial reservation %j", async initial => {
    queue(readyReply, initial);
    expect(await run("issue")).toEqual({ ok: false, code: "unconfirmed" }); expect(sign).not.toHaveBeenCalled();
  });
  it.each([NaN, Infinity, 0, -1, 0.5, Date.parse(base.expiresAt)])("does not claim with invalid/expired wall clock %s", async clock => {
    time = clock; issueQueue();
    expect(await run("issue")).toEqual({ ok: false, code: "expired" }); expect(sign).not.toHaveBeenCalled(); expect(rpc).toHaveBeenCalledTimes(2);
  });
  it.each([
    [{ ...issued, outcome: "already_issued" }, { ok: true, state: "already-issued" }],
    [{ ...closed(), outcome: "terminal" }, { ok: false, code: "intent-closed" }],
    [{ ...consumed, outcome: "terminal" }, { ok: true, state: "already-completed" }],
    [{ ...base, status: "cancelled", outcome: "too_late" }, { ok: false, code: "expired" }],
  ])("does not sign nonwinning claim %j", async (claim, expected) => {
    issueQueue(base, claim); expect(await run("issue")).toMatchObject(expected); expect(sign).not.toHaveBeenCalled(); expect(rpc).toHaveBeenCalledTimes(3);
  });
  it.each([
    null, { ...issued }, { ...issued, outcome: "reissued" }, { ...issued, outcome: "issued", extra: true },
    { ...base, outcome: "issued" }, { ...issued, outcome: "terminal" },
    { ...issued, outcome: "issued", expectedByteSize: 2048 },
    { ...issued, outcome: "issued", expectedChecksumSha256: "b".repeat(64) },
    { ...issued, outcome: "issued", physicalObjectId: "00000000-0000-4000-8000-000000000005" },
    { ...issued, outcome: "issued", expiresAt: "2026-09-22T12:11:00.000Z" },
  ])("rejects malformed/drifted claim %j", async claim => {
    issueQueue(base, claim); expect(await run("issue")).toEqual({ ok: false, code: "unconfirmed" }); expect(sign).not.toHaveBeenCalled();
  });
  it.each(["error", "lost-reply"])("never retries or closes an ambiguous claim: %s", async mode => {
    queue(readyReply, base);
    if (mode === "error") rpc.mockResolvedValueOnce({ data: { ...issued, outcome: "issued" }, error: new Error(credentials.privateKey) });
    else rpc.mockRejectedValueOnce(new Error(credentials.privateKey));
    expect(await run("issue")).toEqual({ ok: false, code: "unconfirmed" }); expect(sign).not.toHaveBeenCalled(); expect(rpc).toHaveBeenCalledTimes(3);
  });
  it.each([Date.parse(issued.issuedAt) - 5001, Date.parse(issued.authorityExpiresAt) - 29_999])("refuses future/too-short authority at time %s", async clock => {
    time = clock; issueQueue();
    expect(await run("issue")).toEqual({ ok: false, code: "expired" }); expect(sign).not.toHaveBeenCalled();
  });
  it.each(["throws", "error", "wrong-expiry"])("does not expose authority when signer %s", async mode => {
    issueQueue();
    sign.mockImplementation(input => {
      if (mode === "throws") throw new Error(credentials.privateKey);
      if (mode === "error") return { ok: false, reason: "invalid-expiry" };
      const result = createImageKitUploadAuthority(input);
      if (!result.ok) return result;
      return { ok: true, authority: { ...result.authority, expiresAt: result.authority.expiresAt + 1 } };
    });
    expect(await run("issue")).toEqual({ ok: false, code: "unconfirmed" }); expect(rpc).toHaveBeenCalledTimes(3);
  });
  it.each([
    [closed(), "intent-closed"], [null, "unconfirmed"],
    [{ ...issued, physicalObjectId: "00000000-0000-4000-8000-000000000005" }, "unconfirmed"],
    [{ ...issued, issuedAt: "2026-09-22T12:00:01.000Z", authorityExpiresAt: "2026-09-22T12:05:01.000Z" }, "unconfirmed"],
  ])("withholds signed token if post-sign state changes %j", async (current, code) => {
    issueQueue(base, { ...issued, outcome: "issued" }, current);
    expect(await run("issue")).toEqual({ ok: false, code }); expect(sign).toHaveBeenCalledTimes(1);
  });
  it("withholds a token that became too short while signing", async () => {
    issueQueue(); sign.mockImplementation(input => { time += 270_000; return createImageKitUploadAuthority(input); });
    expect(await run("issue")).toEqual({ ok: false, code: "expired" }); expect(rpc).toHaveBeenCalledTimes(4);
  });
  it("withholds signed authority after a final actor-scoped resolve error", async () => {
    queue(readyReply, base, { ...issued, outcome: "issued" });
    rpc.mockResolvedValueOnce({ data: issued, error: { code: "42501" } });
    expect(await run("issue")).toEqual({ ok: false, code: "unconfirmed" }); expect(sign).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledTimes(4);
  });
  it("returns completion without token if consumed during signing", async () => {
    issueQueue(base, { ...issued, outcome: "issued" }, consumed);
    expect(await run("issue")).toMatchObject({ ok: true, state: "already-completed" }); expect(revalidate).toHaveBeenCalledOnce();
  });
});

describe("ImageKit verified atomic completion", () => {
  it("passes fresh server proof to the finalizer after actor-scoped reread", async () => {
    finalizeQueue();
    expect(await run("finalize")).toMatchObject({ ok: true, state: "completed", upload: { status: "consumed" } });
    expect(verify).toHaveBeenCalledExactlyOnceWith({ credentials, fileId: proof.fileId, intent: {
      intentId, assetId, storageContainer: base.storageContainer, objectKey: base.objectKey, mimeType: base.mimeType,
      expectedByteSize: base.expectedByteSize, expectedChecksumSha256: base.expectedChecksumSha256,
    } });
    expect(calls()).toEqual(["get_imagekit_upload_readiness_v1", "resolve_imagekit_upload_v1", "resolve_imagekit_upload_v1", "finalize_imagekit_upload_v1"]);
    expect(rpc).toHaveBeenLastCalledWith("finalize_imagekit_upload_v1", { p_intent_id: intentId, p_actor_id: actorId, p_evidence: proof });
    expect(sign).not.toHaveBeenCalled(); expect(revalidate).toHaveBeenCalledOnce();
  });
  it("permits completed transfer verification after token expiry while reservation remains live", async () => {
    time = Date.parse(issued.authorityExpiresAt) + 1000; finalizeQueue();
    expect(await run("finalize")).toMatchObject({ ok: true, state: "completed" });
  });
  it.each([[base, "not-issued"], [closed(), "intent-closed"], [closed("failed"), "intent-closed"], [closed("expired"), "intent-closed"]])("refuses unissued/closed %j", async (initial, code) => {
    queue(readyReply, initial); expect(await run("finalize")).toEqual({ ok: false, code }); expect(verify).not.toHaveBeenCalled();
  });
  it("does not verify a reservation that already expired", async () => {
    time = Date.parse(base.expiresAt); finalizeQueue();
    expect(await run("finalize")).toEqual({ ok: false, code: "expired" }); expect(verify).not.toHaveBeenCalled();
  });
  it.each([[proof.fileId, "already-completed"], ["other_file", "conflict"]])("handles consumed retry for %s without provider read", async (fileId, outcome) => {
    queue(readyReply, consumed);
    expect(await run("finalize", { intentId, fileId })).toMatchObject(outcome === "conflict" ? { ok: false, code: outcome } : { ok: true, state: outcome });
    expect(verify).not.toHaveBeenCalled(); expect(rpc).toHaveBeenCalledTimes(2);
  });
  it.each(["provider-unavailable", "content-mismatch", "identity-mismatch", "version-changed"] as const)("does not mutate DB when verifier rejects %s", async reason => {
    finalizeQueue(); verify.mockResolvedValue({ ok: false, reason });
    expect(await run("finalize")).toEqual({ ok: false, code: "verification-failed" }); expect(rpc).toHaveBeenCalledTimes(2);
  });
  it("handles unexpected verifier failure without exposing credentials", async () => {
    finalizeQueue(); verify.mockRejectedValue(new Error(credentials.privateKey));
    expect(await run("finalize")).toEqual({ ok: false, code: "unconfirmed" }); expect(rpc).toHaveBeenCalledTimes(2);
  });
  it.each([
    { storageProvider: "supabase" }, { storageContainer: "foreign_account" }, { fileId: "other_file" },
    { objectKey: "media/source/other/file.jpg" }, { deliveryUrl: `${proof.deliveryUrl}?tr=w-100` },
    { deliveryUrl: "https://evil.test/file.jpg" }, { mimeType: "image/png" }, { byteSize: 1025 },
    { checksumSha256: "b".repeat(64) }, { versionId: "../version" }, { versionToken: "" }, { extra: true },
  ])("rejects malformed/mismatched server proof %j", async patch => {
    finalizeQueue(); verify.mockResolvedValue({ ok: true, object: { ...proof, ...patch } } as Awaited<ReturnType<typeof verifyImageKitObject>>);
    expect(await run("finalize")).toEqual({ ok: false, code: "verification-failed" }); expect(rpc).toHaveBeenCalledTimes(2);
  });
  it("does not finalize if intent expires during provider verification", async () => {
    finalizeQueue(); verify.mockImplementation(async () => { time = Date.parse(base.expiresAt); return { ok: true, object: proof }; });
    expect(await run("finalize")).toEqual({ ok: false, code: "expired" }); expect(rpc).toHaveBeenCalledTimes(2);
  });
  it("also rechecks expiry after a slow actor-scoped resolve", async () => {
    queue(readyReply, issued);
    rpc.mockImplementationOnce(async () => { time = Date.parse(base.expiresAt); return ok(issued); });
    expect(await run("finalize")).toEqual({ ok: false, code: "expired" }); expect(rpc).toHaveBeenCalledTimes(3);
  });
  it.each([[closed(), "intent-closed"], [null, "unconfirmed"],
    [{ ...issued, expectedChecksumSha256: "b".repeat(64) }, "unconfirmed"],
    [{ ...issued, issuedAt: "2026-09-22T12:00:01.000Z", authorityExpiresAt: "2026-09-22T12:05:01.000Z" }, "unconfirmed"],
  ])("does not publish after cancellation/actor loss/fact drift %j", async (current, code) => {
    finalizeQueue(issued, current); expect(await run("finalize")).toEqual({ ok: false, code }); expect(rpc).toHaveBeenCalledTimes(3);
  });
  it("handles an actor ownership error after verification without mutation", async () => {
    queue(readyReply, issued); rpc.mockResolvedValueOnce({ data: issued, error: { code: "42501" } });
    expect(await run("finalize")).toEqual({ ok: false, code: "unconfirmed" }); expect(rpc).toHaveBeenCalledTimes(3);
  });
  it.each([
    [consumed, "already-completed"], [{ ...consumed, fileId: "other_file" }, "conflict"],
    [{ ...consumed, versionId: "version_two" }, "conflict"], [{ ...consumed, versionToken: "token_two" }, "conflict"],
  ])("handles concurrent consumption without refinalizing: %j", async (current, outcome) => {
    finalizeQueue(issued, current);
    expect(await run("finalize")).toMatchObject(outcome === "conflict" ? { ok: false, code: outcome } : { ok: true, state: outcome });
    expect(rpc).toHaveBeenCalledTimes(3);
  });
  it.each([
    null, {}, { ...consumed }, { ...consumed, outcome: "prepared" }, { ...issued, outcome: "consumed" },
    { ...consumed, outcome: "consumed", extra: true }, { ...consumed, outcome: "consumed", fileId: "other_file" },
    { ...consumed, outcome: "consumed", versionId: "version_two" }, { ...consumed, outcome: "consumed", versionToken: "token_two" },
    { ...consumed, outcome: "consumed", expectedByteSize: 2048 },
    { ...consumed, outcome: "consumed", issuedAt: "2026-09-22T12:00:01.000Z", authorityExpiresAt: "2026-09-22T12:05:01.000Z" },
  ])("refuses malformed or inconsistent finalizer response %j", async final => {
    finalizeQueue(issued, issued, final);
    expect(await run("finalize")).toEqual({ ok: false, code: "unconfirmed" }); expect(revalidate).not.toHaveBeenCalled();
  });
  it.each(["error", "lost-reply"])("does not retry/rollback on ambiguous finalizer %s", async mode => {
    queue(readyReply, issued, issued);
    if (mode === "error") rpc.mockResolvedValueOnce({ data: consumed, error: new Error(credentials.privateKey) });
    else rpc.mockRejectedValueOnce(new Error(credentials.privateKey));
    expect(await run("finalize")).toEqual({ ok: false, code: "unconfirmed" }); expect(rpc).toHaveBeenCalledTimes(4); expect(revalidate).not.toHaveBeenCalled();
  });
  it("reports a finalizer's idempotent concurrent success", async () => {
    finalizeQueue(issued, issued, { ...consumed, outcome: "already_consumed" });
    expect(await run("finalize")).toMatchObject({ ok: true, state: "already-completed" });
  });
  it("does not turn committed success into failure when cache invalidation throws", async () => {
    finalizeQueue(); revalidate.mockImplementation(() => { throw new Error(credentials.privateKey); });
    expect(await run("finalize")).toMatchObject({ ok: true, state: "completed" }); expect(rpc).toHaveBeenCalledTimes(4);
  });
  it("preserves committed success after an asynchronous cache invalidation rejection", async () => {
    finalizeQueue(); revalidate.mockRejectedValue(new Error(credentials.privateKey));
    expect(await run("finalize")).toMatchObject({ ok: true, state: "completed" }); expect(rpc).toHaveBeenCalledTimes(4);
    expect(revalidate).toHaveBeenCalledOnce();
  });
});

describe("dormant module boundary", () => {
  it("is server-only, not a public action, and has no application consumers", () => {
    const source = readFileSync("lib/admin/imagekit-upload-workflow.ts", "utf8");
    expect(source).toContain('import "server-only"'); expect(source).not.toMatch(/["']use server["']/);
    function scan(directory: string): string[] {
      return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
        ? scan(join(directory, entry.name)) : /\.[cm]?[jt]sx?$/.test(entry.name) ? [join(directory, entry.name)] : []);
    }
    for (const file of [...scan("app"), ...scan("components"), ...scan("lib")]) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/(?:from\s*|import\s*\()["'][^"']*imagekit-upload-workflow/);
    }
  });
});
