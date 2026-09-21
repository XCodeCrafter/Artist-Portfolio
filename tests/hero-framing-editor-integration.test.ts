import { beforeEach, describe, expect, it, vi } from "vitest";
import * as home from "@/lib/admin/home-editor";
import * as bio from "@/lib/admin/bio-editor";
import * as music from "@/lib/admin/music-editor";
import * as gallery from "@/lib/admin/gallery-editor";
import * as showreel from "@/lib/admin/showreel-editor";
import * as contact from "@/lib/admin/contact-editor";
import { FALLBACK_CONTENT } from "@/lib/content/fallback";
import { getPublishedHomeDraft } from "@/lib/content/home.server";
import { getDefaultHeroFraming, type HeroFraming } from "@/lib/content/hero-framing";
import type { HeroContent } from "@/lib/content/types";

const publicRead = vi.hoisted(() => ({ result: {} as { data?: unknown; error?: unknown }, available: true, from: vi.fn(), select: vi.fn() }));
vi.mock("react", async original => ({ ...await original<typeof import("react")>(), cache: (fn: unknown) => fn }));
vi.mock("@/lib/content/supabase", () => ({ createPublicContentClient: () => {
  if (!publicRead.available) return null;
  const query = { select: publicRead.select.mockImplementation(() => query), eq: () => query, limit: () => query, returns: () => Promise.resolve(publicRead.result) };
  return { from: publicRead.from.mockImplementation(() => query) };
} }));

