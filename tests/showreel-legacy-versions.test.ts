import { describe, expect, it } from "vitest";
import { parseShowreelSectionSubmission, type ShowreelEditorVersions } from "@/lib/admin/showreel-editor";

const savedAt = "2026-09-21T10:15:30.123456+00:00";
const work = {
  id: "__proto__", title: "Restored reel", description: "A historical video.",
  embedUrl: "https://www.youtube.com/watch?v=abcdefghijk", platform: "youtube",
  thumbnailSrc: "/images/showreel-thumb.jpg", videoType: "showreel",
  isFeatured: false, isPublished: false,
};
const savedVersions = (id = work.id) => ({ items: Object.fromEntries([[id, savedAt]]) });

describe("Showreel ordinary-save legacy version-map regression", () => {
  it.each([
    ["__proto__", false], ["__proto__", true],
    ["constructor", false], ["constructor", true],
    ["prototype", false], ["prototype", true],
  ] as const)("preserves own saved identity %s while published=%s in submissions and confirmations", (id, isPublished) => {
    const versions = savedVersions(id);
    for (const requireExactCollectionVersions of [false, true]) {
      const result = parseShowreelSectionSubmission("works", { items: [{ ...work, id, isPublished }] }, versions, { requireExactCollectionVersions });
      expect(result.success).toBe(true);
      if (!result.success) throw new Error("A saved historical identity must remain editable.");
      const returned = result.data.versions as ShowreelEditorVersions["works"];
      expect(Object.keys(returned.items)).toEqual([id]);
      expect(Object.hasOwn(returned.items, id)).toBe(true);
      expect(returned.items[id]).toBe(savedAt);
      expect(Object.getPrototypeOf(returned.items)).toBe(Object.prototype);
    }
  });

  it("retains an own __proto__ key received through a real JSON roundtrip", () => {
    const versions: unknown = JSON.parse(JSON.stringify(savedVersions()));
    expect(parseShowreelSectionSubmission("works", { items: [work] }, versions, { requireExactCollectionVersions: true }).success).toBe(true);
    expect(Object.getPrototypeOf({})).toBe(Object.prototype);
  });

  it.each(["__proto__", "legacy / video", "Živě 2020"])("continues rejecting a newly invented unsaved legacy-only identity: %s", (id) => {
    expect(parseShowreelSectionSubmission("works", { items: [{ ...work, id }] }, { items: {} }).success).toBe(false);
  });

  it.each(["constructor", "prototype"])("does not unnecessarily ban valid new strict identifiers: %s", (id) => {
    expect(parseShowreelSectionSubmission("works", { items: [{ ...work, id }] }, { items: {} }).success).toBe(true);
  });

  it.each([undefined, null, [], "invalid", 3])("rejects malformed version dictionaries without throwing: %s", (items) => {
    expect(parseShowreelSectionSubmission("works", { items: [work] }, { items }).success).toBe(false);
  });

  it("rejects an inherited version map even if it also has an own legacy identity", () => {
    const items = Object.create({ ghost: savedAt }) as Record<string, string>;
    Object.defineProperty(items, work.id, { value: savedAt, enumerable: true });
    expect(parseShowreelSectionSubmission("works", { items: [work] }, { items }).success).toBe(false);
  });

  it("accepts a null-prototype dictionary and normalizes its own data keys safely", () => {
    const items = Object.assign(Object.create(null) as Record<string, string>, savedVersions().items);
    const result = parseShowreelSectionSubmission("works", { items: [work] }, { items }, { requireExactCollectionVersions: true });
    expect(result.success).toBe(true);
    if (!result.success) throw new Error("Own null-prototype data keys must remain editable.");
    expect(Object.hasOwn((result.data.versions as ShowreelEditorVersions["works"]).items, work.id)).toBe(true);
  });

  it.each(["", "invalid", "2026-13-21T10:15:30Z", "x".repeat(65)])("keeps timestamp validation for own legacy keys: %j", (invalidVersion) => {
    const versions = { items: Object.fromEntries([[work.id, invalidVersion]]) };
    expect(parseShowreelSectionSubmission("works", { items: [work] }, versions).success).toBe(false);
  });

  it.each(["", "blank\u0000key", "x".repeat(513)])("keeps saved-identity validation for malformed keys: %j", (id) => {
    expect(parseShowreelSectionSubmission("works", { items: [{ ...work, id }] }, savedVersions(id)).success).toBe(false);
  });

  it.each([
    { embedUrl: "javascript:alert(1)" },
    { embedUrl: "https://unapproved.example.com/film.mp4" },
    { thumbnailSrc: "https://unmanaged.example.com/thumbnail.jpg" },
  ])("does not weaken published-media validation when retaining a legacy identity: %j", (unsafeFields) => {
    expect(parseShowreelSectionSubmission("works", { items: [{ ...work, ...unsafeFields, isPublished: true }] }, savedVersions()).success).toBe(false);
  });

  it("still permits editing a hidden broken legacy source without publishing it", () => {
    const hidden = { ...work, embedUrl: "historically broken source", thumbnailSrc: "not a URL" };
    expect(parseShowreelSectionSubmission("works", { items: [hidden] }, savedVersions(), { requireExactCollectionVersions: true }).success).toBe(true);
  });

  it("does not let retaining __proto__ bypass omitted-saved-item checks", () => {
    const versions = { items: Object.fromEntries([[work.id, savedAt], ["saved-survivor", savedAt]]) };
    expect(parseShowreelSectionSubmission("works", { items: [work] }, versions).success).toBe(false);
  });

  it("keeps exact confirmation parity when additional submitted identities lack versions", () => {
    const items = [work, { ...work, id: "new-valid-id" }];
    expect(parseShowreelSectionSubmission("works", { items }, savedVersions()).success).toBe(true);
    expect(parseShowreelSectionSubmission("works", { items }, savedVersions(), { requireExactCollectionVersions: true }).success).toBe(false);
  });
});
