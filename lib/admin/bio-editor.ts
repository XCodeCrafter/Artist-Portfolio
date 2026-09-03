import { z } from "zod";
import { FALLBACK_CONTENT } from "@/lib/content/fallback";
import {
  ACTOR_CREDIT_TYPES,
  type ActorCreditType,
  type ActorResume,
  type FooterEffect,
  type HeroContent,
  type SocialLink,
} from "@/lib/content/types";

export const BIO_EDITOR_SECTIONS = [
  "hero",
  "biography",
  "resume",
  "credits",
] as const;

export type BioEditorSection = (typeof BIO_EDITOR_SECTIONS)[number];

export type BioHeroDraft = HeroContent;

export type BioGalleryEditorItem = {
  id: string;
  src: string;
  alt: string;
  isPublished: boolean;
};

export type BioParagraphEditorItem = {
  id: string;
  body: string;
  revealDelay: number;
  isPublished: boolean;
};

export type BioBiographyDraft = {
  topLabel: string;
  introText: string;
  caption: string;
  galleryImages: BioGalleryEditorItem[];
  paragraphs: BioParagraphEditorItem[];
};

export type BioResumeDraft = ActorResume;

export type BioCreditEditorItem = {
  id: string;
  creditType: ActorCreditType;
  title: string;
  role: string;
  production: string;
  director: string;
  year: string;
  href: string;
  isPublished: boolean;
};

export type BioCreditsDraft = {
  items: BioCreditEditorItem[];
};

export type BioEditorDraft = {
  hero: BioHeroDraft;
  biography: BioBiographyDraft;
  resume: BioResumeDraft;
  credits: BioCreditsDraft;
};

export type BioEditorVersions = {
  hero: { updatedAt: string };
  biography: {
    profileUpdatedAt: string;
    galleryItems: Record<string, string>;
    paragraphItems: Record<string, string>;
  };
  resume: { updatedAt: string };
  credits: { items: Record<string, string> };
};

export type BioEditorFooter = {
  artistName: string;
  contactBlurb: string;
  footerEffect: FooterEffect;
  location: string;
  socialLinks: SocialLink[];
  tagline: string;
};

export type BioEditorSnapshot = {
  draft: BioEditorDraft;
  versions: BioEditorVersions;
  footer: BioEditorFooter;
  hasResumeDetails: boolean;
};

export type BioSectionVersions = {
  hero: BioEditorVersions["hero"];
  biography: BioEditorVersions["biography"];
  resume: BioEditorVersions["resume"];
  credits: BioEditorVersions["credits"];
};

export type BioSaveStatus =
  | "idle"
  | "saved"
  | "invalid"
  | "conflict"
  | "security-error"
  | "missing-service"
  | "migration-required"
  | "error";

export type BioSaveState = {
  status: BioSaveStatus;
  message: string;
  eventId: string;
  section?: BioEditorSection;
  fieldErrors?: Record<string, string[]>;
  canonicalSection?: unknown;
  versions?: unknown;
  savedAt?: string;
};

export const INITIAL_BIO_SAVE_STATE: BioSaveState = {
  status: "idle",
  message: "",
  eventId: "",
};

const text = (max: number) => z.string().trim().max(max);
const requiredText = (max: number) => z.string().trim().min(1).max(max);
const recordId = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
const timestamp = z.string().refine(
  (value) =>
    value.length <= 64 &&
    /^\d{4}-\d{2}-\d{2}T/.test(value) &&
    Number.isFinite(Date.parse(value)),
  "Invalid saved version. Reload this editor."
);

function hasUnsafeUrlParts(url: URL) {
  return Boolean(url.username || url.password) || url.protocol !== "https:";
}

function isHttpsUrl(value: string) {
  try {
    return !hasUnsafeUrlParts(new URL(value));
  } catch {
    return false;
  }
}

function isConfiguredStorageAsset(value: string) {
  const storageBase = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!storageBase) return false;

  try {
    const assetUrl = new URL(value);
    const storageUrl = new URL(storageBase);
    return (
      !hasUnsafeUrlParts(assetUrl) &&
      storageUrl.protocol === "https:" &&
      assetUrl.origin === storageUrl.origin &&
      assetUrl.pathname.startsWith("/storage/v1/object/public/")
    );
  } catch {
    return false;
  }
}

