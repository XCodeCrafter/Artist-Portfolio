import { z } from "zod";
import { FALLBACK_CONTENT } from "@/lib/content/fallback";
import type { HeroContent } from "@/lib/content/types";

export const CONTACT_EDITOR_SECTIONS = ["hero", "details"] as const;

export type ContactEditorSection = (typeof CONTACT_EDITOR_SECTIONS)[number];

export type ContactHeroDraft = HeroContent;

export type ContactDetailsDraft = {
  location: string;
  contactBlurb: string;
};

export type ContactEditorDraft = {
  hero: ContactHeroDraft;
  details: ContactDetailsDraft;
};

export type ContactEditorVersions = {
  hero: { updatedAt: string };
  details: { updatedAt: string };
};

export type ContactEditorSnapshot = {
  draft: ContactEditorDraft;
  versions: ContactEditorVersions;
};

export type ContactSectionVersions = {
  hero: ContactEditorVersions["hero"];
  details: ContactEditorVersions["details"];
};

export type ContactSaveStatus =
  | "idle"
  | "saved"
  | "invalid"
  | "conflict"
  | "security-error"
  | "missing-service"
  | "migration-required"
  | "error";

export type ContactSaveState = {
  status: ContactSaveStatus;
  message: string;
  eventId: string;
  section?: ContactEditorSection;
  fieldErrors?: Record<string, string[]>;
  canonicalSection?: unknown;
  versions?: unknown;
  savedAt?: string;
};

export const INITIAL_CONTACT_SAVE_STATE: ContactSaveState = {
  status: "idle",
  message: "",
  eventId: "",
};

const text = (max: number) => z.string().trim().max(max);
const requiredText = (max: number) => z.string().trim().min(1).max(max);
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

export function isSafeContactAssetSource(value: string) {
  return isSafeLocalPath(value) || isConfiguredStorageAsset(value);
}

function isSafeOptionalHref(value: string) {
  if (!value) return true;
  if (/^#[A-Za-z][A-Za-z0-9_-]*$/.test(value)) return true;
  return isSafeLocalPath(value) || isHttpsUrl(value);
}

const assetSource = requiredText(2_048).refine(
  isSafeContactAssetSource,
  "Choose a local file or one uploaded to this site's Media Library."
);
const optionalAssetSource = text(2_048).refine(
  (value) => !value || isSafeContactAssetSource(value),
  "Choose a local file or one uploaded to this site's Media Library."
);
const optionalHref = text(2_048).refine(
  isSafeOptionalHref,
  "Use a local path, an #anchor, or a safe https:// URL."
);

const contactHeroDraftSchema = z
  .object({
    title: requiredText(220),
    subtitle: text(220),
    ctaLabel: text(220),
    ctaHref: optionalHref,
    backgroundSrc: assetSource,
    posterSrc: optionalAssetSource,
    mediaType: z.enum(["image", "video"]),
  })
  .strict()
  .superRefine((hero, context) => {
    if (Boolean(hero.ctaLabel) === Boolean(hero.ctaHref)) return;
    context.addIssue({
      code: "custom",
      message:
        "CTA label and destination must either both be filled or both be empty.",
      path: [hero.ctaLabel ? "ctaHref" : "ctaLabel"],
    });
  });

const contactDetailsDraftSchema = z
  .object({
    location: requiredText(220),
    contactBlurb: requiredText(1_000),
  })
  .strict();

const singletonVersionsSchema = z.object({ updatedAt: timestamp }).strict();

// The snapshot accepts historical URLs and longer legacy copy so that an old
// record remains visible and repairable. Current save boundaries above remain
// deliberately stricter.
const snapshotHeroSchema = z
  .object({
    title: requiredText(1_000),
    subtitle: text(1_000),
    ctaLabel: text(1_000),
    ctaHref: text(4_096),
    backgroundSrc: requiredText(4_096),
    posterSrc: text(4_096),
    mediaType: z.enum(["image", "video"]),
    updatedAt: timestamp,
  })
  .strict();
const snapshotDetailsSchema = z
  .object({
    location: text(2_000),
    contactBlurb: text(10_000),
    updatedAt: timestamp,
  })
  .strict();
const snapshotSchema = z
  .object({
    hero: snapshotHeroSchema,
    details: snapshotDetailsSchema,
  })
  .strict();

export function parseContactHeroDraft(value: unknown) {
  return contactHeroDraftSchema.safeParse(value);
}

export function parseContactDetailsDraft(value: unknown) {
  return contactDetailsDraftSchema.safeParse(value);
}

function issueMap(error: z.ZodError) {
  const errors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    errors[key] = [...(errors[key] || []), issue.message];
  }
  return errors;
}

export function parseContactSectionSubmission(
  section: unknown,
  payload: unknown,
  versions: unknown
):
  | {
      success: true;
      data: {
        section: ContactEditorSection;
        payload: unknown;
        versions: unknown;
      };
    }
  | { success: false; fieldErrors: Record<string, string[]> } {
  const parsedSection = z.enum(CONTACT_EDITOR_SECTIONS).safeParse(section);
  if (!parsedSection.success) {
    return {
      success: false,
      fieldErrors: { section: ["Choose a valid Contact section."] },
    };
  }

  const payloadSchema =
    parsedSection.data === "hero"
      ? contactHeroDraftSchema
      : contactDetailsDraftSchema;
  const parsedPayload = payloadSchema.safeParse(payload);
  const parsedVersions = singletonVersionsSchema.safeParse(versions);

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

  return {
    success: true,
    data: {
      section: parsedSection.data,
      payload: parsedPayload.data,
      versions: parsedVersions.data,
    },
  };
}

