import { describe, expect, it } from "vitest";
import {
  emptyVisualArchiveData, parseVisualArchivePage, parseVisualArchiveSnapshot,
  visualArchiveMutationSchema,
} from "@/lib/admin/visual-content-archive-editor";
import { parseGallerySectionSubmission } from "@/lib/admin/gallery-editor";
import { parseShowreelSectionSubmission } from "@/lib/admin/showreel-editor";

const version = "2026-09-21T10:15:30.123456+00:00";
const archiveVersion = "2026-09-21T10:16:30.654321+00:00";
const frame = { id: "frame-1", title: "On stage", src: "/images/stage.webp", alt: "Live set", caption: "At the club", category: "music", isMosaic: true, isPublished: true };
const work = { id: "legacy / Živě 01", title: "Live set", description: "Showreel", embedUrl: "https://www.youtube.com/watch?v=abc123", platform: "youtube", thumbnailSrc: "/images/stage.webp", videoType: "showreel", isFeatured: false, isPublished: true };
const archivedItem = { id: frame.id, label: frame.title, platform: "gallery", archivedAt: archiveVersion, updatedAt: archiveVersion };
const page = { items: [archivedItem], total: 1, offset: 0, activeLimit: 120 };
const archiveInput = { collection: "gallery", operation: "archive", itemId: frame.id, expectedVersions: { items: { [frame.id]: version } } };
const restoreInput = { collection: "gallery", operation: "restore", itemId: frame.id, expectedVersions: { items: {} }, expectedArchiveUpdatedAt: archiveVersion };

describe("Visual archive lifecycle envelope", () => {
  it("accepts exact Gallery archive and restore envelopes without truncating microseconds", () => {
    expect(visualArchiveMutationSchema.parse(archiveInput)).toEqual(archiveInput);
    expect(visualArchiveMutationSchema.parse(restoreInput)).toEqual(restoreInput);
  });

  it.each(["legacy / Živě 01", "2020 concert.mp4", "folder/video", "漢字作品", "x".repeat(512), "__proto__", "constructor", "prototype"])("preserves valid legacy Showreel identities byte for byte: %s", (itemId) => {
    const input = { ...archiveInput, collection: "showreel", itemId, expectedVersions: { items: Object.fromEntries([[itemId, version]]) } };
    expect(visualArchiveMutationSchema.parse(input)).toEqual(input);
    expect(Object.hasOwn(visualArchiveMutationSchema.parse(input).expectedVersions.items, itemId)).toBe(true);
    expect(visualArchiveMutationSchema.parse({ ...restoreInput, collection: "showreel", itemId }).itemId).toBe(itemId);
  });

  it.each([
    { ...archiveInput, collection: "frames" },
    { ...archiveInput, collection: "videos" },
    { ...archiveInput, operation: "delete" },
    { ...archiveInput, actorId: "untrusted" },
    { ...archiveInput, tableName: "media_assets" },
    { ...archiveInput, isFeatured: true },
    { ...archiveInput, expectedArchiveUpdatedAt: archiveVersion },
    { ...archiveInput, expectedVersions: { items: {} } },
    { ...archiveInput, expectedVersions: { ...archiveInput.expectedVersions, updatedAt: version } },
    { ...restoreInput, expectedArchiveUpdatedAt: undefined },
    { ...restoreInput, expectedVersions: archiveInput.expectedVersions },
    { ...archiveInput, itemId: "../gallery" },
    { ...archiveInput, itemId: "x".repeat(161) },
  ])("rejects unsupported collection, caller-controlled metadata or invalid lifecycle shape: %j", (input) => {
    expect(visualArchiveMutationSchema.safeParse(input).success).toBe(false);
  });

  it.each(["", " ", "\n", "legacy\u0000id", "legacy\u007fid", "x".repeat(513)])("rejects invalid legacy Showreel identities: %j", (itemId) => {
    const input = { ...archiveInput, collection: "showreel", itemId, expectedVersions: { items: { [itemId]: version } } };
    expect(visualArchiveMutationSchema.safeParse(input).success).toBe(false);
  });

  it.each(["gallery", "showreel"] as const)("rejects missing/null/malformed CAS maps without throwing for %s", (collection) => {
    for (const items of [undefined, null, [], "invalid", 3]) {
      expect(visualArchiveMutationSchema.safeParse({ ...archiveInput, collection, expectedVersions: { items } }).success).toBe(false);
    }
  });

  it.each(["2026-02-30T10:15:30Z", "2026-09-21T24:00:00Z", "2026-09-21", "2026-09-21T10:15:30", "2026-09-21T10:15:30.1234567Z"])("rejects invalid saved or archive timestamps: %s", (badVersion) => {
    for (const collection of ["gallery", "showreel"]) {
      expect(visualArchiveMutationSchema.safeParse({ ...archiveInput, collection, expectedVersions: { items: { [frame.id]: badVersion } } }).success).toBe(false);
      expect(visualArchiveMutationSchema.safeParse({ ...restoreInput, collection, expectedArchiveUpdatedAt: badVersion }).success).toBe(false);
    }
  });

  it.each([["gallery", 120], ["showreel", 10_000]] as const)("bounds %s CAS maps to %d items", (collection, limit) => {
    const versions = (count: number) => ({ items: Object.fromEntries(Array.from({ length: count }, (_, i) => [`item-${i}`, version])) });
    expect(visualArchiveMutationSchema.safeParse({ ...archiveInput, collection, itemId: "item-0", expectedVersions: versions(limit) }).success).toBe(true);
    expect(visualArchiveMutationSchema.safeParse({ ...archiveInput, collection, itemId: "item-0", expectedVersions: versions(limit + 1) }).success).toBe(false);
  });

  it("permits recovery of historical Showreel catalogs larger than 120 records", () => {
    const items = Object.fromEntries(Array.from({ length: 121 }, (_, i) => [`legacy / ${i}`, version]));
    expect(visualArchiveMutationSchema.safeParse({ ...archiveInput, collection: "showreel", itemId: "legacy / 0", expectedVersions: { items } }).success).toBe(true);
  });

  it("preserves Showreel's own raw prototype CAS keys without prototype pollution", () => {
    const items: unknown = JSON.parse(`{"${frame.id}":"${version}","__proto__":"${version}"}`);
    const parsed = visualArchiveMutationSchema.parse({ ...archiveInput, collection: "showreel", expectedVersions: { items } });
    expect(Object.hasOwn(parsed.expectedVersions.items, "__proto__")).toBe(true);
    expect(parsed.expectedVersions.items["__proto__"]).toBe(version);
    expect(Object.getPrototypeOf(parsed.expectedVersions.items)).toBe(Object.prototype);
    expect(visualArchiveMutationSchema.safeParse({ ...archiveInput, expectedVersions: { items } }).success).toBe(false);
  });

  it.each(["gallery", "showreel"] as const)("rejects inherited dictionaries but accepts null-prototype maps for %s", (collection) => {
    const inherited = Object.assign(Object.create({ ghost: version }) as Record<string, string>, { [frame.id]: version });
    expect(visualArchiveMutationSchema.safeParse({ ...archiveInput, collection, expectedVersions: { items: inherited } }).success).toBe(false);
    const clean = Object.assign(Object.create(null) as Record<string, string>, { [frame.id]: version });
    expect(visualArchiveMutationSchema.safeParse({ ...archiveInput, collection, expectedVersions: { items: clean } }).success).toBe(true);
  });
});

