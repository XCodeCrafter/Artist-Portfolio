import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { discoverImageKitOrphanCandidate } from "@/lib/admin/imagekit-orphan-discovery";

const intentId = "123e4567-e89b-42d3-a456-426614174000";
const assetId = `imagekit-${intentId}`;
const credentials = {
  publicKey: "public_abcdefghijklmnop", privateKey: "private_abcdefghijklmnop",
  imageKitId: "artistportfolio", urlEndpoint: "https://ik.imagekit.io/artistportfolio",
};
const intent = {
  intentId, assetId, storageContainer: credentials.imageKitId,
  objectKey: `media/source/${assetId}/${intentId}.png`, mimeType: "image/png",
  expectedByteSize: 1024, expectedChecksumSha256: "a".repeat(64),
};
const deliveryUrl = `${credentials.urlEndpoint}/${intent.objectKey}`;
const file = {
  fileId: "file_123", type: "file", name: `${intentId}.png`, filePath: `/${intent.objectKey}`,
  versionInfo: { id: "version_1" }, isPrivateFile: false, isPublished: true,
  url: deliveryUrl, mime: intent.mimeType, size: intent.expectedByteSize,
  updatedAt: "2026-09-23T10:00:00.000Z",
};
const requestUrl = new URL("https://api.imagekit.io/v1/files");
requestUrl.searchParams.set("path", `/media/source/${assetId}/`);
requestUrl.searchParams.set("type", "all");
requestUrl.searchParams.set("limit", "2");
requestUrl.searchParams.set("skip", "0");

function identify(response: Response, url = requestUrl.toString()) {
  Object.defineProperty(response, "url", { value: url });
  return response;
}
function jsonResponse(value: unknown, headers: HeadersInit = {}) {
  return identify(new Response(JSON.stringify(value), { headers: { "content-type": "application/json", ...headers } }));
}
function discover(overrides: Record<string, unknown> = {}, signal?: AbortSignal) {
  return discoverImageKitOrphanCandidate({ credentials, intent, ...overrides }, { signal });
}