function isSafeAssetSource(value: string) {
  if (
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !/[\\\u0000-\u001f\u007f]/.test(value)
  ) {
    return true;
  }
  return isConfiguredStorageAsset(value);
}

function isSafeOptionalHref(value: string) {
  if (!value) return true;
  if (/^#[A-Za-z][A-Za-z0-9_-]*$/.test(value)) return true;
  if (
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !/[\\\u0000-\u001f\u007f]/.test(value)
  ) {
    return true;
  }
  return isHttpsUrl(value);
}

const assetSource = requiredText(2_048).refine(
  isSafeAssetSource,
  "Choose a local file or one uploaded to this site's Media Library."
);
const optionalAssetSource = text(2_048).refine(
  (value) => !value || isSafeAssetSource(value),
  "Choose a local file or one uploaded to this site's Media Library."
);
const legacyMediaSource = requiredText(2_048).refine(
  (value) => isSafeAssetSource(value) || isHttpsUrl(value),
  "Use a local path or a safe https:// media URL."
);
const optionalLegacyAssetSource = text(2_048).refine(
  (value) => !value || isSafeAssetSource(value) || isHttpsUrl(value),
  "Use a local path or a safe https:// media URL."
);
const optionalHref = text(2_048).refine(
  isSafeOptionalHref,
  "Use a local path, an #anchor, or a safe https:// URL."
);

const bioHeroDraftSchema = z
  .object({
    title: requiredText(220),
    subtitle: text(220),
    ctaLabel: text(220),
    ctaHref: optionalHref,
    backgroundSrc: assetSource,
    posterSrc: optionalAssetSource,
    mediaType: z.enum(["image", "video"]),
  })
  .strict();

const bioGalleryItemSchema = z
  .object({
    id: recordId,
    src: assetSource,
    alt: text(220),
    isPublished: z.boolean(),
  })
  .strict();

const bioParagraphItemSchema = z
  .object({
    id: recordId,
    body: requiredText(6_000),
    revealDelay: z.number().int().min(0).max(5_000),
    isPublished: z.boolean(),
  })
  .strict();

const bioBiographyDraftSchema = z
  .object({
    topLabel: text(220),
    introText: text(6_000),
    caption: text(220),
    galleryImages: z
      .array(bioGalleryItemSchema)
      .max(32, "Keep the portrait list to 32 images or fewer."),
    paragraphs: z
      .array(bioParagraphItemSchema)
      .max(50, "Keep the biography to 50 paragraphs or fewer."),
  })
  .strict()
  .superRefine((value, context) => {
    for (const [key, items] of [
      ["galleryImages", value.galleryImages],
      ["paragraphs", value.paragraphs],
    ] as const) {
      const seen = new Set<string>();
      items.forEach((item, index) => {
        if (seen.has(item.id)) {
          context.addIssue({
            code: "custom",
            message: "Each saved item can appear only once.",
            path: [key, index, "id"],
          });
        }
        seen.add(item.id);
      });
    }
  });

const bioResumeDraftSchema = z
  .object({
    headline: text(220),
    summary: text(6_000),
    location: text(220),
    playingAge: text(220),
    height: text(220),
    eyes: text(220),
    hair: text(220),
    languages: text(1_000),
    skills: text(1_000),
    representation: text(220),
    resumeUrl: optionalHref,
  })
  .strict();

const bioCreditItemSchema = z
  .object({
    id: recordId,
    creditType: z.enum(ACTOR_CREDIT_TYPES),
    title: requiredText(220),
    role: text(220),
    production: text(220),
    director: text(220),
    year: text(220),
    href: optionalHref,
    isPublished: z.boolean(),
  })
  .strict();

const bioCreditsDraftSchema = z
  .object({
    items: z
      .array(bioCreditItemSchema)
      .max(100, "Keep the credits list to 100 entries or fewer."),
  })
  .strict()
  .superRefine((value, context) => {
    const seen = new Set<string>();
    value.items.forEach((item, index) => {
      if (seen.has(item.id)) {
        context.addIssue({
          code: "custom",
          message: "Each credit can appear only once.",
          path: ["items", index, "id"],
        });
      }
      seen.add(item.id);
    });
  });

const versionMap = z.record(recordId, timestamp);
const heroVersionsSchema = z.object({ updatedAt: timestamp }).strict();
const biographyVersionsSchema = z
  .object({
    profileUpdatedAt: timestamp,
    galleryItems: versionMap,
    paragraphItems: versionMap,
  })
  .strict();
const resumeVersionsSchema = z.object({ updatedAt: timestamp }).strict();
const creditsVersionsSchema = z.object({ items: versionMap }).strict();

const snapshotHeroSchema = bioHeroDraftSchema
  .omit({ backgroundSrc: true, posterSrc: true })
  .extend({
    backgroundSrc: legacyMediaSource,
    posterSrc: optionalLegacyAssetSource,
    updatedAt: timestamp,
  })
  .strict();
const snapshotGallerySchema = bioGalleryItemSchema
  .omit({ src: true })
  .extend({ src: legacyMediaSource, updatedAt: timestamp })
  .strict();
const snapshotParagraphSchema = bioParagraphItemSchema
  .extend({ updatedAt: timestamp })
  .strict();
const snapshotCreditSchema = bioCreditItemSchema
  .extend({ updatedAt: timestamp })
  .strict();
const snapshotBiographySchema = z
  .object({
    topLabel: text(220),
    introText: text(6_000),
    caption: text(220),
    profileUpdatedAt: timestamp,
    galleryImages: z.array(snapshotGallerySchema),
    paragraphs: z.array(snapshotParagraphSchema),
  })
  .strict();
const snapshotResumeSchema = bioResumeDraftSchema
  .extend({ updatedAt: timestamp })
  .strict();
const snapshotSocialSchema = z
  .object({
    id: recordId,
    label: requiredText(220),
    platform: requiredText(220),
    href: optionalHref,
    iconKey: text(220),
  })
  .strict();
const editorFooterSchema = z
  .object({
    artistName: requiredText(220),
    contactBlurb: text(1_000),
    footerEffect: z.enum(["soul", "red-light"]),
    location: text(220),
    socialLinks: z.array(snapshotSocialSchema),
    tagline: text(220),
  })
  .strict();
const snapshotSchema = z
  .object({
    hero: snapshotHeroSchema,
    biography: snapshotBiographySchema,
    resume: snapshotResumeSchema,
    credits: z.array(snapshotCreditSchema),
    footer: editorFooterSchema,
    hasResumeDetails: z.boolean(),
  })
  .strict();

export function parseBioHeroDraft(value: unknown) {
  return bioHeroDraftSchema.safeParse(value);
}

export function parseBioBiographyDraft(value: unknown) {
  return bioBiographyDraftSchema.safeParse(value);
}

export function parseBioResumeDraft(value: unknown) {
  return bioResumeDraftSchema.safeParse(value);
}

export function parseBioCreditsDraft(value: unknown) {
  return bioCreditsDraftSchema.safeParse(value);
}

function issueMap(error: z.ZodError) {
  const errors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    errors[key] = [...(errors[key] || []), issue.message];
  }
  return errors;
}

