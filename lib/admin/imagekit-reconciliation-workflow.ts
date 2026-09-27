import "server-only";

import { z } from "zod";
import { parseImageKitCleanupLease, parseImageKitCleanupFinished } from "@/lib/admin/imagekit-reconciliation-contracts";
import { observeImageKitUpload } from "@/lib/admin/imagekit-reconciliation-observation";
import { createImageKitObservationBudget, parseImageKitObservationApproval,
  type ImageKitObservationApproval, type ImageKitObservationBudget } from "@/lib/admin/imagekit-observation-contracts";
import type { ImageKitMediaUploadCredentials } from "@/lib/admin/media-upload-config";

type RpcClient = {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
};
export type ImageKitReconciliationAdmission = { ok: false } | {
  ok: true;
  actorId: string;
  workerId: string;
  credentials: ImageKitMediaUploadCredentials;
  approval: ImageKitObservationApproval;
  client: RpcClient;
  revalidate(budget: ImageKitObservationBudget): Promise<boolean>;
};
type Dependencies = {
  /** Trusted server/job admission, never a browser flag or just env formats.
   * Must authenticate the invoker, enforce quotas and explicitly approve the
   * configured account. A manual admin action supplies it; no scheduler exists.
   * The scoped SQL boundary independently fences actor, account, credential
   * binding and approval revision. No legacy global-claim fallback exists. */
  admit(budget: ImageKitObservationBudget): Promise<ImageKitReconciliationAdmission>;
  observe?: typeof observeImageKitUpload;
  now?: () => number;
  monotonicNow?: () => number;
};
type Observation = "absent" | "retry" | "unsafe";
export type ImageKitReconciliationResult =
  | { ok: false; code: "not-admitted" | "not-ready" | "invalid-lease" | "lease-expired" | "unconfirmed" }
  | { ok: true; state: "idle" }
  | { ok: true; state: "observed"; observation: Observation; queueState: "pending" | "attention" };

const providerId = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const admissionConfig = z.object({
  actorId: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/),
  workerId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/),
  credentials: z.object({
    publicKey: z.string().regex(/^public_[A-Za-z0-9+/_-]{8,192}={0,2}$/),
    privateKey: z.string().regex(/^private_[A-Za-z0-9+/_-]{8,192}={0,2}$/),
    imageKitId: providerId,
    urlEndpoint: z.string().max(256),
  }).strict().refine(value => value.urlEndpoint === `https://ik.imagekit.io/${value.imageKitId}`),
}).strict();
const readySchema = z.object({ version: z.literal(1), ready: z.literal(true) }).strict();
const observationSchema = z.object({ observation: z.enum(["absent", "retry", "unsafe"]) }).strict();
const fail = (code: Extract<ImageKitReconciliationResult, { ok: false }>["code"]): ImageKitReconciliationResult => ({ ok: false, code });

/**
 * One bounded observation, NOT orphan deletion. Server-only factory; the manual
 * admin entry supplies admission. No page load or background job starts a run.
 * All targets originate in the locked DB queue, never a browser file ID.
 * Missing files remain pending; present/ambiguous objects require attention.
 */
