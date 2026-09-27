import "server-only";

import { createImageKitObservationAdmission } from "@/lib/admin/imagekit-observation-admission";
import { createImageKitReconciliationWorkflow } from "@/lib/admin/imagekit-reconciliation-workflow";

/** Invoked only by the explicit single-check server action. No page load or
 * background job runs it. Every request needs live admin/MFA, Origin, separate
 * observation flag, owner approval and quotas. Never enables uploads/deletion. */
export function createImageKitObservationEntry() {
  return createImageKitReconciliationWorkflow({ admit: createImageKitObservationAdmission() });
}