describe("Visual archive canonical snapshots", () => {
  it.each([["gallery", "frames", frame], ["showreel", "works", work]] as const)("parses %s with exact identities and versions", (collection, section, item) => {
    const payload = { items: [item] };
    const versions = { items: { [item.id]: version } };
    expect(parseVisualArchiveSnapshot(collection, payload, versions)).toEqual({ collection, section, payload, versions });
  });

  it.each([["gallery", "frames"], ["showreel", "works"]] as const)("keeps an empty %s collection genuinely empty", (collection, section) => {
    expect(parseVisualArchiveSnapshot(collection, { items: [] }, { items: {} })).toEqual({ collection, section, payload: { items: [] }, versions: { items: {} } });
  });

  it("permits safe legacy Gallery URLs for reads without weakening managed-media writes", () => {
    const payload = { items: [{ ...frame, src: "https://legacy.example.com/photo.webp" }] };
    expect(parseVisualArchiveSnapshot("gallery", payload, archiveInput.expectedVersions)).toMatchObject({ payload });
    expect(parseGallerySectionSubmission("frames", payload, archiveInput.expectedVersions).success).toBe(false);
  });

  it("preserves broken historical Showreel sources as data so the user can recover or repair them", () => {
    const payload = { items: [{ ...work, embedUrl: "javascript:legacyBrokenSource()", thumbnailSrc: "not a valid image URL" }] };
    const versions = { items: { [work.id]: version } };
    expect(parseVisualArchiveSnapshot("showreel", payload, versions)).toMatchObject({ payload });
    expect(parseShowreelSectionSubmission("works", payload, versions).success).toBe(false);
  });

  it.each([["gallery", frame], ["showreel", work]] as const)("rejects malformed or mismatched canonical data for %s", (collection, item) => {
    for (const [payload, versions] of [
      [{ items: [item] }, { items: {} }],
      [{ items: [] }, { items: { [item.id]: version } }],
      [{ items: [item, item] }, { items: { [item.id]: version } }],
      [{ items: [item] }, { items: { [item.id]: version, ghost: version } }],
      [{ items: [{ ...item, isPublished: "false" }] }, { items: { [item.id]: version } }],
      [{ items: [{ ...item, unknown: "extra" }] }, { items: { [item.id]: version } }],
      [{ items: [item], otherSection: {} }, { items: { [item.id]: version } }],
      [{ items: [item] }, { items: { [item.id]: "2026-02-30T10:00:00Z" } }],
      [{ items: [item] }, { items: { [item.id]: version }, extra: true }],
    ]) expect(parseVisualArchiveSnapshot(collection, payload, versions)).toBeNull();
  });

  it.each(["javascript:alert(1)", "data:image/svg+xml,<svg/>", "https://name:password@example.com/image.webp", "//external.example.com/image.webp", "http://insecure.example.com/image.webp"])("rejects unsafe Gallery canonical sources: %s", (src) => {
    expect(parseVisualArchiveSnapshot("gallery", { items: [{ ...frame, src }] }, archiveInput.expectedVersions)).toBeNull();
  });

  it("does not splice Gallery and Showreel payloads or accept unsupported collections", () => {
    expect(parseVisualArchiveSnapshot("gallery", { items: [work] }, { items: { [work.id]: version } })).toBeNull();
    expect(parseVisualArchiveSnapshot("showreel", { items: [frame] }, archiveInput.expectedVersions)).toBeNull();
    expect(parseVisualArchiveSnapshot("videos", { items: [] }, { items: {} })).toBeNull();
  });

  it.each(["__proto__", "constructor", "prototype"])("retains own historical Showreel keys in canonical snapshots: %s", (id) => {
    const payload = { items: [{ ...work, id }] };
    const versions = { items: Object.fromEntries([[id, version]]) };
    const parsed = parseVisualArchiveSnapshot("showreel", payload, versions);
    expect(parsed).toMatchObject({ payload, versions });
    expect(Object.hasOwn(parsed!.versions.items, id)).toBe(true);
    expect(parsed!.versions.items[id]).toBe(version);
  });

  it("accepts 121 historical Showreel entries but does not expand Gallery beyond 120", () => {
    const works = Array.from({ length: 121 }, (_, i) => ({ ...work, id: `legacy / ${i}` }));
    const frames = works.map((_, i) => ({ ...frame, id: `frame-${i}` }));
    expect(parseVisualArchiveSnapshot("showreel", { items: works }, { items: Object.fromEntries(works.map((item) => [item.id, version])) })).not.toBeNull();
    expect(parseVisualArchiveSnapshot("gallery", { items: frames }, { items: Object.fromEntries(frames.map((item) => [item.id, version])) })).toBeNull();
  });

  it("rejects Showreel snapshots above the explicit safety ceiling", () => {
    const items = Array.from({ length: 10_001 }, (_, i) => ({ ...work, id: `legacy / ${i}` }));
    expect(parseVisualArchiveSnapshot("showreel", { items }, { items: Object.fromEntries(items.map((item) => [item.id, version])) })).toBeNull();
  });
});

