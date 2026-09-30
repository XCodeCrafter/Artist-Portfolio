import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createFallbackHomeEditorSnapshot, parseHomeEditorSnapshot, parseHomeSectionSubmission } from "@/lib/admin/home-editor";
import { createFallbackBioEditorSnapshot, parseBioEditorSnapshot, parseBioSectionSubmission } from "@/lib/admin/bio-editor";
import { createFallbackGalleryEditorSnapshot, parseGalleryEditorSnapshot, parseGallerySectionSubmission } from "@/lib/admin/gallery-editor";
import { createFallbackMusicEditorSnapshot, parseMusicEditorSnapshot, parseMusicSectionSubmission } from "@/lib/admin/music-editor";
import { createFallbackShowreelEditorSnapshot, parseShowreelEditorSnapshot, parseShowreelSectionSubmission } from "@/lib/admin/showreel-editor";
import { createFallbackContactEditorSnapshot, parseContactEditorSnapshot, parseContactSectionSubmission } from "@/lib/admin/contact-editor";

const updatedAt = "2026-09-30T10:00:00.000001Z";
const versions = { updatedAt };
const hero = { title: "", subtitle: "Supporting copy", ctaLabel: "View", ctaHref: "#work", backgroundSrc: "/images/hero.jpg", posterSrc: "", mediaType: "image" as const };
const saveParsers = [
  ["Home", parseHomeSectionSubmission], ["Bio", parseBioSectionSubmission],
  ["Gallery", parseGallerySectionSubmission], ["Music", parseMusicSectionSubmission],
  ["Showreel", parseShowreelSectionSubmission], ["Contact", parseContactSectionSubmission],
] as const;

describe("Optional main hero headings in every editor", () => {
  for (const [page, parse] of saveParsers) {
    it(`${page} accepts an empty or whitespace-only heading without replacing it`, () => {
      for (const title of ["", " \t\n "]) {
        expect(parse("hero", { ...hero, title }, versions)).toMatchObject({
          success: true, data: { payload: hero, versions },
        });
      }
      expect(parse("hero", { ...hero, title: "  Restored heading  " }, versions)).toMatchObject({
        success: true, data: { payload: { ...hero, title: "Restored heading" } },
      });
    });
    it(`${page} retains explicit strings, length, media and version validation`, () => {
      for (const title of [undefined, null, false, 42, "x".repeat(221)]) {
        expect(parse("hero", { ...hero, title }, versions).success).toBe(false);
      }
      expect(parse("hero", { ...hero, title: "x".repeat(220) }, versions).success).toBe(true);
      expect(parse("hero", { ...hero, extra: true }, versions).success).toBe(false);
      expect(parse("hero", { ...hero, backgroundSrc: "javascript:alert(1)" }, versions).success).toBe(false);
      expect(parse("hero", hero, { updatedAt: "invalid" }).success).toBe(false);
    });
  }

  it("reopens saved blank headings on all six pages without locking the editor", () => {
    const home = createFallbackHomeEditorSnapshot();
    const bio = createFallbackBioEditorSnapshot();
    const gallery = createFallbackGalleryEditorSnapshot();
    const music = createFallbackMusicEditorSnapshot();
    const showreel = createFallbackShowreelEditorSnapshot();
    const contact = createFallbackContactEditorSnapshot();
    const savedHero = { ...hero, updatedAt };
    const snapshots = [
      parseHomeEditorSnapshot({ ...home, draft: { ...home.draft, hero } }),
      parseBioEditorSnapshot({
        hero: savedHero,
        biography: { ...bio.draft.biography, galleryImages: [], paragraphs: [], profileUpdatedAt: updatedAt },
        resume: { ...bio.draft.resume, updatedAt }, credits: [], footer: bio.footer, hasResumeDetails: false,
      }),
      parseGalleryEditorSnapshot({ hero: savedHero, introduction: { ...gallery.draft.introduction, updatedAt }, frames: { items: [] }, footer: gallery.footer }),
      parseMusicEditorSnapshot({
        hero: savedHero,
        spotify: { ...music.draft.spotify, settingsUpdatedAt: updatedAt, presentationUpdatedAt: updatedAt },
        platforms: [], soundcloud: { mixesHeading: music.draft.soundcloud.mixesHeading, presentationUpdatedAt: updatedAt, tracks: [] },
        footer: music.footer,
      }),
      parseShowreelEditorSnapshot({ hero: savedHero, introduction: { ...showreel.draft.introduction, updatedAt }, works: { items: [] }, footer: showreel.footer }),
      parseContactEditorSnapshot({ hero: savedHero, details: { ...contact.draft.details, updatedAt } }),
    ];
    snapshots.forEach(snapshot => {
      expect(snapshot).not.toBeNull();
      expect(snapshot?.draft.hero).toMatchObject(hero);
    });
  });

  it("labels every V2 hero title optional and preserves legacy hero support", () => {
    for (const page of ["Home", "Bio", "Gallery", "Music", "Showreel", "Contact"]) {
      const source = readFileSync(`components/admin/v2/${page}Editor.tsx`, "utf8");
      expect(source).toContain("Main title (optional)");
      expect(source).toContain("Leave blank to hide the heading.");
      expect(source).not.toMatch(/label="Main title[^"]*" required/);
    }
    for (const file of ["components/admin/ContentEditor.tsx", "components/admin/MediaManager.tsx"]) {
      const source = readFileSync(file, "utf8");
      expect(source).toContain("Leave blank to hide the heading.");
      expect(source).not.toMatch(/defaultValue=\{hero.title\} name="title" required/);
    }
    for (const [file, schema] of [["app/admin/content/actions.ts", "heroSchema"], ["app/admin/media/actions.ts", "galleryHeroSchema"]]) {
      const source = readFileSync(file, "utf8");
      const title = source.slice(source.indexOf(`const ${schema} =`)).match(/title: ([^\n]+)/)?.[1];
      expect(title).toBeDefined();
      expect(title).not.toContain(".min(1)");
    }
  });
});