function missingSavedCollectionIds(
  items: Array<{ id: string }>,
  expectedVersions: Record<string, string>
) {
  const submittedIds = new Set(items.map((item) => item.id));
  return Object.keys(expectedVersions).filter((id) => !submittedIds.has(id));
}

function missingReturnedCollectionVersions(
  items: Array<{ id: string }>,
  returnedVersions: Record<string, string>
) {
  return items.filter((item) => !(item.id in returnedVersions)).map((item) => item.id);
}

export function parseBioSectionSubmission(
  section: unknown,
  payload: unknown,
  versions: unknown,
  options: { requireExactCollectionVersions?: boolean } = {}
):
  | {
      success: true;
      data: {
        section: BioEditorSection;
        payload: unknown;
        versions: unknown;
      };
    }
  | { success: false; fieldErrors: Record<string, string[]> } {
  const parsedSection = z.enum(BIO_EDITOR_SECTIONS).safeParse(section);
  if (!parsedSection.success) {
    return {
      success: false,
      fieldErrors: { section: ["Choose a valid Bio section."] },
    };
  }

  const sectionParsers = {
    hero: [bioHeroDraftSchema, heroVersionsSchema],
    biography: [bioBiographyDraftSchema, biographyVersionsSchema],
    resume: [bioResumeDraftSchema, resumeVersionsSchema],
    credits: [bioCreditsDraftSchema, creditsVersionsSchema],
  } as const;
  const [payloadSchema, versionsSchema] = sectionParsers[parsedSection.data];
  const parsedPayload = payloadSchema.safeParse(payload);
  const parsedVersions = versionsSchema.safeParse(versions);

  if (!parsedPayload.success || !parsedVersions.success) {
    return {
      success: false,
      fieldErrors: {
        ...(!parsedPayload.success ? issueMap(parsedPayload.error) : {}),
        ...(!parsedVersions.success
          ? Object.fromEntries(
              Object.entries(issueMap(parsedVersions.error)).map(
                ([key, messages]) => [`versions.${key}`, messages]
              )
            )
          : {}),
      },
    };
  }

  const requireExact = options.requireExactCollectionVersions === true;
  const formErrors: string[] = [];

  if (parsedSection.data === "biography") {
    const bioPayload = parsedPayload.data as BioBiographyDraft;
    const bioVersions = parsedVersions.data as BioEditorVersions["biography"];
    const missingSaved = [
      ...missingSavedCollectionIds(
        bioPayload.galleryImages,
        bioVersions.galleryItems
      ),
      ...missingSavedCollectionIds(
        bioPayload.paragraphs,
        bioVersions.paragraphItems
      ),
    ];
    const missingReturned = requireExact
      ? [
          ...missingReturnedCollectionVersions(
            bioPayload.galleryImages,
            bioVersions.galleryItems
          ),
          ...missingReturnedCollectionVersions(
            bioPayload.paragraphs,
            bioVersions.paragraphItems
          ),
        ]
      : [];
    if (missingSaved.length || missingReturned.length) {
      formErrors.push(
        requireExact
          ? "The saved biography could not be confirmed. Reload before editing it again."
          : "Saved biography items cannot be deleted here. Hide an existing item, or reload if the page changed."
      );
    }
  }

  if (parsedSection.data === "credits") {
    const creditsPayload = parsedPayload.data as BioCreditsDraft;
    const creditVersions = parsedVersions.data as BioEditorVersions["credits"];
    const missingSaved = missingSavedCollectionIds(
      creditsPayload.items,
      creditVersions.items
    );
    const missingReturned = requireExact
      ? missingReturnedCollectionVersions(
          creditsPayload.items,
          creditVersions.items
        )
      : [];
    if (missingSaved.length || missingReturned.length) {
      formErrors.push(
        requireExact
          ? "The saved credits could not be confirmed. Reload before editing them again."
          : "Saved credits cannot be deleted here. Hide an existing credit, or reload if the list changed."
      );
    }
  }

  if (formErrors.length) {
    return { success: false, fieldErrors: { form: formErrors } };
  }

  return {
    success: true,
    data: {
      section: parsedSection.data,
      payload: parsedPayload.data,
      versions: parsedVersions.data,
    },
  };
}

