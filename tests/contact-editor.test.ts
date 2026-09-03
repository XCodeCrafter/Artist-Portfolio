import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CONTACT_PREVIEW_UPDATE_MESSAGE,
  createContactPageViewDataFromEditor,
  createFallbackContactEditorSnapshot,
  getContactSectionPayload,
  getContactSectionVersions,
  getDirtyContactSections,
  isContactSectionDirty,
  parseContactDetailsDraft,
  parseContactEditorSnapshot,
  parseContactHeroDraft,
  parseContactPreviewUpdateMessage,
  parseContactSectionSubmission,
} from "@/lib/admin/contact-editor";

const UPDATED_AT = "2026-09-04T08:00:00.000Z";

const hero = {
  title: "CONTACT",
  subtitle: "LET'S WORK TOGETHER",
  ctaLabel: "WRITE",
  ctaHref: "#form",
  backgroundSrc: "/images/booking-hero.jpg",
  posterSrc: "",
  mediaType: "image" as const,
};

const details = {
  location: "Prague / Worldwide",
  contactBlurb: "For acting, music, productions, and creative collaborations.",
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Admin V2 Contact editor parsers", () => {
  it("accepts, strictly shapes, and trims both independent save boundaries", () => {
    expect(
      parseContactHeroDraft({ ...hero, title: "  CONTACT  " })
    ).toMatchObject({ success: true, data: { title: "CONTACT" } });
    expect(
      parseContactDetailsDraft({
        location: "  Prague / Worldwide  ",
        contactBlurb: "  Write about a project.  ",
      })
    ).toMatchObject({
      success: true,
      data: {
        location: "Prague / Worldwide",
        contactBlurb: "Write about a project.",
      },
    });
    expect(parseContactDetailsDraft({ ...details, ignored: true }).success).toBe(
      false
    );
  });

  it("requires visible details and enforces their storage limits", () => {
    expect(
      parseContactDetailsDraft({ location: "", contactBlurb: "" }).success
    ).toBe(false);
    expect(
      parseContactDetailsDraft({
        location: "x".repeat(221),
        contactBlurb: details.contactBlurb,
      }).success
    ).toBe(false);
    expect(
      parseContactDetailsDraft({
        location: details.location,
        contactBlurb: "x".repeat(1_001),
      }).success
    ).toBe(false);
  });

  it("requires paired Hero CTA fields and rejects unsafe links or media", () => {
    expect(parseContactHeroDraft({ ...hero, ctaHref: "" }).success).toBe(false);
    expect(parseContactHeroDraft({ ...hero, ctaLabel: "" }).success).toBe(false);
    expect(
      parseContactHeroDraft({ ...hero, ctaLabel: "", ctaHref: "" }).success
    ).toBe(true);
    expect(
      parseContactHeroDraft({
        ...hero,
        ctaHref: "https://admin:secret@example.com/contact",
      }).success
    ).toBe(false);
    expect(
      parseContactHeroDraft({
        ...hero,
        backgroundSrc: "https://unmanaged.example/hero.jpg",
      }).success
    ).toBe(false);
    expect(
      parseContactHeroDraft({
        ...hero,
        backgroundSrc: "//evil.example/hero.jpg",
      }).success
    ).toBe(false);
  });

  it("accepts local and configured public Supabase media only", () => {
    vi.stubEnv(
      "NEXT_PUBLIC_SUPABASE_URL",
      "https://project-ref.supabase.co"
    );
    expect(
      parseContactHeroDraft({
        ...hero,
        backgroundSrc:
          "https://project-ref.supabase.co/storage/v1/object/public/portfolio-media/contact.jpg",
      }).success
    ).toBe(true);
    expect(
      parseContactHeroDraft({
        ...hero,
        backgroundSrc:
          "https://project-ref.supabase.co:444/storage/v1/object/public/portfolio-media/contact.jpg",
      }).success
    ).toBe(false);
    expect(
      parseContactHeroDraft({
        ...hero,
        backgroundSrc:
          "https://project-ref.supabase.co/storage/v1/object/sign/portfolio-media/contact.jpg",
      }).success
    ).toBe(false);
  });

  it("validates the section and exact singleton version envelope", () => {
    expect(
      parseContactSectionSubmission("hero", hero, {
        updatedAt: UPDATED_AT,
      })
    ).toMatchObject({ success: true, data: { section: "hero" } });
    expect(
      parseContactSectionSubmission("details", details, {
        updatedAt: UPDATED_AT,
      })
    ).toMatchObject({ success: true, data: { section: "details" } });
    expect(
      parseContactSectionSubmission("settings", details, {
        updatedAt: UPDATED_AT,
      })
    ).toMatchObject({
      success: false,
      fieldErrors: { section: ["Choose a valid Contact section."] },
    });
    expect(
      parseContactSectionSubmission("details", details, {
        updatedAt: "not-a-timestamp",
      })
    ).toMatchObject({
      success: false,
      fieldErrors: { "versions.updatedAt": expect.any(Array) },
    });
    expect(
      parseContactSectionSubmission("details", details, {
        updatedAt: UPDATED_AT,
        staleExtraVersion: UPDATED_AT,
      }).success
    ).toBe(false);
  });

  it("maps a service snapshot without leaking versions into editable drafts", () => {
    const parsed = parseContactEditorSnapshot({
      hero: { ...hero, updatedAt: UPDATED_AT },
      details: { ...details, updatedAt: UPDATED_AT },
    });

    expect(parsed).toEqual({
      draft: { hero, details },
      versions: {
        hero: { updatedAt: UPDATED_AT },
        details: { updatedAt: UPDATED_AT },
      },
    });
    expect(parsed?.draft.hero).not.toHaveProperty("updatedAt");
    expect(parsed?.draft.details).not.toHaveProperty("updatedAt");
  });

  it("loads repairable historical copy and URLs while keeping saves strict", () => {
    const historicalHero = {
      ...hero,
      subtitle: "s".repeat(500),
      backgroundSrc: "https://legacy-cdn.example/contact.jpg",
    };
    const historicalDetails = {
      location: "l".repeat(500),
      contactBlurb: "b".repeat(2_000),
    };

    expect(
      parseContactEditorSnapshot({
        hero: { ...historicalHero, updatedAt: UPDATED_AT },
        details: { ...historicalDetails, updatedAt: UPDATED_AT },
      })
    ).not.toBeNull();
    expect(parseContactHeroDraft(historicalHero).success).toBe(false);
    expect(parseContactDetailsDraft(historicalDetails).success).toBe(false);
  });

  it("rejects malformed snapshots instead of partly hydrating the editor", () => {
    expect(
      parseContactEditorSnapshot({
        hero: { ...hero, updatedAt: UPDATED_AT },
        details,
      })
    ).toBeNull();
    expect(
      parseContactEditorSnapshot({
        hero: { ...hero, updatedAt: UPDATED_AT },
        details: { ...details, updatedAt: UPDATED_AT },
        secret: "must not cross the boundary",
      })
    ).toBeNull();
  });

  it("sanitizes unsafe preview fields without rejecting an unfinished draft", () => {
    const parsed = parseContactPreviewUpdateMessage({
      type: CONTACT_PREVIEW_UPDATE_MESSAGE,
      draft: {
        hero: {
          ...hero,
          title: "",
          ctaHref: "javascript:alert(1)",
          backgroundSrc: "javascript:alert(2)",
        },
        details: { location: "", contactBlurb: "" },
      },
      focusRequestId: 2,
      selectedSection: "details",
    });

    expect(parsed).not.toBeNull();
    expect(parsed?.draft.hero.ctaHref).toBe("");
    expect(parsed?.draft.hero.backgroundSrc).toBe("");
    expect(
      parseContactPreviewUpdateMessage({
        type: CONTACT_PREVIEW_UPDATE_MESSAGE,
        draft: { hero, details },
        focusRequestId: -1,
        selectedSection: "details",
      })
    ).toBeNull();
  });
});

