import { describe, expect, it } from "vitest";
import * as home from "@/lib/admin/home-editor";
import * as bio from "@/lib/admin/bio-editor";
import * as music from "@/lib/admin/music-editor";
import * as gallery from "@/lib/admin/gallery-editor";
import * as showreel from "@/lib/admin/showreel-editor";
import { FALLBACK_CONTENT } from "@/lib/content/fallback";
import { applyHomePhotoFramings, applyPublicPhotoFramings, parsePublicPhotoFramings, photoFramingFor } from "@/lib/content/photo-framing";
import type { HeroFraming } from "@/lib/content/hero-framing";

const updatedAt = "2026-09-23T10:11:12.123456Z";
const framing: HeroFraming = { desktop: { fit: "contain", x: 31.24, y: 14.87, zoom: 1.3 }, mobile: { fit: "cover", x: 88.19, y: 5.64, zoom: 2.7 } };
const alternate: HeroFraming = { desktop: { fit: "cover", x: 80, y: 10, zoom: 2 }, mobile: { fit: "contain", x: 10, y: 80, zoom: 1 } };
// Deliberately carries unknown test data into untrusted parsers without JSON
// serialization losing NaN/Infinity and hiding a validation regression.
function crop<T extends object>(item: T, value: unknown, key = "framing"): T {
  return value === undefined ? { ...item } : { ...item, [key]: value };
}
function path(value: unknown, keys: Array<string | number>): unknown {
  return keys.reduce<unknown>((current, key) => current != null && typeof current === "object" ? (current as Record<string | number, unknown>)[key] : undefined, value);
}
type Adapter = {
  name: string;
  snapshot: (value: unknown, capability?: unknown, empty?: boolean) => { draft: unknown; photoFramingAvailable?: true } | null;
  save: (value: unknown) => { success: boolean };
  payload: (value: unknown) => unknown;
  preview: (value: unknown) => { draft: unknown } | null;
  view: (value: unknown) => unknown;
  dirty: (value: unknown) => string[];
  section: string;
  draftPath: Array<string | number>;
  payloadPath: Array<string | number>;
  viewPath: Array<string | number>;
};
function adapters(): Adapter[] {
  const h = home.createFallbackHomeEditorSnapshot(), b = bio.createFallbackBioEditorSnapshot(), m = music.createFallbackMusicEditorSnapshot(),
    g = gallery.createFallbackGalleryEditorSnapshot(), s = showreel.createFallbackShowreelEditorSnapshot();
  s.draft.works.items = [{ id: "showreel:fixture", title: "Fixture reel", description: "", embedUrl: "/media/reel.mp4", platform: "upload", thumbnailSrc: "/images/reel.jpg", videoType: "showreel", isFeatured: true, isPublished: true }];
  s.versions.works.items = { "showreel:fixture": updatedAt };
  const flags = (capability: unknown) => capability === undefined ? {} : { photoFramingAvailable: capability };
  const bd = (value: unknown, empty = false) => ({ ...b.draft, biography: { ...b.draft.biography, galleryImages: empty ? [] : b.draft.biography.galleryImages.map(item => crop(item, value)) } });
  const md = (value: unknown, empty = false) => ({ ...m.draft, platforms: { items: empty ? [] : m.draft.platforms.items.map(item => crop(item, value)) } });
  const gd = (value: unknown, empty = false) => ({ ...g.draft, frames: { items: empty ? [] : g.draft.frames.items.map(item => crop(item, value)) } });
  const sd = (value: unknown, empty = false) => ({ ...s.draft, works: { items: empty ? [] : s.draft.works.items.map(item => crop(item, value)) } });
  const result: Adapter[] = (["about", "feature", "stories"] as const).map(section => {
    const draft = (value: unknown) => ({ ...h.draft, [section]: section === "stories"
      ? { ...h.draft.stories, images: h.draft.stories.images.map(item => crop(item, value)) }
      : crop(h.draft[section], value, section === "feature" ? "posterFraming" : "framing") });
    const payloadPath: Array<string | number> = section === "stories" ? ["images", 0, "framing"] : [section === "feature" ? "posterFraming" : "framing"];
    return { name: `Home/${section}`, section,
      snapshot: (value, capability) => home.parseHomeEditorSnapshot({ ...h, draft: draft(value), ...flags(capability) }),
      save: value => home.parseHomeSectionSubmission(section, draft(value)[section], h.versions),
      payload: value => home.getHomeSectionPayload(draft(value), section),
      preview: value => home.parseHomePreviewUpdateMessage({ type: home.HOME_PREVIEW_UPDATE_MESSAGE, draft: draft(value), selectedSection: section, focusRequestId: 1 }),
      view: value => draft(value), dirty: value => home.getDirtyHomeSections(h.draft, draft(value)),
      draftPath: [section, ...payloadPath], payloadPath, viewPath: [section, ...payloadPath] };
  });
  result.push(
    { name: "Bio/portraits", section: "biography", draftPath: ["biography", "galleryImages", 0, "framing"], payloadPath: ["galleryImages", 0, "framing"], viewPath: ["bio", "galleryImages", 0, "framing"],
      snapshot: (value, capability, empty) => { const draft = bd(value, empty); return bio.parseBioEditorSnapshot({
        hero: { ...draft.hero, updatedAt }, biography: { ...draft.biography, profileUpdatedAt: updatedAt, galleryImages: draft.biography.galleryImages.map(item => ({ ...item, updatedAt })), paragraphs: draft.biography.paragraphs.map(item => ({ ...item, updatedAt })) },
        resume: { ...draft.resume, updatedAt }, credits: draft.credits.items.map(item => ({ ...item, updatedAt })), footer: b.footer, hasResumeDetails: b.hasResumeDetails, ...flags(capability),
      }); },
      save: value => bio.parseBioSectionSubmission("biography", bd(value).biography, b.versions.biography),
      payload: value => bio.getBioSectionPayload(bd(value), "biography"),
      preview: value => bio.parseBioPreviewUpdateMessage({ type: bio.BIO_PREVIEW_UPDATE_MESSAGE, draft: bd(value), selectedSection: "biography", focusRequestId: 1, footer: b.footer, hasResumeDetails: b.hasResumeDetails }),
      view: value => bio.createBioPageViewDataFromEditor(bd(value), b.footer), dirty: value => bio.getDirtyBioSections(b.draft, bd(value)) },
    { name: "Music/platforms", section: "platforms", draftPath: ["platforms", "items", 0, "framing"], payloadPath: ["items", 0, "framing"], viewPath: ["platforms", 0, "framing"],
      snapshot: (value, capability, empty) => { const draft = md(value, empty); return music.parseMusicEditorSnapshot({
        hero: { ...draft.hero, updatedAt }, spotify: { ...draft.spotify, settingsUpdatedAt: updatedAt, presentationUpdatedAt: updatedAt }, platforms: draft.platforms.items.map(item => ({ ...item, updatedAt })),
        soundcloud: { mixesHeading: draft.soundcloud.mixesHeading, presentationUpdatedAt: updatedAt, tracks: draft.soundcloud.items.map(item => ({ ...item, updatedAt })) }, footer: m.footer, ...flags(capability),
      }); },
      save: value => music.parseMusicSectionSubmission("platforms", md(value).platforms, m.versions.platforms),
      payload: value => music.getMusicSectionPayload(md(value), "platforms"),
      preview: value => music.parseMusicPreviewUpdateMessage({ type: music.MUSIC_PREVIEW_UPDATE_MESSAGE, draft: md(value), selectedSection: "platforms", focusRequestId: 1, footer: m.footer }),
      view: value => music.createMusicPageViewDataFromEditor(md(value), m.footer), dirty: value => music.getDirtyMusicSections(m.draft, md(value)) },
    { name: "Gallery/frames", section: "frames", draftPath: ["frames", "items", 0, "framing"], payloadPath: ["items", 0, "framing"], viewPath: ["images", 0, "framing"],
      snapshot: (value, capability, empty) => { const draft = gd(value, empty); return gallery.parseGalleryEditorSnapshot({ hero: { ...draft.hero, updatedAt }, introduction: { ...draft.introduction, updatedAt }, frames: { items: draft.frames.items.map(item => ({ ...item, updatedAt })) }, footer: g.footer, ...flags(capability) }); },
      save: value => gallery.parseGallerySectionSubmission("frames", gd(value).frames, g.versions.frames),
      payload: value => gallery.getGallerySectionPayload(gd(value), "frames"),
      preview: value => gallery.parseGalleryPreviewUpdateMessage({ type: gallery.GALLERY_PREVIEW_UPDATE_MESSAGE, draft: gd(value), selectedSection: "frames", focusRequestId: 1, footer: g.footer }),
      view: value => gallery.createGalleryPageViewDataFromEditor(gd(value), g.footer), dirty: value => gallery.getDirtyGallerySections(g.draft, gd(value)) },
    { name: "Showreel/thumbnails", section: "works", draftPath: ["works", "items", 0, "framing"], payloadPath: ["items", 0, "framing"], viewPath: ["videos", 0, "framing"],
      snapshot: (value, capability, empty) => { const draft = sd(value, empty); return showreel.parseShowreelEditorSnapshot({ hero: { ...draft.hero, updatedAt }, introduction: { ...draft.introduction, updatedAt }, works: { items: draft.works.items.map(item => ({ ...item, updatedAt })) }, footer: s.footer, ...flags(capability) }); },
      save: value => showreel.parseShowreelSectionSubmission("works", sd(value).works, s.versions.works),
      payload: value => showreel.getShowreelSectionPayload(sd(value), "works"),
      preview: value => showreel.parseShowreelPreviewUpdateMessage({ type: showreel.SHOWREEL_PREVIEW_UPDATE_MESSAGE, draft: sd(value), selectedSection: "works", focusRequestId: 1, footer: s.footer }),
      view: value => showreel.createShowreelPageViewDataFromEditor(sd(value), s.footer), dirty: value => showreel.getDirtyShowreelSections(s.draft, sd(value)) },
  );
  return result;
}

