import { z } from "zod";
import type { NavbarSocialLinksSnapshot } from "./navbar-social-links-editor";

export const ARCHIVE_PAGE_SIZE = 20;
export const archiveIdSchema = z.string().min(1).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
export const archiveTimestampSchema = z.string().max(64).regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/)
  .refine((value) => {
    const [year, month, day] = value.slice(0, 10).split("-").map(Number);
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return Number.isFinite(Date.parse(value)) && year >= 1 && month >= 1 && month <= 12 &&
      day >= 1 && day <= days[month - 1] && Number(value.slice(11, 13)) < 24;
  });
export const archiveOffsetSchema = z.number().int().min(0).max(1_000_000).multipleOf(ARCHIVE_PAGE_SIZE);
const id = archiveIdSchema;
const timestamp = archiveTimestampSchema;
// Check raw keys before z.record can discard a dangerous __proto__ key.
export function createArchiveVersionMapSchema(limit: number) {
  return z.unknown().refine((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    if (![Object.prototype, null].includes(Object.getPrototypeOf(value))) return false;
    const keys = Object.keys(value);
    return keys.length <= limit && keys.every((key) => id.safeParse(key).success);
  }).pipe(z.record(id, timestamp));
}
const versions = createArchiveVersionMapSchema(16);

export const archiveMutationSchema = z.object({
  operation: z.enum(["archive", "restore"]),
  itemId: id,
  expectedVersions: versions,
  expectedArchiveUpdatedAt: timestamp.optional(),
}).strict().superRefine((value, context) => {
  if (!value.expectedVersions || typeof value.expectedVersions !== "object" || Array.isArray(value.expectedVersions)) return;
  const inActiveSet = Object.hasOwn(value.expectedVersions, value.itemId);
  if (value.operation === "archive" && (!inActiveSet || value.expectedArchiveUpdatedAt !== undefined)) {
    context.addIssue({ code: "custom", path: ["itemId"], message: "Choose a saved shortcut from the current collection." });
  }
  if (value.operation === "restore" && (inActiveSet || !value.expectedArchiveUpdatedAt)) {
    context.addIssue({ code: "custom", path: ["expectedArchiveUpdatedAt"], message: "Reload the archive before restoring this shortcut." });
  }
});

const archiveItemSchema = z.object({
  id, label: z.string().max(220), platform: z.string().max(80), archivedAt: timestamp, updatedAt: timestamp,
}).strict();
const archivePageSchema = z.object({
  items: z.array(archiveItemSchema).max(ARCHIVE_PAGE_SIZE),
  total: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  offset: archiveOffsetSchema,
}).strict().refine((page) => new Set(page.items.map((item) => item.id)).size === page.items.length &&
  page.items.length === Math.min(ARCHIVE_PAGE_SIZE, Math.max(0, page.total - page.offset)));

export type ArchiveItem = z.infer<typeof archiveItemSchema>;
export type ArchivePage = z.infer<typeof archivePageSchema>;
export type ArchiveData = { page: ArchivePage; available: boolean; message?: string };
export type ArchiveMutationResult = {
  ok: boolean; message: string; reloadRequired?: boolean;
  snapshot?: NavbarSocialLinksSnapshot; archive?: ArchivePage;
};

export function parseArchivePage(value: unknown): ArchivePage | null {
  const parsed = archivePageSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function emptyArchivePage(): ArchivePage {
  return { items: [], total: 0, offset: 0 };
}
