import "server-only";

import { z } from "zod";
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

// Provider responses contain additional documented fields. Validate the facts
// used below, then project only candidate identity; never return raw metadata.
const candidateSchema = z.object({
  fileId: providerId,
  type: z.literal("file"),
  name: z.string().max(128),
  filePath: z.string().max(256),
  versionInfo: z.object({ id: providerId }),
  isPrivateFile: z.literal(false),
  isPublished: z.literal(true),
  url: z.string().max(2048),
  mime: z.string().max(32),
  size: z.number().int().positive().max(95_000_000),
  updatedAt: z.string().max(40).datetime({ offset: true })
    .refine(value => Number.isFinite(Date.parse(value))),
});

export type ImageKitOrphanCandidate = Readonly<{
  fileId: string;
  versionId: string;
  versionToken: string | null;
  updatedAt: string;
}>;
export type ImageKitOrphanDiscovery =
  | Readonly<{ status: "not-observed" | "retry" | "attention" }>
  | Readonly<{ status: "candidate"; candidate: ImageKitOrphanCandidate }>;

function cancelBody(response: Response) {
  try { void response.body?.cancel().catch(() => undefined); } catch { /* No provider diagnostics. */ }
}

async function readMetadata(response: Response, signal: AbortSignal, checkpoint: () => void): Promise<unknown> {
  const reader = response.body!.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  const cancel = () => {
    try { void reader.cancel().catch(() => undefined); } catch { /* Never await cancellation. */ }
  };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    for (;;) {
      checkpoint();
      const chunk = await reader.read();
      checkpoint();
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > METADATA_LIMIT) return undefined;
      chunks.push(Buffer.from(chunk.value));
    }
    const length = response.headers.get("content-length");
    if (length !== null && total !== Number(length)) return undefined;
    try {
      return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
    } catch { return undefined; }
  } finally {
    signal.removeEventListener("abort", cancel);
    cancel();
    reader.releaseLock();
  }
}

function parseVersionToken(value: string, deliveryUrl: string): string | null | undefined {
  let url: URL;
  try { url = new URL(value); } catch { return undefined; }
  if (value.split("?")[0] !== deliveryUrl || url.hash ||
      `${url.origin}${url.pathname}` !== deliveryUrl || url.username || url.password) return undefined;
  const keys = [...url.searchParams.keys()];
  if (new Set(keys).size !== keys.length || keys.some(key => !["ik-obj-version", "updatedAt"].includes(key))) return undefined;
  const updatedAt = url.searchParams.get("updatedAt");
  const token = url.searchParams.get("ik-obj-version");
  if ((updatedAt !== null && !/^\d{1,16}$/.test(updatedAt)) ||
      (token !== null && !/^[A-Za-z0-9_.-]{1,256}$/.test(token))) return undefined;
  return token;
}

/**
 * Dormant read-only discovery, NOT ownership, quiescence or deletion proof.
 * The reservation must originate in a trusted server workflow. Credential
 * formats do not prove the public/private key pair belongs to this account.
 *
 * Uses the documented List Assets exact-folder `path`, `type=all`, `limit=2`
 * contract. A single result is only a candidate for fresh byte/version checks.
 * Empty listings do not prove absence: indexing or in-flight uploads can change.
 * No SQL, retries, provider mutation, caller-selected URL or media download.
 * https://imagekit.io/docs/api-reference/digital-asset-management-dam/list-and-search-assets
 */
export async function discoverImageKitOrphanCandidate(
  value: unknown,
  options?: { signal?: AbortSignal },
): Promise<ImageKitOrphanDiscovery> {
  const parsed = inputSchema.safeParse(value);
  if (!parsed.success) return { status: "attention" };
  const { credentials, intent } = parsed.data;
  const target = getImageKitMediaTarget(intent.mimeType);
  if (!target || intent.assetId !== `imagekit-${intent.intentId}` ||
      intent.expectedByteSize > target.maximumBytes ||
      intent.storageContainer !== credentials.imageKitId ||
      credentials.urlEndpoint !== `https://ik.imagekit.io/${credentials.imageKitId}` ||
      intent.objectKey !== `media/source/${intent.assetId}/${intent.intentId}.${target.extension}`) {
    return { status: "attention" };
  }
  const externalSignal = options?.signal;
  if (externalSignal?.aborted) return { status: "retry" };

  const url = new URL(API_URL);
  url.searchParams.set("path", `/media/source/${intent.assetId}/`);
  url.searchParams.set("type", "all");
  url.searchParams.set("limit", "2");
  url.searchParams.set("skip", "0");
  const requestUrl = url.toString();
  const deliveryUrl = `${credentials.urlEndpoint}/${intent.objectKey}`;
  const controller = new AbortController();
  const deadlineAt = performance.now() + TOTAL_TIMEOUT_MS;
  const expired = () => controller.signal.aborted || performance.now() >= deadlineAt;
  const checkpoint = () => {
    if (expired()) controller.abort();
    controller.signal.throwIfAborted();
  };
  let abortResult!: () => void;
  const interrupted = new Promise<ImageKitOrphanDiscovery>(resolve => {
    abortResult = () => resolve({ status: "retry" });
    controller.signal.addEventListener("abort", abortResult, { once: true });
  });
  const abort = () => controller.abort();
  externalSignal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, TOTAL_TIMEOUT_MS);

  const inspect = async (): Promise<ImageKitOrphanDiscovery> => {
    try {
      checkpoint();
      const response = await fetch(requestUrl, {
        method: "GET", redirect: "error", credentials: "omit", cache: "no-store",
        signal: controller.signal,
        headers: {
          Accept: "application/json", "Accept-Encoding": "identity",
          Authorization: `Basic ${Buffer.from(`${credentials.privateKey}:`).toString("base64")}`,
        },
      });
      if (expired()) {
        controller.abort();
        cancelBody(response);
        return { status: "retry" };
      }
      // Neither HTTP 404 nor an authentication error proves an empty folder.
      if (response.status !== 200) {
        cancelBody(response);
        return { status: "retry" };
      }
      const length = response.headers.get("content-length");
      const encoding = response.headers.get("content-encoding");
      if (response.url !== requestUrl || response.redirected ||
          response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json" ||
          (encoding !== null && encoding !== "identity") ||
          response.headers.has("content-range") || !response.body ||
          (length !== null && (!/^\d+$/.test(length) || Number(length) > METADATA_LIMIT))) {
        cancelBody(response);
        return { status: "attention" };
      }
      const metadata = await readMetadata(response, controller.signal, checkpoint);
      checkpoint();
      if (!Array.isArray(metadata) || metadata.length > 1) return { status: "attention" };
      if (metadata.length === 0) return { status: "not-observed" };
      const candidate = candidateSchema.safeParse(metadata[0]);
      if (!candidate.success) return { status: "attention" };
      const item = candidate.data;
      if (item.filePath !== `/${intent.objectKey}` || item.name !== intent.objectKey.split("/").at(-1) ||
          item.mime !== intent.mimeType || item.size !== intent.expectedByteSize) return { status: "attention" };
      const versionToken = parseVersionToken(item.url, deliveryUrl);
      if (versionToken === undefined) return { status: "attention" };
      checkpoint();
      return { status: "candidate", candidate: {
        fileId: item.fileId, versionId: item.versionInfo.id, versionToken, updatedAt: item.updatedAt,
      } };
    } catch {
      return { status: "retry" };
    }
  };
  try {
    return await Promise.race([inspect(), interrupted]);
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener("abort", abort);
    controller.signal.removeEventListener("abort", abortResult);
    controller.abort();
  }
}
