import type {
  ImageKitReconciliationOverview,
  ImageKitReconciliationOverviewData,
  ImageKitReconciliationStage,
} from "../../lib/admin/imagekit-reconciliation-overview-types";

/** Synthetic display-only snapshots. Never seed these into an application database. */
export type ImageKitOverviewBrowserFixture = {
  id: "empty" | "uploading" | "waiting" | "checking" | "due" | "attention" | "mixed"
    | "not-configured" | "migration-required" | "not-ready" | "unavailable";
  title: string;
  data: ImageKitReconciliationOverviewData;
};

type Item = ImageKitReconciliationOverview["items"][number];
const generatedAt = "2026-09-23T12:00:00.000Z";
const priority: ImageKitReconciliationStage[] = ["attention", "due", "checking", "waiting", "uploading"];
const zeroCounts = (): ImageKitReconciliationOverview["counts"] => ({ uploading: 0, waiting: 0, due: 0, checking: 0, attention: 0 });

function row(stage: ImageKitReconciliationStage, index: number): Item {
  const observation = stage === "attention" ? (index % 2 === 0 ? "exhausted" : "unsafe")
    : stage === "uploading" ? null : (index % 2 === 0 ? "absent" : "retry");
  return {
    intentId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    label: `Synthetic ${stage} upload ${String(index).padStart(2, "0")}`,
    mediaType: index % 2 === 0 ? "video" : "image",
    sizeBytes: index % 2 === 0 ? 48_000_000 : 1_048_576,
    stage,
    attempts: observation === "exhausted" ? 5 : observation === null ? 0 : 1,
    lastObservation: observation,
    nextCheckAt: stage === "attention" ? null
      : stage === "due" ? "2026-09-23T12:00:00.000Z" : "2026-09-23T12:30:00.000Z",
    updatedAt: `2026-09-23T09:${String(index).padStart(2, "0")}:00.000Z`,
  };
}

function available(items: Item[], extraUploading = 0): ImageKitReconciliationOverviewData {
  const counts = zeroCounts();
  for (const item of items) counts[item.stage]++;
  counts.uploading += extraUploading;
  return {
    status: "available",
    overview: { version: 1, generatedAt, total: items.length + extraUploading, counts, items, hasMore: extraUploading > 0 },
  };
}

const mixedRows = priority.flatMap((stage, stageIndex) =>
  Array.from({ length: 4 }, (_, index) => row(stage, stageIndex * 4 + index + 1)));
// Boundary labels exercise wrapping and React text escaping, not external media.
mixedRows[0].label = `Synthetic${"X".repeat(211)}`;
mixedRows[1].label = 'Synthetic <img src=x onerror=alert("fixture")> & <script>fixture</script>';

export const imageKitOverviewBrowserFixtures: readonly ImageKitOverviewBrowserFixture[] = [
  { id: "empty", title: "Verified empty snapshot", data: available([]) },
  { id: "uploading", title: "Upload window open · starts collapsed", data: available([row("uploading", 1)]) },
  { id: "waiting", title: "Waiting to check · starts collapsed", data: available([row("waiting", 1)]) },
  { id: "checking", title: "Check in progress · starts collapsed", data: available([row("checking", 1)]) },
  { id: "due", title: "Ready for a check · starts expanded", data: available([row("due", 1)]) },
  { id: "attention", title: "Needs review · starts expanded", data: available([row("attention", 1)]) },
  { id: "mixed", title: "Mixed queue · bounded 20 of 23", data: available(mixedRows, 3) },
  { id: "not-configured", title: "Database connection not configured", data: { status: "unavailable", reason: "not-configured" } },
  { id: "migration-required", title: "Database migration unavailable", data: { status: "unavailable", reason: "migration-required" } },
  { id: "not-ready", title: "Database safety checks not ready", data: { status: "unavailable", reason: "not-ready" } },
  { id: "unavailable", title: "Snapshot temporarily unavailable", data: { status: "unavailable", reason: "unavailable" } },
];
