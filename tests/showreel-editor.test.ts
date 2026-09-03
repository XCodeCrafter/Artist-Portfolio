import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SHOWREEL_PREVIEW_UPDATE_MESSAGE,
  createFallbackShowreelEditorSnapshot,
  createShowreelPageViewDataFromEditor,
  getDirtyShowreelSections,
  moveShowreelEditorItem,
  parseShowreelEditorSnapshot,
  parseShowreelHeroDraft,
  parseShowreelIntroductionDraft,
  parseShowreelPreviewUpdateMessage,
  parseShowreelSectionSubmission,
  parseShowreelWorksDraft,
} from "@/lib/admin/showreel-editor";

const UPDATED_AT = "2026-09-03T10:00:00.000Z";
const NEXT_UPDATED_AT = "2026-09-03T10:01:00.000Z";

const hero = {
  title: "SHOWREEL",
  subtitle: "ACTOR",
  ctaLabel: "WATCH",
  ctaHref: "#videos",
  backgroundSrc: "/images/showreel.jpg",
  posterSrc: "",
  mediaType: "image" as const,
};

const introduction = {
  sectionEyebrow: "Selected work",
  sectionTitle: "Showreels, scenes, and music videos",
  sectionBody: "Screen work and selected performances.",
  emptyText: "More video work is coming soon.",
};

const showreel = {
  id: "showreel:main",
  title: "Casting reel",
  description: "A concise acting reel.",
  embedUrl: "https://www.youtube.com/watch?v=abcdefghijk",
  platform: "YouTube",
  thumbnailSrc: "/images/showreel-thumb.jpg",
  videoType: "showreel" as const,
  isFeatured: true,
  isPublished: true,
};

const legacyMusicVideo = {
  id: "legacy-music-video",
  title: "Legacy music video",
  description: "Kept from the original musician portfolio.",
  embedUrl: "https://vimeo.com/123456789",
  platform: "Vimeo",
  thumbnailSrc: "",
  videoType: "music_video" as const,
  isFeatured: false,
  isPublished: false,
};

const works = { items: [showreel, legacyMusicVideo] };