export function parseBioEditorSnapshot(value: unknown): BioEditorSnapshot | null {
  const parsed = snapshotSchema.safeParse(value);
  if (!parsed.success) return null;

  const snapshot = parsed.data;
  return {
    draft: {
      hero: {
        title: snapshot.hero.title,
        subtitle: snapshot.hero.subtitle,
        ctaLabel: snapshot.hero.ctaLabel,
        ctaHref: snapshot.hero.ctaHref,
        backgroundSrc: snapshot.hero.backgroundSrc,
        posterSrc: snapshot.hero.posterSrc,
        mediaType: snapshot.hero.mediaType,
      },
      biography: {
        topLabel: snapshot.biography.topLabel,
        introText: snapshot.biography.introText,
        caption: snapshot.biography.caption,
        galleryImages: snapshot.biography.galleryImages.map((item) => ({
          id: item.id,
          src: item.src,
          alt: item.alt,
          isPublished: item.isPublished,
        })),
        paragraphs: snapshot.biography.paragraphs.map((item) => ({
          id: item.id,
          body: item.body,
          revealDelay: item.revealDelay,
          isPublished: item.isPublished,
        })),
      },
      resume: {
        headline: snapshot.resume.headline,
        summary: snapshot.resume.summary,
        location: snapshot.resume.location,
        playingAge: snapshot.resume.playingAge,
        height: snapshot.resume.height,
        eyes: snapshot.resume.eyes,
        hair: snapshot.resume.hair,
        languages: snapshot.resume.languages,
        skills: snapshot.resume.skills,
        representation: snapshot.resume.representation,
        resumeUrl: snapshot.resume.resumeUrl,
      },
      credits: {
        items: snapshot.credits.map((item) => ({
          id: item.id,
          creditType: item.creditType,
          title: item.title,
          role: item.role,
          production: item.production,
          director: item.director,
          year: item.year,
          href: item.href,
          isPublished: item.isPublished,
        })),
      },
    },
    versions: {
      hero: { updatedAt: snapshot.hero.updatedAt },
      biography: {
        profileUpdatedAt: snapshot.biography.profileUpdatedAt,
        galleryItems: Object.fromEntries(
          snapshot.biography.galleryImages.map((item) => [item.id, item.updatedAt])
        ),
        paragraphItems: Object.fromEntries(
          snapshot.biography.paragraphs.map((item) => [item.id, item.updatedAt])
        ),
      },
      resume: { updatedAt: snapshot.resume.updatedAt },
      credits: {
        items: Object.fromEntries(
          snapshot.credits.map((item) => [item.id, item.updatedAt])
        ),
      },
    },
    footer: snapshot.footer,
    hasResumeDetails: snapshot.hasResumeDetails,
  };
}

