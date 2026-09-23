import "server-only";

import { z } from "zod";
import {
  imageKitIntentRequestSchema, imageKitFinalizeRequestSchema,
  parseImageKitUploadSnapshot, parseImageKitClaimSnapshot, parseImageKitFinalizedSnapshot,
  toImageKitUploadStatus, type ImageKitUploadSnapshot,
} from "@/lib/admin/imagekit-lifecycle-contracts";
import { createImageKitUploadAuthority, type ImageKitUploadAuthority } from "@/lib/admin/imagekit-upload";
import { verifyImageKitObject } from "@/lib/admin/imagekit-object-verification";
import { revalidateMediaSurfaces } from "@/lib/admin/media-action-shared";
import type { ImageKitMediaUploadCredentials } from "@/lib/admin/media-upload-config";

type RpcClient = {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
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
   * implementation exists until those activation prerequisites are met. */
  admit(operation: "issue" | "finalize"): Promise<ImageKitUploadAdmission>;
  sign?: typeof createImageKitUploadAuthority;
  verify?: typeof verifyImageKitObject;
  now?: () => number;
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

function validAdmission(admission: Extract<ImageKitUploadAdmission, { ok: true }>) {
  return z.string().uuid().safeParse(admission.actorId).success &&
    credentialsSchema.safeParse(admission.credentials).success;
}

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
  const sign = dependencies.sign ?? createImageKitUploadAuthority;
  const verify = dependencies.verify ?? verifyImageKitObject;
  const now = dependencies.now ?? Date.now;
  const revalidate = dependencies.revalidate ?? revalidateMediaSurfaces;

  function live(snapshot: ImageKitUploadSnapshot) {
    const time = now();
    return Number.isSafeInteger(time) && time > 0 && Date.parse(snapshot.expiresAt) > time;
  }
  function usefulAuthority(snapshot: ImageKitUploadSnapshot) {
    const time = now();
    return Number.isSafeInteger(time) && time > 0 && snapshot.issuedAt !== null && snapshot.authorityExpiresAt !== null &&
      Date.parse(snapshot.issuedAt) <= time + 5000 && Date.parse(snapshot.authorityExpiresAt) - time >= 30_000 &&
      Date.parse(snapshot.expiresAt) > time;
  }
  async function complete(snapshot: ImageKitUploadSnapshot, state: "completed" | "already-completed"): Promise<ImageKitUploadWorkflowResult> {
    // Cache failure cannot undo a committed DB publication; preserve the true
    // outcome rather than inviting another upload. A reload can refresh the UI.
    try { await revalidate(); } catch { /* Never log provider or credential material. */ }
    return { ok: true, state, upload: toImageKitUploadStatus(snapshot) };
  }
  async function ready(client: RpcClient) {
    const result = await client.rpc("get_imagekit_upload_readiness_v1");
    return !result.error && readinessSchema.safeParse(result.data).success;
  }
  async function resolve(admission: Extract<ImageKitUploadAdmission, { ok: true }>, intentId: string) {
    const result = await admission.client.rpc("resolve_imagekit_upload_v1", { p_intent_id: intentId, p_actor_id: admission.actorId });
    return result.error ? null : parseImageKitUploadSnapshot(result.data, { intentId, storageContainer: admission.credentials.imageKitId });
  }

  async function issue(input: unknown): Promise<ImageKitUploadWorkflowResult> {
    // Admission is outside catch so Next login/MFA redirects retain control flow.
    const admission = await dependencies.admit("issue");
    if (!admission.ok || !validAdmission(admission)) return fail("not-admitted");
    const parsed = imageKitIntentRequestSchema.safeParse(input);
    if (!parsed.success) return fail("invalid-request");
    const { intentId } = parsed.data;
    try {
      if (!(await ready(admission.client))) return fail("not-ready");
      const initial = await resolve(admission, intentId);
      if (!initial) return fail("unconfirmed");
      if (initial.status === "consumed") return complete(initial, "already-completed");
      if (initial.status !== "prepared") return fail("intent-closed");
      if (!live(initial)) return fail("expired");
      if (initial.issuedAt !== null) return { ok: true, state: "already-issued", upload: toImageKitUploadStatus(initial) };

      const result = await admission.client.rpc("claim_imagekit_upload_v1", { p_intent_id: intentId, p_actor_id: admission.actorId });
      if (result.error) return fail("unconfirmed");
      const claim = parseImageKitClaimSnapshot(result.data, { intentId, storageContainer: admission.credentials.imageKitId });
      if (!claim || !sameReservation(initial, claim)) return fail("unconfirmed");
      if (claim.outcome === "terminal") return claim.status === "consumed" ? complete(claim, "already-completed") : fail("intent-closed");
      if (claim.outcome === "too_late") return fail("expired");
      if (claim.outcome === "already_issued") return { ok: true, state: "already-issued", upload: toImageKitUploadStatus(claim) };
      if (!usefulAuthority(claim)) return fail("expired");
      const signed = sign({
        credentials: admission.credentials, intentId, assetId: claim.assetId, objectKey: claim.objectKey,
        mimeType: claim.mimeType, expectedByteSize: claim.expectedByteSize,
        intentExpiresAt: claim.expiresAt, nowSeconds: Date.parse(claim.issuedAt!) / 1000,
      });
      if (!signed.ok || signed.authority.expiresAt * 1000 !== Date.parse(claim.authorityExpiresAt!)) return fail("unconfirmed");
      // Recheck actor/terminal state after claim/sign latency, without reclaiming.
      // A cancellation after this check still relies on the durable cleanup queue;
      // already-issued provider authority cannot be revoked by a DB update.
      const current = await resolve(admission, intentId);
      if (!current || !sameReservation(claim, current) || !sameIssuance(claim, current)) return fail("unconfirmed");
      if (current.status === "consumed") return complete(current, "already-completed");
      if (current.status !== "prepared") return fail("intent-closed");
      if (!usefulAuthority(current)) return fail("expired");
      return { ok: true, state: "issued", upload: toImageKitUploadStatus(current), authority: signed.authority };
    } catch { return fail("unconfirmed"); }
  }

  async function finalize(input: unknown): Promise<ImageKitUploadWorkflowResult> {
    const admission = await dependencies.admit("finalize");
    if (!admission.ok || !validAdmission(admission)) return fail("not-admitted");
    const parsed = imageKitFinalizeRequestSchema.safeParse(input);
    if (!parsed.success) return fail("invalid-request");
    const { intentId, fileId } = parsed.data;
    try {
      if (!(await ready(admission.client))) return fail("not-ready");
      const initial = await resolve(admission, intentId);
      if (!initial) return fail("unconfirmed");
      if (initial.status === "consumed") return initial.fileId === fileId ? complete(initial, "already-completed") : fail("conflict");
      if (initial.status !== "prepared") return fail("intent-closed");
      if (initial.issuedAt === null) return fail("not-issued");
      if (!live(initial)) return fail("expired");
      const verified = await verify({
        credentials: admission.credentials, fileId,
        intent: { intentId, assetId: initial.assetId, storageContainer: initial.storageContainer, objectKey: initial.objectKey,
          mimeType: initial.mimeType, expectedByteSize: initial.expectedByteSize, expectedChecksumSha256: initial.expectedChecksumSha256 },
      });
      if (!verified.ok) return fail("verification-failed");
      const evidence = evidenceSchema.safeParse(verified.object);
      if (!evidence.success) return fail("verification-failed");
      const object = evidence.data;
      if (object.fileId !== fileId || object.storageContainer !== initial.storageContainer || object.objectKey !== initial.objectKey ||
          object.deliveryUrl !== `${admission.credentials.urlEndpoint}/${initial.objectKey}` || object.mimeType !== initial.mimeType ||
          object.byteSize !== initial.expectedByteSize || object.checksumSha256 !== initial.expectedChecksumSha256) return fail("verification-failed");
      if (!live(initial)) return fail("expired");
      const current = await resolve(admission, intentId);
      if (!current || !sameReservation(initial, current) || !sameIssuance(initial, current)) return fail("unconfirmed");
      if (current.status === "consumed") {
        return current.fileId === fileId && current.versionId === object.versionId && current.versionToken === object.versionToken
          ? complete(current, "already-completed") : fail("conflict");
      }
      if (current.status !== "prepared") return fail("intent-closed");
      if (!live(current)) return fail("expired");
      const result = await admission.client.rpc("finalize_imagekit_upload_v1", {
        p_intent_id: intentId, p_actor_id: admission.actorId, p_evidence: object,
      });
      if (result.error) return fail("unconfirmed");
      const final = parseImageKitFinalizedSnapshot(result.data, { intentId, storageContainer: admission.credentials.imageKitId });
      if (!final || !sameReservation(current, final) || !sameIssuance(current, final) ||
          final.fileId !== fileId || final.versionId !== object.versionId || final.versionToken !== object.versionToken) return fail("unconfirmed");
      return complete(final, final.outcome === "consumed" ? "completed" : "already-completed");
    } catch { return fail("unconfirmed"); }
  }

  return { issue, finalize };
}
