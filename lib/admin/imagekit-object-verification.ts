import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";
import type { ImageKitMediaUploadCredentials } from "@/lib/admin/media-upload-config";
import { getImageKitMediaTarget, isImageKitTargetIdentity } from "@/lib/admin/imagekit-media-policy";

const API_ORIGIN = "https://api.imagekit.io";
const METADATA_LIMIT = 64 * 1024;
const SIGNATURE_LIMIT = 4096;
const TOTAL_TIMEOUT_MS = 45_000;
const providerId = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const inputSchema = z.object({
  credentials: z.object({
    publicKey: z.string().regex(/^public_[A-Za-z0-9+/_-]{8,192}={0,2}$/),
    privateKey: z.string().regex(/^private_[A-Za-z0-9+/_-]{8,192}={0,2}$/),
    imageKitId: providerId,
    urlEndpoint: z.string().max(256),
  }).strict(),
  intent: z.object({
    intentId: z.string().max(36),
    assetId: z.string().max(100),
    storageContainer: providerId,
    objectKey: z.string().max(256),
    mimeType: z.string().max(32),
    expectedByteSize: z.number().int().positive().max(95_000_000),
    expectedChecksumSha256: z.string().regex(/^[0-9a-f]{64}$/),
  }).strict(),
  fileId: providerId,
}).strict();

const detailsSchema = z.object({
  fileId: providerId,
  type: z.enum(["file", "file-version"]),
  name: z.string().max(128),
  filePath: z.string().max(256),
  versionInfo: z.object({ id: providerId }),
  isPrivateFile: z.literal(false),
  isPublished: z.literal(true),
  url: z.string().max(2048),
  mime: z.string().max(32),
  size: z.number().int().positive().max(95_000_000),
  updatedAt: z.string().datetime({ offset: true }),
});
type Details = z.infer<typeof detailsSchema>;
type Input = z.infer<typeof inputSchema>;
const optionsSchema = z.object({
  signal: z.instanceof(AbortSignal).optional(),
  expectedCurrent: z.object({
    versionId: providerId,
    versionToken: z.string().regex(/^[A-Za-z0-9_.-]{1,256}$/).nullable(),
    updatedAt: z.string().datetime({ offset: true }),
  }).strict().optional(),
}).strict();
export type ImageKitObjectVerificationOptions = z.infer<typeof optionsSchema>;
type FailureReason = "invalid-input" | "provider-unavailable" |
  "invalid-provider-response" | "identity-mismatch" | "content-mismatch" | "version-changed";

export type VerifiedImageKitObject = Readonly<{
  storageProvider: "imagekit";
  storageContainer: string;
  objectKey: string;
  fileId: string;
  versionId: string;
  versionToken: string;
  deliveryUrl: string;
  mimeType: string;
  byteSize: number;
  checksumSha256: string;
}>;
export type ImageKitObjectVerification =
  | { ok: true; object: VerifiedImageKitObject }
  | { ok: false; reason: FailureReason };

class VerificationFailure extends Error {
  constructor(readonly reason: FailureReason) { super(reason); }
}
function reject(reason: FailureReason): never { throw new VerificationFailure(reason); }

// Reject normalized aliases, redirects, foreign accounts, transformations and
// duplicate/unknown query fields. Never fetch a browser-supplied delivery URL.
function versionTokenFromUrl(value: string, deliveryUrl: string, required: boolean) {
  let url: URL;
  try { url = new URL(value); } catch { return reject("identity-mismatch"); }
  if (value.split("?")[0] !== deliveryUrl || url.hash ||
      `${url.origin}${url.pathname}` !== deliveryUrl || url.username || url.password) {
    reject("identity-mismatch");
  }
  const keys = [...url.searchParams.keys()];
  if (new Set(keys).size !== keys.length || keys.some((key) => !["ik-obj-version", "updatedAt"].includes(key))) {
    reject("identity-mismatch");
  }
  const updatedAt = url.searchParams.get("updatedAt");
  const token = url.searchParams.get("ik-obj-version");
  if ((updatedAt !== null && !/^\d{1,16}$/.test(updatedAt)) ||
      (token !== null && !/^[A-Za-z0-9_.-]{1,256}$/.test(token)) || (required && !token)) {
    reject("identity-mismatch");
  }
  return token;
}

type VerificationContext = { signal: AbortSignal; assertActive: () => void };

function cancelBody(response: Response) {
  try { void response.body?.cancel().catch(() => {}); } catch { /* Best effort only. */ }
}

async function get(url: string, context: VerificationContext, credentials?: ImageKitMediaUploadCredentials) {
  context.assertActive();
  const response = await fetch(url, {
    method: "GET", redirect: "error", credentials: "omit", cache: "no-store", signal: context.signal,
    headers: credentials ? {
      Accept: "application/json",
      "Accept-Encoding": "identity",
      Authorization: `Basic ${Buffer.from(`${credentials.privateKey}:`).toString("base64")}`,
    } : { Accept: "*/*", "Accept-Encoding": "identity" },
  });
  try { context.assertActive(); } catch (error) { cancelBody(response); throw error; }
  if (response.status !== 200 || response.redirected || (response.url && response.url !== url)) {
    cancelBody(response);
    reject("provider-unavailable");
  }
  return response;
}