export function createFallbackBioEditorSnapshot(): BioEditorSnapshot {
  const fallbackTimestamp = new Date(0).toISOString();
  return {
    draft: {
      hero: FALLBACK_CONTENT.heroes.bio,
      biography: {
        topLabel: FALLBACK_CONTENT.bio.topLabel,
        introText: FALLBACK_CONTENT.bio.introText,
        caption: FALLBACK_CONTENT.bio.caption,
        galleryImages: FALLBACK_CONTENT.bio.galleryImages.map((item) => ({
          ...item,
          isPublished: true,
        })),
        paragraphs: FALLBACK_CONTENT.bio.paragraphs.map((item) => ({
          ...item,
          isPublished: true,
        })),
      },
      resume: FALLBACK_CONTENT.actorResume,
      credits: {
        items: FALLBACK_CONTENT.actorCredits.map((item) => ({
          ...item,
          isPublished: true,
        })),
      },
    },
    versions: {
      hero: { updatedAt: fallbackTimestamp },
      biography: {
        profileUpdatedAt: fallbackTimestamp,
        galleryItems: Object.fromEntries(
          FALLBACK_CONTENT.bio.galleryImages.map((item) => [
            item.id,
            fallbackTimestamp,
          ])
        ),
        paragraphItems: Object.fromEntries(
          FALLBACK_CONTENT.bio.paragraphs.map((item) => [
            item.id,
            fallbackTimestamp,
          ])
        ),
      },
      resume: { updatedAt: fallbackTimestamp },
      credits: {
        items: Object.fromEntries(
          FALLBACK_CONTENT.actorCredits.map((item) => [
            item.id,
            fallbackTimestamp,
          ])
        ),
      },
    },
    footer: {
      artistName: FALLBACK_CONTENT.settings.artistName,
      contactBlurb: FALLBACK_CONTENT.settings.contactBlurb,
      footerEffect: FALLBACK_CONTENT.settings.footerEffect,
      location: FALLBACK_CONTENT.settings.location,
      socialLinks: FALLBACK_CONTENT.socialLinks,
      tagline: FALLBACK_CONTENT.settings.tagline,
    },
    hasResumeDetails: FALLBACK_CONTENT.hasActorResume,
  };
}

export function getBioSectionPayload(
  draft: BioEditorDraft,
  section: BioEditorSection
) {
  return draft[section];
}

export function getBioSectionVersions(
  versions: BioEditorVersions,
  section: BioEditorSection
) {
  return versions[section];
}

export function isBioSectionDirty(
  baseline: BioEditorDraft,
  draft: BioEditorDraft,
  section: BioEditorSection
) {
  return JSON.stringify(baseline[section]) !== JSON.stringify(draft[section]);
}

export function getDirtyBioSections(
  baseline: BioEditorDraft,
  draft: BioEditorDraft
) {
  return BIO_EDITOR_SECTIONS.filter((section) =>
    isBioSectionDirty(baseline, draft, section)
  );
}

