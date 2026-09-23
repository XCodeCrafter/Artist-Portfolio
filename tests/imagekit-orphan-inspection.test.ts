import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inspectImageKitOrphanCandidate, type ImageKitOrphanInspection } from "@/lib/admin/imagekit-orphan-inspection";
import type { discoverImageKitOrphanCandidate } from "@/lib/admin/imagekit-orphan-discovery";
import type { verifyImageKitObject } from "@/lib/admin/imagekit-object-verification";

const credentials = { imageKitId: "fictional_artist", urlEndpoint: "https://ik.imagekit.io/fictional_artist",
  publicKey: "public_fictional_test_key", privateKey: "private_fictional_test_key" };
const intentId = "123e4567-e89b-42d3-a456-426614174000";
const assetId = `imagekit-${intentId}`;
const bytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const lease = {
  intentId, assetId, physicalObjectId: "00000000-0000-4000-8000-000000000002",
  storageProvider: "imagekit", storageContainer: credentials.imageKitId,
  objectKey: `media/source/${assetId}/${intentId}.png`, mediaType: "image", mimeType: "image/png",
  expectedByteSize: bytes.length, expectedChecksumSha256: createHash("sha256").update(bytes).digest("hex"),
  expiresAt: "2026-09-22T12:10:00.000Z", status: "cancelled",
  issuedAt: "2026-09-22T12:00:00.000Z", authorityExpiresAt: "2026-09-22T12:05:00.000Z",
  fileId: null, versionId: null, versionToken: null, sourceVariantId: null, cleanupState: "leased",
  leaseId: "00000000-0000-4000-8000-000000000003", leaseExpiresAt: "2026-09-22T13:16:00.000Z",
};
const candidate = { fileId: "file_one", versionId: "version_one", versionToken: "token_one", updatedAt: "2026-09-22T12:01:00.000Z" };
const proof = { storageProvider: "imagekit" as const, storageContainer: credentials.imageKitId, objectKey: lease.objectKey,
  fileId: candidate.fileId, versionId: candidate.versionId, versionToken: candidate.versionToken,
  deliveryUrl: `${credentials.urlEndpoint}/${lease.objectKey}`, mimeType: lease.mimeType,
  byteSize: lease.expectedByteSize, checksumSha256: lease.expectedChecksumSha256 };
type Discovery = Awaited<ReturnType<typeof discoverImageKitOrphanCandidate>>;
type Verification = Awaited<ReturnType<typeof verifyImageKitObject>>;
let discover: ReturnType<typeof vi.fn<typeof discoverImageKitOrphanCandidate>>;
let verify: ReturnType<typeof vi.fn<typeof verifyImageKitObject>>;
let time: number;
let results: ImageKitOrphanInspection[];
let allowMockedHttp: boolean;
async function run(value: unknown = { credentials, lease }, signal?: AbortSignal) {
  const result = await inspectImageKitOrphanCandidate(value, { discover, verify, now: () => time, signal });
  results.push(result); return result;
}

beforeEach(() => {
  time = Date.parse("2026-09-22T13:11:00.000Z"); results = []; allowMockedHttp = false;
  discover = vi.fn<typeof discoverImageKitOrphanCandidate>().mockResolvedValue({ status: "candidate", candidate });
  verify = vi.fn<typeof verifyImageKitObject>().mockResolvedValue({ ok: true, object: proof });
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unexpected real network"); }));
});
afterEach(() => {
  if (!allowMockedHttp) expect(fetch).not.toHaveBeenCalled();
  expect(discover.mock.calls.length).toBeLessThanOrEqual(1);
  expect(verify.mock.calls.length).toBeLessThanOrEqual(1);
  for (const result of results) {
    for (const secret of [credentials.privateKey, credentials.publicKey, lease.leaseId, lease.physicalObjectId, "raw-provider-error"]) {
      expect(JSON.stringify(result)).not.toContain(secret);
    }
    if (result.status !== "candidate-observed") {
      expect(JSON.stringify(result)).not.toContain(lease.objectKey);
      expect(JSON.stringify(result)).not.toContain(candidate.fileId);
    }
    expect(JSON.stringify(result)).not.toMatch(/"(?:deleted|resolved|deletable|cleaned|quiescent)"/);
  }
  vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals();
});