/** Bounded memory for metadata; media is hashed incrementally, not buffered. */
async function readBody(response: Response, limit: number, onChunk: (chunk: Uint8Array) => void, context: VerificationContext) {
  try { context.assertActive(); } catch (error) { cancelBody(response); throw error; }
  if (!response.body) reject("invalid-provider-response");
  const length = response.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > limit)) {
    cancelBody(response);
    reject("content-mismatch");
  }
  const reader = response.body.getReader();
  const release = () => {
    // Neither provider cancellation nor a stalled test stream may hold the deadline open.
    try { void reader.cancel().catch(() => {}); } catch { /* Preserve the safe failure code. */ }
    try { reader.releaseLock(); } catch { /* Best effort for an already released reader. */ }
  };
  context.signal.addEventListener("abort", release, { once: true });
  let total = 0;
  try {
    for (;;) {
      context.assertActive();
      const chunk = await reader.read();
      context.assertActive();
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > limit) reject("content-mismatch");
      onChunk(chunk.value);
    }
    context.assertActive();
    if (length !== null && total !== Number(length)) reject("content-mismatch");
    return total;
  } finally {
    context.signal.removeEventListener("abort", release);
    release();
  }
}

async function readDetails(url: string, input: Input, context: VerificationContext) {
  const response = await get(url, context, input.credentials);
  try { context.assertActive(); } catch (error) { cancelBody(response); throw error; }
  const encoding = response.headers.get("content-encoding");
  if (response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json" ||
      (encoding !== null && encoding !== "identity") || response.headers.has("content-range")) {
    cancelBody(response);
    reject("invalid-provider-response");
  }
  const chunks: Buffer[] = [];
  await readBody(response, METADATA_LIMIT, (chunk) => chunks.push(Buffer.from(chunk)), context);
  context.assertActive();
  let value: unknown;
  try { value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))); }
  catch { return reject("invalid-provider-response"); }
  const parsed = detailsSchema.safeParse(value);
  if (!parsed.success) reject("invalid-provider-response");
  return parsed.data;
}

function matchDetails(details: Details, input: Input, deliveryUrl: string, type: Details["type"]) {
  if (details.type !== type || details.fileId !== input.fileId ||
      details.filePath !== `/${input.intent.objectKey}` ||
      details.name !== input.intent.objectKey.split("/").at(-1)) reject("identity-mismatch");
  if (details.mime !== input.intent.mimeType || details.size !== input.intent.expectedByteSize) reject("content-mismatch");
  return versionTokenFromUrl(details.url, deliveryUrl, type === "file-version");
}

// Signature checks are a second MIME signal, not a decoder or malware scanner.
// Reject unknown ISO-BMFF brands (e.g. HEIC) and Matroska without WebM DocType.
function signatureMime(bytes: Buffer): string | null {
  if (bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) return "image/jpeg";
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  const ascii = bytes.toString("latin1");
  if (/^GIF8[79]a/.test(ascii)) return "image/gif";
  if (ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP") return "image/webp";
  if (bytes.length >= 16 && ascii.slice(4, 8) === "ftyp") {
    const size = bytes.readUInt32BE(0);
    if (size < 16 || size > bytes.length || size % 4 !== 0) return null;
    const brands = [ascii.slice(8, 12)];
    for (let offset = 16; offset < size; offset += 4) brands.push(ascii.slice(offset, offset + 4));
    if (brands.includes("avif") || brands.includes("avis")) return "image/avif";
    if (brands[0] === "qt  ") return "video/quicktime";
    if (/^(isom|iso[2-9]|mp4[12]|avc1|M4V )$/.test(brands[0])) return "video/mp4";
  }
  if (bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) &&
      bytes.includes(Buffer.from([0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6d]))) return "video/webm";
  return null;
}

/**
 * Dormant, READ-ONLY evidence adapter, not an action or publication capability.
 * `intent` must come from the future authenticated/locked DB resolver, never
 * from browser metadata. No signing, DB writes, retries, upload cancellation or delete.
 * The future finalizer must recheck actor/status/expiry/issuance under DB locks;
 * provider evidence alone is NOT ownership proof or public/private key-pair proof.
 * Consume evidence immediately in that workflow, never accept/replay it from a
 * client or cache it as an independent permission to publish or delete an object.
 */
