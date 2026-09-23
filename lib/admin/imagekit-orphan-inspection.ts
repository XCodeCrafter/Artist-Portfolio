import "server-only";

import { z } from "zod";
import { parseImageKitCleanupLease } from "@/lib/admin/imagekit-reconciliation-contracts";
import { discoverImageKitOrphanCandidate } from "@/lib/admin/imagekit-orphan-discovery";
import { verifyImageKitObject, type VerifiedImageKitObject } from "@/lib/admin/imagekit-object-verification";

const TOTAL_TIMEOUT_MS = 60_000;
const LEASE_MARGIN_MS = 5_000;
const VERIFICATION_TIMEOUT_MS = 45_000;
const providerId = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const versionToken = z.string().regex(/^[A-Za-z0-9_.-]{1,256}$/);
const inputSchema = z.object({
  credentials: z.object({
    publicKey: z.string().regex(/^public_[A-Za-z0-9+/_-]{8,192}={0,2}$/),
    privateKey: z.string().regex(/^private_[A-Za-z0-9+/_-]{8,192}={0,2}$/),
    imageKitId: providerId,
    urlEndpoint: z.string().max(256),
  }).strict().refine(value => value.urlEndpoint === `https://ik.imagekit.io/${value.imageKitId}`),
  lease: z.unknown(),
}).strict();
const discoverySchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("not-observed") }).strict(),
  z.object({ status: z.literal("retry") }).strict(),
  z.object({ status: z.literal("attention") }).strict(),
  z.object({ status: z.literal("candidate"), candidate: z.object({
    fileId: providerId, versionId: providerId, versionToken: versionToken.nullable(),
    updatedAt: z.string().max(40).datetime({ offset: true }),
  }).strict() }).strict(),
]);
const evidenceSchema = z.object({
  storageProvider: z.literal("imagekit"), storageContainer: providerId,
  objectKey: z.string().max(256), fileId: providerId, versionId: providerId,
  versionToken, deliveryUrl: z.string().max(2048), mimeType: z.string().max(32),
  byteSize: z.number().int().positive().max(95_000_000),
  checksumSha256: z.string().regex(/^[0-9a-f]{64}$/),
}).strict();
const verificationSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), object: evidenceSchema }).strict(),
  z.object({ ok: z.literal(false), reason: z.enum([
    "invalid-input", "provider-unavailable", "invalid-provider-response",
    "identity-mismatch", "content-mismatch", "version-changed",
  ]) }).strict(),
]);

export type ImageKitOrphanInspection =
  | { status: "not-observed" }
  | { status: "candidate-observed"; object: VerifiedImageKitObject }
  | { status: "retry"; reason: "provider-unavailable" | "lease-too-short" | "deadline" | "unconfirmed" }
  | { status: "attention"; reason: "invalid-input" | "invalid-lease" | "ambiguous-candidate" | "evidence-mismatch" };

type Dependencies = {
  discover?: typeof discoverImageKitOrphanCandidate;
  verify?: typeof verifyImageKitObject;
  now?: () => number;
  signal?: AbortSignal;
};

/**
 * Dormant READ-ONLY inspection of ONE terminal, issued, unbound reservation.
 * A trusted future worker must obtain the lease from locked DB state and admit
 * the account/invoker with quotas. Formats do not prove account/key ownership.
 * Never accept this input or its evidence from a browser or persist/replay it
 * as an authorization. No SQL, signing, publication, deletion or queue changes.
 *
 * "candidate-observed" means the listed current version's bytes matched while
 * inspected. It proves neither upload quiescence nor safe deletion; "not-observed"
 * is not durable absence. ImageKit file deletion can remove ALL file versions.
 * This 60s inspection is intentionally NOT wired into the existing 30s worker.
 */
