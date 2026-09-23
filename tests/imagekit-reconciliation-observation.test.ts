import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { observeImageKitUpload } from "@/lib/admin/imagekit-reconciliation-observation";

const intentId = "123e4567-e89b-42d3-a456-426614174000";
const assetId = `imagekit-${intentId}`;
const credentials = {
  publicKey: "public_abcdefghijklmnop",
  privateKey: "private_abcdefghijklmnop",
  imageKitId: "artistportfolio",
  urlEndpoint: "https://ik.imagekit.io/artistportfolio",
};
const intent = {
  intentId, assetId, storageContainer: "artistportfolio",
  objectKey: `media/source/${assetId}/${intentId}.png`,
  mimeType: "image/png", expectedByteSize: 1024,
  expectedChecksumSha256: "a".repeat(64),
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
  return identify(new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json", ...headers },
  }));
}
function observe(overrides: Record<string, unknown> = {}) {
  return observeImageKitUpload({ credentials, intent, ...overrides });
}

beforeEach(() => { vi.stubGlobal("fetch", vi.fn()); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("read-only ImageKit reconciliation observation", () => {
  it("observes an empty exact reserved folder with one authenticated bounded GET", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse([]));
    expect(await observe()).toEqual({ observation: "absent" });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toBe(requestUrl.toString());
    expect([...new URL(String(url)).searchParams]).toEqual([
      ["path", `/media/source/${assetId}/`], ["type", "all"], ["limit", "2"], ["skip", "0"],
    ]);
    expect(init).toMatchObject({ method: "GET", redirect: "error", credentials: "omit", cache: "no-store" });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(init?.body).toBeUndefined();
    const headers = new Headers(init?.headers);
    expect(headers.get("accept")).toBe("application/json");
    expect(headers.get("accept-encoding")).toBe("identity");
    expect(headers.get("authorization")).toBe(`Basic ${Buffer.from(`${credentials.privateKey}:`).toString("base64")}`);
    expect(headers.has("cookie")).toBe(false);
    expect(String(url)).not.toContain(credentials.publicKey);
    expect(String(url)).not.toContain(credentials.privateKey);
  });

  it.each([
    [{ type: "file", name: `${intentId}.png`, filePath: `/${intent.objectKey}`, privateData: credentials.privateKey }],
    [{ type: "folder", folderPath: "/foreign-folder" }],
    [{ type: "file-version", fileId: "unexpected-version" }],
    [{ name: "other.png", filePath: "/another/image.png", url: "https://foreign.invalid/secret" }],
    [{ arbitraryFutureProviderField: true }],
    [null], ["unexpected"], [1], [{}, {}], [{}, {}, {}],
  ].map((items) => ({ items })))("requires manual attention for any listed item %#, never following its URL", async ({ items }) => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(items));
    expect(await observe()).toEqual({ observation: "unsafe" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["missing credentials", { credentials: undefined }],
    ["extra input", { action: "delete" }],
    ["extra credential field", { credentials: { ...credentials, token: "no" } }],
    ["extra reservation field", { intent: { ...intent, fileId: "no" } }],
    ["invalid public key", { credentials: { ...credentials, publicKey: "wrong" } }],
    ["invalid private key", { credentials: { ...credentials, privateKey: "private_\r\nInjection" } }],
    ["foreign endpoint", { credentials: { ...credentials, urlEndpoint: "https://foreign.invalid" } }],
    ["endpoint suffix", { credentials: { ...credentials, urlEndpoint: `${credentials.urlEndpoint}/` } }],
    ["endpoint query", { credentials: { ...credentials, urlEndpoint: `${credentials.urlEndpoint}?account=other` } }],
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
    ["oversized video", { intent: { ...intent, mimeType: "video/mp4", expectedByteSize: 95_000_001, objectKey: intent.objectKey.replace(/png$/, "mp4") } }],
    ["invalid checksum", { intent: { ...intent, expectedChecksumSha256: "not-sha256" } }],
    ["uppercase checksum", { intent: { ...intent, expectedChecksumSha256: "A".repeat(64) } }],
  ])("rejects %s without a request", async (_label, overrides) => {
    expect(await observe(overrides)).toEqual({ observation: "unsafe" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    ["image/avif", "avif", 10 * 1024 * 1024], ["image/gif", "gif", 1],
    ["image/jpeg", "jpg", 1024], ["image/png", "png", 1024], ["image/webp", "webp", 1024],
    ["video/mp4", "mp4", 95_000_000], ["video/quicktime", "mov", 1024], ["video/webm", "webm", 1024],
  ])("allows canonical %s inputs while only reading metadata", async (mimeType, extension, expectedByteSize) => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse([]));
    expect(await observe({ intent: {
      ...intent, mimeType, expectedByteSize, objectKey: intent.objectKey.replace(/png$/, String(extension)),
    } })).toEqual({ observation: "absent" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([201, 204, 206, 301, 302, 400, 401, 403, 404, 409, 429, 500, 503])(
    "treats HTTP %i as retry, never absence", async (status) => {
      const cancel = vi.fn();
      const response = status === 204 ? new Response(null, { status }) : new Response(new ReadableStream({ cancel }), { status });
      vi.mocked(fetch).mockResolvedValueOnce(response);
      expect(await observe()).toEqual({ observation: "retry" });
      expect(fetch).toHaveBeenCalledTimes(1);
      if (status !== 204) expect(cancel).toHaveBeenCalledTimes(1);
    }
  );

  it.each([
    ["html content", { "content-type": "text/html" }],
    ["gzip compression", { "content-encoding": "gzip" }],
    ["brotli compression", { "content-encoding": "br" }],
    ["partial range", { "content-range": "bytes 0-1/1000" }],
    ["invalid size", { "content-length": "NaN" }],
    ["negative size", { "content-length": "-1" }],
    ["fractional size", { "content-length": "2.5" }],
    ["excessive size", { "content-length": String(64 * 1024 + 1) }],
    ["short size", { "content-length": "1" }],
    ["long size", { "content-length": "3" }],
  ])("does not trust %s metadata", async (_label, headers) => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse([], headers));
    expect(await observe()).toEqual({ observation: "unsafe" });
  });

  it("accepts explicit identity encoding and exact content length", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse([], {
      "content-type": "application/json; charset=utf-8", "content-length": "2", "content-encoding": "identity",
    }));
    expect(await observe()).toEqual({ observation: "absent" });
  });

  it.each([null, {}, { data: [] }, "[]", 0, false])("rejects non-array JSON %#", async (body) => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(body));
    expect(await observe()).toEqual({ observation: "unsafe" });
  });

  it.each(["", "[", "[]suffix", "\u0000[]"])("rejects malformed JSON %#", async (body) => {
    vi.mocked(fetch).mockResolvedValueOnce(identify(new Response(body, { headers: { "content-type": "application/json" } })));
    expect(await observe()).toEqual({ observation: "unsafe" });
  });

  it("rejects invalid UTF-8", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(identify(new Response(new Uint8Array([0xc0, 0xaf, 91, 93]), { headers: { "content-type": "application/json" } })));
    expect(await observe()).toEqual({ observation: "unsafe" });
  });

  it("rejects missing response identity, redirects, and foreign or changed URLs", async () => {
    const redirected = jsonResponse([]);
    Object.defineProperty(redirected, "redirected", { value: true });
    for (const response of [
      new Response("[]", { headers: { "content-type": "application/json" } }),
      identify(new Response("[]"), "https://foreign.invalid"),
      identify(new Response("[]"), "https://api.imagekit.io/v1/files"), redirected,
    ]) {
      vi.mocked(fetch).mockResolvedValueOnce(response);
      expect(await observe()).toEqual({ observation: "unsafe" });
    }
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("rejects a missing body", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(identify(new Response(null, { headers: { "content-type": "application/json" } })));
    expect(await observe()).toEqual({ observation: "unsafe" });
  });

  it("reads split metadata chunks within the same byte budget", async () => {
    const body = new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(new TextEncoder().encode("["));
      controller.enqueue(new TextEncoder().encode("]")); controller.close();
    } });
    vi.mocked(fetch).mockResolvedValueOnce(identify(new Response(body, { headers: { "content-type": "application/json" } })));
    expect(await observe()).toEqual({ observation: "absent" });
  });

  it("caps and cancels streamed metadata without Content-Length", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(new Uint8Array(64 * 1024)); controller.enqueue(new Uint8Array([0]));
    }, cancel });
    vi.mocked(fetch).mockResolvedValueOnce(identify(new Response(body, { headers: { "content-type": "application/json" } })));
    expect(await observe()).toEqual({ observation: "unsafe" });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not leak network or stream errors, metadata or credentials", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(fetch).mockRejectedValueOnce(new Error(`private diagnostic ${credentials.privateKey}`));
    expect(await observe()).toEqual({ observation: "retry" });
    const body = new ReadableStream({ start(controller) { controller.error(new Error(credentials.privateKey)); } });
    vi.mocked(fetch).mockResolvedValueOnce(identify(new Response(body, { headers: { "content-type": "application/json" } })));
    expect(await observe()).toEqual({ observation: "retry" });
    expect(log).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("bounds even a fetch that ignores abort to 15 seconds and cancels a late body", async () => {
    vi.useFakeTimers();
    let resolveFetch!: (response: Response) => void;
    vi.mocked(fetch).mockReturnValueOnce(new Promise((resolve) => { resolveFetch = resolve; }));
    const result = observe();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await result).toEqual({ observation: "retry" });
    expect(vi.mocked(fetch).mock.calls[0][1]?.signal?.aborted).toBe(true);
    const cancel = vi.fn();
    resolveFetch(identify(new Response(new ReadableStream({ cancel }))));
    await Promise.resolve(); await Promise.resolve();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("includes a stalled response body in the total deadline", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ cancel });
    vi.mocked(fetch).mockResolvedValueOnce(identify(new Response(body, { headers: { "content-type": "application/json" } })));
    const result = observe();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await result).toEqual({ observation: "retry" });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not wait on a hanging cancellation or leave a timer after success", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn(() => new Promise<void>(() => undefined));
    vi.mocked(fetch).mockResolvedValueOnce(identify(new Response(new ReadableStream({ cancel }), { status: 401 })));
    expect(await observe()).toEqual({ observation: "retry" });
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse([]));
    expect(await observe()).toEqual({ observation: "absent" });
    expect(vi.getTimerCount()).toBe(0);
  });
});
