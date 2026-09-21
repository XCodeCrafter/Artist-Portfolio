import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  filterMediaLibrary,
  getMediaPlacementInfo,
  MEDIA_LARGE_IMAGE_BYTES,
  MEDIA_LARGE_VIDEO_BYTES,
  MEDIA_RECENT_DAYS,
  type MediaLibraryBrowseOptions,
} from "@/lib/admin/media-library-editor";
import type { MediaAsset } from "@/lib/admin/media";

const now = Date.parse("2026-09-21T12:00:00Z");
const day = 24 * 60 * 60 * 1000;
const base: MediaAsset = {
  id: "portrait", label: "Portrait", src: "/portrait.jpg", alt: "Studio portrait",
  mediaType: "image", usageKey: "Bio", sortOrder: 0, isPublished: true,
  storageBucket: "portfolio-media", storagePath: "portrait.jpg", fileSize: 1024,
  mimeType: "image/jpeg", metadata: {}, createdAt: "2026-09-20T12:00:00Z",
  updatedAt: "2026-09-20T12:00:00Z", deletedAt: "", deletedBy: "",
};
const asset = (id: string, fields: Partial<MediaAsset> = {}): MediaAsset => ({ ...base, id, ...fields });
const browse = (assets: MediaAsset[], options: MediaLibraryBrowseOptions) =>
  filterMediaLibrary(assets, {}, "all", "", options).map((item) => item.id);

describe("Media V2 browse filters", () => {
  it("preserves the existing four-argument source order", () => {
    const assets = [asset("z", { createdAt: "" }), asset("a"), asset("m")];
    expect(filterMediaLibrary(assets, {}, "all", "").map((item) => item.id)).toEqual(["z", "a", "m"]);
  });

  it("finds missing alternative text only on images, including whitespace", () => {
    expect(browse([
      asset("empty", { alt: "" }), asset("whitespace", { alt: " \n\t " }),
      asset("described"), asset("video", { mediaType: "video", alt: "" }),
      asset("audio", { mediaType: "audio", alt: "" }),
    ], { attention: "missing-alt" })).toEqual(["empty", "whitespace"]);
  });

  it("uses advisory size thresholds strictly above 2 MiB for images and 20 MiB for videos", () => {
    expect(MEDIA_LARGE_IMAGE_BYTES).toBe(2 * 1024 * 1024);
    expect(MEDIA_LARGE_VIDEO_BYTES).toBe(20 * 1024 * 1024);
    expect(browse([
      asset("image-boundary", { fileSize: MEDIA_LARGE_IMAGE_BYTES }),
      asset("image-large", { fileSize: MEDIA_LARGE_IMAGE_BYTES + 1 }),
      asset("video-boundary", { mediaType: "video", fileSize: MEDIA_LARGE_VIDEO_BYTES }),
      asset("video-large", { mediaType: "video", fileSize: MEDIA_LARGE_VIDEO_BYTES + 1 }),
      asset("document", { mediaType: "document", fileSize: MEDIA_LARGE_VIDEO_BYTES + 1 }),
      asset("audio", { mediaType: "audio", fileSize: MEDIA_LARGE_VIDEO_BYTES + 1 }),
      asset("invalid", { fileSize: Number.NaN }),
      asset("infinite", { fileSize: Number.POSITIVE_INFINITY }),
    ], { attention: "oversized" })).toEqual(["image-large", "video-large"]);
  });

  it("finds only valid upload timestamps within the last seven days, never future dates", () => {
    expect(MEDIA_RECENT_DAYS).toBe(7);
    expect(browse([
      asset("just-now", { createdAt: new Date(now).toISOString() }),
      asset("boundary", { createdAt: new Date(now - 7 * day).toISOString() }),
      asset("old", { createdAt: new Date(now - 7 * day - 1).toISOString(), updatedAt: new Date(now).toISOString() }),
      asset("future", { createdAt: new Date(now + 1).toISOString() }),
      asset("missing", { createdAt: "" }),
      asset("invalid", { createdAt: "not a date" }),
    ], { attention: "recent", now })).toEqual(["just-now", "boundary"]);
    expect(browse([base], { attention: "recent", now: Number.NaN })).toEqual([]);
  });

  it("treats unavailable as disabled for selection, without conflating it with Trash", () => {
    const assets = [asset("available"), asset("unavailable", { isPublished: false }),
      asset("trashed", { isPublished: true, deletedAt: "2026-09-21T12:00:00Z" }),
      asset("trashed-unavailable", { isPublished: false, deletedAt: "2026-09-21T12:00:00Z" })];
    expect(browse(assets, { availability: "available" })).toEqual(["available"]);
    expect(browse(assets, { availability: "unavailable" })).toEqual(["unavailable"]);
    expect(filterMediaLibrary(assets, {}, "trash", "", { availability: "available" }).map((item) => item.id)).toEqual(["trashed"]);
    expect(filterMediaLibrary(assets, {}, "trash", "", { availability: "unavailable" }).map((item) => item.id)).toEqual(["trashed-unavailable"]);
  });

  it("does not claim assets are unused when reference loading failed", () => {
    expect(filterMediaLibrary([base], {}, "unused", "", { usageVerified: false })).toEqual([]);
    expect(filterMediaLibrary([base], {}, "unused", "", { usageVerified: true })).toEqual([base]);
    expect(filterMediaLibrary([base], {}, "all", "", { usageVerified: false })).toEqual([base]);
  });

  it("combines type, usage, search, availability and attention filters", () => {
    const assets = [asset("match", { alt: "", isPublished: false }),
      asset("with-alt", { isPublished: false }), asset("published", { alt: "" }),
      asset("other-search", { label: "Concert", alt: "", usageKey: "Other", isPublished: false }),
      asset("video", { mediaType: "video", alt: "", isPublished: false })];
    expect(filterMediaLibrary(assets, {}, "image", " bIo ", {
      attention: "missing-alt", availability: "unavailable",
    }).map((item) => item.id)).toEqual(["match"]);
    expect(filterMediaLibrary(assets, { match: [{ label: "Bio gallery", count: 1 }] }, "unused", " bIo ", {
      attention: "missing-alt", availability: "unavailable", usageVerified: true,
    })).toEqual([]);
  });
});

