import { describe, expect, it } from "vitest";
import {
  GALLERY_PREVIEW_UPDATE_MESSAGE,
  createFallbackGalleryEditorSnapshot,
  createGalleryPageViewDataFromEditor,
  getDirtyGallerySections,
  moveGalleryEditorItem,
  parseGalleryEditorSnapshot,
  parseGalleryFramesDraft,
  parseGalleryHeroDraft,
  parseGalleryIntroductionDraft,
  parseGalleryPreviewUpdateMessage,
  parseGallerySectionSubmission,
} from "@/lib/admin/gallery-editor";

const UPDATED_AT = "2026-09-03T10:00:00.000Z";
const NEXT_UPDATED_AT = "2026-09-03T10:01:00.000Z";

const hero = {
  title: "GALLERY",
  subtitle: "HEADSHOTS",
  ctaLabel: "VIEW",
  ctaHref: "#gallery",
  backgroundSrc: "/images/gallery.jpg",
  posterSrc: "",
  mediaType: "image" as const,
};

const introduction = {
  introEyebrow: "Selected frames",
  introTitle: "A visual archive.",
};

const frames = {
  items: [
    {
      id: "gallery:portrait-01",
      title: "Editorial portrait",
      src: "/images/bio.jpg",
      alt: "Editorial actor portrait",
      caption: "Natural-light portrait.",
      category: "Headshot",
      isMosaic: true,
      isPublished: true,
    },
  ],
};

const footer = {
  artistName: "Example Artist",
  contactBlurb: "Bookings and collaborations.",
  footerEffect: "soul" as const,
  location: "Amsterdam",
  socialLinks: [],
  tagline: "Actor and musician",
};

