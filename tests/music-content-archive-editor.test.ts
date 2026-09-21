import { describe, expect, it } from "vitest";
import { musicArchiveMutationSchema, parseMusicArchiveSnapshot } from "@/lib/admin/music-content-archive-editor";
import { parseMusicSectionSubmission } from "@/lib/admin/music-editor";

const version = "2026-09-21T10:15:30.123456+00:00";
const archiveVersion = "2026-09-21T10:16:30.654321+00:00";
const platform = {
  id: "spotify.artist-1", title: "Spotify artist", label: "Listen now",
  href: "https://open.spotify.com/artist/artist-1", imageSrc: "/images/spotify.webp",
  iconKey: "spotify", isPublished: true,
};
const track = { id: "mix-1", title: "Live set", embedUrl: "https://soundcloud.com/artist/live-set", isPublished: true };
const archiveInput = {
  section: "platforms", operation: "archive", itemId: platform.id,
  expectedVersions: { items: { [platform.id]: version } },
};
const restoreInput = {
  section: "platforms", operation: "restore", itemId: platform.id,
  expectedVersions: { items: {} }, expectedArchiveUpdatedAt: archiveVersion,
};

describe("Music archive mutation parser", () => {
  it.each([undefined, null, [], false, "invalid", 42])("rejects malformed CAS maps without throwing: %j", (items) => {
    expect(musicArchiveMutationSchema.safeParse({ ...archiveInput, expectedVersions: { items } }).success).toBe(false);
    expect(musicArchiveMutationSchema.safeParse({ ...archiveInput, expectedVersions: items }).success).toBe(false);
  });

  it("accepts exact platform archive and hidden-restore version envelopes", () => {
    expect(musicArchiveMutationSchema.parse(archiveInput)).toEqual(archiveInput);
    expect(musicArchiveMutationSchema.parse(restoreInput)).toEqual(restoreInput);
  });

  it("preserves PostgreSQL microseconds and SoundCloud's shared presentation version", () => {
    const input = { ...archiveInput, section: "soundcloud", itemId: track.id,
      expectedVersions: { items: { [track.id]: version }, presentationUpdatedAt: archiveVersion } };
    expect(musicArchiveMutationSchema.parse(input)).toEqual(input);
  });

  it.each([
    { ...archiveInput, section: "spotify" },
    { ...archiveInput, section: "hero" },
    { ...archiveInput, section: "social_links" },
    { ...archiveInput, operation: "purge" },
    { ...archiveInput, actorId: "intruder" },
    { ...archiveInput, tableName: "media_assets" },
    { ...archiveInput, isPublished: true },
    { ...archiveInput, expectedArchiveUpdatedAt: archiveVersion },
    { ...archiveInput, expectedVersions: { items: {} } },
    { ...archiveInput, expectedVersions: { ...archiveInput.expectedVersions, presentationUpdatedAt: version } },
    { ...archiveInput, expectedVersions: { ...archiveInput.expectedVersions, actorId: "intruder" } },
    { ...archiveInput, section: "soundcloud" },
    { ...restoreInput, expectedArchiveUpdatedAt: undefined },
    { ...restoreInput, expectedVersions: archiveInput.expectedVersions },
    { ...archiveInput, itemId: "../music_platform_links" },
    { ...archiveInput, itemId: "x".repeat(161) },
  ])("rejects wrong section, unsafe caller fields and invalid lifecycle envelopes: %j", (input) => {
    expect(musicArchiveMutationSchema.safeParse(input).success).toBe(false);
  });

  it.each(["2026-02-30T10:15:30Z", "2026-09-21T24:00:00Z", "2026-09-21", "2026-09-21T10:15:30", "2026-09-21T10:15:30Z private", "2026-09-21T10:15:30.1234567Z"])("rejects normalized, incomplete and malformed timestamps: %s", (badVersion) => {
    expect(musicArchiveMutationSchema.safeParse({ ...archiveInput, expectedVersions: { items: { [platform.id]: badVersion } } }).success).toBe(false);
    expect(musicArchiveMutationSchema.safeParse({ ...restoreInput, expectedArchiveUpdatedAt: badVersion }).success).toBe(false);
    expect(musicArchiveMutationSchema.safeParse({ ...restoreInput, section: "soundcloud", expectedVersions: { items: {}, presentationUpdatedAt: badVersion } }).success).toBe(false);
  });

  it.each([["platforms", 32], ["soundcloud", 48]] as const)("bounds %s to its own active capacity %d", (section, cap) => {
    const versions = (count: number) => ({ items: Object.fromEntries(Array.from({ length: count }, (_, i) => [`item-${i}`, version])),
      ...(section === "soundcloud" ? { presentationUpdatedAt: version } : {}) });
    expect(musicArchiveMutationSchema.safeParse({ ...archiveInput, section, itemId: "item-0", expectedVersions: versions(cap) }).success).toBe(true);
    expect(musicArchiveMutationSchema.safeParse({ ...archiveInput, section, itemId: "item-0", expectedVersions: versions(cap + 1) }).success).toBe(false);
  });

  it("rejects raw prototype keys before record parsing can silently discard them", () => {
    const items: unknown = JSON.parse(`{"${platform.id}":"${version}","__proto__":"${version}"}`);
    expect(musicArchiveMutationSchema.safeParse({ ...archiveInput, expectedVersions: { items } }).success).toBe(false);
  });

  it("rejects inherited CAS maps and accepts ordinary null-prototype maps", () => {
    const inherited = Object.create({ ghost: version }) as Record<string, string>;
    inherited[platform.id] = version;
    expect(musicArchiveMutationSchema.safeParse({ ...archiveInput, expectedVersions: { items: inherited } }).success).toBe(false);
    const clean = Object.assign(Object.create(null) as Record<string, string>, { [platform.id]: version });
    expect(musicArchiveMutationSchema.safeParse({ ...archiveInput, expectedVersions: { items: clean } }).success).toBe(true);
  });
});

