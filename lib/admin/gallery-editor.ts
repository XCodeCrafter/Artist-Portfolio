import { z } from "zod";
import { FALLBACK_CONTENT } from "@/lib/content/fallback";
import type {
  FooterEffect,
  GalleryImage,
  GalleryPresentation,
  HeroContent,
  SocialLink,
} from "@/lib/content/types";
import { isSafeManagedMediaSource } from "@/lib/media-source";

export const GALLERY_EDITOR_SECTIONS = [
  "hero",
  "introduction",
  "frames",
] as const;

export type GalleryEditorSection =
  (typeof GALLERY_EDITOR_SECTIONS)[number];

export type GalleryHeroDraft = HeroContent;

export type GalleryIntroductionDraft = {
  introEyebrow: string;
  introTitle: string;
};

export type GalleryFrameEditorItem = {
  id: string;
  title: string;
  src: string;
  alt: string;
  caption: string;
  category: string;
  isMosaic: boolean;
  isPublished: boolean;
};

export type GalleryFramesDraft = {
  items: GalleryFrameEditorItem[];
};

export type GalleryEditorDraft = {
  hero: GalleryHeroDraft;
  introduction: GalleryIntroductionDraft;
  frames: GalleryFramesDraft;
};

export type GalleryEditorVersions = {
  hero: { updatedAt: string };
  introduction: { updatedAt: string };
  frames: { items: Record<string, string> };
};

export type GalleryEditorFooter = {
  artistName: string;
  contactBlurb: string;
  footerEffect: FooterEffect;
  location: string;
  socialLinks: SocialLink[];
  tagline: string;
};

export type GalleryEditorSnapshot = {
  draft: GalleryEditorDraft;
  versions: GalleryEditorVersions;
  footer: GalleryEditorFooter;
};

export type GallerySectionVersions = {
  hero: GalleryEditorVersions["hero"];
  introduction: GalleryEditorVersions["introduction"];
  frames: GalleryEditorVersions["frames"];
};

export type GallerySaveStatus =
  | "idle"
  | "saved"
  | "invalid"
  | "conflict"
  | "security-error"
  | "missing-service"
  | "migration-required"
  | "error";

export type GallerySaveState = {
  status: GallerySaveStatus;
  message: string;
  eventId: string;
  section?: GalleryEditorSection;
  fieldErrors?: Record<string, string[]>;
  canonicalSection?: unknown;
  versions?: unknown;
  savedAt?: string;
};

export const INITIAL_GALLERY_SAVE_STATE: GallerySaveState = {
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

const isSafeAssetSource = isSafeManagedMediaSource;

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
const optionalLegacyMediaSource = text(2_048).refine(
  (value) => !value || isSafeAssetSource(value) || isHttpsUrl(value),
  "Use a local path or a safe https:// media URL."
);
const optionalHref = text(2_048).refine(
  isSafeOptionalHref,
  "Use a local path, an #anchor, or a safe https:// URL."
);

const heroFieldsSchema = z
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

const galleryHeroDraftSchema = heroFieldsSchema.superRefine((hero, context) => {
  if (Boolean(hero.ctaLabel) === Boolean(hero.ctaHref)) return;

  const missingField = hero.ctaLabel ? "ctaHref" : "ctaLabel";
  context.addIssue({
    code: "custom",
    message: "CTA label and destination must either both be filled or both be empty.",
    path: [missingField],
  });
});

const galleryIntroductionDraftSchema = z
  .object({
    introEyebrow: requiredText(220),
    introTitle: requiredText(500),
  })
  .strict();

const galleryFrameItemSchema = z
  .object({
    id: recordId,
    title: requiredText(180),
    src: assetSource,
    alt: text(220),
    caption: text(600),
    category: text(80),
    isMosaic: z.boolean(),
    isPublished: z.boolean(),
  })
  .strict();

const galleryFramesDraftSchema = z
  .object({
    items: z
      .array(galleryFrameItemSchema)
      .max(120, "Keep the Gallery catalog to 120 frames or fewer."),
  })
  .strict()
  .superRefine((value, context) => {
    const seen = new Set<string>();
    value.items.forEach((item, index) => {
      if (seen.has(item.id)) {
        context.addIssue({
          code: "custom",
          message: "Each Gallery frame can appear only once.",
          path: ["items", index, "id"],
        });
      }
      seen.add(item.id);
    });
  });

const versionMap = z.record(recordId, timestamp);
const singletonVersionsSchema = z.object({ updatedAt: timestamp }).strict();
const frameVersionsSchema = z.object({ items: versionMap }).strict();

const snapshotHeroSchema = z
  .object({
    title: requiredText(220),
    subtitle: text(220),
    ctaLabel: text(220),
    ctaHref: optionalHref,
    backgroundSrc: legacyMediaSource,
    posterSrc: optionalLegacyMediaSource,
    mediaType: z.enum(["image", "video"]),
    updatedAt: timestamp,
  })
  .strict();
const snapshotIntroductionSchema = galleryIntroductionDraftSchema
  .extend({ updatedAt: timestamp })
  .strict();
const snapshotFrameSchema = galleryFrameItemSchema
  .omit({ src: true })
  .extend({ src: legacyMediaSource, updatedAt: timestamp })
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
const galleryEditorFooterSchema = z
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
    introduction: snapshotIntroductionSchema,
    frames: z.object({ items: z.array(snapshotFrameSchema) }).strict(),
    footer: galleryEditorFooterSchema,
  })
  .strict();

