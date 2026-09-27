import type { ImageKitObservationOutcome, ImageKitObservationSetupCode, ImageKitOperationsSnapshot } from "@/lib/admin/imagekit-operations-types";
import { imageKitOverviewBrowserFixtures } from "./imagekit-overview-browser";

export const setupCodes = [
  "available", "access-required", "configuration-required", "checks-disabled", "security-required",
  "database-unavailable", "migration-required", "database-not-ready", "approval-required", "unavailable",
] as const satisfies readonly ImageKitObservationSetupCode[];

export const outcomeCodes = [
  "idle", "absent", "retry", "needs-review", "blocked", "not-ready", "unconfirmed",
] as const satisfies readonly ImageKitObservationOutcome["code"][];

export const overviewCases = imageKitOverviewBrowserFixtures;
export type OverviewCase = (typeof overviewCases)[number]["id"];

/** Deterministic, synthetic presentation data. Never seed into an application. */
export function operationsSnapshot(code: ImageKitObservationSetupCode, overviewCase: OverviewCase, refreshSequence = 0): ImageKitOperationsSnapshot {
  const source = overviewCases.find(fixture => fixture.id === overviewCase);
  if (!source || !Number.isSafeInteger(refreshSequence) || refreshSequence < 0 || refreshSequence > 9999) {
    throw new Error("Unknown synthetic operations scenario.");
  }
  const checkedAt = new Date(Date.parse("2026-09-24T12:00:00.000Z") + refreshSequence * 1000).toISOString();
  const overview = structuredClone(source.data);
  if (overview.status === "available") {
    // Preserve each stage's relationship to its snapshot time when advancing
    // the synthetic clock; a waiting row must not accidentally become overdue.
    const offset = Date.parse(checkedAt) - Date.parse(overview.overview.generatedAt);
    const shifted = (value: string) => new Date(Date.parse(value) + offset).toISOString();
    overview.overview.generatedAt = checkedAt;
    for (const item of overview.overview.items) {
      item.updatedAt = shifted(item.updatedAt);
      if (item.nextCheckAt) item.nextCheckAt = shifted(item.nextCheckAt);
    }
  }
  return { setup: { code, checkedAt }, overview };
}
