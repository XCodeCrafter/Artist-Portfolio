import "server-only";

import { z } from "zod";
import { requireAdmin, type AdminUser } from "@/lib/admin/auth";
import type { ImageKitObservationBudget } from "@/lib/admin/imagekit-observation-contracts";
import { createAdminServiceClient } from "@/lib/admin/service";
import type { ImageKitReconciliationOverviewData } from "@/lib/admin/imagekit-reconciliation-overview-types";
import { parseImageKitReconciliationOverview } from "@/lib/admin/imagekit-reconciliation-overview-contracts";
export { parseImageKitReconciliationOverview } from "@/lib/admin/imagekit-reconciliation-overview-contracts";

const LIMIT = 20;

const unavailable = (reason: Extract<ImageKitReconciliationOverviewData, { status: "unavailable" }>["reason"]): ImageKitReconciliationOverviewData =>
  ({ status: "unavailable", reason });

/** Authenticated, read-only server load. Never claims/expires/retries any job. */
export async function getImageKitReconciliationOverview(): Promise<ImageKitReconciliationOverviewData> {
  // Preserve redirects and require AAL2/live-session checks before a privileged read.
  const admin = await requireAdmin();
  return getImageKitReconciliationOverviewForAdmin(admin);
}

/** Server-only reuse after a caller already performed fresh authentication.
 * Never accept this context from browser input. A caller budget prevents another
 * DB request from starting after a local-panel refresh has timed out. */
export async function getImageKitReconciliationOverviewForAdmin(
  admin: AdminUser, budget?: ImageKitObservationBudget,
): Promise<ImageKitReconciliationOverviewData> {
  if (!admin.hasActiveProfile || !z.string().uuid().safeParse(admin.id).success) return unavailable("unavailable");
  let timer: ReturnType<typeof setTimeout> | undefined;
  const controller = new AbortController();
  const abort = () => controller.abort();
  try {
    budget?.checkpoint();
    budget?.signal.addEventListener("abort", abort, { once: true });
    const client = createAdminServiceClient();
    if (!client) return unavailable("not-configured");
    const deadline = new Promise<ImageKitReconciliationOverviewData>(resolve => {
      timer = setTimeout(() => { controller.abort(); resolve(unavailable("unavailable")); }, 5000);
    });
    const read = async (): Promise<ImageKitReconciliationOverviewData> => {
      budget?.checkpoint();
      const { data, error } = await client.rpc("get_imagekit_reconciliation_overview_v1", {
        p_actor_id: admin.id, p_limit: LIMIT,
      }).abortSignal(controller.signal);
      if (controller.signal.aborted) return unavailable("unavailable");
      if (error) {
        if (["PGRST202", "42883"].includes(error.code)) return unavailable("migration-required");
        return unavailable(error.code === "55000" ? "not-ready" : "unavailable");
      }
      const overview = parseImageKitReconciliationOverview(data);
      return overview ? { status: "available", overview } : unavailable("unavailable");
    };
    return await Promise.race([read(), deadline]);
  } catch {
    return unavailable("unavailable");
  } finally {
    budget?.signal.removeEventListener("abort", abort);
    clearTimeout(timer);
    controller.abort();
  }
}