export async function inspectImageKitOrphanCandidate(
  value: unknown,
  dependencies: Dependencies = {},
): Promise<ImageKitOrphanInspection> {
  const parsed = inputSchema.safeParse(value);
  if (!parsed.success) return { status: "attention", reason: "invalid-input" };
  const credentials = Object.freeze(parsed.data.credentials);
  const now = dependencies.now ?? Date.now;
  const discover = dependencies.discover ?? discoverImageKitOrphanCandidate;
  const verify = dependencies.verify ?? verifyImageKitObject;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stop: (() => void) | undefined;
  const abort = () => { controller.abort(); stop?.(); };
  const deadline = new Promise<never>((_, reject) => {
    stop = () => reject(new Error("inspection-stopped"));
  });
  // Attach a handler even if validation returns before the first awaited step.
  void deadline.catch(() => undefined);
  let reason: "deadline" | "lease-too-short" | "unconfirmed" = "unconfirmed";
  try {
    let previousTime = now();
    if (!Number.isSafeInteger(previousTime) || previousTime <= 0) {
      return { status: "retry", reason: "unconfirmed" };
    }
    const lease = parseImageKitCleanupLease(parsed.data.lease, { storageContainer: credentials.imageKitId }, previousTime);
    if (!lease) return { status: "attention", reason: "invalid-lease" };
    const time = () => {
      const current = now();
      if (!Number.isSafeInteger(current) || current < previousTime) throw new Error("invalid-clock");
      previousTime = current;
      return current;
    };
    const enoughLease = (required: number) => {
      if (Date.parse(lease.leaseExpiresAt) - time() <= required) {
        reason = "lease-too-short";
        throw new Error("lease-too-short");
      }
    };
    enoughLease(TOTAL_TIMEOUT_MS + LEASE_MARGIN_MS);
    if (dependencies.signal?.aborted) return { status: "retry", reason: "unconfirmed" };
    dependencies.signal?.addEventListener("abort", abort, { once: true });
    const startedAt = performance.now();
    timer = setTimeout(() => { reason = "deadline"; abort(); }, TOTAL_TIMEOUT_MS);
    const checkDeadline = () => {
      // A delayed event loop can settle I/O before its already-due timer runs.
      const elapsed = performance.now() - startedAt;
      if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed >= TOTAL_TIMEOUT_MS) {
        reason = "deadline";
        abort();
      }
      controller.signal.throwIfAborted();
    };
    const within = async <T>(work: () => Promise<T>): Promise<T> => {
      checkDeadline();
      const result = await Promise.race([work(), deadline]);
      checkDeadline();
      return result;
    };
    // Provider adapters see only this immutable target, not lease/worker IDs.
    const intent = Object.freeze({
      intentId: lease.intentId, assetId: lease.assetId, storageContainer: lease.storageContainer,
      objectKey: lease.objectKey, mimeType: lease.mimeType,
      expectedByteSize: lease.expectedByteSize, expectedChecksumSha256: lease.expectedChecksumSha256,
    });
    const found = discoverySchema.safeParse(await within(() => discover({ credentials, intent }, { signal: controller.signal })));
    enoughLease(LEASE_MARGIN_MS);
    checkDeadline();
    if (!found.success) return { status: "retry", reason: "unconfirmed" };
    if (found.data.status === "not-observed") return { status: "not-observed" };
    if (found.data.status === "retry") return { status: "retry", reason: "provider-unavailable" };
    if (found.data.status === "attention") return { status: "attention", reason: "ambiguous-candidate" };
    enoughLease(VERIFICATION_TIMEOUT_MS + LEASE_MARGIN_MS);
    const candidate = Object.freeze(found.data.candidate);
    const verified = verificationSchema.safeParse(await within(() => verify({
      credentials, intent, fileId: candidate.fileId,
    }, { signal: controller.signal, expectedCurrent: {
      versionId: candidate.versionId, versionToken: candidate.versionToken, updatedAt: candidate.updatedAt,
    } })));
    enoughLease(LEASE_MARGIN_MS);
    checkDeadline();
    if (!verified.success) return { status: "retry", reason: "unconfirmed" };
    if (!verified.data.ok) {
      return verified.data.reason === "provider-unavailable"
        ? { status: "retry", reason: "provider-unavailable" }
        : { status: "attention", reason: "evidence-mismatch" };
    }
    const object = verified.data.object;
    if (object.storageContainer !== lease.storageContainer || object.objectKey !== lease.objectKey ||
        object.fileId !== candidate.fileId || object.versionId !== candidate.versionId ||
        (candidate.versionToken !== null && object.versionToken !== candidate.versionToken) ||
        object.deliveryUrl !== `${credentials.urlEndpoint}/${lease.objectKey}` ||
        object.mimeType !== lease.mimeType || object.byteSize !== lease.expectedByteSize ||
        object.checksumSha256 !== lease.expectedChecksumSha256) {
      return { status: "attention", reason: "evidence-mismatch" };
    }
    checkDeadline();
    return { status: "candidate-observed", object };
  } catch {
    // Never expose provider exceptions, keys, paths, RPC state or raw responses.
    return { status: "retry", reason };
  } finally {
    clearTimeout(timer);
    dependencies.signal?.removeEventListener("abort", abort);
    controller.abort();
  }
}
