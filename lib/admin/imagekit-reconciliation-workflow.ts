import "server-only";

import { z } from "zod";
import { parseImageKitCleanupLease, parseImageKitCleanupFinished } from "@/lib/admin/imagekit-reconciliation-contracts";
import { observeImageKitUpload } from "@/lib/admin/imagekit-reconciliation-observation";
import type { ImageKitMediaUploadCredentials } from "@/lib/admin/media-upload-config";

type RpcClient = {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
};
export type ImageKitReconciliationAdmission = { ok: false } | {
  ok: true;
  workerId: string;
  credentials: ImageKitMediaUploadCredentials;
  client: RpcClient;
};
type Dependencies = {
  /** Trusted server/job admission, never a browser flag or just env formats.
   * Must authenticate the invoker, enforce quotas and explicitly approve the
   * configured account. No production adapter or scheduler exists in this batch.
   * The 0047 claim RPC is global: activate only for this single approved account;
   * multi-account installations need a scoped claim RPC before deployment. */
  admit(): Promise<ImageKitReconciliationAdmission>;
  observe?: typeof observeImageKitUpload;
  now?: () => number;
};
type Observation = "absent" | "retry" | "unsafe";
export type ImageKitReconciliationResult =
  | { ok: false; code: "not-admitted" | "not-ready" | "invalid-lease" | "lease-expired" | "unconfirmed" }
  | { ok: true; state: "idle" }
  | { ok: true; state: "observed"; observation: Observation; queueState: "pending" | "attention" };

const providerId = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const admissionConfig = z.object({
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
 * One bounded observation, NOT orphan deletion. Dormant server-only factory;
 * no action/route/cron imports it and no default admission opens the gate.
 * All targets originate in the locked DB queue, never a browser file ID.
 * Missing files remain pending; present/ambiguous objects require attention.
 */
export function createImageKitReconciliationWorkflow(dependencies: Dependencies) {
  const observe = dependencies.observe ?? observeImageKitUpload;
  const now = dependencies.now ?? Date.now;

  async function runOnce(): Promise<ImageKitReconciliationResult> {
    // A lost/late RPC can still commit remotely. Bound our waiting, never replay
    // it and never continue with provider/finish calls after that uncertainty.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("reconciliation-deadline")), 30_000);
    });
    const within = <T>(work: PromiseLike<T>): Promise<T> => Promise.race([Promise.resolve(work), deadline]);
    let admitted = false;
    try {
      const admission = await within(dependencies.admit());
      if (!admission?.ok) return fail("not-admitted");
      const config = admissionConfig.safeParse({ workerId: admission.workerId, credentials: admission.credentials });
      if (!config.success || typeof admission.client?.rpc !== "function") return fail("not-admitted");
      admitted = true;
      const { workerId, credentials } = config.data;
      const client = admission.client;
      const ready = async () => {
        const result = await within(client.rpc("get_imagekit_upload_readiness_v1"));
        return !result.error && readySchema.safeParse(result.data).success;
      };
      let previousTime = now();
      if (!Number.isSafeInteger(previousTime) || previousTime <= 0) return fail("unconfirmed");
      const time = () => {
        const value = now();
        if (!Number.isSafeInteger(value) || value < previousTime) throw new Error("invalid-clock");
        previousTime = value;
        return value;
      };
      if (!(await ready())) return fail("not-ready");
      // Claim at most ONE candidate, including DB-side expiry/attention work.
      // An empty result need not mean the whole queue is empty or cleaned up.
      const claimed = await within(client.rpc("claim_imagekit_upload_cleanup_v1", { p_worker_id: workerId, p_limit: 1 }));
      if (claimed.error) return fail("unconfirmed");
      if (!Array.isArray(claimed.data) || claimed.data.length > 1) return fail("invalid-lease");
      if (claimed.data.length === 0) return { ok: true, state: "idle" };
      const lease = parseImageKitCleanupLease(claimed.data[0], { storageContainer: credentials.imageKitId }, time());
      if (!lease) return fail("invalid-lease");
      // Copy the exact whitelisted target. Provider adapters never see worker
      // IDs, lease IDs, unrelated DB records or a caller-chosen URL.
      let observation: Observation;
      try {
        const observed = await within(observe({ credentials, intent: {
          intentId: lease.intentId, assetId: lease.assetId, storageContainer: lease.storageContainer,
          objectKey: lease.objectKey, mimeType: lease.mimeType,
          expectedByteSize: lease.expectedByteSize, expectedChecksumSha256: lease.expectedChecksumSha256,
        } }));
        const parsed = observationSchema.safeParse(observed);
        if (!parsed.success) return fail("unconfirmed");
        observation = parsed.data.observation;
      } catch {
        // The real adapter maps bounded failures to retry. An unexpected throw
        // (including our overall deadline) must not start another DB operation.
        return fail("unconfirmed");
      }
      if (Date.parse(lease.leaseExpiresAt) - time() <= 5000) return fail("lease-expired");
      if (!(await ready())) return fail("not-ready");
      if (Date.parse(lease.leaseExpiresAt) - time() <= 5000) return fail("lease-expired");
      const finished = await within(client.rpc("finish_imagekit_upload_cleanup_v1", {
        p_intent_id: lease.intentId, p_lease_id: lease.leaseId, p_worker_id: workerId, p_result: observation,
      }));
      if (finished.error) return fail("unconfirmed");
      const snapshot = parseImageKitCleanupFinished(finished.data, lease, observation);
      if (!snapshot || (snapshot.cleanupState !== "pending" && snapshot.cleanupState !== "attention")) return fail("unconfirmed");
      return { ok: true, state: "observed", observation, queueState: snapshot.cleanupState };
    } catch {
      return fail(admitted ? "unconfirmed" : "not-admitted");
    } finally {
      clearTimeout(timer);
    }
  }

  return { runOnce };
}