describe("lease-gated dormant orphan inspection", () => {
  it.each([null, [], {}, { credentials }, { credentials, lease, fileId: "from-browser" }, { credentials, lease, quiescent: true }])(
    "refuses malformed or expanded input %j", async value => {
      expect((await run(value)).status).toBe("attention");
      expect(discover).not.toHaveBeenCalled(); expect(verify).not.toHaveBeenCalled();
    });
  it.each([{ privateKey: "" }, { publicKey: "x" }, { imageKitId: "foreign" }, { extra: true },
    { urlEndpoint: "https://evil.test/fictional_artist" }, { urlEndpoint: `${credentials.urlEndpoint}/` }])(
    "refuses unsafe config %j before probing", async patch => {
      expect((await run({ credentials: { ...credentials, ...patch }, lease })).status).toBe("attention");
      expect(discover).not.toHaveBeenCalled();
    });
  it.each([{ storageContainer: "other" }, { status: "prepared" }, { status: "consumed" }, { status: "unknown" },
    { issuedAt: null }, { authorityExpiresAt: "2026-09-22T13:12:00.000Z" }, { cleanupState: "pending" },
    { fileId: "already-bound" }, { sourceVariantId: lease.physicalObjectId }, { leaseId: "invalid" },
    { expiresAt: "2026-09-22T13:09:00.000Z" }, { objectKey: "../foreign.png" }, { unknown: true },
    { leaseExpiresAt: "2026-09-22T13:11:30.000Z" }, { leaseExpiresAt: "2026-09-22T13:17:00.000Z" }])(
    "refuses an invalid lease %j", async patch => {
      expect(await run({ credentials, lease: { ...lease, ...patch } })).toEqual({ status: "attention", reason: "invalid-lease" });
      expect(discover).not.toHaveBeenCalled();
    });
  it.each([30_001, 60_000, 65_000])("requires more than the entire budget plus 5s margin (%i)", async remaining => {
    expect(await run({ credentials, lease: { ...lease, leaseExpiresAt: new Date(time + remaining).toISOString() } }))
      .toEqual({ status: "retry", reason: "lease-too-short" });
    expect(discover).not.toHaveBeenCalled();
  });
  it.each([0, -1, 1.5, Infinity, NaN])("refuses invalid clock %j", async value => {
    time = value;
    expect(await run()).toEqual({ status: "retry", reason: "unconfirmed" });
    expect(discover).not.toHaveBeenCalled();
  });
  it("returns projected server-only evidence, not delete authorization", async () => {
    expect(await run()).toEqual({ status: "candidate-observed", object: proof });
    const expectedIntent = { intentId, assetId, storageContainer: credentials.imageKitId, objectKey: lease.objectKey,
      mimeType: lease.mimeType, expectedByteSize: lease.expectedByteSize, expectedChecksumSha256: lease.expectedChecksumSha256 };
    expect(discover).toHaveBeenCalledExactlyOnceWith({ credentials, intent: expectedIntent }, { signal: expect.any(AbortSignal) });
    expect(verify).toHaveBeenCalledExactlyOnceWith({ credentials, intent: expectedIntent, fileId: candidate.fileId }, {
      signal: expect.any(AbortSignal), expectedCurrent: { versionId: candidate.versionId, versionToken: candidate.versionToken, updatedAt: candidate.updatedAt },
    });
  });
  it("retains a valid candidate whose list URL has no version token", async () => {
    discover.mockResolvedValue({ status: "candidate", candidate: { ...candidate, versionToken: null } });
    expect((await run()).status).toBe("candidate-observed");
    expect(verify.mock.calls[0][1]?.expectedCurrent?.versionToken).toBeNull();
  });
  it.each(["expired", "failed"])("allows other eligible terminal states (%s)", async status => {
    expect((await run({ credentials, lease: { ...lease, status } })).status).toBe("candidate-observed");
  });
});