describe("Media V2 browse sorting", () => {
  it("orders newest valid upload timestamps first with missing/invalid dates last", () => {
    const assets = [asset("missing", { createdAt: "" }), asset("old", { createdAt: "2026-09-10T10:00:00Z" }),
      asset("new", { createdAt: "2026-09-21T10:00:00Z" }), asset("bad", { createdAt: "bad" })];
    expect(browse(assets, { sort: "newest" })).toEqual(["new", "old", "bad", "missing"]);
  });

  it("orders largest first and treats invalid sizes as unknown rather than enormous", () => {
    expect(browse([asset("small", { fileSize: 10 }), asset("big", { fileSize: 1_000 }),
      asset("invalid", { fileSize: Number.POSITIVE_INFINITY }), asset("empty", { fileSize: 0 }),
    ], { sort: "largest" })).toEqual(["big", "small", "empty", "invalid"]);
  });

  it("uses a natural case-insensitive alphabetical name order", () => {
    expect(browse([asset("ten", { label: "Photo 10" }), asset("two", { label: "photo 2" }),
      asset("one", { label: "Alpha" })], { sort: "name" })).toEqual(["one", "two", "ten"]);
  });

  it.each(["newest", "largest", "name"] as const)("uses stable identifier tie-breaking for %s without mutating assets", (sort) => {
    const assets = [asset("z"), asset("b"), asset("a")];
    const before = structuredClone(assets);
    expect(browse(assets, { sort })).toEqual(["a", "b", "z"]);
    expect(assets).toEqual(before);
    expect(browse([...assets].reverse(), { sort })).toEqual(["a", "b", "z"]);
  });
});

describe("Media V2 placement explanations", () => {
  it("offers supported content archive editors without guessing the collection", () => {
    const placement = getMediaPlacementInfo("Archived content");
    expect(placement.description).toContain("preserved for restoration");
    expect(placement.links).toEqual([
      { label: "Open shortcut archive", href: "/admin/v2/navigation#shortcut-archive" },
      { label: "Open Music editor", href: "/admin/v2/pages/music" },
      { label: "Open Bio editor", href: "/admin/v2/pages/bio" },
      { label: "Open Gallery editor", href: "/admin/v2/pages/gallery" },
      { label: "Open Showreel editor", href: "/admin/v2/pages/showreel" },
    ]);
    expect(placement.description).toContain("does not identify the individual collection");
  });

  it("covers each exact 0040 registry label and only returns existing V2 destinations", () => {
    const migration = readFileSync("supabase/migrations/0040_media_library_v2.sql", "utf8");
    const registryStart = migration.indexOf("  values");
    const registry = migration.slice(registryStart, migration.indexOf("$$;", registryStart));
    const labels = [...registry.matchAll(/\('[^']+', '([^']+)'/g)].map((match) => match[1]);
    expect(labels).toHaveLength(15);
    const destinations = new Set(["/admin/v2", "/admin/v2/pages/bio", "/admin/v2/pages/gallery",
      "/admin/v2/pages/home", "/admin/v2/pages/music", "/admin/v2/pages/showreel",
      "/admin/v2/navigation", "/admin/v2/settings/appearance"]);
    for (const label of labels) {
      const placement = getMediaPlacementInfo(label);
      expect(placement.description).not.toContain("could not be identified");
      for (const link of placement.links) expect(destinations.has(link.href)).toBe(true);
    }
  });

  it("keeps mixed and legacy sources honest instead of guessing a page or editor block", () => {
    expect(getMediaPlacementInfo("Saved media presentation")).toMatchObject({ links: [] });
    expect(getMediaPlacementInfo("Saved media presentation").description).toContain("Classic");
    expect(getMediaPlacementInfo("Home about (Classic)").links).toEqual([]);
    expect(getMediaPlacementInfo("Home update (Classic)").links).toEqual([]);
    expect(getMediaPlacementInfo("Page hero / button").links).toEqual([{ label: "Choose a page editor", href: "/admin/v2" }]);
    expect(getMediaPlacementInfo("Site music / footer link").description).toContain("does not distinguish");
    expect(getMediaPlacementInfo("Showreel / video").description).toContain("legacy");
    expect(getMediaPlacementInfo("Home V2 (including hidden sections)").description).toContain("Hidden sections");
  });

  it.each(["constructor", "__proto__", " Gallery", "gallery", "https://evil.example", "<script>alert(1)</script>"])("does not interpret or turn an unknown label into a URL: %s", (label) => {
    expect(getMediaPlacementInfo(label)).toMatchObject({ title: label, links: [] });
    expect(getMediaPlacementInfo(label).description).toContain("could not be identified");
  });

  it("does not allow callers to mutate the registry's link objects", () => {
    const placement = getMediaPlacementInfo("Gallery");
    placement.links[0].href = "https://evil.example";
    placement.title = "Changed";
    expect(getMediaPlacementInfo("Gallery")).toMatchObject({
      title: "Gallery images", links: [{ href: "/admin/v2/pages/gallery" }],
    });
  });
});
