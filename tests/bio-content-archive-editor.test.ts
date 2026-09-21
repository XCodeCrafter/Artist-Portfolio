import { describe, expect, it } from "vitest";
import { bioArchiveMutationSchema, parseBioArchiveSnapshot, sameBioArchiveVersion } from "@/lib/admin/bio-content-archive-editor";
import { parseBioSectionSubmission } from "@/lib/admin/bio-editor";

const version = "2026-09-21T10:15:30.123456+00:00";
const archiveVersion = "2026-09-21T10:16:30.654321+00:00";
const portrait = { id: "portrait-1", src: "/images/portrait.webp", alt: "On stage", isPublished: true };
const paragraph = { id: "paragraph-1", body: "A musician and actor.", revealDelay: 100, isPublished: true };
const credit = { id: "credit-1", creditType: "film", title: "A film", role: "Lead", production: "Studio", director: "Director", year: "2026", href: "https://example.com/film", isPublished: true };
const biography = { topLabel: "Biography", introText: "About the artist", caption: "Portraits", galleryImages: [portrait], paragraphs: [paragraph] };
const bioVersions = { profileUpdatedAt: version, galleryItems: { [portrait.id]: version }, paragraphItems: { [paragraph.id]: version } };
const archiveInput = { collection: "portraits", operation: "archive", itemId: portrait.id, expectedVersions: bioVersions };
const restoreInput = { collection: "portraits", operation: "restore", itemId: portrait.id,
  expectedVersions: { ...bioVersions, galleryItems: {} }, expectedArchiveUpdatedAt: archiveVersion };

describe("Bio archive mutation parser", () => {
  it("preserves the complete biography CAS envelope and PostgreSQL microseconds", () => {
    expect(bioArchiveMutationSchema.parse(archiveInput)).toEqual(archiveInput);
    expect(bioArchiveMutationSchema.parse(restoreInput)).toEqual(restoreInput);
    const input = { ...archiveInput, collection: "paragraphs", itemId: paragraph.id };
    expect(bioArchiveMutationSchema.parse(input)).toEqual(input);
  });

  it("accepts credits without importing the biography version envelope", () => {
    const input = { collection: "credits", operation: "archive", itemId: credit.id, expectedVersions: { items: { [credit.id]: version } } };
    expect(bioArchiveMutationSchema.parse(input)).toEqual(input);
    expect(bioArchiveMutationSchema.parse({ ...input, operation: "restore", expectedVersions: { items: {} }, expectedArchiveUpdatedAt: archiveVersion })).toMatchObject({ collection: "credits" });
  });

  it.each([
    { ...archiveInput, collection: "biography" },
    { ...archiveInput, collection: "hero" },
    { ...archiveInput, collection: "bio_gallery_images" },
    { ...archiveInput, operation: "delete" },
    { ...archiveInput, actorId: "intruder" },
    { ...archiveInput, tableName: "media_assets" },
    { ...archiveInput, isPublished: true },
    { ...archiveInput, expectedArchiveUpdatedAt: archiveVersion },
    { ...archiveInput, expectedVersions: { ...bioVersions, galleryItems: {} } },
    { ...archiveInput, expectedVersions: { ...bioVersions, actorId: "intruder" } },
    { ...archiveInput, expectedVersions: { galleryItems: bioVersions.galleryItems, paragraphItems: bioVersions.paragraphItems } },
    { ...archiveInput, expectedVersions: { profileUpdatedAt: version, galleryItems: bioVersions.galleryItems } },
    { ...archiveInput, expectedVersions: { profileUpdatedAt: version, paragraphItems: bioVersions.paragraphItems } },
    { ...archiveInput, expectedVersions: { items: { [portrait.id]: version } } },
    { ...archiveInput, collection: "paragraphs" },
    { ...archiveInput, collection: "credits" },
    { ...restoreInput, expectedArchiveUpdatedAt: undefined },
    { ...restoreInput, expectedVersions: bioVersions },
    { ...archiveInput, itemId: "../bio_gallery_images" },
    { ...archiveInput, itemId: "x".repeat(161) },
  ])("rejects unsafe or incomplete lifecycle envelopes: %j", (input) => {
    expect(bioArchiveMutationSchema.safeParse(input).success).toBe(false);
  });

  it.each(["2026-02-30T10:15:30Z", "2026-09-21T24:00:00Z", "2026-09-21", "2026-09-21T10:15:30", "2026-09-21T10:15:30Z private", "2026-09-21T10:15:30.1234567Z"])("rejects malformed or normalized timestamps everywhere: %s", (badVersion) => {
    for (const expectedVersions of [
      { ...bioVersions, profileUpdatedAt: badVersion },
      { ...bioVersions, galleryItems: { [portrait.id]: badVersion } },
      { ...bioVersions, paragraphItems: { [paragraph.id]: badVersion } },
    ]) expect(bioArchiveMutationSchema.safeParse({ ...archiveInput, expectedVersions }).success).toBe(false);
    expect(bioArchiveMutationSchema.safeParse({ ...restoreInput, expectedArchiveUpdatedAt: badVersion }).success).toBe(false);
  });

  it.each([["portraits", "galleryItems", 32], ["paragraphs", "paragraphItems", 50], ["credits", "items", 100]] as const)("bounds %s %s to %d saved items", (collection, key, cap) => {
    const versions = (count: number) => ({ ...(collection === "credits" ? {} : bioVersions),
      [key]: Object.fromEntries(Array.from({ length: count }, (_, i) => [`item-${i}`, version])) });
    expect(bioArchiveMutationSchema.safeParse({ ...archiveInput, collection, itemId: "item-0", expectedVersions: versions(cap) }).success).toBe(true);
    expect(bioArchiveMutationSchema.safeParse({ ...archiveInput, collection, itemId: "item-0", expectedVersions: versions(cap + 1) }).success).toBe(false);
  });

  it.each(["galleryItems", "paragraphItems"] as const)("rejects raw prototype keys before parsing %s can discard them", (key) => {
    const map: unknown = JSON.parse(`{"${key === "galleryItems" ? portrait.id : paragraph.id}":"${version}","__proto__":"${version}"}`);
    expect(bioArchiveMutationSchema.safeParse({ ...archiveInput, expectedVersions: { ...bioVersions, [key]: map } }).success).toBe(false);
  });

  it("rejects inherited maps but permits ordinary null-prototype dictionaries", () => {
    const inherited = Object.assign(Object.create({ ghost: version }) as Record<string, string>, { [portrait.id]: version });
    expect(bioArchiveMutationSchema.safeParse({ ...archiveInput, expectedVersions: { ...bioVersions, galleryItems: inherited } }).success).toBe(false);
    const clean = Object.assign(Object.create(null) as Record<string, string>, { [portrait.id]: version });
    expect(bioArchiveMutationSchema.safeParse({ ...archiveInput, expectedVersions: { ...bioVersions, galleryItems: clean } }).success).toBe(true);
  });

  it("allows the same identity in distinct biography collections without confusing the target", () => {
    const input = { ...restoreInput, expectedVersions: { ...restoreInput.expectedVersions, paragraphItems: { [portrait.id]: version } } };
    expect(bioArchiveMutationSchema.safeParse(input).success).toBe(true);
  });

  it.each(["portraits", "paragraphs", "credits"] as const)("returns a validation failure instead of throwing for absent/null target maps in %s", (collection) => {
    const key = collection === "portraits" ? "galleryItems" : collection === "paragraphs" ? "paragraphItems" : "items";
    for (const map of [undefined, null, [], "invalid", 3]) {
      const input = { ...archiveInput, collection, expectedVersions: { ...(collection === "credits" ? {} : bioVersions), [key]: map } };
      expect(bioArchiveMutationSchema.safeParse(input).success).toBe(false);
    }
  });
});

