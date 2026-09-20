import { describe, expect, it } from "vitest";
import { FALLBACK_CONTENT } from "@/lib/content/fallback";
import { HOME_CONTENT_SECTIONS, HOME_EDITOR_SECTIONS, HOME_PREVIEW_UPDATE_MESSAGE, createFallbackHomeEditorSnapshot, createHomeDraftFromContent, getDirtyHomeSections, parseHomeEditorDraft, parseHomeEditorSnapshot, parseHomePreviewUpdateMessage, parseHomeSectionSubmission } from "@/lib/admin/home-editor";

const versions = { updatedAt: "2026-09-20T10:00:00.000000Z" };
describe("Home V2 editor", () => {
  it("preserves original HOME media fallbacks and all five independently ordered sections", () => {
    const draft = createHomeDraftFromContent(FALLBACK_CONTENT);
    expect(draft.hero).toEqual(FALLBACK_CONTENT.heroes.home);
    expect(draft.layout.map((item) => item.id)).toEqual(HOME_CONTENT_SECTIONS);
    expect(draft.feature.videoSrc).toBe("/media/hero-loop.mp4");
    expect(draft.stories.images[0].src).toBe(FALLBACK_CONTENT.galleryImages[0].src);
    for (const section of HOME_EDITOR_SECTIONS) expect(parseHomeSectionSubmission(section, draft[section], versions).success).toBe(true);
    expect(parseHomeEditorSnapshot({ draft, versions })).toEqual({ draft, versions });
  });
  it("requires an exact section permutation with at least one visible section", () => {
    const draft = createFallbackHomeEditorSnapshot().draft;
    const reversed = [...draft.layout].reverse().map((item) => ({ ...item, enabled: item.id === "stories" }));
    expect(parseHomeSectionSubmission("layout", reversed, versions).success).toBe(true);
    for (const layout of [draft.layout.slice(1), [...draft.layout, draft.layout[0]], draft.layout.map((item) => ({ ...item, enabled: false })), draft.layout.map(() => draft.layout[0])]) {
      expect(parseHomeSectionSubmission("layout", layout, versions).success).toBe(false);
    }
  });
  it("changes layout without deleting disabled content and detects only dirty sections", () => {
    const baseline = createFallbackHomeEditorSnapshot().draft;
    const draft = structuredClone(baseline);
    draft.layout.reverse();
    draft.layout.find((item) => item.id === "cnc")!.enabled = false;
    expect(getDirtyHomeSections(baseline, draft)).toEqual(["layout"]);
    expect(draft.cnc).toEqual(baseline.cnc);
    draft.about.body = "New introduction";
    expect(getDirtyHomeSections(baseline, draft)).toEqual(["layout", "about"]);
  });
  it("rejects malicious or unmanaged sources, invalid story collections, stale-shaped versions and unknown keys", () => {
    const { draft } = createFallbackHomeEditorSnapshot();
    for (const imageSrc of ["//evil.example/a.jpg", "/\\evil.example/a.jpg", "javascript:alert(1)", "https://unmanaged.example/a.jpg"]) {
      expect(parseHomeSectionSubmission("about", { ...draft.about, imageSrc }, versions).success).toBe(false);
    }
    expect(parseHomeSectionSubmission("stories", { ...draft.stories, images: draft.stories.images.slice(1) }, versions).success).toBe(false);
    expect(parseHomeSectionSubmission("cnc", { ...draft.cnc, admin: true }, versions).success).toBe(false);
    expect(parseHomeSectionSubmission("hero", draft.hero, { hero: versions }).success).toBe(false);
    expect(parseHomeSectionSubmission("footer", draft.hero, versions).success).toBe(false);
    expect(parseHomeSectionSubmission("hero", { ...draft.hero, ctaLabel: "Click", ctaHref: "" }, versions).success).toBe(false);
    expect(parseHomeSectionSubmission("feature", { ...draft.feature, ctaHref: "https://user:secret@example.com/" }, versions).success).toBe(false);
  });
  it("keeps incomplete edits in preview but neutralizes unsafe destinations", () => {
    const draft = createFallbackHomeEditorSnapshot().draft;
    draft.hero.title = "";
    draft.hero.backgroundSrc = "javascript:alert(1)";
    draft.about.ctaHref = "//evil.example";
    draft.stories.images[0].src = "data:image/svg+xml,malicious";
    draft.cnc.body = "  still typing  ";
    const preview = parseHomePreviewUpdateMessage({ type: HOME_PREVIEW_UPDATE_MESSAGE, draft, selectedSection: "hero", focusRequestId: 1 });
    expect(preview?.draft.hero.title).toBe("");
    expect(preview?.draft.hero.backgroundSrc).toBe("");
    expect(preview?.draft.about.ctaHref).toBe("");
    expect(preview?.draft.stories.images[0].src).toBe("");
    expect(preview?.draft.cnc.body).toBe("  still typing  ");
    expect(draft.hero.backgroundSrc).toBe("javascript:alert(1)");
  });
  it("accepts historical saved content but rejects malformed snapshots", () => {
    const snapshot = createFallbackHomeEditorSnapshot();
    snapshot.draft.hero.backgroundSrc = "https://legacy-cdn.example/home.jpg";
    expect(parseHomeEditorDraft(snapshot.draft)).toEqual(snapshot.draft);
    expect(parseHomeEditorSnapshot(snapshot)).toEqual(snapshot);
    expect(parseHomeEditorSnapshot({ ...snapshot, versions: { updatedAt: "yesterday" } })).toBeNull();
    expect(parseHomeEditorDraft({ ...snapshot.draft, stories: { images: [] } })).toBeNull();
  });
});
