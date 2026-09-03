import { z } from "zod";
import { FALLBACK_CONTENT } from "@/lib/content/fallback";
import type {
  FooterEffect,
  HeroContent,
  SocialLink,
  VideoItem,
  VideoPresentation,
  VideoType,
} from "@/lib/content/types";

export const SHOWREEL_EDITOR_SECTIONS = [
  "hero",
  "introduction",
  "works",
] as const;

export type ShowreelEditorSection =
  (typeof SHOWREEL_EDITOR_SECTIONS)[number];

export type ShowreelHeroDraft = HeroContent;

export type ShowreelIntroductionDraft = {
  sectionEyebrow: string;
  sectionTitle: string;
  sectionBody: string;
  emptyText: string;
};

export type ShowreelWorkEditorItem = {
  id: string;
  title: string;
  description: string;
  embedUrl: string;
  platform: string;
  thumbnailSrc: string;
  videoType: VideoType;
  isFeatured: boolean;
  isPublished: boolean;
};

export type ShowreelWorksDraft = {
  items: ShowreelWorkEditorItem[];
};

export type ShowreelEditorDraft = {
  hero: ShowreelHeroDraft;
  introduction: ShowreelIntroductionDraft;
  works: ShowreelWorksDraft;
};

export type ShowreelEditorVersions = {
  hero: { updatedAt: string };
  introduction: { updatedAt: string };
  works: { items: Record<string, string> };
};

export type ShowreelEditorFooter = {
  artistName: string;
  contactBlurb: string;
  footerEffect: FooterEffect;
  location: string;
  socialLinks: SocialLink[];
  tagline: string;
};

export type ShowreelEditorSnapshot = {
  draft: ShowreelEditorDraft;
  versions: ShowreelEditorVersions;
  footer: ShowreelEditorFooter;
};

export type ShowreelSaveStatus =
  | "idle"
  | "saved"
  | "invalid"
  | "conflict"
  | "security-error"
  | "missing-service"
  | "migration-required"
  | "error";

export type ShowreelSaveState = {
  status: ShowreelSaveStatus;
  message: string;
  eventId: string;
  section?: ShowreelEditorSection;
  fieldErrors?: Record<string, string[]>;
  canonicalSection?: unknown;
  versions?: unknown;
  savedAt?: string;
};

