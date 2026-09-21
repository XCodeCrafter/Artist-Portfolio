import { z } from "zod";
import {
  archiveIdSchema, archiveTimestampSchema, createArchiveVersionMapSchema,
  type ArchiveData, type ArchivePage,
} from "./content-archive-editor";
import {
  parseBioCollectionSnapshotPayload,
  type BioBiographyDraft, type BioCreditsDraft, type BioEditorVersions,
} from "./bio-editor";

export const bioArchiveCollectionSchema = z.enum(["portraits", "paragraphs", "credits"]);
export type BioArchiveCollection = z.infer<typeof bioArchiveCollectionSchema>;
export type BioArchiveData = Record<BioArchiveCollection, ArchiveData>;
export const BIO_ARCHIVE_LIMITS = { portraits: 32, paragraphs: 50, credits: 100 } as const;
export function bioArchiveSection(collection: BioArchiveCollection) {
  return collection === "credits" ? "credits" : "biography";
}

const biographyVersions = z.object({
  profileUpdatedAt: archiveTimestampSchema,
  galleryItems: createArchiveVersionMapSchema(32), paragraphItems: createArchiveVersionMapSchema(50),
}).strict();
const creditsVersions = z.object({ items: createArchiveVersionMapSchema(100) }).strict();
const mutationFields = {
  operation: z.enum(["archive", "restore"]), itemId: archiveIdSchema,
  expectedArchiveUpdatedAt: archiveTimestampSchema.optional(),
};
export const bioArchiveMutationSchema = z.discriminatedUnion("collection", [
  z.object({ ...mutationFields, collection: z.literal("portraits"), expectedVersions: biographyVersions }).strict(),
  z.object({ ...mutationFields, collection: z.literal("paragraphs"), expectedVersions: biographyVersions }).strict(),
  z.object({ ...mutationFields, collection: z.literal("credits"), expectedVersions: creditsVersions }).strict(),
]).superRefine((value, context) => {
  const versions = value.collection === "credits" ? value.expectedVersions.items
    : value.collection === "portraits" ? value.expectedVersions.galleryItems : value.expectedVersions.paragraphItems;
  // z.unknown refinements can leave an invalid map undefined while other
  // refinements still run. The map schema already reports that validation error.
  if (!versions || typeof versions !== "object" || Array.isArray(versions)) return;
  const active = Object.hasOwn(versions, value.itemId);
  if (value.operation === "archive" && (!active || value.expectedArchiveUpdatedAt !== undefined)) {
    context.addIssue({ code: "custom", path: ["itemId"], message: "Choose a saved item from this collection." });
  }
  if (value.operation === "restore" && (active || !value.expectedArchiveUpdatedAt)) {
    context.addIssue({ code: "custom", path: ["expectedArchiveUpdatedAt"], message: "Reload the archive before restoring this item." });
  }
});

export type BioArchiveSnapshot = {
  collection: "portraits" | "paragraphs"; section: "biography";
  payload: BioBiographyDraft; versions: BioEditorVersions["biography"];
} | {
  collection: "credits"; section: "credits";
  payload: BioCreditsDraft; versions: BioEditorVersions["credits"];
};
export type BioArchiveMutationResult = {
  ok: boolean; message: string; reloadRequired?: boolean;
  collection?: BioArchiveCollection; section?: "biography" | "credits";
  canonicalSection?: unknown; versions?: unknown; archive?: ArchivePage;
};

function exactItems(items: { id: string }[], versions: Record<string, string>) {
  return items.length === Object.keys(versions).length && items.every((item) => Object.hasOwn(versions, item.id));
}

export function parseBioArchiveSnapshot(collection: unknown, payload: unknown, versions: unknown): BioArchiveSnapshot | null {
  const target = bioArchiveCollectionSchema.safeParse(collection);
  if (!target.success) return null;
  const section = bioArchiveSection(target.data);
  const parsedPayload = parseBioCollectionSnapshotPayload(section, payload);
  if (!parsedPayload) return null;
  if (target.data === "credits") {
    const saved = creditsVersions.safeParse(versions);
    if (!saved.success || !("items" in parsedPayload) || !exactItems(parsedPayload.items, saved.data.items)) return null;
    return { collection: "credits", section: "credits", payload: parsedPayload, versions: saved.data };
  }
  const saved = biographyVersions.safeParse(versions);
  if (!saved.success || !("galleryImages" in parsedPayload) ||
    !exactItems(parsedPayload.galleryImages, saved.data.galleryItems) ||
    !exactItems(parsedPayload.paragraphs, saved.data.paragraphItems)) return null;
  return { collection: target.data, section: "biography", payload: parsedPayload, versions: saved.data };
}

// Compare the same instant without truncating PostgreSQL microseconds, while
// accepting equivalent Z / +00:00 and fractional-precision representations.
export function sameBioArchiveVersion(left: string, right: string) {
  const micros = (value: string) => (value.match(/\.(\d+)/)?.[1] || "").padEnd(6, "0").slice(3);
  return Date.parse(left) === Date.parse(right) && micros(left) === micros(right);
}
