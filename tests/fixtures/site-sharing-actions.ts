// Isolated browser QA only. Saves remain in memory; no backend or credentials.
import { parseSharingSubmission, type SharingEditorSnapshot, type SharingSaveState } from "@/lib/admin/site-sharing-editor";

export function createSharingFixture(): SharingEditorSnapshot {
  return { draft: { title: "Franky Fugazi | Cigar Box Blues", description: "Raw cigar box blues, garage and swamp sounds. Discover Franky Fugazi’s music, videos and live dates.", imageSrc: "", imageAlt: "" }, versions: { updatedAt: "2026-09-29T14:00:00.000Z" } };
}
let saved = createSharingFixture();
let mode: "success" | "conflict" | "lost" = "success";
export function readSharingFixture() { return structuredClone(saved); }
export function setSharingFixtureMode(value: typeof mode) { mode = value; }
export async function saveSiteSharingV2(_previous: SharingSaveState, form: FormData): Promise<SharingSaveState> {
  await new Promise(resolve => setTimeout(resolve, 250));
  const eventId = crypto.randomUUID();
  let parsed;
  try { parsed = parseSharingSubmission(JSON.parse(String(form.get("payload"))), JSON.parse(String(form.get("versions")))); }
  catch { return { status: "invalid", message: "Invalid local test draft.", eventId }; }
  if (!parsed.success) return { status: "invalid", message: "Invalid local test draft.", eventId, fieldErrors: parsed.fieldErrors };
  if (mode === "conflict" || parsed.data.versions.updatedAt !== saved.versions.updatedAt) return { status: "conflict", message: "Synthetic conflict: keep the draft and reload saved test state.", eventId };
  saved = { draft: parsed.data.payload, versions: { updatedAt: new Date(Date.parse(saved.versions.updatedAt) + 1000).toISOString() } };
  if (mode === "lost") throw new Error("Synthetic lost response after local memory save");
  return { status: "saved", message: "Saved in local test memory only.", eventId, canonical: saved.draft, versions: saved.versions };
}
