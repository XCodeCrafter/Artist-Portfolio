import { z } from "zod";
import {
  archiveIdSchema, archiveTimestampSchema, createArchiveVersionMapSchema,
  type ArchiveData, type ArchivePage,
} from "./content-archive-editor";
import {
  parseMusicCollectionSnapshotPayload,
  type MusicPlatformsDraft, type MusicSoundcloudDraft, type MusicSectionVersions,
} from "./music-editor";

export const musicArchiveSectionSchema = z.enum(["platforms", "soundcloud"]);
export type MusicArchiveSection = z.infer<typeof musicArchiveSectionSchema>;
export type MusicArchiveData = Record<MusicArchiveSection, ArchiveData>;
export const MUSIC_ARCHIVE_LIMITS = { platforms: 32, soundcloud: 48 } as const;

const platformsVersions = z.object({ items: createArchiveVersionMapSchema(32) }).strict();
const soundcloudVersions = z.object({
  items: createArchiveVersionMapSchema(48), presentationUpdatedAt: archiveTimestampSchema,
}).strict();
const mutationFields = {
  operation: z.enum(["archive", "restore"]), itemId: archiveIdSchema,
  expectedArchiveUpdatedAt: archiveTimestampSchema.optional(),
};
export const musicArchiveMutationSchema = z.discriminatedUnion("section", [
  z.object({ ...mutationFields, section: z.literal("platforms"), expectedVersions: platformsVersions }).strict(),
  z.object({ ...mutationFields, section: z.literal("soundcloud"), expectedVersions: soundcloudVersions }).strict(),
]).superRefine((value, context) => {
  if (!value.expectedVersions.items || typeof value.expectedVersions.items !== "object" || Array.isArray(value.expectedVersions.items)) return;
  const active = Object.hasOwn(value.expectedVersions.items, value.itemId);
  if (value.operation === "archive" && (!active || value.expectedArchiveUpdatedAt !== undefined)) {
    context.addIssue({ code: "custom", path: ["itemId"], message: "Choose a saved item from this collection." });
  }
  if (value.operation === "restore" && (active || !value.expectedArchiveUpdatedAt)) {
    context.addIssue({ code: "custom", path: ["expectedArchiveUpdatedAt"], message: "Reload the archive before restoring this item." });
  }
});

export type MusicArchiveSnapshot = {
  section: "platforms"; payload: MusicPlatformsDraft; versions: MusicSectionVersions["platforms"];
} | {
  section: "soundcloud"; payload: MusicSoundcloudDraft; versions: MusicSectionVersions["soundcloud"];
};
export type MusicArchiveMutationResult = {
  ok: boolean; message: string; reloadRequired?: boolean; section?: MusicArchiveSection;
  canonicalSection?: unknown; versions?: unknown; archive?: ArchivePage;
};

export function parseMusicArchiveSnapshot(section: unknown, payload: unknown, versions: unknown): MusicArchiveSnapshot | null {
  const parsedSection = musicArchiveSectionSchema.safeParse(section);
  if (!parsedSection.success) return null;
  const target = parsedSection.data;
  const parsedPayload = parseMusicCollectionSnapshotPayload(target, payload);
  const parsedVersions = (target === "platforms" ? platformsVersions : soundcloudVersions).safeParse(versions);
  if (!parsedPayload || !parsedVersions.success) return null;
  const items = parsedVersions.data.items;
  if (parsedPayload.items.length !== Object.keys(items).length ||
    parsedPayload.items.some((item) => !Object.hasOwn(items, item.id))) return null;
  return { section: target, payload: parsedPayload, versions: parsedVersions.data } as MusicArchiveSnapshot;
}