describe("Bio archive profile version comparison", () => {
  it.each([
    [version, "2026-09-21T10:15:30.123456Z"],
    [version, "2026-09-21T12:15:30.123456+02:00"],
    ["2026-09-21T10:15:30.100000Z", "2026-09-21T10:15:30.1+00:00"],
    ["2026-09-21T10:15:30.000000Z", "2026-09-21T10:15:30Z"],
  ])("compares equivalent instants without demanding identical formatting: %s / %s", (left, right) => {
    expect(sameBioArchiveVersion(left, right)).toBe(true);
  });

  it.each(["2026-09-21T10:15:30.123455Z", "2026-09-21T10:15:30.123457Z", "2026-09-21T10:15:31.123456Z"])("does not truncate meaningful precision: %s", (changed) => {
    expect(sameBioArchiveVersion(version, changed)).toBe(false);
  });
});

describe("Bio archive canonical snapshot parser", () => {
  it.each(["portraits", "paragraphs"] as const)("returns the complete shared biography for %s", (collection) => {
    expect(parseBioArchiveSnapshot(collection, biography, bioVersions)).toEqual({ collection, section: "biography", payload: biography, versions: bioVersions });
  });

  it("returns only credits for the independent credits collection", () => {
    const payload = { items: [credit] };
    const versions = { items: { [credit.id]: version } };
    expect(parseBioArchiveSnapshot("credits", payload, versions)).toEqual({ collection: "credits", section: "credits", payload, versions });
  });

  it("preserves empty collections instead of resurrecting demo items", () => {
    const payload = { ...biography, galleryImages: [], paragraphs: [] };
    const versions = { profileUpdatedAt: version, galleryItems: {}, paragraphItems: {} };
    expect(parseBioArchiveSnapshot("portraits", payload, versions)).toEqual({ collection: "portraits", section: "biography", payload, versions });
    expect(parseBioArchiveSnapshot("credits", { items: [] }, { items: {} })).not.toBeNull();
  });

  it("permits a safe legacy portrait read without weakening managed-media save validation", () => {
    const payload = { ...biography, galleryImages: [{ ...portrait, src: "https://legacy.example.com/portrait.webp", isPublished: false }] };
    expect(parseBioArchiveSnapshot("portraits", payload, bioVersions)).toMatchObject({ payload });
    expect(parseBioSectionSubmission("biography", payload, bioVersions).success).toBe(false);
  });

  it.each([
    ["portraits", biography, { ...bioVersions, galleryItems: {} }],
    ["portraits", biography, { ...bioVersions, paragraphItems: {} }],
    ["portraits", biography, { ...bioVersions, paragraphItems: { ...bioVersions.paragraphItems, ghost: version } }],
    ["portraits", biography, { ...bioVersions, profileUpdatedAt: "2026-02-30T10:00:00Z" }],
    ["portraits", biography, { ...bioVersions, extra: "unsafe" }],
    ["portraits", { ...biography, galleryImages: [portrait, portrait] }, bioVersions],
    ["portraits", { ...biography, paragraphs: [paragraph, paragraph] }, bioVersions],
    ["portraits", { ...biography, galleryImages: [] }, bioVersions],
    ["paragraphs", { ...biography, paragraphs: [] }, bioVersions],
    ["paragraphs", { ...biography, paragraphs: [{ ...paragraph, revealDelay: -1 }] }, bioVersions],
    ["paragraphs", { ...biography, paragraphs: [{ ...paragraph, body: "" }] }, bioVersions],
    ["paragraphs", { ...biography, paragraphs: [{ ...paragraph, script: "injected" }] }, bioVersions],
    ["credits", { items: [credit] }, { items: {} }],
    ["credits", { items: [] }, { items: { [credit.id]: version } }],
    ["credits", { items: [credit, credit] }, { items: { [credit.id]: version } }],
    ["credits", { items: [credit] }, { ...bioVersions, items: { [credit.id]: version } }],
    ["credits", biography, bioVersions],
    ["portraits", { items: [credit] }, { items: { [credit.id]: version } }],
    ["hero", biography, bioVersions],
    ["bio_gallery_images", biography, bioVersions],
  ])("rejects incomplete, duplicated or cross-section snapshots: %j", (collection, payload, versions) => {
    expect(parseBioArchiveSnapshot(collection, payload, versions)).toBeNull();
  });

  it.each(["javascript:alert(1)", "data:image/svg+xml,<svg onload='alert(1)'/>", "https://name:password@example.com/image.webp", "//external.example.com/image.webp", "http://insecure.example.com/portrait.webp"])("rejects unsafe portrait sources: %s", (src) => {
    expect(parseBioArchiveSnapshot("portraits", { ...biography, galleryImages: [{ ...portrait, src }] }, bioVersions)).toBeNull();
  });

  it.each(["javascript:alert(1)", "https://name:password@example.com/film", "//external.example.com/film"])("rejects unsafe credit URLs: %s", (href) => {
    expect(parseBioArchiveSnapshot("credits", { items: [{ ...credit, href }] }, { items: { [credit.id]: version } })).toBeNull();
  });

  it.each(["galleryItems", "paragraphItems"] as const)("rejects raw prototype version keys in canonical %s", (key) => {
    const map: unknown = JSON.parse(`{"${key === "galleryItems" ? portrait.id : paragraph.id}":"${version}","__proto__":"${version}"}`);
    expect(parseBioArchiveSnapshot("portraits", biography, { ...bioVersions, [key]: map })).toBeNull();
  });

  it.each([["portraits", 33], ["paragraphs", 51], ["credits", 101]] as const)("rejects oversized canonical %s snapshots", (collection, count) => {
    const items = Array.from({ length: count }, (_, i) => ({ ...(collection === "portraits" ? portrait : collection === "paragraphs" ? paragraph : credit), id: `item-${i}` }));
    const map = Object.fromEntries(items.map((item) => [item.id, version]));
    const payload = collection === "credits" ? { items } : { ...biography, [collection === "portraits" ? "galleryImages" : "paragraphs"]: items };
    const versions = collection === "credits" ? { items: map } : { ...bioVersions, [collection === "portraits" ? "galleryItems" : "paragraphItems"]: map };
    expect(parseBioArchiveSnapshot(collection, payload, versions)).toBeNull();
  });
});