export function createImageKitReconciliationWorkflow(dependencies: Dependencies) {
  const observe = dependencies.observe ?? observeImageKitUpload;
  async function runOnce(): Promise<ImageKitReconciliationResult> {
    // A lost/late RPC can still commit remotely. Bound our waiting, never replay
    // it and never continue with provider/finish calls after that uncertainty.
    let budget: ReturnType<typeof createImageKitObservationBudget> | undefined;
    let admitted = false;
    try {
      const activeBudget = createImageKitObservationBudget({
        now: dependencies.now, monotonicNow: dependencies.monotonicNow, timeoutMs: 30_000,
      });
      budget = activeBudget;
      const admission = await activeBudget.within(() => dependencies.admit(activeBudget));
      if (!admission?.ok) return fail("not-admitted");
      const config = admissionConfig.safeParse({ actorId: admission.actorId, workerId: admission.workerId, credentials: admission.credentials });
      if (!config.success || typeof admission.client?.rpc !== "function" || typeof admission.revalidate !== "function") return fail("not-admitted");
      const { actorId, workerId, credentials } = config.data;
      const approval = parseImageKitObservationApproval(admission.approval, {
        storageContainer: credentials.imageKitId, urlEndpoint: credentials.urlEndpoint,
        credentialBinding: admission.approval?.credentialBinding,
      }, activeBudget.checkpoint(), 35_000);
      if (!approval) return fail("not-admitted");
      admitted = true;
      const client = admission.client;
      const revalidate = admission.revalidate;
      const authorization = {
        p_actor_id: actorId, p_storage_container: approval.storageContainer,
        p_url_endpoint: approval.urlEndpoint, p_credential_binding: approval.credentialBinding,
        p_approval_revision: approval.revision, p_worker_id: workerId,
      };
      const authorized = async () => {
        if (!parseImageKitObservationApproval(approval, {
          storageContainer: credentials.imageKitId, urlEndpoint: credentials.urlEndpoint,
          credentialBinding: approval.credentialBinding,
        }, activeBudget.checkpoint(), 5000)) return false;
        const valid = await activeBudget.within(() => revalidate(activeBudget));
        // Revalidation can consume time; never start the next call using an
        // approval that expired while the session/account check was in flight.
        return valid === true && !!parseImageKitObservationApproval(approval, {
          storageContainer: credentials.imageKitId, urlEndpoint: credentials.urlEndpoint,
          credentialBinding: approval.credentialBinding,
        }, activeBudget.checkpoint(), 5000);
      };
      const ready = async () => {
        const result = await activeBudget.within(() => client.rpc("get_imagekit_upload_readiness_v1"));
        return !result.error && readySchema.safeParse(result.data).success;
      };
      if (!(await ready())) return fail("not-ready");
      if (!(await authorized())) return fail("not-admitted");
      // Claim at most ONE candidate, including DB-side expiry/attention work.
      // An empty result need not mean the whole queue is empty or cleaned up.
      const claimed = await activeBudget.within(() => client.rpc("claim_imagekit_observation_v1", authorization));
      if (claimed.error) return fail("unconfirmed");
      if (!Array.isArray(claimed.data) || claimed.data.length > 1) return fail("invalid-lease");
      if (claimed.data.length === 0) return { ok: true, state: "idle" };
      const lease = parseImageKitCleanupLease(claimed.data[0], { storageContainer: credentials.imageKitId }, activeBudget.checkpoint());
      if (!lease) return fail("invalid-lease");
      if (!(await authorized())) return fail("not-admitted");
      if (Date.parse(lease.leaseExpiresAt) - activeBudget.checkpoint() <= 5000) return fail("lease-expired");
      // Copy the exact whitelisted target. Provider adapters never see worker
      // IDs, lease IDs, unrelated DB records or a caller-chosen URL.
      let observation: Observation;
      try {
        const observed = await activeBudget.within(() => observe({ credentials, intent: {
          intentId: lease.intentId, assetId: lease.assetId, storageContainer: lease.storageContainer,
          objectKey: lease.objectKey, mimeType: lease.mimeType,
          expectedByteSize: lease.expectedByteSize, expectedChecksumSha256: lease.expectedChecksumSha256,
        } }, { signal: activeBudget.signal }));
        const parsed = observationSchema.safeParse(observed);
        if (!parsed.success) return fail("unconfirmed");
        observation = parsed.data.observation;
      } catch {
        // The real adapter maps bounded failures to retry. An unexpected throw
        // (including our overall deadline) must not start another DB operation.
        return fail("unconfirmed");
      }
      if (Date.parse(lease.leaseExpiresAt) - activeBudget.checkpoint() <= 5000) return fail("lease-expired");
      if (!(await ready())) return fail("not-ready");
      if (!(await authorized())) return fail("not-admitted");
      if (Date.parse(lease.leaseExpiresAt) - activeBudget.checkpoint() <= 5000) return fail("lease-expired");
      const finished = await activeBudget.within(() => client.rpc("finish_imagekit_observation_v1", {
        ...authorization, p_intent_id: lease.intentId, p_lease_id: lease.leaseId, p_result: observation,
      }));
      if (finished.error) return fail("unconfirmed");
      const snapshot = parseImageKitCleanupFinished(finished.data, lease, observation);
      if (!snapshot || (snapshot.cleanupState !== "pending" && snapshot.cleanupState !== "attention")) return fail("unconfirmed");
      return { ok: true, state: "observed", observation, queueState: snapshot.cleanupState };
    } catch {
      return fail(admitted ? "unconfirmed" : "not-admitted");
    } finally {
      budget?.close();
    }
  }

  return { runOnce };
}