export function moveBioEditorItem<T>(items: T[], from: number, to: number) {
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= items.length ||
    to >= items.length
  ) {
    return items;
  }
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function getBioCreditMoveTarget(
  items: Array<{ creditType: ActorCreditType }>,
  index: number,
  direction: -1 | 1
) {
  const type = items[index]?.creditType;
  if (!type) return -1;

  for (
    let candidate = index + direction;
    candidate >= 0 && candidate < items.length;
    candidate += direction
  ) {
    if (items[candidate].creditType === type) return candidate;
  }

  return -1;
}

const previewHref = text(2_048).transform((value) =>
  isSafeOptionalHref(value) ? value : ""
);
const previewMediaSource = text(2_048).transform((value) =>
  !value || isSafeAssetSource(value) || isHttpsUrl(value) ? value : ""
);

const previewDraftSchema = z
  .object({
    hero: z
      .object({
        title: text(220),
        subtitle: text(220),
        ctaLabel: text(220),
        ctaHref: previewHref,
        backgroundSrc: previewMediaSource,
        posterSrc: previewMediaSource,
        mediaType: z.enum(["image", "video"]),
      })
      .strict(),
    biography: z
      .object({
        topLabel: text(220),
        introText: text(6_000),
        caption: text(220),
        galleryImages: z.array(
          z
            .object({
              id: recordId,
              src: previewMediaSource,
              alt: text(220),
              isPublished: z.boolean(),
            })
            .strict()
        ),
        paragraphs: z.array(
          bioParagraphItemSchema
            .omit({ body: true })
            .extend({ body: text(6_000) })
            .strict()
        ),
      })
      .strict(),
    resume: z
      .object({
        headline: text(220),
        summary: text(6_000),
        location: text(220),
        playingAge: text(220),
        height: text(220),
        eyes: text(220),
        hair: text(220),
        languages: text(1_000),
        skills: text(1_000),
        representation: text(220),
        resumeUrl: previewHref,
      })
      .strict(),
    credits: z
      .object({
        items: z.array(
          bioCreditItemSchema
            .omit({ title: true, href: true })
            .extend({ title: text(220), href: previewHref })
            .strict()
        ),
      })
      .strict(),
  })
  .strict();

export const BIO_PREVIEW_UPDATE_MESSAGE = "bio-preview-update" as const;

const bioPreviewUpdateSchema = z
  .object({
    type: z.literal(BIO_PREVIEW_UPDATE_MESSAGE),
    draft: previewDraftSchema,
    footer: editorFooterSchema,
    hasResumeDetails: z.boolean(),
    focusRequestId: z.number().int().nonnegative(),
    selectedSection: z.enum(BIO_EDITOR_SECTIONS),
  })
  .strict();

export type BioPreviewUpdateMessage = z.infer<typeof bioPreviewUpdateSchema>;

export function parseBioPreviewUpdateMessage(
  value: unknown
): BioPreviewUpdateMessage | null {
  const parsed = bioPreviewUpdateSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function createBioPageViewDataFromEditor(
  draft: BioEditorDraft,
  footer: BioEditorFooter,
  hasResumeDetails = true
) {
  const hasHeroBackground = Boolean(draft.hero.backgroundSrc);
  return {
    hero: {
      ...draft.hero,
      backgroundSrc:
        draft.hero.backgroundSrc || FALLBACK_CONTENT.heroes.bio.backgroundSrc,
      mediaType: hasHeroBackground ? draft.hero.mediaType : ("image" as const),
    },
    bio: {
      topLabel: draft.biography.topLabel,
      introText: draft.biography.introText,
      caption: draft.biography.caption,
      galleryImages: draft.biography.galleryImages
        .filter((item) => item.isPublished)
        .map(({ id, src, alt }) => ({ id, src, alt })),
      paragraphs: draft.biography.paragraphs
        .filter((item) => item.isPublished)
        .map(({ id, body, revealDelay }) => ({ id, body, revealDelay })),
    },
    resume: draft.resume,
    hasResumeDetails,
    credits: draft.credits.items
      .filter((item) => item.isPublished)
      .map(
        ({
          id,
          creditType,
          title,
          role,
          production,
          director,
          year,
          href,
        }) => ({
          id,
          creditType,
          title,
          role,
          production,
          director,
          year,
          href,
        })
      ),
    footer,
  };
}
