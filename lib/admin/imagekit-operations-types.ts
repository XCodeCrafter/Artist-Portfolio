import type { ImageKitReconciliationOverviewData } from "@/lib/admin/imagekit-reconciliation-overview-types";

// Public display projection only. Account IDs, endpoints, keys, credential
// bindings, approval revisions and raw database/provider errors never belong here.
export type ImageKitObservationSetupCode = "available" | "access-required" |
  "configuration-required" | "checks-disabled" | "security-required" |
  "database-unavailable" | "migration-required" | "database-not-ready" |
  "approval-required" | "unavailable";
export type ImageKitObservationSetup = {
  code: ImageKitObservationSetupCode;
  checkedAt: string | null;
};
export type ImageKitOperationsSnapshot = {
  setup: ImageKitObservationSetup;
  overview: ImageKitReconciliationOverviewData;
};
export type ImageKitOperationsRefreshResult =
  | { ok: true; snapshot: ImageKitOperationsSnapshot }
  | { ok: false; code: "blocked" | "rate-limited" | "unavailable" };
export type ImageKitObservationOutcome = {
  code: "idle" | "absent" | "retry" | "needs-review" | "blocked" | "not-ready" | "unconfirmed";
};