beforeEach(() => { vi.stubGlobal("fetch", vi.fn()); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("dormant read-only ImageKit orphan discovery", () => {
  it("projects one exact candidate from one bounded authenticated GET, not its raw metadata", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse([{ ...file, unknownPrivateField: credentials.privateKey }]));
    expect(await discover()).toEqual({ status: "candidate", candidate: {
      fileId: file.fileId, versionId: file.versionInfo.id, versionToken: null, updatedAt: file.updatedAt,
    } });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe(requestUrl.toString());
    expect([...new URL(String(url)).searchParams]).toEqual([
      ["path", `/media/source/${assetId}/`], ["type", "all"], ["limit", "2"], ["skip", "0"],
    ]);
    expect(init).toMatchObject({ method: "GET", redirect: "error", credentials: "omit", cache: "no-store" });
    expect(init?.body).toBeUndefined();
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    const headers = new Headers(init?.headers);
    expect(headers.get("authorization")).toBe(`Basic ${Buffer.from(`${credentials.privateKey}:`).toString("base64")}`);
    expect(headers.get("accept")).toBe("application/json");
    expect(headers.get("accept-encoding")).toBe("identity");
    expect(headers.has("cookie")).toBe(false);
  });

  it.each([
    [deliveryUrl, null], [`${deliveryUrl}?updatedAt=123`, null],
    [`${deliveryUrl}?ik-obj-version=v1._-2`, "v1._-2"],
    [`${deliveryUrl}?updatedAt=123&ik-obj-version=v1`, "v1"],
    [`${deliveryUrl}?ik-obj-version=v1&updatedAt=123`, "v1"],
  ])("accepts the exact canonical URL and supported query %s", async (url, versionToken) => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse([{ ...file, url }]));
    expect(await discover()).toEqual({ status: "candidate", candidate: {
      fileId: file.fileId, versionId: file.versionInfo.id, versionToken, updatedAt: file.updatedAt,
    } });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    "https://foreign.invalid/file.png", deliveryUrl.replace("https:", "http:"),
    deliveryUrl.replace("artistportfolio", "other"), `${deliveryUrl}/`, `${deliveryUrl}#fragment`,
    `${deliveryUrl}?tr=w-100`, `${deliveryUrl}?unknown=1`,
    `${deliveryUrl}?updatedAt=1&updatedAt=2`, `${deliveryUrl}?ik-obj-version=v1&ik-obj-version=v2`,
    `${deliveryUrl}?updatedAt=NaN`, `${deliveryUrl}?updatedAt=-1`, `${deliveryUrl}?updatedAt=1.2`,
    `${deliveryUrl}?updatedAt=${"1".repeat(17)}`, `${deliveryUrl}?updatedAt=`,
    `${deliveryUrl}?ik-obj-version=`, `${deliveryUrl}?ik-obj-version=${"a".repeat(257)}`,
    `${deliveryUrl}?ik-obj-version=bad%2Ftoken`, `${deliveryUrl}?ik-obj-version=bad%20token`,
    deliveryUrl.replace("https://", "https://user:secret@"),
    deliveryUrl.replace("/media/", "/other/../media/"),
    deliveryUrl.replace("/media/", "/%6dedia/"), ` ${deliveryUrl}`,
  ])("rejects ambiguous/foreign/transformed URL without following it: %s", async url => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse([{ ...file, url }]));
    expect(await discover()).toEqual({ status: "attention" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("an empty folder means only not-observed, never resolved or deleted", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse([]));
    expect(await discover()).toEqual({ status: "not-observed" });
  });

  it.each([
    [file, file], [file, file, file], [null], [{}], ["unexpected"], [1],
    [{ ...file, type: "folder" }], [{ ...file, type: "file-version" }],
  ].map(items => ({ items })))("refuses missing, multiple or non-file candidates %#", async ({ items }) => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(items));
    expect(await discover()).toEqual({ status: "attention" });
  });

  it.each([
    ["fileId", ""], ["fileId", "../foreign"], ["fileId", "a".repeat(129)],
    ["name", "other.png"], ["filePath", "/other/file.png"], ["filePath", intent.objectKey],
    ["versionInfo", null], ["versionInfo", {}], ["versionInfo", { id: "bad/version" }],
    ["mime", "image/jpeg"], ["mime", "IMAGE/PNG"], ["mime", undefined],
    ["size", 1023], ["size", "1024"], ["size", 1024.1], ["size", 0],
    ["isPrivateFile", true], ["isPrivateFile", undefined],
    ["isPublished", false], ["isPublished", undefined],
    ["updatedAt", "yesterday"], ["updatedAt", "2026-09-23"], ["updatedAt", undefined],
    ["url", undefined],
  ])("refuses invalid or mismatching %s %#", async (key, value) => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse([{ ...file, [String(key)]: value }]));
    expect(await discover()).toEqual({ status: "attention" });
  });

  it.each(Object.keys(file))("requires candidate field %s", async key => {
    const without = { ...file } as Record<string, unknown>;
    delete without[key];
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse([without]));
    expect(await discover()).toEqual({ status: "attention" });
  });

  it.each([
    ["missing credentials", { credentials: undefined }],
    ["extra input", { delete: true }],
    ["extra credential", { credentials: { ...credentials, token: "no" } }],
    ["extra intent", { intent: { ...intent, fileId: "no" } }],
    ["invalid public key", { credentials: { ...credentials, publicKey: "wrong" } }],
    ["invalid private key", { credentials: { ...credentials, privateKey: "private_\r\nInjection" } }],
    ["foreign endpoint", { credentials: { ...credentials, urlEndpoint: "https://foreign.invalid" } }],
    ["endpoint suffix", { credentials: { ...credentials, urlEndpoint: `${credentials.urlEndpoint}/` } }],
    ["endpoint query", { credentials: { ...credentials, urlEndpoint: `${credentials.urlEndpoint}?other=1` } }],
    ["foreign account", { credentials: { ...credentials, imageKitId: "other" } }],
    ["wrong container", { intent: { ...intent, storageContainer: "other" } }],
    ["wrong UUID", { intent: { ...intent, intentId: "not-a-uuid" } }],
    ["uppercase UUID", { intent: { ...intent, intentId: intentId.toUpperCase() } }],
    ["non-v4 UUID", { intent: { ...intent, intentId: intentId.replace("42d3", "12d3") } }],
    ["legacy asset namespace", { intent: { ...intent, assetId: "pilot-image" } }],
    ["path traversal", { intent: { ...intent, objectKey: `${intent.objectKey}/../../other` } }],
    ["leading object slash", { intent: { ...intent, objectKey: `/${intent.objectKey}` } }],
    ["wrong extension", { intent: { ...intent, objectKey: intent.objectKey.replace(/png$/, "jpg") } }],
    ["unsupported mime", { intent: { ...intent, mimeType: "image/svg+xml" } }],
    ["wrong mime casing", { intent: { ...intent, mimeType: "IMAGE/PNG" } }],
    ["zero size", { intent: { ...intent, expectedByteSize: 0 } }],
    ["fractional size", { intent: { ...intent, expectedByteSize: 1.5 } }],
    ["oversized image", { intent: { ...intent, expectedByteSize: 10 * 1024 * 1024 + 1 } }],
    ["invalid checksum", { intent: { ...intent, expectedChecksumSha256: "not-sha256" } }],
    ["uppercase checksum", { intent: { ...intent, expectedChecksumSha256: "A".repeat(64) } }],
  ])("rejects %s without a request", async (_label, overrides) => {
    expect(await discover(overrides)).toEqual({ status: "attention" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    ["image/avif", "avif", 10 * 1024 * 1024], ["image/gif", "gif", 1],
    ["image/jpeg", "jpg", 1024], ["image/png", "png", 1024], ["image/webp", "webp", 1024],
    ["video/mp4", "mp4", 95_000_000], ["video/quicktime", "mov", 1024], ["video/webm", "webm", 1024],
  ])("accepts canonical %s reservations with bounded metadata only", async (mimeType, extension, expectedByteSize) => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse([]));
    expect(await discover({ intent: {
      ...intent, mimeType, expectedByteSize, objectKey: intent.objectKey.replace(/png$/, String(extension)),
    } })).toEqual({ status: "not-observed" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([201, 204, 206, 301, 302, 400, 401, 403, 404, 409, 429, 500, 503])(
    "treats HTTP %i as retry, never not-observed", async status => {
      const cancel = vi.fn();
      const response = status === 204 ? new Response(null, { status }) : new Response(new ReadableStream({ cancel }), { status });
      vi.mocked(fetch).mockResolvedValueOnce(response);
      expect(await discover()).toEqual({ status: "retry" });
      expect(fetch).toHaveBeenCalledTimes(1);
      if (status !== 204) expect(cancel).toHaveBeenCalledTimes(1);
    }
  );

  it.each([
    ["html", { "content-type": "text/html" }], ["gzip", { "content-encoding": "gzip" }],
    ["brotli", { "content-encoding": "br" }], ["range", { "content-range": "bytes 0-1/1000" }],
    ["invalid size", { "content-length": "NaN" }], ["negative size", { "content-length": "-1" }],
    ["fractional size", { "content-length": "2.5" }], ["excessive size", { "content-length": String(64 * 1024 + 1) }],
    ["short size", { "content-length": "1" }], ["long size", { "content-length": "3" }],
  ])("rejects %s metadata", async (_label, headers) => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse([], headers));
    expect(await discover()).toEqual({ status: "attention" });
  });

  it("accepts explicit identity encoding, charset and exact length", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse([], {
      "content-type": "application/json; charset=utf-8", "content-encoding": "identity", "content-length": "2",
    }));
    expect(await discover()).toEqual({ status: "not-observed" });
  });

  it.each([null, {}, { data: [] }, "[]", 0, false])("rejects non-array JSON %#", async body => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(body));
    expect(await discover()).toEqual({ status: "attention" });
  });
  it.each(["", "[", "[]suffix", "\u0000[]"])("rejects malformed JSON %#", async body => {
    vi.mocked(fetch).mockResolvedValueOnce(identify(new Response(body, { headers: { "content-type": "application/json" } })));
    expect(await discover()).toEqual({ status: "attention" });
  });

  it("rejects invalid UTF-8", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(identify(new Response(new Uint8Array([0xc0, 0xaf, 91, 93]), { headers: { "content-type": "application/json" } })));
    expect(await discover()).toEqual({ status: "attention" });
  });

  it("rejects missing identity, redirected, foreign, or changed response URLs", async () => {
    const redirected = jsonResponse([]);
    Object.defineProperty(redirected, "redirected", { value: true });
    for (const response of [
      new Response("[]", { headers: { "content-type": "application/json" } }),
      identify(new Response("[]"), "https://foreign.invalid"),
      identify(new Response("[]"), "https://api.imagekit.io/v1/files"), redirected,
    ]) {
      vi.mocked(fetch).mockResolvedValueOnce(response);
      expect(await discover()).toEqual({ status: "attention" });
    }
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("rejects a missing body", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(identify(new Response(null, { headers: { "content-type": "application/json" } })));
    expect(await discover()).toEqual({ status: "attention" });
  });

  it("reads split metadata chunks within the budget", async () => {
    const body = new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(new TextEncoder().encode("["));
      controller.enqueue(new TextEncoder().encode("]")); controller.close();
    } });
    vi.mocked(fetch).mockResolvedValueOnce(identify(new Response(body, { headers: { "content-type": "application/json" } })));
    expect(await discover()).toEqual({ status: "not-observed" });
  });

  it("caps and cancels streamed metadata without a declared length", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(new Uint8Array(64 * 1024)); controller.enqueue(new Uint8Array([0]));
    }, cancel });
    vi.mocked(fetch).mockResolvedValueOnce(identify(new Response(body, { headers: { "content-type": "application/json" } })));
    expect(await discover()).toEqual({ status: "attention" });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("redacts network/stream diagnostics and never logs credentials", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(fetch).mockRejectedValueOnce(new Error(credentials.privateKey));
    expect(await discover()).toEqual({ status: "retry" });
    const body = new ReadableStream({ start(controller) { controller.error(new Error(credentials.privateKey)); } });
    vi.mocked(fetch).mockResolvedValueOnce(identify(new Response(body, { headers: { "content-type": "application/json" } })));
    expect(await discover()).toEqual({ status: "retry" });
    expect(log).not.toHaveBeenCalled();
  });

  it("bounds fetch ignoring abort and discards a late candidate without reading its body", async () => {
    vi.useFakeTimers();
    let resolveFetch!: (response: Response) => void;
    vi.mocked(fetch).mockReturnValueOnce(new Promise(resolve => { resolveFetch = resolve; }));
    const result = discover();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await result).toEqual({ status: "retry" });
    expect(vi.mocked(fetch).mock.calls[0][1]?.signal?.aborted).toBe(true);
    const cancel = vi.fn();
    const response = identify(new Response(new ReadableStream({ cancel }), { headers: { "content-type": "application/json" } }));
    const getReader = vi.spyOn(response.body!, "getReader");
    resolveFetch(response);
    await Promise.resolve(); await Promise.resolve();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(getReader).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("includes a stalled stream in the absolute deadline", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    vi.mocked(fetch).mockResolvedValueOnce(identify(new Response(new ReadableStream({ cancel }), { headers: { "content-type": "application/json" } })));
    const result = discover();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await result).toEqual({ status: "retry" });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("enforces elapsed time even when the event loop has not fired its timer", async () => {
    vi.useFakeTimers();
    vi.spyOn(performance, "now").mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValue(15_000);
    const cancel = vi.fn();
    const response = identify(new Response(new ReadableStream({ cancel }), { headers: { "content-type": "application/json" } }));
    const getReader = vi.spyOn(response.body!, "getReader");
    vi.mocked(fetch).mockResolvedValueOnce(response);
    expect(await discover()).toEqual({ status: "retry" });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(getReader).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("checks pre-aborted external cancellation before requesting", async () => {
    const controller = new AbortController(); controller.abort();
    expect(await discover({}, controller.signal)).toEqual({ status: "retry" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("honors external abort even when fetch ignores its signal", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    let resolveFetch!: (response: Response) => void;
    vi.mocked(fetch).mockReturnValueOnce(new Promise(resolve => { resolveFetch = resolve; }));
    const result = discover({}, controller.signal);
    controller.abort();
    expect(await result).toEqual({ status: "retry" });
    expect(vi.mocked(fetch).mock.calls[0][1]?.signal?.aborted).toBe(true);
    const cancel = vi.fn();
    resolveFetch(identify(new Response(new ReadableStream({ cancel }))));
    await Promise.resolve(); await Promise.resolve();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("external abort cancels a stalled metadata stream", async () => {
    const controller = new AbortController();
    const cancel = vi.fn();
    vi.mocked(fetch).mockResolvedValueOnce(identify(new Response(new ReadableStream({ cancel }), { headers: { "content-type": "application/json" } })));
    const result = discover({}, controller.signal);
    await Promise.resolve(); await Promise.resolve();
    controller.abort();
    expect(await result).toEqual({ status: "retry" });
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("removes external listeners and timers after success", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse([file]));
    expect((await discover({}, controller.signal)).status).toBe("candidate");
    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
    controller.abort();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not wait on hanging cancellation", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn(() => new Promise<void>(() => undefined));
    vi.mocked(fetch).mockResolvedValueOnce(identify(new Response(new ReadableStream({ cancel }), { status: 401 })));
    expect(await discover()).toEqual({ status: "retry" });
    expect(vi.getTimerCount()).toBe(0);
  });
});