export function parseContactEditorSnapshot(
  value: unknown
): ContactEditorSnapshot | null {
  const parsed = snapshotSchema.safeParse(value);
  if (!parsed.success) return null;

  return {
    draft: {
      hero: {
        title: parsed.data.hero.title,
        subtitle: parsed.data.hero.subtitle,
        ctaLabel: parsed.data.hero.ctaLabel,
        ctaHref: parsed.data.hero.ctaHref,
        backgroundSrc: parsed.data.hero.backgroundSrc,
        posterSrc: parsed.data.hero.posterSrc,
        mediaType: parsed.data.hero.mediaType,
      },
      details: {
        location: parsed.data.details.location,
        contactBlurb: parsed.data.details.contactBlurb,
      },
    },
    versions: {
      hero: { updatedAt: parsed.data.hero.updatedAt },
      details: { updatedAt: parsed.data.details.updatedAt },
    },
  };
}

export function createFallbackContactEditorSnapshot(): ContactEditorSnapshot {
  const updatedAt = new Date(0).toISOString();
  return {
    draft: {
      hero: FALLBACK_CONTENT.heroes.booking,
      details: {
        location: FALLBACK_CONTENT.settings.location,
        contactBlurb: FALLBACK_CONTENT.settings.contactBlurb,
      },
    },
    versions: {
      hero: { updatedAt },
      details: { updatedAt },
    },
  };
}

export function getContactSectionPayload(
  draft: ContactEditorDraft,
  section: ContactEditorSection
) {
  return draft[section];
}

export function getContactSectionVersions(
  versions: ContactEditorVersions,
  section: ContactEditorSection
) {
  return versions[section];
}

export function isContactSectionDirty(
  baseline: ContactEditorDraft,
  draft: ContactEditorDraft,
  section: ContactEditorSection
) {
  return JSON.stringify(baseline[section]) !== JSON.stringify(draft[section]);
}

export function getDirtyContactSections(
  baseline: ContactEditorDraft,
  draft: ContactEditorDraft
) {
  return CONTACT_EDITOR_SECTIONS.filter((section) =>
    isContactSectionDirty(baseline, draft, section)
  );
}

const previewHref = text(2_048).transform((value) =>
  isSafeOptionalHref(value) ? value : ""
);
const previewMediaSource = text(4_096).transform((value) =>
  !value || isSafeContactAssetSource(value) || isHttpsUrl(value) ? value : ""
);
const previewDraftSchema = z
  .object({
    hero: z
      .object({
        title: text(1_000),
        subtitle: text(1_000),
        ctaLabel: text(1_000),
        ctaHref: previewHref,
        backgroundSrc: previewMediaSource,
        posterSrc: previewMediaSource,
        mediaType: z.enum(["image", "video"]),
      })
      .strict(),
    details: z
      .object({
        location: text(2_000),
        contactBlurb: text(10_000),
      })
      .strict(),
  })
  .strict();

export const CONTACT_PREVIEW_UPDATE_MESSAGE = "contact-preview-update" as const;

const contactPreviewUpdateSchema = z
  .object({
    type: z.literal(CONTACT_PREVIEW_UPDATE_MESSAGE),
    draft: previewDraftSchema,
    focusRequestId: z.number().int().nonnegative(),
    selectedSection: z.enum(CONTACT_EDITOR_SECTIONS),
  })
  .strict();

export type ContactPreviewUpdateMessage = z.infer<
  typeof contactPreviewUpdateSchema
>;

export function parseContactPreviewUpdateMessage(
  value: unknown
): ContactPreviewUpdateMessage | null {
  const parsed = contactPreviewUpdateSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export type ContactPageViewData = {
  hero: HeroContent;
  details: ContactDetailsDraft;
};

export function createContactPageViewDataFromEditor(
  draft: ContactEditorDraft
): ContactPageViewData {
  const hasValidBackground = Boolean(
    draft.hero.backgroundSrc &&
      (isSafeContactAssetSource(draft.hero.backgroundSrc) ||
        isHttpsUrl(draft.hero.backgroundSrc))
  );
  const backgroundSrc =
    hasValidBackground
      ? draft.hero.backgroundSrc
      : FALLBACK_CONTENT.heroes.booking.backgroundSrc;
  const posterSrc =
    draft.hero.posterSrc &&
    (isSafeContactAssetSource(draft.hero.posterSrc) ||
      isHttpsUrl(draft.hero.posterSrc))
      ? draft.hero.posterSrc
      : "";
  const ctaHref = isSafeOptionalHref(draft.hero.ctaHref)
    ? draft.hero.ctaHref
    : "";

  return {
    hero: {
      ...draft.hero,
      ctaHref,
      backgroundSrc,
      posterSrc,
      mediaType: hasValidBackground ? draft.hero.mediaType : "image",
    },
    details: { ...draft.details },
  };
}
