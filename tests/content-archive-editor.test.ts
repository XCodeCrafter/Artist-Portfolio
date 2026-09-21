import { describe, expect, it } from "vitest";
import {
  archiveMutationSchema,
  parseArchivePage,
} from "@/lib/admin/content-archive-editor";

const version = "2026-09-21T10:15:30.123456+00:00";
const archivedVersion = "2026-09-21T10:16:30.654321+00:00";
const item = {
  id: "spotify.artist-1",
  label: "Spotify artist",
  platform: "spotify",
  archivedAt: archivedVersion,
  updatedAt: archivedVersion,
};
const archiveInput = {
  operation: "archive",
  itemId: item.id,
  expectedVersions: { [item.id]: version },
};
const restoreInput = {
  operation: "restore",
  itemId: item.id,
  expectedVersions: {},
  expectedArchiveUpdatedAt: archivedVersion,
};

describe("Content archive snapshot parser", () => {
  it("retains exact database versions instead of rounding PostgreSQL microseconds", () => {
    expect(parseArchivePage({ items: [item], total: 1, offset: 0 })).toEqual({
      items: [item], total: 1, offset: 0,
    });
  });

  it("accepts empty archives and bounded later pages", () => {
    expect(parseArchivePage({ items: [], total: 0, offset: 0 })).toEqual({
      items: [], total: 0, offset: 0,
    });
    expect(parseArchivePage({ items: [item], total: 21, offset: 20 })).not.toBeNull();
  });

  it.each([null, [], {}, { items: [], total: "0", offset: 0 },
    { items: [], total: -1, offset: 0 }, { items: [], total: 0.5, offset: 0 },
    { items: [], total: 0, offset: -20 }, { items: [], total: 0, offset: 1 },
    { items: [], total: 0, offset: 20.5 },
    { items: [], total: 0, offset: 1_000_020 },
  ])("rejects malformed or unbounded page metadata: %j", (value) => {
    expect(parseArchivePage(value)).toBeNull();
  });

  it("rejects oversized pages, duplicate identities, and contradictory totals", () => {
    const oversized = Array.from({ length: 21 }, (_, index) => ({ ...item, id: `item-${index}` }));
    expect(parseArchivePage({ items: oversized, total: 21, offset: 0 })).toBeNull();
    expect(parseArchivePage({ items: [item, item], total: 2, offset: 0 })).toBeNull();
    expect(parseArchivePage({ items: [item], total: 0, offset: 0 })).toBeNull();
  });

  it.each([
    { ...item, id: "../another-table" },
    { ...item, id: "x".repeat(161) },
    { ...item, archivedAt: "yesterday" },
    { ...item, archivedAt: "2026-02-30T10:16:30Z" },
    { ...item, updatedAt: "2026-09-21" },
    { ...item, updatedAt: "2026-09-21T10:16:30" },
    { ...item, updatedAt: "2026-09-21T25:16:30Z" },
    { ...item, updatedAt: "2026-09-21T10:16:30Z extra" },
  ])("rejects unsafe row identity or a noncanonical version: %j", (row) => {
    expect(parseArchivePage({ items: [row], total: 1, offset: 0 })).toBeNull();
  });
});

describe("Content archive mutation payload", () => {
  it.each([undefined, null, [], false, "invalid", 42])("rejects malformed CAS maps without throwing: %j", (expectedVersions) => {
    expect(archiveMutationSchema.safeParse({ ...archiveInput, expectedVersions }).success).toBe(false);
  });

  it("accepts archive with its active CAS version and restore with its archive CAS version", () => {
    expect(archiveMutationSchema.parse(archiveInput)).toEqual(archiveInput);
    expect(archiveMutationSchema.parse(restoreInput)).toEqual(restoreInput);
  });

  it("keeps exact versions for every active item and the archived record", () => {
    const input = { ...restoreInput, expectedVersions: { youtube: version } };
    expect(archiveMutationSchema.parse(input)).toEqual(input);
  });

  it.each([
    { ...archiveInput, operation: "delete" },
    { ...archiveInput, actorId: "different-admin" },
    { ...archiveInput, isPublished: true },
    { ...archiveInput, tableName: "media_assets" },
    { ...archiveInput, expectedVersions: {} },
    { ...archiveInput, expectedArchiveUpdatedAt: archivedVersion },
    { ...restoreInput, expectedArchiveUpdatedAt: undefined },
    { ...restoreInput, expectedVersions: { [item.id]: version } },
    { ...archiveInput, itemId: "../media" },
    { ...archiveInput, itemId: "x".repeat(161) },
    { ...archiveInput, expectedVersions: { [item.id]: "2026-09-21" } },
    { ...restoreInput, expectedArchiveUpdatedAt: "2026-02-30T10:16:30Z" },
  ])("rejects unsafe, stale-shape, or caller-controlled fields: %j", (input) => {
    expect(archiveMutationSchema.safeParse(input).success).toBe(false);
  });

  it("bounds CAS maps to the active navbar capacity", () => {
    const expectedVersions = Object.fromEntries(Array.from({ length: 17 }, (_, i) => [`item-${i}`, version]));
    expect(archiveMutationSchema.safeParse({ ...archiveInput, itemId: "item-0", expectedVersions }).success).toBe(false);
  });

  it("rejects prototype-like untrusted version keys", () => {
    const expectedVersions: unknown = JSON.parse(`{"${item.id}":"${version}","__proto__":"${version}"}`);
    expect(archiveMutationSchema.safeParse({ ...archiveInput, expectedVersions }).success).toBe(false);
  });
});
