import "server-only";

import { z } from "zod";
import type { ImageKitMediaUploadCredentials } from "@/lib/admin/media-upload-config";
import { getImageKitMediaTarget } from "@/lib/admin/imagekit-media-policy";

const API_URL = "https://api.imagekit.io/v1/files";
const METADATA_LIMIT = 64 * 1024;
const TOTAL_TIMEOUT_MS = 15_000;
const providerId = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const inputSchema = z.object({
  credentials: z.object({
    publicKey: z.string().regex(/^public_[A-Za-z0-9+/_-]{8,192}={0,2}$/),
    privateKey: z.string().regex(/^private_[A-Za-z0-9+/_-]{8,192}={0,2}$/),
    imageKitId: providerId,
    urlEndpoint: z.string().max(256),
  }).strict(),
  intent: z.object({
    intentId: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/),
    assetId: z.string().max(100),
    storageContainer: providerId,
    objectKey: z.string().max(256),
    mimeType: z.string().max(32),
    expectedByteSize: z.number().int().positive().max(95_000_000),
    expectedChecksumSha256: z.string().regex(/^[0-9a-f]{64}$/),
  }).strict(),
}).strict();

export type ImageKitObservationInput = Readonly<{
  credentials: ImageKitMediaUploadCredentials;
  intent: Readonly<z.infer<typeof inputSchema>["intent"]>;
}>;
export type ImageKitReconciliationObservation = Readonly<{
  observation: "absent" | "retry" | "unsafe";
}>;

function cancelBody(response: Response) {
  // Cancellation itself must never extend the total deadline.
  try { void response.body?.cancel().catch(() => undefined); } catch { /* No provider diagnostics. */ }
}

async function readMetadata(response: Response, signal: AbortSignal): Promise<unknown> {
  const reader = response.body!.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  const cancel = () => {
    try { void reader.cancel().catch(() => undefined); } catch { /* Preserve the safe result. */ }
  };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    for (;;) {
      signal.throwIfAborted();
      const chunk = await reader.read();
      signal.throwIfAborted();
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > METADATA_LIMIT) return undefined;
      chunks.push(Buffer.from(chunk.value));
    }
    const length = response.headers.get("content-length");
    if (length !== null && total !== Number(length)) return undefined;
    // Fatal decoding rejects invalid UTF-8 instead of accepting replacement text.
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
      return JSON.parse(text);
    } catch { return undefined; }
  } finally {
    signal.removeEventListener("abort", cancel);
    cancel();
    reader.releaseLock();
  }
}

/**
 * Dormant, read-only observation; NOT an ownership, deletion or cleanup proof.
 * Only a trusted server workflow may supply the locked DB reservation and keys.
 * Input validation checks formats, not that public/private keys and account match.
 *
 * Official List Assets contract: GET /v1/files; `path` lists the exact folder,
 * `type=all` includes files and folders, `limit` bounds returned entries.
 * https://imagekit.io/docs/api-reference/digital-asset-management-dam/list-and-search-assets
 * https://github.com/imagekit-developer/imagekit-nodejs/blob/main/src/resources/assets.ts
 *
 * The server allocates a unique folder per intent. Listing the entire folder is
 * deliberately conservative: ANY item -> manual attention, even another name.
 * An empty authenticated response is only "not observed now"; provider indexing
 * or an in-flight upload can change later. Keep the DB record and recheck later.
 * No mutations, retries, CDN requests, byte downloads or credential discovery.
 */
export async function observeImageKitUpload(value: unknown): Promise<ImageKitReconciliationObservation> {
  const parsed = inputSchema.safeParse(value);
  if (!parsed.success) return { observation: "unsafe" };
  const { credentials, intent } = parsed.data;
  const target = getImageKitMediaTarget(intent.mimeType);
  if (!target || intent.assetId !== `imagekit-${intent.intentId}` ||
      intent.expectedByteSize > target.maximumBytes ||
      intent.storageContainer !== credentials.imageKitId ||
      credentials.urlEndpoint !== `https://ik.imagekit.io/${credentials.imageKitId}` ||
      intent.objectKey !== `media/source/${intent.assetId}/${intent.intentId}.${target.extension}`) {
    return { observation: "unsafe" };
  }

  const url = new URL(API_URL);
  url.searchParams.set("path", `/media/source/${intent.assetId}/`);
  url.searchParams.set("type", "all");
  url.searchParams.set("limit", "2");
  url.searchParams.set("skip", "0");
  const requestUrl = url.toString();
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout>;
  const deadline = new Promise<ImageKitReconciliationObservation>((resolve) => {
    timeout = setTimeout(() => {
      controller.abort();
      resolve({ observation: "retry" });
    }, TOTAL_TIMEOUT_MS);
  });

  const observe = async (): Promise<ImageKitReconciliationObservation> => {
    try {
      const response = await fetch(requestUrl, {
        method: "GET", redirect: "error", credentials: "omit", cache: "no-store",
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "identity",
          Authorization: `Basic ${Buffer.from(`${credentials.privateKey}:`).toString("base64")}`,
        },
      });
      if (controller.signal.aborted) {
        cancelBody(response);
        return { observation: "retry" };
      }
      // Not even a 404 means absent. Never consume provider error bodies.
      if (response.status !== 200) {
        cancelBody(response);
        return { observation: "retry" };
      }
      const length = response.headers.get("content-length");
      const encoding = response.headers.get("content-encoding");
      if (response.url !== requestUrl || response.redirected ||
          response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json" ||
          (encoding !== null && encoding !== "identity") ||
          response.headers.has("content-range") || !response.body ||
          (length !== null && (!/^\d+$/.test(length) || Number(length) > METADATA_LIMIT))) {
        cancelBody(response);
        return { observation: "unsafe" };
      }
      const metadata = await readMetadata(response, controller.signal);
      return { observation: Array.isArray(metadata) && metadata.length === 0 ? "absent" : "unsafe" };
    } catch {
      // No credential, request URL, response body or provider error escapes.
      return { observation: "retry" };
    }
  };
  try {
    return await Promise.race([observe(), deadline]);
  } finally {
    clearTimeout(timeout!);
    controller.abort();
  }
}
