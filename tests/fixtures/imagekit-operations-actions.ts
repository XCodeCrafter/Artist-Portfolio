import type { ImageKitObservationOutcome, ImageKitOperationsRefreshResult } from "@/lib/admin/imagekit-operations-types";

// This module replaces the actual server-action import ONLY in the isolated
// browser build. Fixture callbacks must be explicitly supplied to the panel.
export async function refreshImageKitOperations(): Promise<ImageKitOperationsRefreshResult> {
  throw new Error("Synthetic operations fixture requires injected refresh callbacks.");
}

export async function requestImageKitObservation(): Promise<ImageKitObservationOutcome> {
  throw new Error("Synthetic operations fixture requires injected observation callbacks.");
}