describe.each(adapters())("$name framing data contracts", adapter => {
  it.each([undefined, null, framing])("preserves old, reset and custom crops through snapshot, save, preview and view (%j)", value => {
    const snapshot = adapter.snapshot(value), preview = adapter.preview(value);
    expect(snapshot).not.toBeNull(); expect(preview).not.toBeNull();
    expect(path(snapshot?.draft, adapter.draftPath)).toEqual(value);
    expect(path(adapter.payload(value), adapter.payloadPath)).toEqual(value);
    expect(path(preview?.draft, adapter.draftPath)).toEqual(value);
    expect(path(adapter.view(value), adapter.viewPath)).toEqual(value);
    expect(adapter.save(value).success).toBe(true);
  });
  it("marks only the containing section dirty", () => {
    expect(adapter.dirty(undefined)).toEqual([]);
    expect(adapter.dirty(framing)).toEqual([adapter.section]);
    expect(adapter.dirty(null)).toEqual([adapter.section]);
  });
  it("preserves capability without inferring it from collection contents", () => {
    expect(adapter.snapshot(undefined)?.photoFramingAvailable).toBeUndefined();
    expect(adapter.snapshot(null, true, true)?.photoFramingAvailable).toBe(true);
    expect(adapter.snapshot(null, false)).toBeNull();
    expect(adapter.snapshot(null, "true")).toBeNull();
  });
  it.each([
    "cover", [], {}, { desktop: framing.desktop }, { ...framing, mobile: null }, { ...framing, tablet: framing.mobile },
    { ...framing, desktop: { ...framing.desktop, extra: true } }, { ...framing, desktop: { ...framing.desktop, x: -1 } },
    { ...framing, mobile: { ...framing.mobile, y: 100.01 } }, { ...framing, desktop: { ...framing.desktop, fit: "fill" } },
    { ...framing, desktop: { ...framing.desktop, zoom: 0.99 } }, { ...framing, mobile: { ...framing.mobile, zoom: 3.01 } },
    { ...framing, mobile: { ...framing.mobile, x: "50" } }, { ...framing, desktop: { ...framing.desktop, x: Number.NaN } },
    { ...framing, mobile: { ...framing.mobile, zoom: Number.POSITIVE_INFINITY } },
  ])("rejects malformed framing at every editable boundary (%j)", invalid => {
    expect(adapter.snapshot(invalid)).toBeNull();
    expect(adapter.preview(invalid)).toBeNull();
    expect(adapter.save(invalid).success).toBe(false);
  });
});