const footer = {
  artistName: "Example Artist",
  contactBlurb: "Bookings and collaborations.",
  footerEffect: "soul" as const,
  location: "Amsterdam",
  socialLinks: [],
  tagline: "Actor and musician",
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Admin V2 Showreel editor parsers", () => {
  it("accepts and trims the three independent save boundaries", () => {
    expect(
      parseShowreelHeroDraft({ ...hero, title: "  SHOWREEL  " })
    ).toMatchObject({ success: true, data: { title: "SHOWREEL" } });
    expect(
      parseShowreelIntroductionDraft({
        ...introduction,
        sectionEyebrow: "  Selected work  ",
        sectionBody: "B".repeat(1_200),
      })
    ).toMatchObject({
      success: true,
      data: { sectionEyebrow: "Selected work" },
    });
    expect(parseShowreelWorksDraft(works)).toMatchObject({
      success: true,
      data: works,
    });
  });

  it("requires Hero CTA fields as a pair and rejects unsafe media URLs", () => {
    expect(parseShowreelHeroDraft({ ...hero, ctaHref: "" }).success).toBe(
      false
    );
    expect(parseShowreelHeroDraft({ ...hero, ctaLabel: "" }).success).toBe(
      false
    );
    expect(
      parseShowreelHeroDraft({ ...hero, ctaLabel: "", ctaHref: "" }).success
    ).toBe(true);
    expect(
      parseShowreelHeroDraft({
        ...hero,
        backgroundSrc: "javascript:alert(1)",
      }).success
    ).toBe(false);
    expect(
      parseShowreelHeroDraft({
        ...hero,
        ctaHref: "https://admin:secret@example.com/watch",
      }).success
    ).toBe(false);
  });

  it("requires genuine YouTube and Vimeo hosts for those platform labels", () => {
    expect(
      parseShowreelWorksDraft({
        items: [
          {
            ...showreel,
            embedUrl: "https://example.com/watch?v=abcdefghijk",
          },
        ],
      }).success
    ).toBe(false);
    expect(
      parseShowreelWorksDraft({
        items: [
          {
            ...legacyMusicVideo,
            embedUrl: "https://vimeo.example.com/123456789",
            isPublished: true,
          },
        ],
      }).success
    ).toBe(false);
    expect(
      parseShowreelWorksDraft({
        items: [
          {
            ...showreel,
            embedUrl: "https://youtu.be/abcdefghijk",
          },
          legacyMusicVideo,
        ],
      }).success
    ).toBe(true);
  });

  it("rejects arbitrary external hero, thumbnail, and direct-video media on submission", () => {
    expect(
      parseShowreelSectionSubmission(
        "hero",
        {
          ...hero,
          backgroundSrc: "https://cdn.example/hero.jpg",
        },
        { updatedAt: UPDATED_AT }
      ).success
    ).toBe(false);
    expect(
      parseShowreelSectionSubmission(
        "hero",
        {
          ...hero,
          posterSrc: "https://cdn.example/poster.jpg",
        },
        { updatedAt: UPDATED_AT }
      ).success
    ).toBe(false);
    expect(
      parseShowreelSectionSubmission(
        "works",
        {
          items: [
            {
              ...showreel,
              embedUrl: "https://cdn.example/reel.mp4",
              platform: "direct",
            },
          ],
        },
        { items: { [showreel.id]: UPDATED_AT } }
      ).success
    ).toBe(false);
    expect(
      parseShowreelSectionSubmission(
        "works",
        {
          items: [
            {
              ...showreel,
              thumbnailSrc: "https://cdn.example/thumb.jpg",
            },
          ],
        },
        { items: { [showreel.id]: UPDATED_AT } }
      ).success
    ).toBe(false);
  });

  it("preserves an unsafe historical source while its row stays hidden", () => {
    expect(
      parseShowreelWorksDraft({
        items: [
          {
            ...legacyMusicVideo,
            embedUrl: "https://legacy-cdn.example/reel.mp4",
            platform: "direct",
            isPublished: false,
          },
        ],
      }).success
    ).toBe(true);
    expect(
      parseShowreelWorksDraft({
        items: [
          {
            ...legacyMusicVideo,
            embedUrl: "https://legacy-cdn.example/reel.mp4",
            platform: "direct",
            isPublished: true,
          },
        ],
      }).success
    ).toBe(false);
  });

  it("accepts local media paths and this site's configured public Supabase storage", () => {
    vi.stubEnv(
      "NEXT_PUBLIC_SUPABASE_URL",
      "https://project-ref.supabase.co"
    );
    const storageRoot =
      "https://project-ref.supabase.co/storage/v1/object/public/artist-media";

    expect(
      parseShowreelSectionSubmission(
        "hero",
        {
          ...hero,
          backgroundSrc: "/uploads/hero.jpg",
          posterSrc: "/uploads/poster.jpg",
        },
        { updatedAt: UPDATED_AT }
      ).success
    ).toBe(true);
    expect(
      parseShowreelSectionSubmission(
        "works",
        {
          items: [
            {
              ...showreel,
              embedUrl: "/uploads/reel.mp4",
              platform: "direct",
              thumbnailSrc: "/uploads/reel.jpg",
            },
          ],
        },
        { items: { [showreel.id]: UPDATED_AT } }
      ).success
    ).toBe(true);
    expect(
      parseShowreelSectionSubmission(
        "hero",
        {
          ...hero,
          backgroundSrc: `${storageRoot}/hero.jpg`,
          posterSrc: `${storageRoot}/poster.jpg`,
        },
        { updatedAt: UPDATED_AT }
      ).success
    ).toBe(true);
    expect(
      parseShowreelSectionSubmission(
        "works",
        {
          items: [
            {
              ...showreel,
              embedUrl: `${storageRoot}/reel.mp4`,
              platform: "direct",
              thumbnailSrc: `${storageRoot}/reel.jpg`,
            },
          ],
        },
        { items: { [showreel.id]: UPDATED_AT } }
      ).success
    ).toBe(true);
  });

  it.each([
    ["YouTube", "https://youtube.com.attacker.test/watch?v=abcdefghijk"],
    ["YouTube", "https://youtube.com:444/watch?v=abcdefghijk"],
    ["Vimeo", "https://vimeo.com.attacker.test/123456789"],
    ["Vimeo", "https://player.vimeo.com:8443/video/123456789"],
  ])("rejects %s lookalikes or non-default ports: %s", (platform, embedUrl) => {
    expect(
      parseShowreelSectionSubmission(
        "works",
        { items: [{ ...showreel, platform, embedUrl }] },
        { items: { [showreel.id]: UPDATED_AT } }
      ).success
    ).toBe(false);
  });

  it("rejects duplicate ids and more than one legacy featured marker", () => {
    expect(
      parseShowreelWorksDraft({ items: [showreel, showreel] }).success
    ).toBe(false);
    expect(
      parseShowreelWorksDraft({
        items: [showreel, { ...legacyMusicVideo, isFeatured: true }],
      }).success
    ).toBe(false);
  });

  it("allows appends but never omission of a saved legacy music-video row", () => {
    const baseline = {
      items: {
        [showreel.id]: UPDATED_AT,
        [legacyMusicVideo.id]: UPDATED_AT,
      },
    };
    const appended = {
      items: [
        ...works.items,
        {
          ...showreel,
          id: "showreel:new",
          title: "New scene",
          isFeatured: false,
        },
      ],
    };

    expect(
      parseShowreelSectionSubmission("works", appended, baseline).success
    ).toBe(true);
    expect(
      parseShowreelSectionSubmission(
        "works",
        { items: [showreel] },
        baseline
      ).success
    ).toBe(false);
    expect(
      parseShowreelSectionSubmission("works", appended, baseline, {
        requireExactCollectionVersions: true,
      }).success
    ).toBe(false);
    expect(
      parseShowreelSectionSubmission(
        "works",
        appended,
        {
          items: {
            [showreel.id]: NEXT_UPDATED_AT,
            [legacyMusicVideo.id]: NEXT_UPDATED_AT,
            "showreel:new": NEXT_UPDATED_AT,
          },
        },
        { requireExactCollectionVersions: true }
      ).success
    ).toBe(true);
  });

  it("rejects extra or missing ids in the confirmed works version map", () => {
    expect(
      parseShowreelSectionSubmission(
        "works",
        works,
        {
          items: {
            [showreel.id]: NEXT_UPDATED_AT,
            [legacyMusicVideo.id]: NEXT_UPDATED_AT,
            ghost: NEXT_UPDATED_AT,
          },
        },
        { requireExactCollectionVersions: true }
      ).success
    ).toBe(false);
    expect(
      parseShowreelSectionSubmission(
        "works",
        works,
        { items: { [showreel.id]: NEXT_UPDATED_AT } },
        { requireExactCollectionVersions: true }
      ).success
    ).toBe(false);
  });

  it("preserves historical ids and catalogs above the new-item UI cap", () => {
    const items = Array.from({ length: 121 }, (_, index) => ({
      ...showreel,
      id: index === 0 ? "Legacy video / 2019" : `legacy-${index}`,
      isFeatured: index === 0,
    }));
    const versions = {
      items: Object.fromEntries(items.map((item) => [item.id, UPDATED_AT])),
    };

    expect(parseShowreelSectionSubmission("works", { items }, versions).success).toBe(
      true
    );
    expect(
      parseShowreelSectionSubmission(
        "works",
        { items: [{ ...showreel, id: "new id with spaces" }] },
        { items: {} }
      ).success
    ).toBe(false);
  });

  it("maps the complete strict snapshot and keeps hidden music_video rows", () => {
    const parsed = parseShowreelEditorSnapshot({
      hero: { ...hero, updatedAt: UPDATED_AT },
      introduction: { ...introduction, updatedAt: UPDATED_AT },
      works: {
        items: works.items.map((item) => ({ ...item, updatedAt: UPDATED_AT })),
      },
      footer,
    });

    expect(parsed).toMatchObject({
      draft: { hero, introduction, works },
      versions: {
        hero: { updatedAt: UPDATED_AT },
        introduction: { updatedAt: UPDATED_AT },
        works: {
          items: {
            [showreel.id]: UPDATED_AT,
            [legacyMusicVideo.id]: UPDATED_AT,
          },
        },
      },
    });
    expect(parsed?.draft.works.items[1]).toMatchObject({
      videoType: "music_video",
      isPublished: false,
    });
    expect(parsed?.draft.works.items[0]).not.toHaveProperty("updatedAt");
  });

  it("loads historical V1 limits and empty introduction without weakening saves", () => {
    const legacyHero = {
      ...hero,
      backgroundSrc: "https://legacy-cdn.example/hero.mp4",
      mediaType: "video" as const,
      updatedAt: UPDATED_AT,
    };
    const legacyIntroduction = {
      ...introduction,
      sectionEyebrow: "",
      sectionBody: "B".repeat(1_200),
      emptyText: "",
      updatedAt: UPDATED_AT,
    };
    const legacyDirect = {
      ...showreel,
      id: "legacy-direct",
      title: "T".repeat(220),
      embedUrl: "https://legacy-cdn.example/reel.mp4",
      platform: "direct",
      isFeatured: false,
      updatedAt: UPDATED_AT,
    };
    const legacyLongPlatform = {
      ...legacyMusicVideo,
      id: "legacy-platform",
      embedUrl: "https://legacy-embed.example/watch/123",
      platform: "P".repeat(80),
      updatedAt: UPDATED_AT,
    };

    const parsed = parseShowreelEditorSnapshot({
      hero: legacyHero,
      introduction: legacyIntroduction,
      works: { items: [legacyDirect, legacyLongPlatform] },
      footer,
    });

    expect(parsed).not.toBeNull();
    expect(parsed?.draft.hero.backgroundSrc).toBe(legacyHero.backgroundSrc);
    expect(parsed?.draft.introduction).toMatchObject({
      sectionEyebrow: "",
      emptyText: "",
    });
    expect(parsed?.draft.introduction.sectionBody).toHaveLength(1_200);
    expect(parsed?.draft.works.items[0].title).toHaveLength(220);
    expect(parsed?.draft.works.items[1].platform).toHaveLength(80);

    expect(parseShowreelHeroDraft(parsed?.draft.hero).success).toBe(false);
    expect(
      parseShowreelIntroductionDraft(parsed?.draft.introduction).success
    ).toBe(false);
    expect(parseShowreelWorksDraft(parsed?.draft.works).success).toBe(false);
  });

  it("preserves a truly empty video catalog", () => {
    const parsed = parseShowreelEditorSnapshot({
      hero: { ...hero, updatedAt: UPDATED_AT },
      introduction: { ...introduction, updatedAt: UPDATED_AT },
      works: { items: [] },
      footer,
    });
    expect(parsed?.draft.works.items).toEqual([]);
    expect(parsed?.versions.works.items).toEqual({});
  });

  it("sanitizes unsafe live-preview URLs without rejecting unfinished copy", () => {
    const parsed = parseShowreelPreviewUpdateMessage({
      type: SHOWREEL_PREVIEW_UPDATE_MESSAGE,
      draft: {
        hero: {
          ...hero,
          title: "",
          ctaHref: "javascript:alert(1)",
          backgroundSrc: "javascript:alert(2)",
          posterSrc: "http://insecure.example/poster.jpg",
        },
        introduction: {
          sectionEyebrow: "",
          sectionTitle: "",
          sectionBody: "",
          emptyText: "",
        },
        works: {
          items: [
            {
              ...showreel,
              title: "",
              embedUrl: "javascript:alert(3)",
              thumbnailSrc: "//evil.example/thumb.jpg",
            },
          ],
        },
      },
      footer,
      focusRequestId: 1,
      selectedSection: "works",
    });

    expect(parsed).not.toBeNull();
    expect(parsed?.draft.hero.ctaHref).toBe("");
    expect(parsed?.draft.hero.backgroundSrc).toBe("");
    expect(parsed?.draft.hero.posterSrc).toBe("");
    expect(parsed?.draft.works.items[0].embedUrl).toBe("");
    expect(parsed?.draft.works.items[0].thumbnailSrc).toBe("");
  });
});

