import "server-only";

import { z } from "zod";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import {
  imageKitIntentRequestSchema, imageKitFinalizeRequestSchema,
  parseImageKitUploadSnapshot, parseImageKitClaimSnapshot, parseImageKitFinalizedSnapshot,
  toImageKitUploadStatus, type ImageKitUploadSnapshot,
} from "@/lib/admin/imagekit-lifecycle-contracts";
import { createImageKitUploadAuthority, type ImageKitUploadAuthority } from "@/lib/admin/imagekit-upload";
import { verifyImageKitObject } from "@/lib/admin/imagekit-object-verification";
import { revalidateMediaSurfaces } from "@/lib/admin/media-action-shared";
import type { ImageKitMediaUploadCredentials } from "@/lib/admin/media-upload-config";
import { createImageKitOperationBudget, type ImageKitOperationBudget } from "@/lib/admin/imagekit-operation-budget";

type RpcReply = { data: unknown; error: unknown };
type RpcClient = {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<RpcReply> & {
    abortSignal?(signal: AbortSignal): PromiseLike<RpcReply>;
  };
};
export type ImageKitUploadAdmission = { ok: false } | {
  ok: true;
  actorId: string;
  credentials: ImageKitMediaUploadCredentials;
  client: RpcClient;
};

type Dependencies = {
  /** Trusted server admission, NOT a browser boolean or a config-shape check.
   * Must require AAL2/live session, explicit allowed Origin, strict operation
   * quotas, approved account setup and ready orphan reconciliation. No default
   * implementation exists until those activation prerequisites are met. Pass
   * the shared lazy budget through admission's own async operations too. An
   * observation approval is NOT permission to issue or finalize an upload. */
  admit(operation: "issue" | "finalize", budget: ImageKitOperationBudget): Promise<ImageKitUploadAdmission>;
  sign?: typeof createImageKitUploadAuthority;
  verify?: typeof verifyImageKitObject;
  now?: () => number;
  monotonicNow?: () => number;
  signal?: AbortSignal;
  revalidate?: () => void | Promise<void>;
};
type UploadStatus = ReturnType<typeof toImageKitUploadStatus>;
type FailureCode = "not-admitted" | "invalid-request" | "not-ready" | "intent-closed" |
  "not-issued" | "expired" | "conflict" | "verification-failed" | "unconfirmed";
export type ImageKitUploadWorkflowResult =
  | { ok: false; code: FailureCode }
  | { ok: true; state: "issued"; upload: UploadStatus; authority: ImageKitUploadAuthority }
  | { ok: true; state: "already-issued" | "completed" | "already-completed"; upload: UploadStatus };

const providerId = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const credentialsSchema = z.object({
  publicKey: z.string().regex(/^public_[A-Za-z0-9+/_-]{8,192}={0,2}$/),
  privateKey: z.string().regex(/^private_[A-Za-z0-9+/_-]{8,192}={0,2}$/),
  imageKitId: providerId,
  urlEndpoint: z.string().max(256),
}).strict().refine(value => value.urlEndpoint === `https://ik.imagekit.io/${value.imageKitId}`);
const readinessSchema = z.object({ version: z.literal(1), ready: z.literal(true) }).strict();
const evidenceSchema = z.object({
  storageProvider: z.literal("imagekit"), storageContainer: providerId, objectKey: z.string().max(256),
  fileId: providerId, versionId: providerId, versionToken: z.string().regex(/^[A-Za-z0-9_.-]{1,256}$/),
  deliveryUrl: z.string().max(2048), mimeType: z.string().max(32),
  byteSize: z.number().int().positive().safe(), checksumSha256: z.string().regex(/^[0-9a-f]{64}$/),
}).strict();
const fail = (code: FailureCode): ImageKitUploadWorkflowResult => ({ ok: false, code });

function snapshotAdmission(value: ImageKitUploadAdmission) {
  try {
    if (value?.ok !== true || !z.string().uuid().safeParse(value.actorId).success) return null;
    const parsed = credentialsSchema.safeParse(value.credentials);
    if (!parsed.success || typeof value.client?.rpc !== "function") return null;
    // Never use a caller-owned credential/actor object or a replaceable RPC
    // method across awaits. This snapshot is identity consistency, not approval.
    return Object.freeze({
      actorId: value.actorId, credentials: Object.freeze(parsed.data),
      client: Object.freeze({ rpc: value.client.rpc.bind(value.client) }),
    });
  } catch { return null; }
}
type AdmissionSnapshot = NonNullable<ReturnType<typeof snapshotAdmission>>;

// Compare immutable reservation facts between separate RPCs, not object identity
// or just a matching asset ID. Issuance fields are checked separately after claim.
function sameReservation(first: ImageKitUploadSnapshot, next: ImageKitUploadSnapshot) {
  return (["intentId", "assetId", "physicalObjectId", "storageProvider", "storageContainer", "objectKey",
    "mediaType", "mimeType", "expectedByteSize", "expectedChecksumSha256", "expiresAt"] as const)
    .every(key => first[key] === next[key]);
}
function sameIssuance(first: ImageKitUploadSnapshot, next: ImageKitUploadSnapshot) {
  return first.issuedAt === next.issuedAt && first.authorityExpiresAt === next.authorityExpiresAt;
}

