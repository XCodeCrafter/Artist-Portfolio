import { describe, expect, it } from "vitest";
import {
  BIO_PREVIEW_UPDATE_MESSAGE,
  createBioPageViewDataFromEditor,
  createFallbackBioEditorSnapshot,
  getDirtyBioSections,
  getBioCreditMoveTarget,
  moveBioEditorItem,
  parseBioBiographyDraft,
  parseBioCreditsDraft,
  parseBioEditorSnapshot,
  parseBioHeroDraft,
  parseBioPreviewUpdateMessage,
  parseBioResumeDraft,
  parseBioSectionSubmission,
} from "@/lib/admin/bio-editor";

const UPDATED_AT = "2026-09-03T10:00:00.000Z";
const NEXT_UPDATED_AT = "2026-09-03T10:01:00.000Z";

const hero = {
  title: "BIOGRAPHY",
  subtitle: "BIO",
  ctaLabel: "READ",
  ctaHref: "#bio",
  backgroundSrc: "/images/bio-hero.jpg",
  posterSrc: "",
  mediaType: "image" as const,
};

const biography = {
  topLabel: "About",
  introText: "Actor and musician.",
  caption: "Amsterdam / Actor / Musician",
  galleryImages: [
    {
      id: "portrait-01",
      src: "/images/bio.jpg",
      alt: "Portrait",
      isPublished: true,
    },
  ],
  paragraphs: [
    {
      id: "bio-01",
      body: "First paragraph.",
      revealDelay: 140,
      isPublished: true,
    },
  ],
};

const resume = {
  headline: "Actor resume",
  summary: "Screen and stage performer.",
  location: "Amsterdam",
  playingAge: "28–38",
  height: "180 cm",
  eyes: "Brown",
  hair: "Brown",
  languages: "English, Dutch",
  skills: "Movement, guitar",
  representation: "Independent",
  resumeUrl: "/resume.pdf",
};

