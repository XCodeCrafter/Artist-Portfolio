import "server-only";

import { z } from "zod";
import { getFreshCurrentAdmin } from "@/lib/admin/auth";
import { createAdminServiceClient } from "@/lib/admin/service";
import { getMediaUploadConfigSummary, getImageKitObservationCredentials } from "@/lib/admin/media-upload-config";
import { hasAuthSecuritySecret, keyedDigest } from "@/lib/admin/security-secret";
import { consumeDatabaseRateLimit } from "@/lib/security/rate-limit";
import { getImageKitObservationCredentialBinding, hasExactImageKitOperationOrigin } from "@/lib/admin/imagekit-observation-admission";
import { createImageKitObservationBudget, parseImageKitObservationApproval, type ImageKitObservationBudget } from "@/lib/admin/imagekit-observation-contracts";
import { getImageKitReconciliationOverviewForAdmin } from "@/lib/admin/imagekit-reconciliation-overview";
import type { ImageKitOperationsRefreshResult, ImageKitOperationsSnapshot, ImageKitObservationSetupCode } from "@/lib/admin/imagekit-operations-types";

const readySchema = z.object({ version: z.literal(1), ready: z.literal(true) }).strict();
const unavailableSnapshot = (code: ImageKitObservationSetupCode = "unavailable"): ImageKitOperationsSnapshot => ({
  setup: { code, checkedAt: null }, overview: { status: "unavailable", reason: "unavailable" },
});

function databaseFailure(error: unknown, functionName: string): ImageKitObservationSetupCode {
  const value = error as { code?: unknown; message?: unknown } | null;
  if (value?.code === "PGRST202" || (value?.code === "42883" && typeof value.message === "string" &&
      value.message.includes(`function public.${functionName}(`) && value.message.includes("does not exist"))) return "migration-required";
  return value?.code === "55000" ? "database-not-ready" : "unavailable";
}

/** Advisory setup read, NOT admission. No quotas, lease claims, approval writes
 * or provider requests. Every execution separately rechecks its authorization. */
async function readSetup(actorId: string, budget: ImageKitObservationBudget): Promise<ImageKitObservationSetupCode> {
  budget.checkpoint();
  const config = getMediaUploadConfigSummary();
  if (!config.imagekit.hasValidPublicKey || !config.imagekit.hasValidPrivateKey || !config.imagekit.hasValidUrlEndpoint) return "configuration-required";
  if (process.env.IMAGEKIT_OBSERVATION_ENABLED !== "true") return "checks-disabled";
  if (!hasAuthSecuritySecret()) return "security-required";
  const credentials = getImageKitObservationCredentials();
  if (!credentials) return "configuration-required";
  const binding = getImageKitObservationCredentialBinding(credentials);
  if (!/^[a-f0-9]{64}$/.test(binding)) return "security-required";
  const client = createAdminServiceClient();
  if (!client) return "database-unavailable";
  const readiness = await budget.within(() => client.rpc("get_imagekit_upload_readiness_v1").abortSignal(budget.signal));
  if (readiness.error) return databaseFailure(readiness.error, "get_imagekit_upload_readiness_v1");
  if (!readySchema.safeParse(readiness.data).success) return "database-not-ready";
  const approved = await budget.within(() => client.rpc("get_imagekit_observation_approval_v1", {
    p_actor_id: actorId, p_storage_container: credentials.imageKitId,
    p_url_endpoint: credentials.urlEndpoint, p_credential_binding: binding,
  }).abortSignal(budget.signal));
  if (approved.error) return databaseFailure(approved.error, "get_imagekit_observation_approval_v1");
  if (approved.data === null) return "approval-required";
  return parseImageKitObservationApproval(approved.data, {
    storageContainer: credentials.imageKitId, urlEndpoint: credentials.urlEndpoint, credentialBinding: binding,
  }, budget.checkpoint()) ? "available" : "unavailable";
}

async function loadSnapshot(refresh: boolean): Promise<ImageKitOperationsRefreshResult> {
  let budget: ReturnType<typeof createImageKitObservationBudget> | undefined;
  try {
    const current = createImageKitObservationBudget({ timeoutMs: 10_000 });
    budget = current;
    const admin = await current.within(() => getFreshCurrentAdmin(current.checkpoint));
    if (!admin?.hasActiveProfile || !["admin", "owner"].includes(admin.role) || !z.string().uuid().safeParse(admin.id).success) {
      return refresh ? { ok: false, code: "blocked" } : { ok: true, snapshot: unavailableSnapshot("access-required") };
    }
    if (refresh) {
      if (!(await hasExactImageKitOperationOrigin(admin.id, current))) return { ok: false, code: "blocked" };
      current.checkpoint();
      if (!hasAuthSecuritySecret()) return { ok: false, code: "unavailable" };
      // Refreshing reads consumes only its own abuse-control budget, never the
      // observation quota. Page rendering and the setup reader consume neither.
      const rate = await current.within(() => consumeDatabaseRateLimit({
        bucket: "imagekit-status:refresh", identifierHash: keyedDigest("imagekit-status-actor:v1", admin.id),
        limit: 30, windowSeconds: 60, failClosed: true,
      }));
      if (rate?.configured !== true || typeof rate.allowed !== "boolean") return { ok: false, code: "unavailable" };
      if (!rate.allowed) return { ok: false, code: "rate-limited" };
    }
    const [code, overview] = await Promise.all([
      current.within(() => readSetup(admin.id, current)),
      current.within(() => getImageKitReconciliationOverviewForAdmin(admin, current)),
    ]);
    const checkedAt = new Date(current.checkpoint()).toISOString();
    return { ok: true, snapshot: { setup: { code, checkedAt }, overview } };
  } catch {
    return { ok: false, code: "unavailable" };
  } finally { budget?.close(); }
}

/** Server page load: authentication before reading config, no automatic run. */
export async function getImageKitOperationsSnapshot(): Promise<ImageKitOperationsSnapshot> {
  const result = await loadSnapshot(false);
  return result.ok ? result.snapshot : unavailableSnapshot();
}

/** Only the explicit refresh action uses this; does not revalidate page caches. */
export async function refreshImageKitOperationsSnapshot(): Promise<ImageKitOperationsRefreshResult> {
  return loadSnapshot(true);
}
