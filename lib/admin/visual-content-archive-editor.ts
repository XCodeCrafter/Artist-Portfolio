import { z } from "zod";
import { ARCHIVE_PAGE_SIZE, archiveIdSchema, archiveTimestampSchema, archiveOffsetSchema, type ArchivePage } from "./content-archive-editor";
import { parseGalleryArchivePayload, type GalleryFramesDraft } from "./gallery-editor";
import { parseShowreelArchivePayload, type ShowreelWorksDraft } from "./showreel-editor";

export const visualArchiveCollectionSchema = z.enum(["gallery", "showreel"]);
export type VisualArchiveCollection = z.infer<typeof visualArchiveCollectionSchema>;
export const VISUAL_ARCHIVE_BASE_LIMIT = 120;
export const VISUAL_ARCHIVE_MAX_HISTORY = 10_000;
const legacyId = z.string().min(1).max(512).refine(value => value.trim().length > 0 && !/[\u0000-\u001f\u007f]/.test(value));
export function visualArchiveSection(collection: VisualArchiveCollection) {
  return collection === "gallery" ? "frames" : "works";
}

function versionMap(collection: VisualArchiveCollection) {
  const id = collection === "gallery" ? archiveIdSchema : legacyId;
  const limit = collection === "gallery" ? VISUAL_ARCHIVE_BASE_LIMIT : VISUAL_ARCHIVE_MAX_HISTORY;
  return z.unknown().transform((value, context): Record<string, string> => {
    if (!value || typeof value !== "object" || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
      context.addIssue({ code: "custom", message: "Reload the saved collection versions." });
      return z.NEVER;
    }
    const entries = Object.entries(value);
    if (entries.length > limit || entries.some(([key, version]) => !id.safeParse(key).success || !archiveTimestampSchema.safeParse(version).success)) {
      context.addIssue({ code: "custom", message: "Invalid collection identity or version." });
      return z.NEVER;
    }
    // Unlike z.record, retain even an own historical __proto__ video ID without
    // assigning to an object's prototype or silently losing a CAS member.
    return Object.fromEntries(entries) as Record<string, string>;
  });
}
const galleryVersions = z.object({ items: versionMap("gallery") }).strict();
const showreelVersions = z.object({ items: versionMap("showreel") }).strict();
const mutationFields = {
  operation: z.enum(["archive", "restore"]),
  expectedArchiveUpdatedAt: archiveTimestampSchema.optional(),
};
export const visualArchiveMutationSchema = z.discriminatedUnion("collection", [
  z.object({ ...mutationFields, collection: z.literal("gallery"), itemId: archiveIdSchema, expectedVersions: galleryVersions }).strict(),
  z.object({ ...mutationFields, collection: z.literal("showreel"), itemId: legacyId, expectedVersions: showreelVersions }).strict(),
]).superRefine((value, context) => {
  const versions = value.expectedVersions.items;
  if (!versions || typeof versions !== "object" || Array.isArray(versions)) return;
  const active = Object.hasOwn(versions, value.itemId);
  if (value.operation === "archive" && (!active || value.expectedArchiveUpdatedAt !== undefined)) {
    context.addIssue({ code: "custom", path: ["itemId"], message: "Choose a saved item from this collection." });
  }
  if (value.operation === "restore" && (active || !value.expectedArchiveUpdatedAt)) {
    context.addIssue({ code: "custom", path: ["expectedArchiveUpdatedAt"], message: "Reload the archive before restoring this item." });
  }
});

export type VisualArchivePage = ArchivePage & { activeLimit: number };
export type VisualArchiveData = { available: boolean; page: VisualArchivePage; message?: string };
export type VisualArchiveSnapshot = {
  collection: "gallery"; section: "frames"; payload: GalleryFramesDraft; versions: { items: Record<string, string> };
} | {
  collection: "showreel"; section: "works"; payload: ShowreelWorksDraft; versions: { items: Record<string, string> };
};
export type VisualArchiveMutationResult = {
  ok: boolean; message: string; reloadRequired?: boolean;
  collection?: VisualArchiveCollection; section?: "frames" | "works";
  canonicalSection?: unknown; versions?: unknown; archive?: VisualArchivePage;
};

export function parseVisualArchivePage(collection: unknown, value: unknown): VisualArchivePage | null {
  const target = visualArchiveCollectionSchema.safeParse(collection);
  if (!target.success) return null;
  const parsed = z.object({
    items: z.array(z.object({
      id: target.data === "gallery" ? archiveIdSchema : legacyId,
      label: z.string().max(220), platform: z.string().max(80),
      archivedAt: archiveTimestampSchema, updatedAt: archiveTimestampSchema,
    }).strict()).max(ARCHIVE_PAGE_SIZE),
    total: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER), offset: archiveOffsetSchema,
    activeLimit: target.data === "gallery" ? z.literal(VISUAL_ARCHIVE_BASE_LIMIT)
      : z.number().int().min(VISUAL_ARCHIVE_BASE_LIMIT).max(VISUAL_ARCHIVE_MAX_HISTORY),
  }).strict().safeParse(value);
  if (!parsed.success) return null;
  const page = parsed.data;
  if (new Set(page.items.map(item => item.id)).size !== page.items.length ||
    page.items.length !== Math.min(ARCHIVE_PAGE_SIZE, Math.max(0, page.total - page.offset))) return null;
  return page;
}

export function emptyVisualArchiveData(collection: VisualArchiveCollection): VisualArchiveData {
  return { available: false, page: { items: [], total: 0, offset: 0, activeLimit: VISUAL_ARCHIVE_BASE_LIMIT },
    message: `${collection === "gallery" ? "Gallery" : "Showreel"} archive needs migration 0044. Existing editing still works.` };
}

export function parseVisualArchiveSnapshot(collection: unknown, payload: unknown, versions: unknown): VisualArchiveSnapshot | null {
  const target = visualArchiveCollectionSchema.safeParse(collection);
  if (!target.success) return null;
  const saved = (target.data === "gallery" ? galleryVersions : showreelVersions).safeParse(versions);
  if (!saved.success) return null;
  function exact(items: { id: string }[]) {
    return saved.success && items.length === Object.keys(saved.data.items).length && items.every(item => Object.hasOwn(saved.data.items, item.id));
  }
  if (target.data === "gallery") {
    const parsed = parseGalleryArchivePayload(payload);
    return parsed && exact(parsed.items) ? { collection: "gallery", section: "frames", payload: parsed, versions: saved.data } : null;
  }
  const parsed = parseShowreelArchivePayload(payload);
  return parsed && exact(parsed.items) ? { collection: "showreel", section: "works", payload: parsed, versions: saved.data } : null;
}