const credits = {
  items: [
    {
      id: "film-01",
      creditType: "film" as const,
      title: "Example Film",
      role: "Lead",
      production: "Example Studio",
      director: "Example Director",
      year: "2026",
      href: "https://example.com/project",
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

describe("Admin V2 Bio editor parsers", () => {
  it("accepts and trims each save boundary", () => {
    expect(parseBioHeroDraft({ ...hero, title: "  BIOGRAPHY  " })).toMatchObject({
      success: true,
      data: { title: "BIOGRAPHY" },
    });
    expect(
      parseBioBiographyDraft({ ...biography, topLabel: "  About  " })
    ).toMatchObject({ success: true, data: { topLabel: "About" } });
    expect(parseBioResumeDraft({ ...resume, headline: "  Resume  " })).toMatchObject({
      success: true,
      data: { headline: "Resume" },
    });
    expect(parseBioCreditsDraft(credits)).toMatchObject({
      success: true,
      data: credits,
    });
  });

  it("rejects technical fields and unsafe save-time media", () => {
    expect(parseBioHeroDraft({ ...hero, pageSlug: "bio" }).success).toBe(false);
    expect(
      parseBioBiographyDraft({
        ...biography,
        galleryImages: [
          {
            ...biography.galleryImages[0],
            src: "https://example.com/unmanaged.jpg",
          },
        ],
      }).success
    ).toBe(false);
    expect(
      parseBioCreditsDraft({
        items: [{ ...credits.items[0], sortOrder: 10 }],
      }).success
    ).toBe(false);
  });

  it("rejects unsafe links and invalid collection data", () => {
    expect(
      parseBioResumeDraft({ ...resume, resumeUrl: "javascript:alert(1)" })
        .success
    ).toBe(false);
    expect(
      parseBioBiographyDraft({
        ...biography,
        paragraphs: [
          { ...biography.paragraphs[0], revealDelay: 5001 },
        ],
      }).success
    ).toBe(false);
    expect(
      parseBioBiographyDraft({
        ...biography,
        galleryImages: [
          biography.galleryImages[0],
          biography.galleryImages[0],
        ],
      }).success
    ).toBe(false);
  });

  it("binds every section to its exact optimistic version shape", () => {
    expect(
      parseBioSectionSubmission("hero", hero, { updatedAt: UPDATED_AT }).success
    ).toBe(true);
    expect(
      parseBioSectionSubmission("biography", biography, {
        profileUpdatedAt: UPDATED_AT,
        galleryItems: { "portrait-01": UPDATED_AT },
        paragraphItems: { "bio-01": UPDATED_AT },
      }).success
    ).toBe(true);
    expect(
      parseBioSectionSubmission("resume", resume, { updatedAt: UPDATED_AT })
        .success
    ).toBe(true);
    expect(
      parseBioSectionSubmission("credits", credits, {
        items: { "film-01": UPDATED_AT },
      }).success
    ).toBe(true);
    expect(
      parseBioSectionSubmission("resume", resume, {
        updatedAt: "yesterday-ish",
      }).success
    ).toBe(false);
  });

  it("allows growth but never lets a saved biography item disappear", () => {
    const withNewParagraph = {
      ...biography,
      paragraphs: [
        ...biography.paragraphs,
        {
          id: "bio:new-second",
          body: "Second paragraph.",
          revealDelay: 200,
          isPublished: false,
        },
      ],
    };
    const baselineVersions = {
      profileUpdatedAt: UPDATED_AT,
      galleryItems: { "portrait-01": UPDATED_AT },
      paragraphItems: { "bio-01": UPDATED_AT },
    };

    expect(
      parseBioSectionSubmission(
        "biography",
        withNewParagraph,
        baselineVersions
      ).success
    ).toBe(true);
    expect(
      parseBioSectionSubmission(
        "biography",
        { ...biography, paragraphs: [] },
        baselineVersions
      ).success
    ).toBe(false);
    expect(
      parseBioSectionSubmission(
        "biography",
        withNewParagraph,
        baselineVersions,
        { requireExactCollectionVersions: true }
      ).success
    ).toBe(false);
    expect(
      parseBioSectionSubmission(
        "biography",
        withNewParagraph,
        {
          ...baselineVersions,
          paragraphItems: {
            "bio-01": NEXT_UPDATED_AT,
            "bio:new-second": NEXT_UPDATED_AT,
          },
          galleryItems: { "portrait-01": NEXT_UPDATED_AT },
          profileUpdatedAt: NEXT_UPDATED_AT,
        },
        { requireExactCollectionVersions: true }
      ).success
    ).toBe(true);
  });

  it("applies the same no-disappearing-row rule to credits", () => {
    expect(
      parseBioSectionSubmission("credits", { items: [] }, {
        items: { "film-01": UPDATED_AT },
      }).success
    ).toBe(false);
    expect(
      parseBioSectionSubmission(
        "credits",
        {
          items: [
            ...credits.items,
            {
              ...credits.items[0],
              id: "theatre:new",
              creditType: "theatre",
              title: "New Stage Credit",
            },
          ],
        },
        { items: { "film-01": UPDATED_AT } }
      ).success
    ).toBe(true);
  });

  it("maps a strict service snapshot without leaking version fields into drafts", () => {
    const parsed = parseBioEditorSnapshot({
      hero: { ...hero, updatedAt: UPDATED_AT },
      biography: {
        topLabel: biography.topLabel,
        introText: biography.introText,
        caption: biography.caption,
        profileUpdatedAt: UPDATED_AT,
        galleryImages: [
          { ...biography.galleryImages[0], updatedAt: UPDATED_AT },
        ],
        paragraphs: [
          { ...biography.paragraphs[0], updatedAt: UPDATED_AT },
        ],
      },
      resume: { ...resume, updatedAt: UPDATED_AT },
      credits: [{ ...credits.items[0], updatedAt: UPDATED_AT }],
      footer,
      hasResumeDetails: true,
    });

    expect(parsed).toMatchObject({
      draft: { hero, biography, resume, credits },
      versions: {
        hero: { updatedAt: UPDATED_AT },
        biography: {
          profileUpdatedAt: UPDATED_AT,
          galleryItems: { "portrait-01": UPDATED_AT },
          paragraphItems: { "bio-01": UPDATED_AT },
        },
        resume: { updatedAt: UPDATED_AT },
        credits: { items: { "film-01": UPDATED_AT } },
      },
      hasResumeDetails: true,
    });
    expect(parsed?.draft.biography.galleryImages[0]).not.toHaveProperty(
      "updatedAt"
    );
    expect(parsed?.draft.credits.items[0]).not.toHaveProperty("updatedAt");
  });

  it("preserves truly empty database collections in a parsed snapshot", () => {
    const parsed = parseBioEditorSnapshot({
      hero: { ...hero, updatedAt: UPDATED_AT },
      biography: {
        topLabel: "",
        introText: "",
        caption: "",
        profileUpdatedAt: UPDATED_AT,
        galleryImages: [],
        paragraphs: [],
      },
      resume: { ...resume, updatedAt: UPDATED_AT },
      credits: [],
      footer,
      hasResumeDetails: true,
    });

    expect(parsed?.draft.biography.galleryImages).toEqual([]);
    expect(parsed?.draft.biography.paragraphs).toEqual([]);
    expect(parsed?.draft.credits.items).toEqual([]);
  });

  it("keeps live preview responsive while required fields are temporarily empty", () => {
    const parsed = parseBioPreviewUpdateMessage({
      type: BIO_PREVIEW_UPDATE_MESSAGE,
      draft: {
        hero: {
          ...hero,
          title: "",
          ctaHref: "javascript:alert(1)",
          backgroundSrc: "javascript:alert(2)",
        },
        biography: {
          ...biography,
          galleryImages: [
            { ...biography.galleryImages[0], src: "javascript:alert(3)" },
          ],
          paragraphs: [{ ...biography.paragraphs[0], body: "" }],
        },
        resume: { ...resume, resumeUrl: "javascript:alert(4)" },
        credits: {
          items: [{ ...credits.items[0], title: "", href: "javascript:x" }],
        },
      },
      footer,
      hasResumeDetails: true,
      focusRequestId: 1,
      selectedSection: "biography",
    });

    expect(parsed).not.toBeNull();
    expect(parsed?.draft.hero.backgroundSrc).toBe("");
    expect(parsed?.draft.hero.ctaHref).toBe("");
    expect(parsed?.draft.biography.galleryImages[0].src).toBe("");
    expect(parsed?.draft.biography.paragraphs[0].body).toBe("");
    expect(parsed?.draft.resume.resumeUrl).toBe("");
    expect(parsed?.draft.credits.items[0]).toMatchObject({ title: "", href: "" });
  });
});

describe("Bio editor helpers", () => {
  it("filters hidden rows for the shared public view", () => {
    const fallback = createFallbackBioEditorSnapshot();
    const draft = structuredClone(fallback.draft);
    draft.biography.galleryImages[0].isPublished = false;
    draft.biography.paragraphs[0].isPublished = false;
    draft.credits.items[0].isPublished = false;

    const view = createBioPageViewDataFromEditor(
      draft,
      fallback.footer,
      fallback.hasResumeDetails
    );

    expect(view.bio.galleryImages).toHaveLength(
      fallback.draft.biography.galleryImages.length - 1
    );
    expect(view.bio.paragraphs).toHaveLength(
      fallback.draft.biography.paragraphs.length - 1
    );
    expect(view.credits).toHaveLength(fallback.draft.credits.items.length - 1);
  });

  it("tracks dirty sections independently and reorders immutably", () => {
    const fallback = createFallbackBioEditorSnapshot();
    const draft = structuredClone(fallback.draft);
    draft.resume.headline = "Changed";
    expect(getDirtyBioSections(fallback.draft, draft)).toEqual(["resume"]);

    const source = ["one", "two", "three"];
    expect(moveBioEditorItem(source, 0, 2)).toEqual(["two", "three", "one"]);
    expect(source).toEqual(["one", "two", "three"]);
  });

  it("moves credits only inside their visible public group", () => {
    const mixed = [
      { creditType: "film" as const },
      { creditType: "theatre" as const },
      { creditType: "film" as const },
    ];

    expect(getBioCreditMoveTarget(mixed, 0, 1)).toBe(2);
    expect(getBioCreditMoveTarget(mixed, 2, -1)).toBe(0);
    expect(getBioCreditMoveTarget(mixed, 1, -1)).toBe(-1);
    expect(getBioCreditMoveTarget(mixed, 1, 1)).toBe(-1);
  });
});
