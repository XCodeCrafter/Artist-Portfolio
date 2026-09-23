// Deliberately safe display projection; no provider paths, keys, worker/lease
// identities, hashes or binding/version details belong in the admin UI payload.
export type ImageKitReconciliationStage = "uploading" | "waiting" | "due" | "checking" | "attention";
export type ImageKitReconciliationOverview = {
  version: 1;
  generatedAt: string;
  total: number;
  counts: Record<ImageKitReconciliationStage, number>;
  items: Array<{
    intentId: string;
    label: string;
    mediaType: "image" | "video";
    sizeBytes: number;
    stage: ImageKitReconciliationStage;
    attempts: number;
    lastObservation: "absent" | "retry" | "unsafe" | "exhausted" | null;
    nextCheckAt: string | null;
    updatedAt: string;
  }>;
  hasMore: boolean;
};
export type ImageKitReconciliationOverviewData =
  | { status: "available"; overview: ImageKitReconciliationOverview }
  | { status: "unavailable"; reason: "not-configured" | "migration-required" | "not-ready" | "unavailable" };