const timestamp = "2026-09-21T10:11:12.123456Z";
const versions = { updatedAt: timestamp };
const framing: HeroFraming = {
  desktop: { fit: "contain", x: 37.12, y: 19.01, zoom: 1.3 },
  mobile: { fit: "cover", x: 83.74, y: 6.89, zoom: 2.01 },
};
const frameValues = [undefined, null, framing] as const;
function withFraming<T extends { hero: HeroContent }>(draft: T, value: HeroFraming | null | undefined): T {
  return { ...draft, hero: { ...draft.hero, ...(value !== undefined ? { framing: value } : {}) } };
}
type Adapter = {
  name: string;
  hero: HeroContent;
  snapshot: (value: unknown) => HeroContent | null;
  save: (value: unknown) => { success: boolean };
  payload: (value: HeroFraming | null | undefined) => unknown;
  preview: (value: unknown) => HeroContent | null;
  dirty: (value: HeroFraming | null | undefined) => string[];
  view: (value: HeroFraming | null | undefined) => HeroContent;
};
function adapters(): Adapter[] {
  const h = home.createFallbackHomeEditorSnapshot();
  const b = bio.createFallbackBioEditorSnapshot();
  const m = music.createFallbackMusicEditorSnapshot();
  const g = gallery.createFallbackGalleryEditorSnapshot();
  const s = showreel.createFallbackShowreelEditorSnapshot();
  const c = contact.createFallbackContactEditorSnapshot();
  const rawHero = (hero: HeroContent, value: unknown) => ({ ...hero, ...(value !== undefined ? { framing: value } : {}), updatedAt: timestamp });
  const preview = (type: string, draft: { hero: HeroContent }, value: unknown) => ({ type, draft: { ...draft, hero: { ...draft.hero, ...(value !== undefined ? { framing: value } : {}) } }, selectedSection: "hero", focusRequestId: 1 });
  return [
    { name: "Home", hero: h.draft.hero,
      snapshot: value => home.parseHomeEditorSnapshot({ ...h, draft: { ...h.draft, hero: { ...h.draft.hero, ...(value !== undefined ? { framing: value } : {}) } } })?.draft.hero ?? null,
      save: value => home.parseHomeSectionSubmission("hero", value, versions),
      payload: value => home.getHomeSectionPayload(withFraming(h.draft, value), "hero"),
      preview: value => home.parseHomePreviewUpdateMessage(preview(home.HOME_PREVIEW_UPDATE_MESSAGE, h.draft, value))?.draft.hero ?? null,
      dirty: value => home.getDirtyHomeSections(h.draft, withFraming(h.draft, value)),
      view: value => withFraming(h.draft, value).hero },
    { name: "Bio", hero: b.draft.hero,
      snapshot: value => bio.parseBioEditorSnapshot({ hero: rawHero(b.draft.hero, value),
        biography: { ...b.draft.biography, profileUpdatedAt: timestamp, galleryImages: b.draft.biography.galleryImages.map(item => ({ ...item, updatedAt: timestamp })), paragraphs: b.draft.biography.paragraphs.map(item => ({ ...item, updatedAt: timestamp })) },
        resume: { ...b.draft.resume, updatedAt: timestamp }, credits: b.draft.credits.items.map(item => ({ ...item, updatedAt: timestamp })), footer: b.footer, hasResumeDetails: b.hasResumeDetails })?.draft.hero ?? null,
      save: value => bio.parseBioSectionSubmission("hero", value, versions),
      payload: value => bio.getBioSectionPayload(withFraming(b.draft, value), "hero"),
      preview: value => bio.parseBioPreviewUpdateMessage({ ...preview(bio.BIO_PREVIEW_UPDATE_MESSAGE, b.draft, value), footer: b.footer, hasResumeDetails: b.hasResumeDetails })?.draft.hero ?? null,
      dirty: value => bio.getDirtyBioSections(b.draft, withFraming(b.draft, value)),
      view: value => bio.createBioPageViewDataFromEditor(withFraming(b.draft, value), b.footer).hero },
    { name: "Music", hero: m.draft.hero,
      snapshot: value => music.parseMusicEditorSnapshot({ hero: rawHero(m.draft.hero, value), spotify: { ...m.draft.spotify, settingsUpdatedAt: timestamp, presentationUpdatedAt: timestamp },
        platforms: m.draft.platforms.items.map(item => ({ ...item, updatedAt: timestamp })), soundcloud: { mixesHeading: m.draft.soundcloud.mixesHeading, presentationUpdatedAt: timestamp, tracks: m.draft.soundcloud.items.map(item => ({ ...item, updatedAt: timestamp })) }, footer: m.footer })?.draft.hero ?? null,
      save: value => music.parseMusicSectionSubmission("hero", value, versions),
      payload: value => music.getMusicSectionPayload(withFraming(m.draft, value), "hero"),
      preview: value => music.parseMusicPreviewUpdateMessage({ ...preview(music.MUSIC_PREVIEW_UPDATE_MESSAGE, m.draft, value), footer: m.footer })?.draft.hero ?? null,
      dirty: value => music.getDirtyMusicSections(m.draft, withFraming(m.draft, value)),
      view: value => music.createMusicPageViewDataFromEditor(withFraming(m.draft, value), m.footer).hero },
    { name: "Gallery", hero: g.draft.hero,
      snapshot: value => gallery.parseGalleryEditorSnapshot({ hero: rawHero(g.draft.hero, value), introduction: { ...g.draft.introduction, updatedAt: timestamp }, frames: { items: g.draft.frames.items.map(item => ({ ...item, updatedAt: timestamp })) }, footer: g.footer })?.draft.hero ?? null,
      save: value => gallery.parseGallerySectionSubmission("hero", value, versions),
      payload: value => gallery.getGallerySectionPayload(withFraming(g.draft, value), "hero"),
      preview: value => gallery.parseGalleryPreviewUpdateMessage({ ...preview(gallery.GALLERY_PREVIEW_UPDATE_MESSAGE, g.draft, value), footer: g.footer })?.draft.hero ?? null,
      dirty: value => gallery.getDirtyGallerySections(g.draft, withFraming(g.draft, value)),
      view: value => gallery.createGalleryPageViewDataFromEditor(withFraming(g.draft, value), g.footer).hero },
    { name: "Showreel", hero: s.draft.hero,
      snapshot: value => showreel.parseShowreelEditorSnapshot({ hero: rawHero(s.draft.hero, value), introduction: { ...s.draft.introduction, updatedAt: timestamp }, works: { items: s.draft.works.items.map(item => ({ ...item, updatedAt: timestamp })) }, footer: s.footer })?.draft.hero ?? null,
      save: value => showreel.parseShowreelSectionSubmission("hero", value, versions),
      payload: value => showreel.getShowreelSectionPayload(withFraming(s.draft, value), "hero"),
      preview: value => showreel.parseShowreelPreviewUpdateMessage({ ...preview(showreel.SHOWREEL_PREVIEW_UPDATE_MESSAGE, s.draft, value), footer: s.footer })?.draft.hero ?? null,
      dirty: value => showreel.getDirtyShowreelSections(s.draft, withFraming(s.draft, value)),
      view: value => showreel.createShowreelPageViewDataFromEditor(withFraming(s.draft, value), s.footer).hero },
    { name: "Contact", hero: c.draft.hero,
      snapshot: value => contact.parseContactEditorSnapshot({ hero: rawHero(c.draft.hero, value), details: { ...c.draft.details, updatedAt: timestamp } })?.draft.hero ?? null,
      save: value => contact.parseContactSectionSubmission("hero", value, versions),
      payload: value => contact.getContactSectionPayload(withFraming(c.draft, value), "hero"),
      preview: value => contact.parseContactPreviewUpdateMessage(preview(contact.CONTACT_PREVIEW_UPDATE_MESSAGE, c.draft, value))?.draft.hero ?? null,
      dirty: value => contact.getDirtyContactSections(c.draft, withFraming(c.draft, value)),
      view: value => contact.createContactPageViewDataFromEditor(withFraming(c.draft, value)).hero },
  ];
}