export async function verifyImageKitObject(
  value: unknown,
  options?: ImageKitObjectVerificationOptions,
): Promise<ImageKitObjectVerification> {
  const parsed = inputSchema.safeParse(value);
  const parsedOptions = optionsSchema.safeParse(options === undefined ? {} : options);
  if (!parsed.success || !parsedOptions.success) return { ok: false, reason: "invalid-input" };
  const input = parsed.data;
  const { intent, credentials } = input;
  const target = getImageKitMediaTarget(intent.mimeType);
  if (!target || !isImageKitTargetIdentity(intent.intentId, intent.assetId) ||
      intent.expectedByteSize > target.maximumBytes ||
      intent.objectKey !== `media/source/${intent.assetId}/${intent.intentId}.${target.extension}` ||
      intent.storageContainer !== credentials.imageKitId ||
      credentials.urlEndpoint !== `https://ik.imagekit.io/${credentials.imageKitId}`) {
    return { ok: false, reason: "invalid-input" };
  }
  const deliveryUrl = `${credentials.urlEndpoint}/${intent.objectKey}`;
  const detailsUrl = `${API_ORIGIN}/v1/files/${input.fileId}/details`;
  const { signal: externalSignal, expectedCurrent } = parsedOptions.data;
  if (externalSignal?.aborted) return { ok: false, reason: "provider-unavailable" };
  const controller = new AbortController();
  const deadline = performance.now() + TOTAL_TIMEOUT_MS;
  let interrupt!: () => void;
  const interrupted = new Promise<never>((_resolve, rejectPromise) => {
    interrupt = () => {
      controller.abort();
      rejectPromise(new VerificationFailure("provider-unavailable"));
    };
  });
  const timer = setTimeout(interrupt, TOTAL_TIMEOUT_MS);
  externalSignal?.addEventListener("abort", interrupt, { once: true });
  const context: VerificationContext = {
    signal: controller.signal,
    assertActive: () => {
      if (controller.signal.aborted || externalSignal?.aborted || performance.now() >= deadline) {
        interrupt();
        reject("provider-unavailable");
      }
    },
  };
  const run = async (): Promise<ImageKitObjectVerification> => {
    context.assertActive();
    const current = await readDetails(detailsUrl, input, context);
    context.assertActive();
    const currentToken = matchDetails(current, input, deliveryUrl, "file");
    const versionId = current.versionInfo.id;
    if (expectedCurrent && (versionId !== expectedCurrent.versionId || current.updatedAt !== expectedCurrent.updatedAt ||
        currentToken !== expectedCurrent.versionToken)) reject("version-changed");
    const version = await readDetails(`${API_ORIGIN}/v1/files/${input.fileId}/versions/${versionId}`, input, context);
    context.assertActive();
    const versionToken = matchDetails(version, input, deliveryUrl, "file-version");
    if (version.versionInfo.id !== versionId || !versionToken || (currentToken !== null && currentToken !== versionToken)) reject("version-changed");
    // Original, version-pinned bytes, distinct from the queryless public src.
    const originalUrl = `${deliveryUrl}?ik-obj-version=${encodeURIComponent(versionToken)}&tr=orig-true`;
    const response = await get(originalUrl, context);
    try { context.assertActive(); } catch (error) { cancelBody(response); throw error; }
    const mime = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
    const encoding = response.headers.get("content-encoding");
    if (mime !== intent.mimeType || (encoding !== null && encoding !== "identity") || response.headers.has("content-range")) {
      cancelBody(response);
      reject("content-mismatch");
    }
    const hash = createHash("sha256");
    const signature = Buffer.alloc(SIGNATURE_LIMIT);
    let signatureSize = 0;
    const byteSize = await readBody(response, intent.expectedByteSize, (chunk) => {
      hash.update(chunk);
      const count = Math.min(chunk.byteLength, SIGNATURE_LIMIT - signatureSize);
      signature.set(chunk.subarray(0, count), signatureSize);
      signatureSize += count;
    }, context);
    context.assertActive();
    const checksumSha256 = hash.digest("hex");
    if (byteSize !== intent.expectedByteSize || checksumSha256 !== intent.expectedChecksumSha256 ||
        signatureMime(signature.subarray(0, signatureSize)) !== intent.mimeType) reject("content-mismatch");
    const latest = await readDetails(detailsUrl, input, context);
    context.assertActive();
    if (latest.versionInfo.id !== versionId || latest.updatedAt !== current.updatedAt) reject("version-changed");
    const latestToken = matchDetails(latest, input, deliveryUrl, "file");
    if (latestToken !== currentToken) reject("version-changed");
    return { ok: true, object: {
      storageProvider: "imagekit", storageContainer: intent.storageContainer,
      objectKey: intent.objectKey, fileId: input.fileId, versionId, versionToken,
      deliveryUrl, mimeType: intent.mimeType, byteSize, checksumSha256,
    } };
  };
  try {
    const result = await Promise.race([run(), interrupted]);
    context.assertActive();
    return result;
  } catch (error) {
    // Provider exceptions may contain auth headers, URLs or private metadata.
    return { ok: false, reason: controller.signal.aborted ? "provider-unavailable" :
      error instanceof VerificationFailure ? error.reason : "provider-unavailable" };
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener("abort", interrupt);
  }
}