describe("Admin V2 Gallery editor parsers", () => {
  it("accepts and trims all three save boundaries", () => {
    expect(parseGalleryHeroDraft({ ...hero, title: "  GALLERY  " })).toMatchObject({
      success: true,
      data: { title: "GALLERY" },
    });
    expect(
      parseGalleryIntroductionDraft({
        ...introduction,
        introEyebrow: "  Selected frames  ",
      })
    ).toMatchObject({ success: true, data: { introEyebrow: "Selected frames" } });
    expect(parseGalleryFramesDraft(frames)).toMatchObject({
      success: true,
      data: frames,
    });
  });

  it("requires the Hero CTA label and destination as a pair", () => {
    expect(parseGalleryHeroDraft({ ...hero, ctaHref: "" }).success).toBe(false);
    expect(parseGalleryHeroDraft({ ...hero, ctaLabel: "" }).success).toBe(false);
    expect(
      parseGalleryHeroDraft({ ...hero, ctaLabel: "", ctaHref: "" }).success
    ).toBe(true);
  });

  it("rejects unmanaged media, duplicate ids, and technical story fields", () => {
    expect(
      parseGalleryFramesDraft({
        items: [
          {
            ...frames.items[0],
            src: "https://example.com/unmanaged.jpg",
          },
        ],
      }).success
    ).toBe(false);
    expect(
      parseGalleryFramesDraft({
        items: [frames.items[0], frames.items[0]],
      }).success
    ).toBe(false);
    expect(
      parseGalleryFramesDraft({
        items: [
          {
            ...frames.items[0],
            isFreelanceStory: true,
          },
        ],
      }).success
    ).toBe(false);
  });

  it("allows appended frames but never omission of a saved frame", () => {
    const baseline = { items: { "gallery:portrait-01": UPDATED_AT } };
    const appended = {
      items: [
        ...frames.items,
        { ...frames.items[0], id: "gallery:new", title: "New frame" },
      ],
    };

    expect(
      parseGallerySectionSubmission("frames", appended, baseline).success
    ).toBe(true);
    expect(
      parseGallerySectionSubmission("frames", { items: [] }, baseline).success
    ).toBe(false);
    expect(
      parseGallerySectionSubmission("frames", appended, baseline, {
        requireExactCollectionVersions: true,
      }).success
    ).toBe(false);
    expect(
      parseGallerySectionSubmission(
        "frames",
        appended,
        {
          items: {
            "gallery:portrait-01": NEXT_UPDATED_AT,
            "gallery:new": NEXT_UPDATED_AT,
          },
        },
        { requireExactCollectionVersions: true }
      ).success
    ).toBe(true);
  });

  it("rejects extra or missing keys in a returned frame version map", () => {
    expect(
      parseGallerySectionSubmission(
        "frames",
        frames,
        {
          items: {
            "gallery:portrait-01": NEXT_UPDATED_AT,
            "gallery:ghost": NEXT_UPDATED_AT,
          },
        },
        { requireExactCollectionVersions: true }
      ).success
    ).toBe(false);
  });

  it("maps a strict service snapshot without leaking timestamps into drafts", () => {
    const parsed = parseGalleryEditorSnapshot({
      hero: { ...hero, updatedAt: UPDATED_AT },
      introduction: { ...introduction, updatedAt: UPDATED_AT },
      frames: {
        items: [{ ...frames.items[0], updatedAt: UPDATED_AT }],
      },
      footer,
    });

    expect(parsed).toMatchObject({
      draft: { hero, introduction, frames },
      versions: {
        hero: { updatedAt: UPDATED_AT },
        introduction: { updatedAt: UPDATED_AT },
        frames: { items: { "gallery:portrait-01": UPDATED_AT } },
      },
    });
    expect(parsed?.draft.frames.items[0]).not.toHaveProperty("updatedAt");
  });

  it("preserves a truly empty frame collection", () => {
    const parsed = parseGalleryEditorSnapshot({
      hero: { ...hero, updatedAt: UPDATED_AT },
      introduction: { ...introduction, updatedAt: UPDATED_AT },
      frames: { items: [] },
      footer,
    });
    expect(parsed?.draft.frames.items).toEqual([]);
  });

  it("sanitizes unsafe live-preview media without rejecting an unfinished draft", () => {
    const parsed = parseGalleryPreviewUpdateMessage({
      type: GALLERY_PREVIEW_UPDATE_MESSAGE,
      draft: {
        hero: {
          ...hero,
          title: "",
          ctaHref: "javascript:alert(1)",
          backgroundSrc: "javascript:alert(2)",
        },
        introduction: { introEyebrow: "", introTitle: "" },
        frames: {
          items: [
            { ...frames.items[0], title: "", src: "javascript:alert(3)" },
          ],
        },
      },
      footer,
      focusRequestId: 1,
      selectedSection: "frames",
    });

    expect(parsed).not.toBeNull();
    expect(parsed?.draft.hero.ctaHref).toBe("");
    expect(parsed?.draft.hero.backgroundSrc).toBe("");
    expect(parsed?.draft.frames.items[0].src).toBe("");
  });
});

describe("Gallery editor helpers", () => {
  it("keeps published catalog rows for exact public empty-mosaic behavior", () => {
    const view = createGalleryPageViewDataFromEditor(
      {
        hero,
        introduction,
        frames: {
          items: [
            { ...frames.items[0], isMosaic: false },
            {
              ...frames.items[0],
              id: "gallery:hidden",
              isPublished: false,
            },
          ],
        },
      },
      footer
    );

    expect(view.images).toHaveLength(1);
    expect(view.images[0]).toMatchObject({
      isMosaic: false,
      isFreelanceStory: false,
    });
  });

  it("keeps an unfinished empty-source frame out of the live image preview", () => {
    const view = createGalleryPageViewDataFromEditor(
      {
        hero,
        introduction,
        frames: {
          items: [{ ...frames.items[0], id: "gallery:new", src: "" }],
        },
      },
      footer
    );

    expect(view.images).toEqual([]);
  });

  it("tracks dirty sections and reorders immutably", () => {
    const fallback = createFallbackGalleryEditorSnapshot();
    const draft = structuredClone(fallback.draft);
    draft.introduction.introTitle = "Changed";
    expect(getDirtyGallerySections(fallback.draft, draft)).toEqual([
      "introduction",
    ]);

    const source = ["one", "two", "three"];
    expect(moveGalleryEditorItem(source, 0, 2)).toEqual([
      "two",
      "three",
      "one",
    ]);
    expect(source).toEqual(["one", "two", "three"]);
  });
});