describe("Visual archive page metadata", () => {
  it("parses Gallery's fixed active capacity and Showreel's historical capacity", () => {
    expect(parseVisualArchivePage("gallery", page)).toEqual(page);
    const historical = { ...page, items: [{ ...archivedItem, id: work.id }], activeLimit: 143 };
    expect(parseVisualArchivePage("showreel", historical)).toEqual(historical);
  });

  it.each([119, 121, 10_000])("rejects Gallery capacity other than 120: %d", (activeLimit) => {
    expect(parseVisualArchivePage("gallery", { ...page, activeLimit })).toBeNull();
  });

  it.each([undefined, null, 0, 119, 120.5, 10_001, Number.NaN])("rejects invalid Showreel capacity: %s", (activeLimit) => {
    expect(parseVisualArchivePage("showreel", { ...page, activeLimit })).toBeNull();
  });

  it.each(["gallery", "showreel"] as const)("enforces exact bounded page membership and timestamps for %s", (collection) => {
    for (const value of [
      null, {}, { ...page, total: 2 }, { ...page, offset: 1 }, { ...page, offset: -20 },
      { ...page, offset: 1_000_020 }, { ...page, items: [archivedItem, archivedItem], total: 2 },
      { ...page, items: [{ ...archivedItem, updatedAt: "invalid" }] },
      { ...page, items: [{ ...archivedItem, label: "x".repeat(221) }] },
      { ...page, items: [{ ...archivedItem, privateUrl: "https://secret.example" }] },
      { ...page, items: Array.from({ length: 21 }, (_, i) => ({ ...archivedItem, id: `item-${i}` })), total: 21 },
    ]) expect(parseVisualArchivePage(collection, value)).toBeNull();
    expect(parseVisualArchivePage(collection, { ...page, total: 21, offset: 20 })).not.toBeNull();
    expect(parseVisualArchivePage(collection, { ...page, items: [], total: 0 })).not.toBeNull();
  });

  it("uses collection-specific legacy ID validation in archived summaries", () => {
    const historical = { ...page, items: [{ ...archivedItem, id: work.id }] };
    expect(parseVisualArchivePage("showreel", historical)).not.toBeNull();
    expect(parseVisualArchivePage("gallery", historical)).toBeNull();
    expect(parseVisualArchivePage("not-real", page)).toBeNull();
  });

  it.each(["gallery", "showreel"] as const)("initializes %s as unavailable, never as a fabricated healthy archive", (collection) => {
    expect(emptyVisualArchiveData(collection)).toMatchObject({ available: false, page: { items: [], total: 0, offset: 0, activeLimit: 120 } });
  });
});
