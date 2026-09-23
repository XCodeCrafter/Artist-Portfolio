import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verifyImageKitObject, type ImageKitObjectVerificationOptions } from "@/lib/admin/imagekit-object-verification";

const PNG_BYTES = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const checksum = createHash("sha256").update(PNG_BYTES).digest("hex");
const credentials = {
  publicKey: "public_abcdefghijklmnop",
  privateKey: "private_abcdefghijklmnop",
  urlEndpoint: "https://ik.imagekit.io/artistportfolio",
  imageKitId: "artistportfolio",
};
const intent = {
  intentId: "123e4567-e89b-42d3-a456-426614174000",
  assetId: "pilot-image",
  storageContainer: "artistportfolio",
  objectKey:
    "media/source/pilot-image/123e4567-e89b-42d3-a456-426614174000.png",
  mimeType: "image/png",
  expectedByteSize: PNG_BYTES.length,
  expectedChecksumSha256: checksum,
};
const deliveryUrl = `${credentials.urlEndpoint}/${intent.objectKey}`;
const currentApiUrl = "https://api.imagekit.io/v1/files/file-one/details";
const versionApiUrl =
  "https://api.imagekit.io/v1/files/file-one/versions/version-one";
const originalUrl = `${deliveryUrl}?ik-obj-version=object.version_one&tr=orig-true`;
const currentDetails = {
  fileId: "file-one",
  type: "file",
  name: `${intent.intentId}.png`,
  filePath: `/${intent.objectKey}`,
  versionInfo: { id: "version-one" },
  isPrivateFile: false,
  isPublished: true,
  url: `${deliveryUrl}?updatedAt=1800000000000`,
  mime: "image/png",
  size: PNG_BYTES.length,
  updatedAt: "2026-09-22T12:00:00.000Z",
};
const versionDetails = {
  ...currentDetails,
  type: "file-version",
  url: `${deliveryUrl}?ik-obj-version=object.version_one&updatedAt=1800000000000`,
};

type Input = {
  credentials: typeof credentials;
  intent: typeof intent;
  fileId: string;
};

function verify(overrides: Partial<Input> = {}, options?: ImageKitObjectVerificationOptions) {
  return verifyImageKitObject({
    credentials,
    intent,
    fileId: "file-one",
    ...overrides,
  }, options);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json" },
  });
}

function mediaResponse(
  body: Uint8Array<ArrayBuffer> = PNG_BYTES,
  headers: HeadersInit = {}
) {
  return new Response(body, {
    headers: { "content-type": "image/png", ...headers },
  });
}

function mockResponses(responses: Response[]) {
  const mock = vi.mocked(fetch);
  for (const response of responses) mock.mockResolvedValueOnce(response);
  return mock;
}