describe("ambiguity and stale evidence never become cleanup success", () => {
  it.each([
    [{ status: "not-observed" }, { status: "not-observed" }],
    [{ status: "retry" }, { status: "retry", reason: "provider-unavailable" }],
    [{ status: "attention" }, { status: "attention", reason: "ambiguous-candidate" }],
  ])("does not download bytes after %j", async (found, expected) => {
    discover.mockResolvedValue(found as Discovery);
    expect(await run()).toEqual(expected); expect(verify).not.toHaveBeenCalled();
  });
  it.each([null, {}, { status: "deleted" }, { status: "not-observed", extra: true },
    { status: "candidate", candidate: { ...candidate, extra: true } },
    { status: "candidate", candidate: { ...candidate, fileId: "../foreign" } },
    { status: "candidate", candidate: { ...candidate, updatedAt: "invalid" } }])(
    "refuses malformed discovery %j", async found => {
      discover.mockResolvedValue(found as Discovery);
      expect(await run()).toEqual({ status: "retry", reason: "unconfirmed" }); expect(verify).not.toHaveBeenCalled();
    });
  it.each(["invalid-input", "invalid-provider-response", "identity-mismatch", "content-mismatch", "version-changed"] as const)(
    "requires attention on verification %s", async reason => {
      verify.mockResolvedValue({ ok: false, reason });
      expect(await run()).toEqual({ status: "attention", reason: "evidence-mismatch" });
    });
  it("retains retry on provider unavailability", async () => {
    verify.mockResolvedValue({ ok: false, reason: "provider-unavailable" });
    expect(await run()).toEqual({ status: "retry", reason: "provider-unavailable" });
  });
  it.each([{ storageContainer: "foreign" }, { objectKey: "other.png" }, { fileId: "another" },
    { versionId: "another" }, { versionToken: "another" }, { deliveryUrl: "https://evil.test/media" },
    { mimeType: "image/jpeg" }, { byteSize: bytes.length + 1 }, { checksumSha256: "b".repeat(64) }])(
    "compares every immutable evidence field %j", async patch => {
      verify.mockResolvedValue({ ok: true, object: { ...proof, ...patch } });
      expect(await run()).toEqual({ status: "attention", reason: "evidence-mismatch" });
    });
  it.each([null, {}, { ok: false, reason: "raw-provider-error" }, { ok: true, object: { ...proof, extra: true } },
    { ok: true, object: { ...proof, storageProvider: "supabase" } }, { ok: true, object: { ...proof, versionToken: "" } }])(
    "refuses malformed verifier result %j", async result => {
      verify.mockResolvedValue(result as Verification);
      expect(await run()).toEqual({ status: "retry", reason: "unconfirmed" });
    });
  it.each(["discover", "verify"])("redacts thrown %s errors", async phase => {
    (phase === "discover" ? discover : verify).mockRejectedValue(new Error(`raw-provider-error ${credentials.privateKey}`));
    expect(await run()).toEqual({ status: "retry", reason: "unconfirmed" });
  });
  it("copies caller input before async discovery", async () => {
    const input = { credentials: { ...credentials }, lease: { ...lease } };
    discover.mockImplementation(async () => {
      input.lease.objectKey = "foreign.png"; input.credentials.urlEndpoint = "https://evil.test";
      return { status: "candidate", candidate };
    });
    expect(await run(input)).toEqual({ status: "candidate-observed", object: proof });
  });
});

