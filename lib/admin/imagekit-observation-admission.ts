import "server-only";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { getFreshCurrentAdmin } from "@/lib/admin/auth";
import { verifyAdminActionOrigin } from "@/lib/admin/action-security";
import { getImageKitObservationCredentials, type ImageKitMediaUploadCredentials } from "@/lib/admin/media-upload-config";
import { hasAuthSecuritySecret, keyedDigest, safeDigestEqual } from "@/lib/admin/security-secret";
import { createAdminServiceClient } from "@/lib/admin/service";
import { consumeDatabaseRateLimit } from "@/lib/security/rate-limit";
import { parseImageKitObservationApproval, type ImageKitObservationBudget } from "@/lib/admin/imagekit-observation-contracts";
import type { ImageKitReconciliationAdmission } from "@/lib/admin/imagekit-reconciliation-workflow";

/** Server-only credential-pair fingerprint; NOT evidence the provider pairs them.
 * An owner must explicitly review/approve the account separately. Neither this
 * helper nor the observation entry creates or refreshes any approval. */
export function getImageKitObservationCredentialBinding(credentials: ImageKitMediaUploadCredentials): string {
  if (!hasAuthSecuritySecret()) return "";
  return keyedDigest("imagekit-observation-credential-binding:v1", JSON.stringify([
    credentials.imageKitId, credentials.urlEndpoint, credentials.publicKey, credentials.privateKey,
  ]));
}

export async function hasExactImageKitOperationOrigin(actorId: string, budget: ImageKitObservationBudget) {
  const headerStore = await budget.within(() => headers());
  const origin = headerStore.get("origin");
  try {
    if (!origin) return false;
    const url = new URL(origin);
    if (!["http:", "https:"].includes(url.protocol) || url.origin !== origin) return false;
  } catch { return false; }
  // Denied requests must not turn into unlimited audit writes before quotas.
  return budget.within(() => verifyAdminActionOrigin(actorId, "imagekit:observation", false));
}

/** Manual-admin admission boundary, not itself an action or scheduler.
 * No caller-selected account, file, worker ID, approval flag or key is accepted.
 * Authenticated observations still need explicit DB approval and shared quotas.
 */
export function createImageKitObservationAdmission() {
  return async (budget: ImageKitObservationBudget): Promise<ImageKitReconciliationAdmission> => {
    try {
      const admin = await budget.within(() => getFreshCurrentAdmin(budget.checkpoint));
      if (!admin?.hasActiveProfile || !["admin", "owner"].includes(admin.role) || !(await hasExactImageKitOperationOrigin(admin.id, budget))) return { ok: false };
      budget.checkpoint();
      const configured = getImageKitObservationCredentials();
      if (!configured) return { ok: false };
      const credentials = Object.freeze({ ...configured });
      const credentialBinding = getImageKitObservationCredentialBinding(credentials);
      if (!/^[a-f0-9]{64}$/.test(credentialBinding)) return { ok: false };
      const client = createAdminServiceClient();
      if (!client) return { ok: false };
      // The account quota intentionally ignores approval revision and key pair:
      // rotating credentials or using another admin must not reset its capacity.
      const actorHash = keyedDigest("imagekit-observation-actor:v1", admin.id);
      const accountHash = keyedDigest("imagekit-observation-account:v1", credentials.imageKitId);
      for (const quota of [
        { bucket: "imagekit-observe:actor", identifierHash: actorHash, limit: 3, windowSeconds: 60 },
        { bucket: "imagekit-observe:account", identifierHash: accountHash, limit: 6, windowSeconds: 60 },
        { bucket: "imagekit-observe:account-day", identifierHash: accountHash, limit: 300, windowSeconds: 86_400 },
      ]) {
        const rate = await budget.within(() => consumeDatabaseRateLimit({ ...quota, failClosed: true }));
        if (rate?.allowed !== true || rate.configured !== true) return { ok: false };
      }
      const approvalArgs = {
        p_actor_id: admin.id, p_storage_container: credentials.imageKitId,
        p_url_endpoint: credentials.urlEndpoint, p_credential_binding: credentialBinding,
      };
      const expected = { storageContainer: credentials.imageKitId, urlEndpoint: credentials.urlEndpoint, credentialBinding };
      const read = await budget.within(() => client.rpc("get_imagekit_observation_approval_v1", approvalArgs));
      const approval = !read.error && parseImageKitObservationApproval(read.data, expected, budget.checkpoint());
      if (!approval) return { ok: false };

      const revalidate = async (currentBudget: ImageKitObservationBudget): Promise<boolean> => {
        try {
          // Page auth is cached; use the intentionally uncached AAL2/session/profile
          // reader so revocation during a run blocks the next privileged operation.
          const currentAdmin = await currentBudget.within(() => getFreshCurrentAdmin(currentBudget.checkpoint));
          if (!currentAdmin?.hasActiveProfile || currentAdmin.id !== admin.id ||
              !["admin", "owner"].includes(currentAdmin.role) || !(await hasExactImageKitOperationOrigin(admin.id, currentBudget))) return false;
          currentBudget.checkpoint();
          const currentCredentials = getImageKitObservationCredentials();
          if (!currentCredentials || !safeDigestEqual(getImageKitObservationCredentialBinding(currentCredentials), credentialBinding)) return false;
          const result = await currentBudget.within(() => client.rpc("get_imagekit_observation_approval_v1", approvalArgs));
          const current = !result.error && parseImageKitObservationApproval(result.data, expected, currentBudget.checkpoint(), 5000);
          return Boolean(current && current.revision === approval.revision && current.expiresAt === approval.expiresAt);
        } catch { return false; }
      };
      budget.checkpoint();
      return {
        ok: true, actorId: admin.id, workerId: `observe:${randomUUID()}`,
        credentials, approval, client, revalidate,
      };
    } catch {
      // No raw auth/DB errors, fingerprints, provider configuration or keys escape.
      return { ok: false };
    }
  };
}