describe("Exact-source-bound independent public photo placements", () => {
  it("keeps distinct crops for one shared library URL used in two places", () => {
    const src = "/images/shared.jpg";
    const map = parsePublicPhotoFramings({ "home:about": { src, framing }, "home:story:0": { src, framing: alternate } })!;
    expect(photoFramingFor(map, "home:about", src)).toEqual(framing);
    expect(photoFramingFor(map, "home:story:0", src)).toEqual(alternate);
    expect(photoFramingFor(map, "home:story:1", src)).toBeNull();
  });
  it("will not apply a stale source crop across content/framing read races or inherited keys", () => {
    const map = { "home:about": { src: "/images/old.jpg", framing } };
    expect(photoFramingFor(map, "home:about", "/images/new.jpg")).toBeNull();
    expect(photoFramingFor(map, "home:about", "/images/old.jpg?new=1")).toBeNull();
    expect(photoFramingFor(Object.create(map), "home:about", "/images/old.jpg")).toBeNull();
  });
  it("maps Home about, poster and each story without overwriting the original content", () => {
    const draft = home.createFallbackHomeEditorSnapshot().draft;
    const map = { "home:about": { src: draft.about.imageSrc, framing }, "home:feature:poster": { src: draft.feature.posterSrc, framing: alternate }, "home:story:0": { src: draft.stories.images[0].src, framing } };
    const next = applyHomePhotoFramings(draft, map);
    expect(next.about.framing).toEqual(framing); expect(next.feature.posterFraming).toEqual(alternate);
    expect(next.stories.images[0].framing).toEqual(framing); expect(next.stories.images[1].framing).toBeNull();
    expect(draft.about.framing).toBeUndefined(); expect(draft.feature.posterFraming).toBeUndefined();
    expect(next.hero).toBe(draft.hero);
  });
  it("maps independent collection identity rather than URL alone", () => {
    const content = structuredClone(FALLBACK_CONTENT);
    content.videos = [{ id: "reel-fixture", title: "Reel", description: "", embedUrl: "/media/reel.mp4", platform: "upload", thumbnailSrc: "/images/reel.jpg", videoType: "showreel", isFeatured: true }];
    const platform = content.musicPlatforms[0], portrait = content.bio.galleryImages[0], frame = content.galleryImages[0], video = content.videos[0];
    const map = {
      [`music:platform:${platform.id}`]: { src: platform.imageSrc, framing },
      [`bio:image:${portrait.id}`]: { src: portrait.src, framing: alternate },
      [`gallery:image:${frame.id}`]: { src: frame.src, framing },
      [`showreel:thumbnail:${video.id}`]: { src: video.thumbnailSrc, framing: alternate },
    };
    const next = applyPublicPhotoFramings(content, map);
    expect(next.musicPlatforms[0].framing).toEqual(framing); expect(next.bio.galleryImages[0].framing).toEqual(alternate);
    expect(next.galleryImages[0].framing).toEqual(framing); expect(next.videos[0].framing).toEqual(alternate);
    expect(next.photoFramings).toEqual(map); expect(content.musicPlatforms[0].framing).toBeUndefined();
    expect(next.heroes).toBe(content.heroes);
  });
  it.each([null, [], { one: { src: "/photo.jpg", framing: null } }, { one: { src: "/photo.jpg", framing, extra: true } }, { one: { src: 42, framing } }, { one: { src: "/photo.jpg", framing: { ...framing, desktop: { ...framing.desktop, zoom: 9 } } } }])("rejects malformed public maps (%j)", value => {
    expect(parsePublicPhotoFramings(value)).toBeNull();
  });
  it("bounds keys, sources and total entry count, while accepting the actual empty map", () => {
    expect(parsePublicPhotoFramings({})).toEqual({});
    expect(parsePublicPhotoFramings({ ["x".repeat(550)]: { src: "/photo.jpg", framing } })).not.toBeNull();
    expect(parsePublicPhotoFramings({ [`showreel:thumbnail:${"v".repeat(512)}`]: { src: "/photo.jpg", framing } })).not.toBeNull();
    expect(parsePublicPhotoFramings({ ["x".repeat(551)]: { src: "/photo.jpg", framing } })).toBeNull();
    expect(parsePublicPhotoFramings({ one: { src: "x".repeat(2049), framing } })).toBeNull();
    expect(parsePublicPhotoFramings(Object.fromEntries(Array.from({ length: 20001 }, (_, index) => [`key:${index}`, { src: "/photo.jpg", framing }])))).toBeNull();
  });
});