describe.each(adapters())("$name Hero framing integration", adapter => {
  it.each(frameValues)("preserves legacy, reset, or custom framing through snapshot, payload, preview and page view (%j)", value => {
    const expected = { ...adapter.hero, ...(value !== undefined ? { framing: value } : {}) };
    expect(adapter.snapshot(value)).toEqual(expected);
    expect(adapter.payload(value)).toEqual(expected);
    expect(adapter.preview(value)).toEqual(expected);
    expect(adapter.view(value)).toEqual(expected);
    expect(adapter.save(expected).success).toBe(true);
  });
  it("marks only Hero dirty for a framing change or explicit reset", () => {
    expect(adapter.dirty(undefined)).toEqual([]);
    expect(adapter.dirty(framing)).toEqual(["hero"]);
    expect(adapter.dirty(null)).toEqual(["hero"]);
  });
  it.each([
    "cover", [], {}, { desktop: framing.desktop }, { ...framing, desktop: null },
    { ...framing, tablet: framing.mobile }, { ...framing, mobile: { ...framing.mobile, ignored: true } },
    { ...framing, desktop: { ...framing.desktop, fit: "fill" } },
    { ...framing, desktop: { ...framing.desktop, x: -0.01 } },
    { ...framing, desktop: { ...framing.desktop, y: 100.01 } },
    { ...framing, desktop: { ...framing.desktop, zoom: 0.99 } },
    { ...framing, desktop: { ...framing.desktop, zoom: 3.01 } },
    { ...framing, desktop: { ...framing.desktop, x: "50" } },
    { ...framing, desktop: { ...framing.desktop, x: NaN } },
    { ...framing, desktop: { ...framing.desktop, zoom: Infinity } },
  ])("rejects malformed or out-of-range framing at every editable boundary (%j)", invalid => {
    expect(adapter.save({ ...adapter.hero, framing: invalid }).success).toBe(false);
    expect(adapter.snapshot(invalid)).toBeNull();
    expect(adapter.preview(invalid)).toBeNull();
  });
  it("preserves explicit extrema for both image and video instead of clamping or re-defaulting", () => {
    const endpoints: HeroFraming = { desktop: { fit: "contain", x: 0, y: 100, zoom: 1 }, mobile: { fit: "cover", x: 100, y: 0, zoom: 3 } };
    for (const mediaType of ["image", "video"] as const) {
      expect(adapter.save({ ...adapter.hero, backgroundSrc: mediaType === "image" ? "/images/hero.jpg" : "/media/hero.mp4", mediaType, framing: endpoints }).success).toBe(true);
    }
    expect(adapter.snapshot(endpoints)?.framing).toEqual(endpoints);
    expect(adapter.preview(endpoints)?.framing).toEqual(endpoints);
  });
});

describe("Published HOME framing persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks(); publicRead.available = true;
    publicRead.result = { data: [{ draft: home.createFallbackHomeEditorSnapshot().draft, hero_media_framing: framing }], error: null };
  });
  it("loads the independently stored framing column into the actual public HOME draft", async () => {
    const draft = await getPublishedHomeDraft(FALLBACK_CONTENT);
    expect(draft.hero.framing).toEqual(framing);
    expect(publicRead.from).toHaveBeenCalledWith("home_page_config"); expect(publicRead.select).toHaveBeenCalledWith("*");
  });
  it("lets a saved null reset override older framing embedded in the draft", async () => {
    publicRead.result = { data: [{ draft: withFraming(home.createFallbackHomeEditorSnapshot().draft, framing), hero_media_framing: null }], error: null };
    expect((await getPublishedHomeDraft(FALLBACK_CONTENT)).hero.framing).toBeNull();
  });
  it("keeps pre-migration public data working without inventing framing", async () => {
    publicRead.result = { data: [{ draft: home.createFallbackHomeEditorSnapshot().draft }], error: null };
    expect((await getPublishedHomeDraft(FALLBACK_CONTENT)).hero).not.toHaveProperty("framing");
  });
  it("safely falls back to original framing for a malformed public column", async () => {
    publicRead.result = { data: [{ draft: home.createFallbackHomeEditorSnapshot().draft, hero_media_framing: { ...framing, mobile: { ...framing.mobile, zoom: Infinity } } }], error: null };
    expect((await getPublishedHomeDraft(FALLBACK_CONTENT)).hero.framing).toBeNull();
  });
  it("preserves already mapped page-hero framing when HOME V2 is not configured", async () => {
    publicRead.available = false;
    const content = { ...FALLBACK_CONTENT, heroes: { ...FALLBACK_CONTENT.heroes, home: { ...FALLBACK_CONTENT.heroes.home, framing: getDefaultHeroFraming("video") } } };
    expect((await getPublishedHomeDraft(content)).hero.framing).toEqual(getDefaultHeroFraming("video"));
    expect(home.createHomeDraftFromContent(content).hero.framing).toEqual(getDefaultHeroFraming("video"));
  });
});
