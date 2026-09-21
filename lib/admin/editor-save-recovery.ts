type EditorSaveResponse = { status: string; message: string; eventId?: string };

const CONFIRMED_STATUSES = new Set([
  "saved", "invalid", "conflict", "migration-required", "missing-service",
  "security-error", "error",
]);

/** A lost response is not evidence that the transaction failed. Keep the CAS
 * version and the draft untouched until the owner explicitly reloads. */
export function needsEditorReload(state: { status: string }) {
  // Generic server errors can also mean a committed RPC returned an invalid
  // canonical snapshot. Without a stronger contract, reconcile conservatively.
  return state.status === "conflict" || state.status === "error" ||
    ("requiresReload" in state && state.requiresReload === true);
}

export async function runEditorSave<T extends EditorSaveResponse>(
  previous: T,
  save: () => Promise<T>,
  applyConfirmedSave: (result: T) => boolean,
): Promise<T> {
  if (needsEditorReload(previous)) return previous;
  try {
    const result = await save();
    if (!result || !CONFIRMED_STATUSES.has(result.status) || typeof result.message !== "string") {
      throw new Error("Unrecognized save response");
    }
    if (result.status === "saved" &&
      (!result.eventId || !applyConfirmedSave(result))) {
      throw new Error("Unverified canonical save response");
    }
    return result;
  } catch {
    // Never include the exception text: framework/network errors can contain
    // private request details. Do not return the previous canonical payload.
    return {
      status: "error",
      message: "The save outcome could not be confirmed. Your draft is kept, but the server may have saved it. Reload the saved version before trying again.",
      eventId: crypto.randomUUID(),
      requiresReload: true,
    } as unknown as T;
  }
}