export function parseGalleryHeroDraft(value: unknown) {
  return galleryHeroDraftSchema.safeParse(value);
}

export function parseGalleryIntroductionDraft(value: unknown) {
  return galleryIntroductionDraftSchema.safeParse(value);
}

export function parseGalleryFramesDraft(value: unknown) {
  return galleryFramesDraftSchema.safeParse(value);
}

function issueMap(error: z.ZodError) {
  const errors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    errors[key] = [...(errors[key] || []), issue.message];
  }
  return errors;
}

function hasExactVersionParity(
  items: Array<{ id: string }>,
  versions: Record<string, string>
) {
  const ids = new Set(items.map((item) => item.id));
  const versionIds = Object.keys(versions);
  return (
    ids.size === versionIds.length && versionIds.every((id) => ids.has(id))
  );
}

export function parseGallerySectionSubmission(
  section: unknown,
  payload: unknown,
  versions: unknown,
  options: { requireExactCollectionVersions?: boolean } = {}
):
  | {
      success: true;
      data: {
        section: GalleryEditorSection;
        payload: unknown;
        versions: unknown;
      };
    }
  | { success: false; fieldErrors: Record<string, string[]> } {
  const parsedSection = z.enum(GALLERY_EDITOR_SECTIONS).safeParse(section);
  if (!parsedSection.success) {
    return {
      success: false,
      fieldErrors: { section: ["Choose a valid Gallery section."] },
    };
  }

  const parsers = {
    hero: [galleryHeroDraftSchema, singletonVersionsSchema],
    introduction: [galleryIntroductionDraftSchema, singletonVersionsSchema],
    frames: [galleryFramesDraftSchema, frameVersionsSchema],
  } as const;
  const [payloadSchema, versionsSchema] = parsers[parsedSection.data];
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

  if (parsedSection.data === "frames") {
    const framePayload = parsedPayload.data as GalleryFramesDraft;
    const frameVersions = parsedVersions.data as GalleryEditorVersions["frames"];
    const submittedIds = new Set(framePayload.items.map((item) => item.id));
    const savedItemMissing = Object.keys(frameVersions.items).some(
      (id) => !submittedIds.has(id)
    );
    const exactResponseMissing =
      options.requireExactCollectionVersions === true &&
      !hasExactVersionParity(framePayload.items, frameVersions.items);

    if (savedItemMissing || exactResponseMissing) {
      return {
        success: false,
        fieldErrors: {
          form: [
            options.requireExactCollectionVersions
              ? "The saved Gallery frames could not be confirmed. Reload before editing them again."
              : "Saved Gallery frames cannot be deleted here. Hide a frame, or reload if the page changed.",
          ],
        },
      };
    }
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

export function parseGalleryEditorSnapshot(
  value: unknown
): GalleryEditorSnapshot | null {
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
      introduction: {
        introEyebrow: snapshot.introduction.introEyebrow,
        introTitle: snapshot.introduction.introTitle,
      },
      frames: {
        items: snapshot.frames.items.map((item) => ({
          id: item.id,
          title: item.title,
          src: item.src,
          alt: item.alt,
          caption: item.caption,
          category: item.category,
          isMosaic: item.isMosaic,
          isPublished: item.isPublished,
        })),
      },
    },
    versions: {
      hero: { updatedAt: snapshot.hero.updatedAt },
      introduction: { updatedAt: snapshot.introduction.updatedAt },
      frames: {
        items: Object.fromEntries(
          snapshot.frames.items.map((item) => [item.id, item.updatedAt])
        ),
      },
    },
    footer: snapshot.footer,
  };
}