describe("Showreel editor helpers", () => {
  it("publishes only complete visible items while retaining music-video type", () => {
    const view = createShowreelPageViewDataFromEditor(
      {
        hero,
        introduction,
        works: {
          items: [
            showreel,
            { ...legacyMusicVideo, isPublished: true },
            { ...showreel, id: "showreel:hidden", isPublished: false },
            { ...showreel, id: "showreel:unfinished", embedUrl: "" },
          ],
        },
      },
      footer
    );

    expect(view.videos.map((item) => item.id)).toEqual([
      showreel.id,
      legacyMusicVideo.id,
    ]);
    expect(view.videos[1].videoType).toBe("music_video");
    expect(view.videos[0]).not.toHaveProperty("isPublished");
  });

  it("tracks dirty sections and reorders without mutating the source", () => {
    const fallback = createFallbackShowreelEditorSnapshot();
    const draft = structuredClone(fallback.draft);
    draft.introduction.sectionTitle = "Changed";
    expect(getDirtyShowreelSections(fallback.draft, draft)).toEqual([
      "introduction",
    ]);

    const source = ["one", "two", "three"];
    expect(moveShowreelEditorItem(source, 0, 2)).toEqual([
      "two",
      "three",
      "one",
    ]);
    expect(source).toEqual(["one", "two", "three"]);
  });
});