function successfulResponses() {
  return [
    jsonResponse(currentDetails),
    jsonResponse(versionDetails),
    mediaResponse(),
    jsonResponse(currentDetails),
  ];
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("ImageKit object verification", () => {
  it("verifies the intended object, immutable original bytes, and unchanged current version", async () => {
    const fetchMock = mockResponses(successfulResponses());

    expect(await verify()).toEqual({
      ok: true,
      object: {
        storageProvider: "imagekit",
        storageContainer: intent.storageContainer,
        objectKey: intent.objectKey,
        fileId: "file-one",
        versionId: "version-one",
        versionToken: "object.version_one",
        deliveryUrl,
        mimeType: intent.mimeType,
        byteSize: PNG_BYTES.length,
        checksumSha256: checksum,
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      currentApiUrl,
      versionApiUrl,
      originalUrl,
      currentApiUrl,
    ]);
  });

  it("never forwards provider authorization to the CDN or follows redirects", async () => {
    const fetchMock = mockResponses(successfulResponses());
    expect(await verify()).toMatchObject({ ok: true });

    const basic = `Basic ${Buffer.from(`${credentials.privateKey}:`).toString("base64")}`;
    const verificationSignal = fetchMock.mock.calls[0][1]?.signal;
    for (const [url, init] of fetchMock.mock.calls) {
      expect(init?.method ?? "GET").toBe("GET");
      expect(init?.redirect).toBe("error");
      expect(init?.credentials).toBe("omit");
      expect(init?.cache).toBe("no-store");
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      expect(init?.signal).toBe(verificationSignal);
      const headers = new Headers(init?.headers);
      expect(headers.get("accept-encoding")).toBe("identity");
      if (new URL(String(url)).hostname === "api.imagekit.io") {
        expect(headers.get("authorization")).toBe(basic);
      } else {
        expect(headers.has("authorization")).toBe(false);
        expect(headers.has("cookie")).toBe(false);
      }
      expect(String(url)).not.toContain(credentials.privateKey);
      expect(String(url)).not.toContain(credentials.publicKey);
    }
  });

  it.each([
    { mime: "image/jpeg", extension: "jpg", bytes: new Uint8Array([255, 216, 255]) },
    { mime: "image/gif", extension: "gif", bytes: new Uint8Array(Buffer.from("GIF89a")) },
    { mime: "image/webp", extension: "webp", bytes: new Uint8Array(Buffer.from("RIFF0000WEBP")) },
    { mime: "image/avif", extension: "avif", bytes: new Uint8Array([0, 0, 0, 16, ...Buffer.from("ftypavif"), 0, 0, 0, 0]) },
    { mime: "video/mp4", extension: "mp4", bytes: new Uint8Array([0, 0, 0, 16, ...Buffer.from("ftypisom"), 0, 0, 0, 0]) },
    { mime: "video/quicktime", extension: "mov", bytes: new Uint8Array([0, 0, 0, 16, ...Buffer.from("ftypqt  "), 0, 0, 0, 0]) },
    { mime: "video/webm", extension: "webm", bytes: new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x42, 0x82, 0x84, ...Buffer.from("webm")]) },
  ])("checks the allowlisted $mime signature and canonical extension", async ({ mime, extension, bytes }) => {
    // Minimal signatures intentionally exercise MIME policy, not full decoding.
    const target = {
      ...intent,
      mimeType: mime,
      objectKey: intent.objectKey.replace(/png$/, extension),
      expectedByteSize: bytes.length,
      expectedChecksumSha256: createHash("sha256").update(bytes).digest("hex"),
    };
    const targetUrl = `${credentials.urlEndpoint}/${target.objectKey}`;
    const details = {
      ...currentDetails,
      name: `${intent.intentId}.${extension}`,
      filePath: `/${target.objectKey}`,
      url: targetUrl,
      size: bytes.length,
      mime,
    };
    mockResponses([
      jsonResponse(details),
      jsonResponse({ ...details, type: "file-version", url: `${targetUrl}?ik-obj-version=object.version_one` }),
      mediaResponse(bytes, { "content-type": mime }),
      jsonResponse(details),
    ]);
    expect(await verify({ intent: target })).toMatchObject({
      ok: true,
      object: { mimeType: mime, byteSize: bytes.length, checksumSha256: target.expectedChecksumSha256 },
    });
  });

  it.each([
    ["empty file ID", { fileId: "" }],
    ["file path traversal", { fileId: "../other-file" }],
    ["file query injection", { fileId: "file-one?private=true" }],
    ["encoded file separator", { fileId: "file%2fone" }],
    ["file URL", { fileId: "https://attacker.invalid/file" }],
    ["wrong container", { intent: { ...intent, storageContainer: "someone-else" } }],
    ["wrong asset", { intent: { ...intent, assetId: "another-asset" } }],
    ["wrong intent", { intent: { ...intent, intentId: "not-a-uuid" } }],
    ["leading object slash", { intent: { ...intent, objectKey: `/${intent.objectKey}` } }],
    ["noncanonical extension", { intent: { ...intent, objectKey: intent.objectKey.replace(/png$/, "jpg") } }],
    ["unsupported MIME", { intent: { ...intent, mimeType: "image/svg+xml" } }],
    ["zero bytes", { intent: { ...intent, expectedByteSize: 0 } }],
    ["fractional bytes", { intent: { ...intent, expectedByteSize: 8.5 } }],
    ["oversized image", { intent: { ...intent, expectedByteSize: 10 * 1024 * 1024 + 1 } }],
    ["missing digest", { intent: { ...intent, expectedChecksumSha256: "" } }],
    ["invalid digest", { intent: { ...intent, expectedChecksumSha256: "z".repeat(64) } }],
    ["untrusted endpoint", { credentials: { ...credentials, urlEndpoint: "https://attacker.invalid/artistportfolio" } }],
    ["endpoint query", { credentials: { ...credentials, urlEndpoint: `${credentials.urlEndpoint}?redirect=1` } }],
    ["wrong endpoint identity", { credentials: { ...credentials, imageKitId: "someone-else" } }],
  ])("rejects %s before any provider request", async (_name, overrides) => {
    expect(await verify(overrides)).toEqual({ ok: false, reason: "invalid-input" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([401, 404, 429, 500])("fails closed on provider HTTP %i without leaking its body", async (status) => {
    mockResponses([new Response(`private provider detail ${credentials.privateKey}`, { status })]);
    expect(await verify()).toEqual({ ok: false, reason: "provider-unavailable" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not expose network errors or credentials", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error(`private key ${credentials.privateKey}`));
    expect(await verify()).toEqual({ ok: false, reason: "provider-unavailable" });
  });

  it("fails closed on an aborted download without exposing its reason", async () => {
    mockResponses([jsonResponse(currentDetails), jsonResponse(versionDetails)]);
    vi.mocked(fetch).mockRejectedValueOnce(new DOMException(
      `request aborted: ${credentials.privateKey}`,
      "AbortError"
    ));
    expect(await verify()).toEqual({ ok: false, reason: "provider-unavailable" });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it.each([
    null,
    [],
    "provider text",
    {},
    { ...currentDetails, size: "8" },
    { ...currentDetails, isPrivateFile: true },
    { ...currentDetails, isPublished: false },
    { ...currentDetails, updatedAt: "not-a-date" },
  ])(
    "rejects malformed provider details %#",
    async (details) => {
      mockResponses([jsonResponse(details)]);
      expect(await verify()).toEqual({ ok: false, reason: "invalid-provider-response" });
      expect(fetch).toHaveBeenCalledTimes(1);
    }
  );

  it("rejects invalid JSON", async () => {
    mockResponses([new Response("{not-json", { headers: { "content-type": "application/json" } })]);
    expect(await verify()).toEqual({ ok: false, reason: "invalid-provider-response" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects JSON returned as HTML", async () => {
    mockResponses([new Response(JSON.stringify(currentDetails), {
      headers: { "content-type": "text/html" },
    })]);
    expect(await verify()).toEqual({ ok: false, reason: "invalid-provider-response" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each(["gzip", "br", ""])("rejects unexpected %s metadata encoding before reading the body", async (encoding) => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ cancel });
    mockResponses([new Response(body, {
      headers: {
        "content-type": "application/json",
        "content-encoding": encoding,
      },
    })]);
    expect(await verify()).toEqual({ ok: false, reason: "invalid-provider-response" });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects ranged metadata even when the HTTP status is 200", async () => {
    mockResponses([new Response(JSON.stringify(currentDetails), { headers: {
      "content-type": "application/json", "content-range": "bytes 0-99/100",
    } })]);
    expect(await verify()).toEqual({ ok: false, reason: "invalid-provider-response" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("caps metadata even when the server omits Content-Length", async () => {
    mockResponses([jsonResponse({ ...currentDetails, unexpectedProviderField: "x".repeat(64 * 1024) })]);
    expect(await verify()).toEqual({ ok: false, reason: "content-mismatch" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("ignores unknown provider fields instead of reflecting them into verified metadata", async () => {
    const responses = successfulResponses();
    responses[0] = jsonResponse({ ...currentDetails, providerSecret: credentials.privateKey });
    mockResponses(responses);
    const result = await verify();
    expect(result).toMatchObject({ ok: true });
    expect(JSON.stringify(result)).not.toContain(credentials.privateKey);
    expect(JSON.stringify(result)).not.toContain("providerSecret");
  });

  it.each([
    ["wrong file ID", { fileId: "another-file" }],
    ["wrong filename", { name: "another-image.png" }],
    ["wrong object path", { filePath: "/media/source/another-image.png" }],
    ["foreign delivery host", { url: "https://attacker.invalid/file.png" }],
    ["foreign account", { url: deliveryUrl.replace("artistportfolio", "someone-else") }],
    ["transformed current URL", { url: `${deliveryUrl}?tr=w-200` }],
    ["delivery URL credentials", { url: deliveryUrl.replace("https://", "https://user:password@") }],
  ])("rejects current metadata with %s without downloading", async (_name, override) => {
    mockResponses([jsonResponse({ ...currentDetails, ...override })]);
    expect(await verify()).toEqual({ ok: false, reason: "identity-mismatch" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["different file", { fileId: "another-file" }],
    ["missing immutable token", { url: deliveryUrl }],
    ["duplicate token", { url: `${deliveryUrl}?ik-obj-version=object.version_one&ik-obj-version=object.version_two` }],
    ["extra transform", { url: `${deliveryUrl}?ik-obj-version=object.version_one&tr=w-200` }],
    ["foreign host", { url: "https://attacker.invalid/image.png?ik-obj-version=object.version_one" }],
  ])("rejects version metadata with %s", async (_name, override) => {
    mockResponses([
      jsonResponse(currentDetails),
      jsonResponse({ ...versionDetails, ...override }),
    ]);
    expect(await verify()).toEqual({ ok: false, reason: "identity-mismatch" });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["declared size", { size: 9 }],
    ["declared MIME", { mime: "image/jpeg" }],
  ])("rejects unexpected %s before the original download", async (_name, override) => {
    mockResponses([jsonResponse({ ...currentDetails, ...override })]);
    expect(await verify()).toEqual({ ok: false, reason: "content-mismatch" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["short body", () => mediaResponse(PNG_BYTES.slice(0, 7))],
    ["long body", () => mediaResponse(new Uint8Array([...PNG_BYTES, 0]))],
    ["wrong content type", () => mediaResponse(PNG_BYTES, { "content-type": "image/jpeg" })],
    ["wrong content length", () => mediaResponse(PNG_BYTES, { "content-length": "9" })],
    ["invalid content length", () => mediaResponse(PNG_BYTES, { "content-length": "NaN" })],
    ["encoded body", () => mediaResponse(PNG_BYTES, { "content-encoding": "gzip" })],
    ["empty encoding", () => mediaResponse(PNG_BYTES, { "content-encoding": "" })],
    ["content range on HTTP 200", () => mediaResponse(PNG_BYTES, { "content-range": "bytes 0-7/8" })],
  ])("rejects original bytes with %s", async (_name, response) => {
    mockResponses([jsonResponse(currentDetails), jsonResponse(versionDetails), response()]);
    expect(await verify()).toEqual({ ok: false, reason: "content-mismatch" });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("hashes and verifies a signature split across streamed chunks", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(PNG_BYTES.slice(0, 3));
        controller.enqueue(PNG_BYTES.slice(3, 5));
        controller.enqueue(PNG_BYTES.slice(5));
        controller.close();
      },
    });
    const responses = successfulResponses();
    responses[2] = new Response(body, { headers: { "content-type": "image/png" } });
    mockResponses(responses);
    expect(await verify()).toMatchObject({ ok: true, object: { checksumSha256: checksum } });
  });

  it("cancels an oversized stream without trusting omitted Content-Length", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(PNG_BYTES);
        controller.enqueue(new Uint8Array([0]));
      },
      cancel,
    });
    mockResponses([
      jsonResponse(currentDetails),
      jsonResponse(versionDetails),
      new Response(body, { headers: { "content-type": "image/png" } }),
    ]);
    expect(await verify()).toEqual({ ok: false, reason: "content-mismatch" });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("does not turn a failed body stream into a successful digest or leak its error", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new Error(`provider detail ${credentials.privateKey}`));
      },
    });
    mockResponses([
      jsonResponse(currentDetails),
      jsonResponse(versionDetails),
      new Response(body, { headers: { "content-type": "image/png" } }),
    ]);
    expect(await verify()).toEqual({ ok: false, reason: "provider-unavailable" });
  });

  it("rejects an exact-size valid media signature whose SHA-256 does not match the intent", async () => {
    mockResponses(successfulResponses());
    expect(await verify({ intent: { ...intent, expectedChecksumSha256: "0".repeat(64) } })).toEqual({
      ok: false,
      reason: "content-mismatch",
    });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it.each([
    { label: "invalid PNG signature", mime: "image/png", extension: "png", bytes: new Uint8Array(8) },
    { label: "HEIC disguised as AVIF", mime: "image/avif", extension: "avif", bytes: new Uint8Array([0, 0, 0, 16, ...Buffer.from("ftypheic"), 0, 0, 0, 0]) },
    { label: "unknown BMFF brand", mime: "video/mp4", extension: "mp4", bytes: new Uint8Array([0, 0, 0, 16, ...Buffer.from("ftypfake"), 0, 0, 0, 0]) },
    { label: "truncated ftyp box", mime: "image/avif", extension: "avif", bytes: new Uint8Array([0, 0, 0, 20, ...Buffer.from("ftypavif"), 0, 0, 0, 0]) },
    { label: "undersized ftyp box", mime: "video/mp4", extension: "mp4", bytes: new Uint8Array([0, 0, 0, 8, ...Buffer.from("ftypisom"), 0, 0, 0, 0]) },
    { label: "Matroska disguised as WebM", mime: "video/webm", extension: "webm", bytes: new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x42, 0x82, 0x88, ...Buffer.from("matroska")]) },
  ])("rejects $label even when size, checksum, and declared MIME agree", async ({ mime, extension, bytes }) => {
    const target = {
      ...intent,
      mimeType: mime,
      objectKey: intent.objectKey.replace(/png$/, extension),
      expectedByteSize: bytes.length,
      expectedChecksumSha256: createHash("sha256").update(bytes).digest("hex"),
    };
    const targetUrl = `${credentials.urlEndpoint}/${target.objectKey}`;
    const details = {
      ...currentDetails,
      name: `${intent.intentId}.${extension}`,
      filePath: `/${target.objectKey}`,
      url: targetUrl,
      size: bytes.length,
      mime,
    };
    mockResponses([
      jsonResponse(details),
      jsonResponse({ ...details, type: "file-version", url: `${targetUrl}?ik-obj-version=object.version_one` }),
      mediaResponse(bytes, { "content-type": mime }),
    ]);
    expect(await verify({ intent: target })).toEqual({ ok: false, reason: "content-mismatch" });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("rejects a partial-content response instead of certifying a byte range", async () => {
    mockResponses([
      jsonResponse(currentDetails),
      jsonResponse(versionDetails),
      new Response(PNG_BYTES, { status: 206, headers: { "content-type": "image/png", "content-range": "bytes 0-7/8" } }),
    ]);
    expect(await verify()).toEqual({ ok: false, reason: "provider-unavailable" });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("never certifies a file if its current version changes while reading the original", async () => {
    const responses = successfulResponses();
    responses[3] = jsonResponse({ ...currentDetails, versionInfo: { id: "version-two" } });
    mockResponses(responses);
    expect(await verify()).toEqual({ ok: false, reason: "version-changed" });
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("rejects a resolved version that does not match the requested version ID", async () => {
    mockResponses([
      jsonResponse(currentDetails),
      jsonResponse({ ...versionDetails, versionInfo: { id: "version-two" } }),
    ]);
    expect(await verify()).toEqual({ ok: false, reason: "version-changed" });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("rejects a changed timestamp even if the provider keeps the same version ID", async () => {
    const responses = successfulResponses();
    responses[3] = jsonResponse({ ...currentDetails, updatedAt: "2026-09-22T12:00:01.000Z" });
    mockResponses(responses);
    expect(await verify()).toEqual({ ok: false, reason: "version-changed" });
  });

  it("revalidates identity during the final current-version check", async () => {
    const responses = successfulResponses();
    responses[3] = jsonResponse({ ...currentDetails, filePath: "/another-file.png" });
    mockResponses(responses);
    expect(await verify()).toEqual({ ok: false, reason: "identity-mismatch" });
  });

  it("fails closed if the final current-version check is unavailable", async () => {
    const responses = successfulResponses();
    responses[3] = new Response("private provider diagnostic", { status: 503 });
    mockResponses(responses);
    expect(await verify()).toEqual({ ok: false, reason: "provider-unavailable" });
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("accepts an exact server-discovered current-version expectation without changing the evidence shape", async () => {
    mockResponses(successfulResponses());
    const result = await verify({}, { expectedCurrent: {
      versionId: "version-one", versionToken: null, updatedAt: currentDetails.updatedAt,
    } });
    expect(result).toMatchObject({ ok: true, object: { versionId: "version-one" } });
    expect(JSON.stringify(result)).not.toContain("expectedCurrent");
    expect(JSON.stringify(result)).not.toContain("updatedAt");
  });

  it.each([
    { versionId: "version-two", versionToken: null, updatedAt: currentDetails.updatedAt },
    { versionId: "version-one", versionToken: "object.version_one", updatedAt: currentDetails.updatedAt },
    { versionId: "version-one", versionToken: null, updatedAt: "2026-09-22T12:00:01.000Z" },
  ])("rejects list-to-details drift %# before resolving a version or reading original bytes", async (expectedCurrent) => {
    mockResponses(successfulResponses());
    expect(await verify({}, { expectedCurrent })).toEqual({ ok: false, reason: "version-changed" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("compares an expected absent token exactly, not as a wildcard", async () => {
    mockResponses([jsonResponse({ ...currentDetails, url: `${deliveryUrl}?ik-obj-version=object.version_one` })]);
    expect(await verify({}, { expectedCurrent: {
      versionId: "version-one", versionToken: null, updatedAt: currentDetails.updatedAt,
    } })).toEqual({ ok: false, reason: "version-changed" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    null,
    {},
    { versionId: "version-one", updatedAt: currentDetails.updatedAt },
    { versionId: "../version", versionToken: null, updatedAt: currentDetails.updatedAt },
    { versionId: "version-one", versionToken: "bad?token", updatedAt: currentDetails.updatedAt },
    { versionId: "version-one", versionToken: null, updatedAt: "not-a-date" },
    { versionId: "version-one", versionToken: null, updatedAt: currentDetails.updatedAt, extra: true },
  ])("rejects malformed expectedCurrent %# before any network call", async (expectedCurrent) => {
    expect(await verify({}, { expectedCurrent } as ImageKitObjectVerificationOptions)).toEqual({ ok: false, reason: "invalid-input" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("snapshots the expected current version before awaiting provider data", async () => {
    const first = deferred<Response>();
    vi.mocked(fetch).mockReturnValueOnce(first.promise);
    mockResponses(successfulResponses().slice(1));
    const expectedCurrent = { versionId: "version-one", versionToken: null, updatedAt: currentDetails.updatedAt };
    const pending = verify({}, { expectedCurrent });
    expectedCurrent.versionId = "version-two";
    first.resolve(jsonResponse(currentDetails));
    expect(await pending).toMatchObject({ ok: true });
  });

  it("does not start a request for a pre-aborted caller and never exposes the abort reason", async () => {
    const controller = new AbortController();
    controller.abort(new Error(credentials.privateKey));
    expect(await verify({}, { signal: controller.signal })).toEqual({ ok: false, reason: "provider-unavailable" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([0, 1, 2, 3])("stops promptly when the caller aborts stalled fetch phase %i, including late responses", async (phase) => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const late = deferred<Response>();
    mockResponses(successfulResponses().slice(0, phase));
    vi.mocked(fetch).mockReturnValueOnce(late.promise);
    const pending = verify({}, { signal: controller.signal });
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(phase + 1);
    const providerSignal = vi.mocked(fetch).mock.calls[phase][1]?.signal;
    controller.abort(new Error(`private diagnostic ${credentials.privateKey}`));
    expect(await pending).toEqual({ ok: false, reason: "provider-unavailable" });
    expect(providerSignal?.aborted).toBe(true);
    const cancel = vi.fn(() => new Promise<void>(() => {}));
    late.resolve(new Response(new ReadableStream<Uint8Array>({ cancel }), {
      headers: { "content-type": phase === 2 ? "image/png" : "application/json" },
    }));
    await vi.advanceTimersByTimeAsync(0);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(phase + 1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("bounds a fetch that ignores its signal to 45 seconds and prevents late continuation", async () => {
    vi.useFakeTimers();
    const late = deferred<Response>();
    vi.mocked(fetch).mockReturnValueOnce(late.promise);
    const pending = verify();
    let settled = false;
    void pending.then(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(44_999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toEqual({ ok: false, reason: "provider-unavailable" });
    late.resolve(jsonResponse(currentDetails));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("uses one absolute deadline across all requests, not a fresh timeout per phase", async () => {
    vi.useFakeTimers();
    const first = deferred<Response>();
    const second = deferred<Response>();
    vi.mocked(fetch).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
      .mockReturnValueOnce(new Promise<Response>(() => {}));
    const pending = verify();
    await vi.advanceTimersByTimeAsync(20_000);
    first.resolve(jsonResponse(currentDetails));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(20_000);
    second.resolve(jsonResponse(versionDetails));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await pending).toEqual({ ok: false, reason: "provider-unavailable" });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it.each(["metadata", "media"])("bounds a stalled %s stream even when cancellation never finishes", async (phase) => {
    vi.useFakeTimers();
    const cancel = vi.fn(() => new Promise<void>(() => {}));
    const stalled = new Response(new ReadableStream<Uint8Array>({ cancel }), {
      headers: { "content-type": phase === "media" ? "image/png" : "application/json" },
    });
    mockResponses(phase === "media" ? [jsonResponse(currentDetails), jsonResponse(versionDetails), stalled] : [stalled]);
    const pending = verify();
    await vi.advanceTimersByTimeAsync(45_000);
    expect(await pending).toEqual({ ok: false, reason: "provider-unavailable" });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(stalled.body?.locked).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(phase === "media" ? 3 : 1);
  });

  it("aborts a body read immediately when its caller cancels", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const cancel = vi.fn(() => new Promise<void>(() => {}));
    const stalled = new Response(new ReadableStream<Uint8Array>({ cancel }), {
      headers: { "content-type": "image/png" },
    });
    mockResponses([jsonResponse(currentDetails), jsonResponse(versionDetails), stalled]);
    const pending = verify({}, { signal: controller.signal });
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(3);
    controller.abort();
    expect(await pending).toEqual({ ok: false, reason: "provider-unavailable" });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(stalled.body?.locked).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["http-error", "invalid-metadata", "oversized-stream"])("does not await a never-ending %s cancellation", async (phase) => {
    vi.useFakeTimers();
    const cancel = vi.fn(() => new Promise<void>(() => {}));
    const body = new ReadableStream<Uint8Array>({
      start(stream) { if (phase === "oversized-stream") stream.enqueue(new Uint8Array(64 * 1024 + 1)); },
      cancel,
    });
    mockResponses([new Response(body, {
      status: phase === "http-error" ? 503 : 200,
      headers: { "content-type": phase === "invalid-metadata" ? "text/html" : "application/json" },
    })]);
    expect(await verify()).toEqual({ ok: false, reason: phase === "http-error" ? "provider-unavailable" :
      phase === "invalid-metadata" ? "invalid-provider-response" : "content-mismatch" });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects invalid UTF-8 instead of accepting replacement characters inside ignored metadata fields", async () => {
    const prefix = Buffer.from(JSON.stringify({ ...currentDetails, extra: "marker" }).replace("marker\"}", ""));
    const bytes = new Uint8Array([...prefix, 0xff, ...Buffer.from('"}')]);
    mockResponses([new Response(bytes, { headers: { "content-type": "application/json" } })]);
    expect(await verify()).toEqual({ ok: false, reason: "invalid-provider-response" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
