import { z } from "zod";
import { DEFAULT_SHARING_METADATA, sharingMetadataSchema, type SharingMetadata } from "@/lib/content/site-sharing";

export const sharingVersionsSchema = z.object({ updatedAt: z.string().max(64).refine(value =>
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)),
"The saved version is invalid. Reload this editor.") }).strict();
export type SharingEditorVersions = z.infer<typeof sharingVersionsSchema>;
export type SharingEditorSnapshot = { draft: SharingMetadata; versions: SharingEditorVersions };
export type SharingSaveState = {
  status: "idle" | "saved" | "invalid" | "conflict" | "security-error" | "missing-service" | "migration-required" | "error";
  message: string; eventId: string; canonical?: SharingMetadata; versions?: SharingEditorVersions;
  fieldErrors?: Record<string, string[]>; savedAt?: string;
};
export const INITIAL_SHARING_SAVE_STATE: SharingSaveState = { status: "idle", message: "", eventId: "" };
export function createFallbackSharingEditorSnapshot(): SharingEditorSnapshot {
  return { draft: { ...DEFAULT_SHARING_METADATA }, versions: { updatedAt: new Date(0).toISOString() } };
}
export function parseSharingEditorSnapshot(value: unknown): SharingEditorSnapshot | null {
  const parsed = z.object({ draft: sharingMetadataSchema, versions: sharingVersionsSchema }).strict().safeParse(value);
  return parsed.success ? parsed.data : null;
}
export function parseSharingSubmission(payload: unknown, versions: unknown):
  | { success: true; data: { payload: SharingMetadata; versions: SharingEditorVersions } }
  | { success: false; fieldErrors: Record<string, string[]> } {
  const parsed = z.object({ payload: sharingMetadataSchema, versions: sharingVersionsSchema }).strict().safeParse({ payload, versions });
  if (parsed.success) return { success: true, data: parsed.data };
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of parsed.error.issues) {
    const path = (issue.path[0] === "payload" ? issue.path.slice(1) : issue.path).join(".") || "form";
    fieldErrors[path] = [...(fieldErrors[path] || []), issue.message];
  }
  return { success: false, fieldErrors };
}