describe("bounded inspection and no late continuation", () => {
  it.each(["discover", "verify"])("rejects backward clocks after %s", async phase => {
    if (phase === "discover") discover.mockImplementation(async () => { time -= 1; return { status: "candidate", candidate }; });
    else verify.mockImplementation(async () => { time -= 1; return { ok: true, object: proof }; });
    expect(await run()).toEqual({ status: "retry", reason: "unconfirmed" });
    if (phase === "discover") expect(verify).not.toHaveBeenCalled();
  });
  it("does not verify if the remaining lease cannot cover verification", async () => {
    discover.mockImplementation(async () => { time = Date.parse(lease.leaseExpiresAt) - 50_000; return { status: "candidate", candidate }; });
    expect(await run()).toEqual({ status: "retry", reason: "lease-too-short" }); expect(verify).not.toHaveBeenCalled();
  });
  it.each(["discover", "verify"])("rejects delayed-timer completion after %s exhausts elapsed budget", async phase => {
    let elapsed = 0;
    vi.spyOn(performance, "now").mockImplementation(() => elapsed);
    if (phase === "discover") discover.mockImplementation(async () => { elapsed = 60_001; return { status: "candidate", candidate }; });
    else verify.mockImplementation(async () => { elapsed = 60_001; return { ok: true, object: proof }; });
    expect(await run()).toEqual({ status: "retry", reason: "deadline" });
    if (phase === "discover") expect(verify).not.toHaveBeenCalled();
  });
  it.each(["discover", "verify"])("does not accept %s after lease expiry", async phase => {
    if (phase === "discover") discover.mockImplementation(async () => { time += 300_000; return { status: "not-observed" }; });
    else verify.mockImplementation(async () => { time += 295_000; return { ok: true, object: proof }; });
    expect(await run()).toEqual({ status: "retry", reason: "lease-too-short" });
  });
  it("bounds late discovery and prevents later verification", async () => {
    vi.useFakeTimers();
    let resolve!: (value: Discovery) => void;
    discover.mockReturnValue(new Promise(done => { resolve = done; }));
    const pending = run(); await vi.advanceTimersByTimeAsync(60_001);
    expect(await pending).toEqual({ status: "retry", reason: "deadline" });
    resolve({ status: "candidate", candidate }); await vi.advanceTimersByTimeAsync(0);
    expect(verify).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
    expect(discover.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });
  it("bounds late verification without converting its late result to success", async () => {
    vi.useFakeTimers(); let resolve!: (value: Verification) => void;
    verify.mockReturnValue(new Promise(done => { resolve = done; }));
    const pending = run(); await vi.advanceTimersByTimeAsync(60_001);
    expect(await pending).toEqual({ status: "retry", reason: "deadline" });
    resolve({ ok: true, object: proof }); await vi.advanceTimersByTimeAsync(0);
    expect(results).toHaveLength(1); expect(vi.getTimerCount()).toBe(0);
    expect(verify.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });
  it("does not contact adapters with a pre-aborted caller", async () => {
    const controller = new AbortController(); controller.abort();
    expect(await run(undefined, controller.signal)).toEqual({ status: "retry", reason: "unconfirmed" });
    expect(discover).not.toHaveBeenCalled();
  });
  it.each(["discover", "verify"])("stops %s on external cancellation", async phase => {
    vi.useFakeTimers(); const controller = new AbortController();
    (phase === "discover" ? discover : verify).mockReturnValue(new Promise<never>(() => {}));
    const pending = run(undefined, controller.signal); await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    expect(await pending).toEqual({ status: "retry", reason: "unconfirmed" }); expect(vi.getTimerCount()).toBe(0);
    if (phase === "discover") expect(verify).not.toHaveBeenCalled();
  });
});

describe("real read-only adapters with synthetic HTTP", () => {
  function response(value: unknown, url: string, mime = "application/json") {
    const result = new Response(mime === "application/json" ? JSON.stringify(value) : bytes, { headers: { "content-type": mime } });
    Object.defineProperty(result, "url", { value: url }); return result;
  }
  const detail = { fileId: candidate.fileId, type: "file", name: `${intentId}.png`, filePath: `/${lease.objectKey}`,
    versionInfo: { id: candidate.versionId }, isPrivateFile: false, isPublished: true,
    url: `${proof.deliveryUrl}?ik-obj-version=${candidate.versionToken}`, mime: lease.mimeType, size: bytes.length, updatedAt: candidate.updatedAt };
  it("lists once then checks current/version/original bytes/current without any write", async () => {
    allowMockedHttp = true;
    const payloads = [[detail], detail, { ...detail, type: "file-version" }, bytes, detail];
    vi.mocked(fetch).mockImplementation(async (url) => response(payloads.shift(), String(url), payloads.length === 1 ? lease.mimeType : "application/json"));
    const result = await inspectImageKitOrphanCandidate({ credentials, lease }, { now: () => time }); results.push(result);
    expect(result).toEqual({ status: "candidate-observed", object: proof });
    expect(fetch).toHaveBeenCalledTimes(5);
    for (const [url, options] of vi.mocked(fetch).mock.calls) {
      expect(options?.method).toBe("GET"); expect(options?.redirect).toBe("error");
      expect(options?.cache).toBe("no-store"); expect(options?.credentials).toBe("omit");
      if (String(url).startsWith(credentials.urlEndpoint)) {
        expect(new Headers(options?.headers).has("Authorization")).toBe(false);
        expect(String(url)).toBe(`${proof.deliveryUrl}?ik-obj-version=token_one&tr=orig-true`);
      } else expect(String(url)).toMatch(/^https:\/\/api\.imagekit\.io\/v1\/files/);
    }
  });
  it.each([
    { versionInfo: { id: "new_version" } },
    { updatedAt: "2026-09-22T12:01:01.000Z" },
    { url: `${proof.deliveryUrl}?ik-obj-version=new_token` },
    { url: proof.deliveryUrl },
  ])("stops list-to-detail drift %j before any media download", async patch => {
    allowMockedHttp = true; let call = 0;
    vi.mocked(fetch).mockImplementation(async url => response(call++ === 0 ? [detail] : { ...detail, ...patch }, String(url)));
    const result = await inspectImageKitOrphanCandidate({ credentials, lease }, { now: () => time }); results.push(result);
    expect(result).toEqual({ status: "attention", reason: "evidence-mismatch" }); expect(fetch).toHaveBeenCalledTimes(2);
  });
});

it("remains dormant with no SQL, authority signing, destructive request or 30s-worker integration", () => {
  const files = (path: string): string[] => readdirSync(path, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? files(join(path, entry.name)) : /\.[cm]?[jt]sx?$/.test(entry.name) ? [join(path, entry.name)] : []);
  for (const file of [...files("app"), ...files("components")]) {
    expect(readFileSync(file, "utf8")).not.toMatch(/imagekit-orphan-(?:inspection|discovery)["']/);
  }
  for (const file of ["lib/admin/imagekit-orphan-inspection.ts", "lib/admin/imagekit-orphan-discovery.ts"]) {
    const source = readFileSync(file, "utf8");
    expect(source).toContain('import "server-only"');
    expect(source).not.toMatch(/['"]use server['"]|\.rpc\(|method:\s*['"](?:DELETE|POST|PUT|PATCH)['"]|createImageKitUploadAuthority/);
  }
  expect(readFileSync("lib/admin/imagekit-reconciliation-workflow.ts", "utf8")).not.toContain("imagekit-orphan-");
});
