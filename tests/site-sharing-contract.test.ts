import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SHARING_METADATA, isEligibleSharingImageAsset, isSafeSharingImageSource, normalizeSharingMetadata, sharingMetadataSchema } from "@/lib/content/site-sharing";
import { createFallbackSharingEditorSnapshot, parseSharingEditorSnapshot, parseSharingSubmission } from "@/lib/admin/site-sharing-editor";

const versions = { updatedAt: "2026-09-29T10:00:00.123456+00:00" };
const draft = { title: "Franky Fugazi | Cigar Box Blues", description: "Raw blues.", imageSrc: "", imageAlt: "" };
afterEach(() => vi.unstubAllEnvs());
describe("Sharing metadata exact contract", () => {
  it("keeps owner text independent of hero and normalizes only whitespace", () => {
    expect(normalizeSharingMetadata({ ...draft, title: "  Owner title  " })).toEqual({ ...draft, title: "Owner title" });
    expect(normalizeSharingMetadata(null)).toEqual(DEFAULT_SHARING_METADATA);
    expect(normalizeSharingMetadata({ ...draft, privateDraft: true })).toEqual(DEFAULT_SHARING_METADATA);
  });
  it.each([null, {}, [], { ...draft, version: 1 }, { ...draft, title: null }, { ...draft, title: "x".repeat(121) },
    { ...draft, description: "x".repeat(321) }, { ...draft, imageAlt: "x".repeat(501) }, { ...draft, title: "one\ntwo" }, { ...draft, description: "a\u0000b" }])("rejects invalid shapes, bounds or controls", value => {
    expect(sharingMetadataSchema.safeParse(value).success).toBe(false);
  });
  it.each(["//example.com/a.png", "/admin/a.png", "/api/image.png", "/images/../admin/a.png", "/images/%2e%2e/a.png", "/images/a.png?secret=1", "/images/a.svg", "/images/a.avif", "/images//a.png", "/images/a\\b.png", "https://unmanaged.example/a.png", "data:image/png;base64,a"])("rejects unsafe/unmanaged image %s", value => {
    expect(isSafeSharingImageSource(value)).toBe(false);
  });
  it("accepts safe local covers and configured public media origins only", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://fixture.supabase.co");
    expect(isSafeSharingImageSource("/images/home-editorial/press.webp")).toBe(true);
    expect(isSafeSharingImageSource("https://fixture.supabase.co/storage/v1/object/public/portfolio/a.jpg")).toBe(true);
    expect(isSafeSharingImageSource("https://fixture.supabase.co/storage/v1/object/sign/portfolio/a.jpg")).toBe(false);
    expect(isSafeSharingImageSource("https://user:pass@fixture.supabase.co/storage/v1/object/public/a.jpg")).toBe(false);
  });
  it("drops a retired image origin without losing valid public copy", () => {
    expect(normalizeSharingMetadata({ ...draft, imageSrc: "https://retired.example/a.jpg", imageAlt: "Old image" })).toEqual(draft);
  });
  it("filters picker files consistently with the database image contract", () => {
    const asset = { src: "/images/cover.jpg", mediaType: "image", isPublished: true, deletedAt: "", mimeType: "image/jpeg" };
    expect(isEligibleSharingImageAsset(asset)).toBe(true);
    expect(isEligibleSharingImageAsset({ ...asset, mimeType: "" })).toBe(true);
    for (const override of [{ isPublished: false }, { deletedAt: "2026-09-29" }, { mediaType: "video" }, { mimeType: "image/gif" }, { src: "" }, { src: "/api/private.jpg" }]) expect(isEligibleSharingImageAsset({ ...asset, ...override })).toBe(false);
  });
  it("keeps exact microsecond CAS strings without date roundtripping", () => {
    expect(parseSharingSubmission(draft, versions)).toEqual({ success: true, data: { payload: draft, versions } });
    expect(parseSharingEditorSnapshot({ draft, versions })).toEqual({ draft, versions });
    expect(createFallbackSharingEditorSnapshot().draft).toEqual(DEFAULT_SHARING_METADATA);
    for (const invalid of [{ updatedAt: "bad" }, { updatedAt: "2026-09-29" }, { ...versions, extra: true }, null]) expect(parseSharingSubmission(draft, invalid).success).toBe(false);
  });
});