describe("Music archive canonical snapshot parser", () => {
  it("parses both collections with their exact current versions", () => {
    const platforms = { items: [platform] };
    expect(parseMusicArchiveSnapshot("platforms", platforms, archiveInput.expectedVersions)).toEqual({ section: "platforms", payload: platforms, versions: archiveInput.expectedVersions });
    const soundcloud = { mixesHeading: "Live mixes", items: [track] };
    const versions = { presentationUpdatedAt: archiveVersion, items: { [track.id]: version } };
    expect(parseMusicArchiveSnapshot("soundcloud", soundcloud, versions)).toEqual({ section: "soundcloud", payload: soundcloud, versions });
  });

  it("accepts a genuinely empty collection without substituting demo content", () => {
    expect(parseMusicArchiveSnapshot("platforms", { items: [] }, { items: {} })).toEqual({ section: "platforms", payload: { items: [] }, versions: { items: {} } });
    expect(parseMusicArchiveSnapshot("soundcloud", { mixesHeading: "Sets", items: [] }, { items: {}, presentationUpdatedAt: version })).not.toBeNull();
  });

  it("preserves valid read-only legacy values instead of blocking recovery of an incomplete old card", () => {
    const legacy = { ...platform, imageSrc: "", iconKey: "", isPublished: false };
    expect(parseMusicArchiveSnapshot("platforms", { items: [legacy] }, archiveInput.expectedVersions)).toMatchObject({ payload: { items: [legacy] } });
    const legacyTrack = { ...track, embedUrl: "https://example.com/historical-safe-link", isPublished: false };
    expect(parseMusicArchiveSnapshot("soundcloud", { mixesHeading: "Sets", items: [legacyTrack] }, { items: { [track.id]: version }, presentationUpdatedAt: version })).not.toBeNull();
  });

  it("does not weaken ordinary save rules while accepting a recoverable legacy read snapshot", () => {
    const legacyPlatform = { items: [{ ...platform, imageSrc: "", iconKey: "", isPublished: false }] };
    expect(parseMusicArchiveSnapshot("platforms", legacyPlatform, archiveInput.expectedVersions)).not.toBeNull();
    expect(parseMusicSectionSubmission("platforms", legacyPlatform, archiveInput.expectedVersions).success).toBe(false);
    const legacyTrack = { mixesHeading: "Sets", items: [{ ...track, embedUrl: "https://example.com/historical-safe-link", isPublished: false }] };
    const versions = { items: { [track.id]: version }, presentationUpdatedAt: version };
    expect(parseMusicArchiveSnapshot("soundcloud", legacyTrack, versions)).not.toBeNull();
    expect(parseMusicSectionSubmission("soundcloud", legacyTrack, versions).success).toBe(false);
  });

  it.each([
    ["platforms", { items: [platform] }, { items: {} }],
    ["platforms", { items: [] }, archiveInput.expectedVersions],
    ["platforms", { items: [platform, platform] }, archiveInput.expectedVersions],
    ["platforms", { items: [platform] }, { items: { [platform.id]: version, ghost: version } }],
    ["platforms", { items: [platform] }, { ...archiveInput.expectedVersions, presentationUpdatedAt: version }],
    ["platforms", { items: [platform] }, { items: { [platform.id]: "2026-02-30T10:00:00Z" } }],
    ["soundcloud", { mixesHeading: "Sets", items: [track] }, { items: { [track.id]: version } }],
    ["soundcloud", { items: [track] }, { items: { [track.id]: version }, presentationUpdatedAt: version }],
    ["soundcloud", { mixesHeading: "Sets", items: [platform] }, { items: { [platform.id]: version }, presentationUpdatedAt: version }],
    ["platforms", { items: [track] }, { items: { [track.id]: version } }],
    ["hero", { items: [] }, { items: {} }],
    ["spotify", {}, {}],
  ])("rejects incomplete, duplicated or cross-section response data: %j", (section, payload, versions) => {
    expect(parseMusicArchiveSnapshot(section, payload, versions)).toBeNull();
  });

  it.each([
    { ...platform, href: "javascript:alert(1)" },
    { ...platform, href: "https://name:password@example.com" },
    { ...platform, imageSrc: "data:image/svg+xml,<svg onload='alert(1)'/>" },
    { ...platform, imageSrc: "https://unmanaged.example.com/image.webp" },
    { ...platform, isPublished: "false" },
    { ...platform, html: "<iframe src='https://evil.example'></iframe>" },
  ])("rejects unsafe canonical platform payloads: %j", (item) => {
    expect(parseMusicArchiveSnapshot("platforms", { items: [item] }, archiveInput.expectedVersions)).toBeNull();
  });

  it("rejects untrusted prototype version keys in canonical responses too", () => {
    const items: unknown = JSON.parse(`{"${platform.id}":"${version}","__proto__":"${version}"}`);
    expect(parseMusicArchiveSnapshot("platforms", { items: [platform] }, { items })).toBeNull();
  });

  it.each([["platforms", 33], ["soundcloud", 49]] as const)("rejects oversized %s canonical snapshots", (section, count) => {
    const items = Array.from({ length: count }, (_, i) => ({ ...(section === "platforms" ? platform : track), id: `item-${i}` }));
    const versions = { items: Object.fromEntries(items.map((item) => [item.id, version])), ...(section === "soundcloud" ? { presentationUpdatedAt: version } : {}) };
    const payload = { items, ...(section === "soundcloud" ? { mixesHeading: "Sets" } : {}) };
    expect(parseMusicArchiveSnapshot(section, payload, versions)).toBeNull();
  });
});
