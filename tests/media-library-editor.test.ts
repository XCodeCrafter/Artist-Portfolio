import { describe, expect, it } from "vitest";
import { filterMediaLibrary, formatMediaBytes, getMediaUsage, mediaDetailsSchema, mediaMutationSchema, mediaReplacementOptions, validateMediaUploadFiles } from "@/lib/admin/media-library-editor";
import type { MediaAsset } from "@/lib/admin/media";

const base: MediaAsset = { id: "photo", label: "Portrait", src: "/photo.jpg", alt: "Studio", mediaType: "image", usageKey: "Headshot", sortOrder: 0, isPublished: true, storageBucket: "portfolio-media", storagePath: "image/photo.jpg", fileSize: 1024, mimeType: "image/jpeg", metadata: {}, createdAt: "2026-09-20T10:00:00Z", updatedAt: "2026-09-20T10:00:00.123456Z", deletedAt: "", deletedBy: "" };
const details = { id: base.id, expectedUpdatedAt: base.updatedAt, label: " New name ", alt: "", usageKey: "", isPublished: true };
const files = [base, { ...base, id: "video", src: "/clip.mp4", mediaType: "video" as const }, { ...base, id: "old", deletedAt: "2026-09-20T11:00:00Z" }];

describe("Media V2 editor contracts", () => {
  it("limits updates to editable file metadata and a required exact version", () => {
    expect(mediaDetailsSchema.parse(details).label).toBe("New name");
    for (const input of [{ ...details, src: "/hijack.jpg" }, { ...details, expectedUpdatedAt: "" }, { ...details, id: "home-studio-settings" }, { ...details, label: " " }, { ...details, alt: "x".repeat(221) }]) expect(mediaDetailsSchema.safeParse(input).success).toBe(false);
    expect(mediaDetailsSchema.parse(details).expectedUpdatedAt).toBe(base.updatedAt);
  });
  it("requires a distinct replacement only for replace-and-trash", () => {
    const input = { id: base.id, expectedUpdatedAt: base.updatedAt, operation: "replace_and_trash" };
    expect(mediaMutationSchema.safeParse(input).success).toBe(false);
    expect(mediaMutationSchema.safeParse({ ...input, replacementId: base.id }).success).toBe(false);
    expect(mediaMutationSchema.safeParse({ ...input, replacementId: "replacement" }).success).toBe(true);
    expect(mediaMutationSchema.safeParse({ ...input, operation: "purge" }).success).toBe(false);
    expect(mediaMutationSchema.safeParse({ ...input, operation: "trash", replacementId: "replacement" }).success).toBe(false);
  });
  it("separates Trash, file kinds, usage and textual search", () => {
    const usage = { photo: [{ label: "Bio", count: 1 }] };
    expect(filterMediaLibrary(files, usage, "all", "").map((row) => row.id)).toEqual(["photo", "video"]);
    expect(filterMediaLibrary(files, usage, "unused", "").map((row) => row.id)).toEqual(["video"]);
    expect(filterMediaLibrary(files, usage, "trash", "").map((row) => row.id)).toEqual(["old"]);
    expect(filterMediaLibrary(files, usage, "image", "HEADshot").map((row) => row.id)).toEqual(["photo"]);
    expect(filterMediaLibrary(files, usage, "all", "missing")).toEqual([]);
  });
  it("only suggests different-source, active replacements of the same media kind", () => {
    expect(mediaReplacementOptions(base, [...files, { ...base, id: "duplicate" }, { ...base, id: "hidden", src: "/hidden.jpg", isPublished: false }, { ...base, id: "next", src: "/next.jpg" }]).map((row) => row.id)).toEqual(["next"]);
  });
  it("checks upload type, size and bounded batch count before transfer", () => {
    const image = { name: "photo.jpg", size: 1024, type: "image/jpeg" };
    expect(validateMediaUploadFiles([image])).toBeNull();
    expect(validateMediaUploadFiles([])).toBeTruthy();
    expect(validateMediaUploadFiles(Array.from({ length: 11 }, () => image))).toBeTruthy();
    expect(validateMediaUploadFiles([{ ...image, size: 0 }])).toBeTruthy();
    expect(validateMediaUploadFiles([{ ...image, type: "image/svg+xml" }])).toBeTruthy();
    expect(validateMediaUploadFiles([{ ...image, size: 11 * 1024 * 1024 }])).toBeTruthy();
    expect(validateMediaUploadFiles([{ ...image, size: 90 * 1024 * 1024, type: "video/mp4" }])).toBeNull();
    expect(validateMediaUploadFiles(Array.from({ length: 3 }, () => ({ ...image, size: 90 * 1024 * 1024, type: "video/mp4" })))).toBeTruthy();
  });
  it("labels byte totals, including empty assets, clearly", () => {
    expect(formatMediaBytes(0)).toBe("0 B"); expect(formatMediaBytes(1024)).toBe("1 KB");
    expect(formatMediaBytes(1536)).toBe("1.5 KB"); expect(formatMediaBytes(1024 ** 3)).toBe("1 GB");
  });
  it("does not interpret inherited object properties as media usage", () => {
    expect(getMediaUsage({}, "constructor")).toEqual([]);
    expect(getMediaUsage({}, "__proto__")).toEqual([]);
  });
});