/**
 * Dormant orchestration core. NOT a Next server action or public endpoint. No
 * application imports this factory yet: an always-open admission callback would
 * bypass required activation checks. Unit tests use fictional admissions only.
 * No path below retries a claim, reconstructs a lost JWT, cancels on ambiguity,
 * physically deletes anything, or accepts verification evidence from a browser.
 */
export function createImageKitUploadWorkflow(dependencies: Dependencies) {
  const admit = dependencies.admit;
  const sign = dependencies.sign ?? createImageKitUploadAuthority;
  const verify = dependencies.verify ?? verifyImageKitObject;
  const now = dependencies.now ?? Date.now;
  const monotonicNow = dependencies.monotonicNow;
  const signal = dependencies.signal;
  const revalidate = dependencies.revalidate ?? revalidateMediaSurfaces;

  function live(snapshot: ImageKitUploadSnapshot, budget: ImageKitOperationBudget) {
    return Date.parse(snapshot.expiresAt) > budget.checkpoint();
  }
  function usefulAuthority(snapshot: ImageKitUploadSnapshot, budget: ImageKitOperationBudget) {
    const time = budget.checkpoint();
    return snapshot.issuedAt !== null && snapshot.authorityExpiresAt !== null &&
      Date.parse(snapshot.issuedAt) <= time + 5000 && Date.parse(snapshot.authorityExpiresAt) - time >= 30_000 &&
      Date.parse(snapshot.expiresAt) > time;
  }
  async function complete(snapshot: ImageKitUploadSnapshot, state: "completed" | "already-completed", budget: ImageKitOperationBudget): Promise<ImageKitUploadWorkflowResult> {
    // Cache failure cannot undo a committed DB publication; preserve the true
    // outcome rather than inviting another upload. A reload can refresh the UI.
    try { await budget.within(async () => { await revalidate(); }); } catch { /* Never undo confirmed publication on a cache failure/timeout. */ }
    return { ok: true, state, upload: toImageKitUploadStatus(snapshot) };
  }
  function invoke(admission: AdmissionSnapshot, budget: ImageKitOperationBudget, name: string, args?: Record<string, unknown>) {
    return budget.within(() => {
      const request = admission.client.rpc(name, args);
      return typeof request.abortSignal === "function" ? request.abortSignal(budget.signal) : request;
    });
  }
  async function ready(admission: AdmissionSnapshot, budget: ImageKitOperationBudget) {
    const result = await invoke(admission, budget, "get_imagekit_upload_readiness_v1");
    return !result.error && readinessSchema.safeParse(result.data).success;
  }
  async function resolve(admission: AdmissionSnapshot, budget: ImageKitOperationBudget, intentId: string) {
    const result = await invoke(admission, budget, "resolve_imagekit_upload_v1", { p_intent_id: intentId, p_actor_id: admission.actorId });
    return result.error ? null : parseImageKitUploadSnapshot(result.data, { intentId, storageContainer: admission.credentials.imageKitId });
  }

  async function execute(operation: "issue" | "finalize", work: (admission: AdmissionSnapshot, budget: ImageKitOperationBudget) => Promise<ImageKitUploadWorkflowResult>) {
    let budget: ReturnType<typeof createImageKitOperationBudget>;
    try { budget = createImageKitOperationBudget({ now, monotonicNow, signal, timeoutMs: operation === "issue" ? 15_000 : 60_000 }); }
    catch { return fail("unconfirmed"); }
    try {
      let raw: ImageKitUploadAdmission;
      try { raw = await budget.within(() => admit(operation, budget)); }
      catch (error) {
        // A rejected promise can beat a due timer too; recheck elapsed clocks.
        try { budget.checkpoint(); } catch { return fail("unconfirmed"); }
        // Preserve Next control flow, not raw authentication/backend failures.
        if (isRedirectError(error)) throw error;
        return fail("unconfirmed");
      }
      const admission = snapshotAdmission(raw);
      if (!admission) return fail("not-admitted");
      try { return await work(admission, budget); }
      catch { return fail("unconfirmed"); }
    } finally { budget.close(); }
  }

  async function issue(input: unknown): Promise<ImageKitUploadWorkflowResult> {
    return execute("issue", async (admission, budget) => {
      const parsed = imageKitIntentRequestSchema.safeParse(input);
      if (!parsed.success) return fail("invalid-request");
      const { intentId } = parsed.data;
      if (!(await ready(admission, budget))) return fail("not-ready");
      const initial = await resolve(admission, budget, intentId);
      if (!initial) return fail("unconfirmed");
      if (initial.status === "consumed") return complete(initial, "already-completed", budget);
      if (initial.status !== "prepared") return fail("intent-closed");
      if (!live(initial, budget)) return fail("expired");
      if (initial.issuedAt !== null) return { ok: true, state: "already-issued", upload: toImageKitUploadStatus(initial) };

      const result = await invoke(admission, budget, "claim_imagekit_upload_v1", { p_intent_id: intentId, p_actor_id: admission.actorId });
      if (result.error) return fail("unconfirmed");
      const claim = parseImageKitClaimSnapshot(result.data, { intentId, storageContainer: admission.credentials.imageKitId });
      if (!claim || !sameReservation(initial, claim)) return fail("unconfirmed");
      if (claim.outcome === "terminal") return claim.status === "consumed" ? complete(claim, "already-completed", budget) : fail("intent-closed");
      if (claim.outcome === "too_late") return fail("expired");
      if (claim.outcome === "already_issued") return { ok: true, state: "already-issued", upload: toImageKitUploadStatus(claim) };
      if (!usefulAuthority(claim, budget)) return fail("expired");
      const signed = sign({
        credentials: admission.credentials, intentId, assetId: claim.assetId, objectKey: claim.objectKey,
        mimeType: claim.mimeType, expectedByteSize: claim.expectedByteSize,
        intentExpiresAt: claim.expiresAt, nowSeconds: Date.parse(claim.issuedAt!) / 1000,
      });
      if (!signed.ok || signed.authority.expiresAt * 1000 !== Date.parse(claim.authorityExpiresAt!)) return fail("unconfirmed");
      // Recheck actor/terminal state after claim/sign latency, without reclaiming.
      // A cancellation after this check still relies on the durable cleanup queue;
      // already-issued provider authority cannot be revoked by a DB update.
      const current = await resolve(admission, budget, intentId);
      if (!current || !sameReservation(claim, current) || !sameIssuance(claim, current)) return fail("unconfirmed");
      if (current.status === "consumed") return complete(current, "already-completed", budget);
      if (current.status !== "prepared") return fail("intent-closed");
      if (!usefulAuthority(current, budget)) return fail("expired");
      return { ok: true, state: "issued", upload: toImageKitUploadStatus(current), authority: signed.authority };
    });
  }

  async function finalize(input: unknown): Promise<ImageKitUploadWorkflowResult> {
    return execute("finalize", async (admission, budget) => {
      const parsed = imageKitFinalizeRequestSchema.safeParse(input);
      if (!parsed.success) return fail("invalid-request");
      const { intentId, fileId } = parsed.data;
      if (!(await ready(admission, budget))) return fail("not-ready");
      const initial = await resolve(admission, budget, intentId);
      if (!initial) return fail("unconfirmed");
      if (initial.status === "consumed") return initial.fileId === fileId ? complete(initial, "already-completed", budget) : fail("conflict");
      if (initial.status !== "prepared") return fail("intent-closed");
      if (initial.issuedAt === null) return fail("not-issued");
      if (!live(initial, budget)) return fail("expired");
      const verified = await budget.within(() => verify({
        credentials: admission.credentials, fileId,
        intent: { intentId, assetId: initial.assetId, storageContainer: initial.storageContainer, objectKey: initial.objectKey,
          mimeType: initial.mimeType, expectedByteSize: initial.expectedByteSize, expectedChecksumSha256: initial.expectedChecksumSha256 },
      }, { signal: budget.signal }));
      if (verified?.ok !== true) return fail("verification-failed");
      const evidence = evidenceSchema.safeParse(verified.object);
      if (!evidence.success) return fail("verification-failed");
      const object = evidence.data;
      if (object.fileId !== fileId || object.storageContainer !== initial.storageContainer || object.objectKey !== initial.objectKey ||
          object.deliveryUrl !== `${admission.credentials.urlEndpoint}/${initial.objectKey}` || object.mimeType !== initial.mimeType ||
          object.byteSize !== initial.expectedByteSize || object.checksumSha256 !== initial.expectedChecksumSha256) return fail("verification-failed");
      if (!live(initial, budget)) return fail("expired");
      const current = await resolve(admission, budget, intentId);
      if (!current || !sameReservation(initial, current) || !sameIssuance(initial, current)) return fail("unconfirmed");
      if (current.status === "consumed") {
        return current.fileId === fileId && current.versionId === object.versionId && current.versionToken === object.versionToken
          ? complete(current, "already-completed", budget) : fail("conflict");
      }
      if (current.status !== "prepared") return fail("intent-closed");
      if (!live(current, budget)) return fail("expired");
      const result = await invoke(admission, budget, "finalize_imagekit_upload_v1", {
        p_intent_id: intentId, p_actor_id: admission.actorId, p_evidence: object,
      });
      if (result.error) return fail("unconfirmed");
      const final = parseImageKitFinalizedSnapshot(result.data, { intentId, storageContainer: admission.credentials.imageKitId });
      if (!final || !sameReservation(current, final) || !sameIssuance(current, final) ||
          final.fileId !== fileId || final.versionId !== object.versionId || final.versionToken !== object.versionToken) return fail("unconfirmed");
      return complete(final, final.outcome === "consumed" ? "completed" : "already-completed", budget);
    });
  }

  return { issue, finalize };
}