export const INITIAL_SHOWREEL_SAVE_STATE: ShowreelSaveState = {
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
const legacyVideoId = z
  .string()
  .min(1)
  .max(512)
  .refine(
    (value) => value.trim().length > 0 && !/[\u0000-\u001f\u007f]/.test(value),
    "Invalid saved video id."
  );
const timestamp = z.string().refine(
  (value) =>
    value.length <= 64 &&
    /^\d{4}-\d{2}-\d{2}T/.test(value) &&
    Number.isFinite(Date.parse(value)),
  "Invalid saved version. Reload this editor."
);

function hasUnsafeUrlParts(url: URL) {
  return (
    Boolean(url.username || url.password) ||
    url.protocol !== "https:" ||
    Boolean(url.port && url.port !== "443")
  );
}

function isHttpsUrl(value: string) {
  try {
    return !hasUnsafeUrlParts(new URL(value));
  } catch {
    return false;
  }
}

function isSafeLocalPath(value: string) {
  return (
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !/[\\\u0000-\u001f\u007f]/.test(value)
  );
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

export function isSafeShowreelAssetSource(value: string) {
  return isSafeLocalPath(value) || isConfiguredStorageAsset(value);
}

const EMBED_HOSTS = new Set([
  "m.youtube.com",
  "music.youtube.com",
  "open.spotify.com",
  "player.vimeo.com",
  "vimeo.com",
  "w.soundcloud.com",
  "www.youtube-nocookie.com",
  "www.youtube.com",
  "www.vimeo.com",
  "youtu.be",
  "youtube-nocookie.com",
  "youtube.com",
]);

function safeEmbedHost(value: string) {
  try {
    const url = new URL(value);
    return hasUnsafeUrlParts(url) ? "" : url.hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isAllowedEmbedUrl(value: string) {
  return EMBED_HOSTS.has(safeEmbedHost(value));
}

function isSafeWorkSource(item: Pick<ShowreelWorkEditorItem, "embedUrl" | "platform">) {
  const platform = item.platform.toLowerCase();
  if (["upload", "direct", "html5"].includes(platform)) {
    return isSafeShowreelAssetSource(item.embedUrl);
  }

  const host = safeEmbedHost(item.embedUrl);
  if (platform === "youtube") {
    return [
      "m.youtube.com",
      "music.youtube.com",
      "www.youtube-nocookie.com",
      "www.youtube.com",
      "youtu.be",
      "youtube-nocookie.com",
      "youtube.com",
    ].includes(host);
  }
  if (platform === "vimeo") {
    return ["player.vimeo.com", "vimeo.com", "www.vimeo.com"].includes(host);
  }
  if (platform === "spotify") return host === "open.spotify.com";
  if (platform === "soundcloud") return host === "w.soundcloud.com";

  // Preserve an older custom platform label only when its URL still belongs to
  // one of the providers allowed by the site's CSP.
  return isAllowedEmbedUrl(item.embedUrl);
}

function isSafeOptionalHref(value: string) {
  if (!value) return true;
  if (/^#[A-Za-z][A-Za-z0-9_-]*$/.test(value)) return true;
  return isSafeLocalPath(value) || isHttpsUrl(value);
}

const assetSource = requiredText(2_048).refine(
  isSafeShowreelAssetSource,
  "Choose a local file or one uploaded to this site's Media Library."
);
const optionalAssetSource = text(2_048).refine(
  (value) => !value || isSafeShowreelAssetSource(value),
  "Choose a local file or one uploaded to this site's Media Library."
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

const showreelHeroDraftSchema = heroFieldsSchema.superRefine((hero, context) => {
  if (Boolean(hero.ctaLabel) === Boolean(hero.ctaHref)) return;
  context.addIssue({
    code: "custom",
    message: "CTA label and destination must either both be filled or both be empty.",
    path: [hero.ctaLabel ? "ctaHref" : "ctaLabel"],
  });
});

const showreelIntroductionDraftSchema = z
  .object({
    sectionEyebrow: requiredText(220),
    sectionTitle: requiredText(500),
    sectionBody: text(1_200),
    emptyText: requiredText(500),
  })
  .strict();

const videoTypes = [
  "showreel",
  "scene",
  "self_tape",
  "interview",
  "music_video",
  "behind_scenes",
  "other",
] as const;

const showreelWorkFieldsSchema = z
  .object({
    id: legacyVideoId,
    title: requiredText(220),
    description: text(1_000),
    embedUrl: requiredText(1_200),
    platform: requiredText(80),
    thumbnailSrc: text(1_200),
    videoType: z.enum(videoTypes),
    isFeatured: z.boolean(),
    isPublished: z.boolean(),
  })
  .strict();

const showreelWorkItemSchema = showreelWorkFieldsSchema.superRefine(
  (item, context) => {
    if (item.isPublished && !isSafeWorkSource(item)) {
      context.addIssue({
        code: "custom",
        message:
          "Choose a Media Library/local video, or use a genuine supported embed link.",
        path: ["embedUrl"],
      });
    }
    if (
      item.isPublished &&
      item.thumbnailSrc &&
      !isSafeShowreelAssetSource(item.thumbnailSrc)
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Choose a local thumbnail or one uploaded to this site's Media Library.",
        path: ["thumbnailSrc"],
      });
    }
  }
);

const showreelWorksDraftSchema = z
  .object({
    items: z
      .array(showreelWorkItemSchema),
  })
  .strict()
  .superRefine((value, context) => {
    const seen = new Set<string>();
    let featuredCount = 0;
    value.items.forEach((item, index) => {
      if (seen.has(item.id)) {
        context.addIssue({
          code: "custom",
          message: "Each video can appear only once.",
          path: ["items", index, "id"],
        });
      }
      seen.add(item.id);
      if (item.isFeatured) featuredCount += 1;
    });
    if (featuredCount > 1) {
      context.addIssue({
        code: "custom",
        message: "Only one video can retain the legacy featured marker.",
        path: ["items"],
      });
    }
  });

const versionMap = z.record(legacyVideoId, timestamp);
const singletonVersionsSchema = z.object({ updatedAt: timestamp }).strict();
const worksVersionsSchema = z.object({ items: versionMap }).strict();

// Snapshot parsing is intentionally compatible with the classic editor. It
// must load an older-but-valid record so the user can repair it in V2; strict
// source and current-copy validation remains on every save boundary above.
const snapshotHeroSchema = z
  .object({
    title: requiredText(220),
    subtitle: text(220),
    ctaLabel: text(220),
    ctaHref: text(2_048),
    backgroundSrc: requiredText(2_048),
    posterSrc: text(2_048),
    mediaType: z.enum(["image", "video"]),
    updatedAt: timestamp,
  })
  .strict();
const snapshotIntroductionSchema = z
  .object({
    sectionEyebrow: text(220),
    sectionTitle: requiredText(500),
    sectionBody: text(1_200),
    emptyText: text(1_000),
    updatedAt: timestamp,
  })
  .strict();
const snapshotWorkSchema = z
  .object({
    id: legacyVideoId,
    title: requiredText(220),
    description: text(1_000),
    embedUrl: requiredText(1_200),
    platform: requiredText(80),
    thumbnailSrc: text(1_200),
    videoType: z.enum(videoTypes),
    isFeatured: z.boolean(),
    isPublished: z.boolean(),
    updatedAt: timestamp,
  })
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
const footerSchema = z
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
    works: z.object({ items: z.array(snapshotWorkSchema) }).strict(),
    footer: footerSchema,
  })
  .strict();

export function parseShowreelHeroDraft(value: unknown) {
  return showreelHeroDraftSchema.safeParse(value);
}

export function parseShowreelIntroductionDraft(value: unknown) {
  return showreelIntroductionDraftSchema.safeParse(value);
}

export function parseShowreelWorksDraft(value: unknown) {
  return showreelWorksDraftSchema.safeParse(value);
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
  return ids.size === versionIds.length && versionIds.every((id) => ids.has(id));
}

export function parseShowreelSectionSubmission(
  section: unknown,
  payload: unknown,
  versions: unknown,
  options: { requireExactCollectionVersions?: boolean } = {}
):
  | {
      success: true;
      data: {
        section: ShowreelEditorSection;
        payload: unknown;
        versions: unknown;
      };
    }
  | { success: false; fieldErrors: Record<string, string[]> } {
  const parsedSection = z.enum(SHOWREEL_EDITOR_SECTIONS).safeParse(section);
  if (!parsedSection.success) {
    return {
      success: false,
      fieldErrors: { section: ["Choose a valid Showreel section."] },
    };
  }

  const parsers = {
    hero: [showreelHeroDraftSchema, singletonVersionsSchema],
    introduction: [showreelIntroductionDraftSchema, singletonVersionsSchema],
    works: [showreelWorksDraftSchema, worksVersionsSchema],
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

  if (parsedSection.data === "works") {
    const workPayload = parsedPayload.data as ShowreelWorksDraft;
    const workVersions = parsedVersions.data as ShowreelEditorVersions["works"];
    const submittedIds = new Set(workPayload.items.map((item) => item.id));
    const savedItemMissing = Object.keys(workVersions.items).some(
      (id) => !submittedIds.has(id)
    );
    const exactResponseMissing =
      options.requireExactCollectionVersions === true &&
      !hasExactVersionParity(workPayload.items, workVersions.items);
    const invalidNewItemIndex = workPayload.items.findIndex(
      (item) =>
        !Object.prototype.hasOwnProperty.call(workVersions.items, item.id) &&
        !recordId.safeParse(item.id).success
    );

    if (invalidNewItemIndex >= 0) {
      return {
        success: false,
        fieldErrors: {
          [`items.${invalidNewItemIndex}.id`]: [
            "New video ids must use only letters, numbers, dots, underscores, colons, or hyphens.",
          ],
        },
      };
    }

    if (savedItemMissing || exactResponseMissing) {
      return {
        success: false,
        fieldErrors: {
          form: [
            options.requireExactCollectionVersions
              ? "The saved videos could not be confirmed. Reload before editing them again."
              : "Saved videos cannot be deleted here. Hide a video, or reload if the page changed.",
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

export function parseShowreelEditorSnapshot(
  value: unknown
): ShowreelEditorSnapshot | null {
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
        sectionEyebrow: snapshot.introduction.sectionEyebrow,
        sectionTitle: snapshot.introduction.sectionTitle,
        sectionBody: snapshot.introduction.sectionBody,
        emptyText: snapshot.introduction.emptyText,
      },
      works: {
        items: snapshot.works.items.map((item) => ({
          id: item.id,
          title: item.title,
          description: item.description,
          embedUrl: item.embedUrl,
          platform: item.platform,
          thumbnailSrc: item.thumbnailSrc,
          videoType: item.videoType,
          isFeatured: item.isFeatured,
          isPublished: item.isPublished,
        })),
      },
    },
    versions: {
      hero: { updatedAt: snapshot.hero.updatedAt },
      introduction: { updatedAt: snapshot.introduction.updatedAt },
      works: {
        items: Object.fromEntries(
          snapshot.works.items.map((item) => [item.id, item.updatedAt])
        ),
      },
    },
    footer: snapshot.footer,
  };
}

export function createFallbackShowreelEditorSnapshot(): ShowreelEditorSnapshot {
  const fallbackTimestamp = new Date(0).toISOString();
  const items = FALLBACK_CONTENT.videos.map((item) => ({
    id: item.id,
    title: item.title,
    description: item.description,
    embedUrl: item.embedUrl,
    platform: item.platform,
    thumbnailSrc: item.thumbnailSrc,
    videoType: item.videoType,
    isFeatured: item.isFeatured,
    isPublished: true,
  }));
  return {
    draft: {
      hero: FALLBACK_CONTENT.heroes.video,
      introduction: {
        sectionEyebrow: FALLBACK_CONTENT.videoPresentation.sectionEyebrow,
        sectionTitle: FALLBACK_CONTENT.videoPresentation.sectionTitle,
        sectionBody: FALLBACK_CONTENT.videoPresentation.sectionBody,
        emptyText: FALLBACK_CONTENT.videoPresentation.emptyText,
      },
      works: { items },
    },
    versions: {
      hero: { updatedAt: fallbackTimestamp },
      introduction: { updatedAt: fallbackTimestamp },
      works: {
        items: Object.fromEntries(items.map((item) => [item.id, fallbackTimestamp])),
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

export function getShowreelSectionPayload(
  draft: ShowreelEditorDraft,
  section: ShowreelEditorSection
) {
  return draft[section];
}

export function getShowreelSectionVersions(
  versions: ShowreelEditorVersions,
  section: ShowreelEditorSection
) {
  return versions[section];
}

export function isShowreelSectionDirty(
  baseline: ShowreelEditorDraft,
  draft: ShowreelEditorDraft,
  section: ShowreelEditorSection
) {
  return JSON.stringify(baseline[section]) !== JSON.stringify(draft[section]);
}

export function getDirtyShowreelSections(
  baseline: ShowreelEditorDraft,
  draft: ShowreelEditorDraft
) {
  return SHOWREEL_EDITOR_SECTIONS.filter((section) =>
    isShowreelSectionDirty(baseline, draft, section)
  );
}

export function moveShowreelEditorItem<T>(items: T[], from: number, to: number) {
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

const previewAssetSource = text(2_048).transform((value) =>
  !value || isSafeShowreelAssetSource(value) ? value : ""
);
const previewVideoSource = text(1_200).transform((value) =>
  !value || isSafeShowreelAssetSource(value) || isAllowedEmbedUrl(value)
    ? value
    : ""
);
const previewHref = text(2_048).transform((value) =>
  isSafeOptionalHref(value) ? value : ""
);
const previewDraftSchema = z
  .object({
    hero: z
      .object({
        title: text(220),
        subtitle: text(220),
        ctaLabel: text(220),
        ctaHref: previewHref,
        backgroundSrc: previewAssetSource,
        posterSrc: previewAssetSource,
        mediaType: z.enum(["image", "video"]),
      })
      .strict(),
    introduction: z
      .object({
        sectionEyebrow: text(220),
        sectionTitle: text(500),
        sectionBody: text(1_200),
        emptyText: text(1_000),
      })
      .strict(),
    works: z
      .object({
        items: z.array(
          z
            .object({
              id: legacyVideoId,
              title: text(220),
              description: text(1_000),
              embedUrl: previewVideoSource,
              platform: text(80),
              thumbnailSrc: previewAssetSource,
              videoType: z.enum(videoTypes),
              isFeatured: z.boolean(),
              isPublished: z.boolean(),
            })
            .strict()
        ),
      })
      .strict(),
  })
  .strict();

export const SHOWREEL_PREVIEW_UPDATE_MESSAGE =
  "showreel-preview-update" as const;

const previewUpdateSchema = z
  .object({
    type: z.literal(SHOWREEL_PREVIEW_UPDATE_MESSAGE),
    draft: previewDraftSchema,
    footer: footerSchema,
    focusRequestId: z.number().int().nonnegative(),
    selectedSection: z.enum(SHOWREEL_EDITOR_SECTIONS),
  })
  .strict();

export type ShowreelPreviewUpdateMessage = z.infer<
  typeof previewUpdateSchema
>;

export function parseShowreelPreviewUpdateMessage(
  value: unknown
): ShowreelPreviewUpdateMessage | null {
  const parsed = previewUpdateSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function createShowreelPageViewDataFromEditor(
  draft: ShowreelEditorDraft,
  footer: ShowreelEditorFooter
): {
  hero: HeroContent;
  presentation: VideoPresentation;
  videos: VideoItem[];
  footer: ShowreelEditorFooter;
} {
  return {
    hero: {
      ...draft.hero,
      backgroundSrc:
        isSafeShowreelAssetSource(draft.hero.backgroundSrc)
          ? draft.hero.backgroundSrc
          : FALLBACK_CONTENT.heroes.video.backgroundSrc,
      posterSrc: isSafeShowreelAssetSource(draft.hero.posterSrc)
        ? draft.hero.posterSrc
        : "",
      mediaType: isSafeShowreelAssetSource(draft.hero.backgroundSrc)
        ? draft.hero.mediaType
        : "image",
    },
    presentation: {
      ...FALLBACK_CONTENT.videoPresentation,
      ...draft.introduction,
    },
    videos: draft.works.items
      .filter(
        (item) =>
          item.isPublished &&
          item.title.trim() &&
          item.embedUrl.trim() &&
          isSafeWorkSource(item)
      )
      .map((item) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        embedUrl: item.embedUrl,
        platform: item.platform,
        thumbnailSrc: isSafeShowreelAssetSource(item.thumbnailSrc)
          ? item.thumbnailSrc
          : "",
        videoType: item.videoType,
        isFeatured: item.isFeatured,
      })),
    footer,
  };
}