export function createFallbackGalleryEditorSnapshot(): GalleryEditorSnapshot {
  const fallbackTimestamp = new Date(0).toISOString();
  const items = FALLBACK_CONTENT.galleryImages.map((item) => ({
    id: item.id,
    title: item.title,
    src: item.src,
    alt: item.alt,
    caption: item.caption,
    category: item.category,
    isMosaic: item.isMosaic,
    isPublished: true,
  }));

  return {
    draft: {
      hero: FALLBACK_CONTENT.heroes.gallery,
      introduction: {
        introEyebrow: FALLBACK_CONTENT.galleryPresentation.introEyebrow,
        introTitle: FALLBACK_CONTENT.galleryPresentation.introTitle,
      },
      frames: { items },
    },
    versions: {
      hero: { updatedAt: fallbackTimestamp },
      introduction: { updatedAt: fallbackTimestamp },
      frames: {
        items: Object.fromEntries(
          items.map((item) => [item.id, fallbackTimestamp])
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
  };
}

export function getGallerySectionPayload(
  draft: GalleryEditorDraft,
  section: GalleryEditorSection
) {
  return draft[section];
}

export function getGallerySectionVersions(
  versions: GalleryEditorVersions,
  section: GalleryEditorSection
) {
  return versions[section];
}

export function isGallerySectionDirty(
  baseline: GalleryEditorDraft,
  draft: GalleryEditorDraft,
  section: GalleryEditorSection
) {
  return JSON.stringify(baseline[section]) !== JSON.stringify(draft[section]);
}

export function getDirtyGallerySections(
  baseline: GalleryEditorDraft,
  draft: GalleryEditorDraft
) {
  return GALLERY_EDITOR_SECTIONS.filter((section) =>
    isGallerySectionDirty(baseline, draft, section)
  );
}

export function moveGalleryEditorItem<T>(items: T[], from: number, to: number) {
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
    introduction: z
      .object({ introEyebrow: text(220), introTitle: text(500) })
      .strict(),
    frames: z
      .object({
        items: z.array(
          galleryFrameItemSchema
            .omit({ title: true, src: true })
            .extend({ title: text(180), src: previewMediaSource })
            .strict()
        ),
      })
      .strict(),
  })
  .strict();

export const GALLERY_PREVIEW_UPDATE_MESSAGE =
  "gallery-preview-update" as const;

const galleryPreviewUpdateSchema = z
  .object({
    type: z.literal(GALLERY_PREVIEW_UPDATE_MESSAGE),
    draft: previewDraftSchema,
    footer: galleryEditorFooterSchema,
    focusRequestId: z.number().int().nonnegative(),
    selectedSection: z.enum(GALLERY_EDITOR_SECTIONS),
  })
  .strict();

export type GalleryPreviewUpdateMessage = z.infer<
  typeof galleryPreviewUpdateSchema
>;

export function parseGalleryPreviewUpdateMessage(
  value: unknown
): GalleryPreviewUpdateMessage | null {
  const parsed = galleryPreviewUpdateSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function createGalleryPageViewDataFromEditor(
  draft: GalleryEditorDraft,
  footer: GalleryEditorFooter
): {
  hero: HeroContent;
  presentation: GalleryPresentation;
  images: GalleryImage[];
  footer: GalleryEditorFooter;
} {
  const hasHeroBackground = Boolean(draft.hero.backgroundSrc);
  return {
    hero: {
      ...draft.hero,
      backgroundSrc:
        draft.hero.backgroundSrc ||
        FALLBACK_CONTENT.heroes.gallery.backgroundSrc,
      mediaType: hasHeroBackground ? draft.hero.mediaType : "image",
    },
    presentation: {
      ...FALLBACK_CONTENT.galleryPresentation,
      introEyebrow: draft.introduction.introEyebrow,
      introTitle: draft.introduction.introTitle,
    },
    images: draft.frames.items
      // New cards enter the inspector before an asset is chosen. Keep that
      // incomplete draft out of Next/Image while still previewing all valid
      // saved and hidden-from-mosaic rows exactly as the public page does.
      .filter((item) => item.isPublished && item.src.trim())
      .map((item) => ({
        id: item.id,
        title: item.title,
        src: item.src,
        alt: item.alt,
        caption: item.caption,
        category: item.category,
        isMosaic: item.isMosaic,
        isFreelanceStory: false,
        freelanceStoryOrder: 0,
      })),
    footer,
  };
}