describe("Contact editor helpers", () => {
  it("provides a complete safe fallback snapshot", () => {
    const fallback = createFallbackContactEditorSnapshot();
    expect(fallback.draft.hero.title).toBeTruthy();
    expect(fallback.draft.hero.backgroundSrc).toMatch(/^\//);
    expect(fallback.draft.details.contactBlurb).toBeTruthy();
    expect(fallback.versions.hero.updatedAt).toBe(
      new Date(0).toISOString()
    );
    expect(fallback.versions.details.updatedAt).toBe(
      new Date(0).toISOString()
    );
  });

  it("returns the active payload/version and detects dirty sections", () => {
    const baseline = { hero, details };
    const draft = {
      hero,
      details: { ...details, location: "Berlin / Worldwide" },
    };
    const versions = {
      hero: { updatedAt: UPDATED_AT },
      details: { updatedAt: UPDATED_AT },
    };

    expect(getContactSectionPayload(draft, "details")).toEqual(draft.details);
    expect(getContactSectionVersions(versions, "hero")).toEqual(versions.hero);
    expect(isContactSectionDirty(baseline, draft, "hero")).toBe(false);
    expect(isContactSectionDirty(baseline, draft, "details")).toBe(true);
    expect(getDirtyContactSections(baseline, draft)).toEqual(["details"]);
  });

  it("maps preview data and replaces executable values with safe fallbacks", () => {
    const mapped = createContactPageViewDataFromEditor({
      hero: {
        ...hero,
        ctaHref: "javascript:alert(1)",
        backgroundSrc: "javascript:alert(2)",
        posterSrc: "javascript:alert(3)",
        mediaType: "video",
      },
      details,
    });

    expect(mapped.hero.ctaHref).toBe("");
    expect(mapped.hero.backgroundSrc).toBe("/images/booking-hero.jpg");
    expect(mapped.hero.posterSrc).toBe("");
    expect(mapped.hero.mediaType).toBe("image");
    expect(mapped.details).toEqual(details);
  });
});
