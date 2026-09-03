import { z } from "zod";
import { FALLBACK_CONTENT } from "@/lib/content/fallback";
import type { MusicPageViewData } from "@/lib/content/music";
import type {
  FooterEffect,
  HeroContent,
  SocialLink,
} from "@/lib/content/types";
import { detectSocialPlatform } from "@/lib/content/social-platforms";

export const MUSIC_EDITOR_SECTIONS = [
  "hero",
  "platforms",
  "spotify",
  "soundcloud",
] as const;

export type MusicEditorSection = (typeof MUSIC_EDITOR_SECTIONS)[number];

export type MusicHeroDraft = HeroContent;

export type MusicSpotifyDraft = {
  releasesHeading: string;
  artistUrl: string;
  embedUrl: string;
};

export type MusicPlatformEditorItem = {
  id: string;
  title: string;
  label: string;
  href: string;
  imageSrc: string;
  iconKey: string;
  isPublished: boolean;
};

export type MusicPlatformsDraft = {
  items: MusicPlatformEditorItem[];
};

export type MusicSoundcloudEditorItem = {
  id: string;
  title: string;
  embedUrl: string;
  isPublished: boolean;
};

export type MusicSoundcloudDraft = {
  mixesHeading: string;
  items: MusicSoundcloudEditorItem[];
};

export type MusicEditorDraft = {
  hero: MusicHeroDraft;
  platforms: MusicPlatformsDraft;
  spotify: MusicSpotifyDraft;
  soundcloud: MusicSoundcloudDraft;
};

export type MusicEditorVersions = {
  hero: { updatedAt: string };
  platforms: { items: Record<string, string> };
  spotify: {
    settingsUpdatedAt: string;
    presentationUpdatedAt: string;
  };
  soundcloud: {
    presentationUpdatedAt: string;
    items: Record<string, string>;
  };
};

export type MusicEditorFooter = {
  artistName: string;
  contactBlurb: string;
  footerEffect: FooterEffect;
  location: string;
  socialLinks: SocialLink[];
  tagline: string;
};

export type MusicEditorSnapshot = {
  draft: MusicEditorDraft;
  versions: MusicEditorVersions;
  footer: MusicEditorFooter;
};

export type MusicSectionVersions = {
  hero: MusicEditorVersions["hero"];
  platforms: MusicEditorVersions["platforms"];
  spotify: MusicEditorVersions["spotify"];
  soundcloud: MusicEditorVersions["soundcloud"];
};

export type MusicSaveStatus =
  | "idle"
  | "saved"
  | "invalid"
  | "conflict"
  | "security-error"
  | "missing-service"
  | "migration-required"
  | "error";

export type MusicSaveState = {
  status: MusicSaveStatus;
  message: string;
  eventId: string;
  section?: MusicEditorSection;
  fieldErrors?: Record<string, string[]>;
  canonicalSection?: unknown;
  versions?: unknown;
  savedAt?: string;
};

export const INITIAL_MUSIC_SAVE_STATE: MusicSaveState = {
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

function isHttpsUrl(value: string, allowedHosts?: readonly string[]) {
  try {
    const url = new URL(value);
    if (hasUnsafeUrlParts(url)) return false;
    if (!allowedHosts?.length) return true;
    return allowedHosts.includes(url.hostname.toLowerCase());
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

function isSpotifyArtistUrl(value: string) {
  if (!value) return true;
  try {
    const url = new URL(value);
    return (
      !hasUnsafeUrlParts(url) &&
      url.hostname.toLowerCase() === "open.spotify.com" &&
      /^\/artist\/[A-Za-z0-9]+\/?$/.test(url.pathname)
    );
  } catch {
    return false;
  }
}

function isSpotifyEmbedUrl(value: string) {
  if (!value) return true;
  try {
    const url = new URL(value);
    return (
      !hasUnsafeUrlParts(url) &&
      url.hostname.toLowerCase() === "open.spotify.com" &&
      url.pathname.startsWith("/embed/")
    );
  } catch {
    return false;
  }
}

function isSoundcloudTrackUrl(value: string) {
  return isHttpsUrl(value, [
    "api.soundcloud.com",
    "on.soundcloud.com",
    "soundcloud.com",
    "www.soundcloud.com",
  ]);
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
  (value) => !value || isSafeAssetSource(value),
  "Use a local image or one uploaded to this site's Media Library."
);
const optionalHref = text(2_048).refine(
  isSafeOptionalHref,
  "Use a local path, an #anchor, or a safe https:// URL."
);
const requiredHref = requiredText(2_048).refine(
  isSafeOptionalHref,
  "Use a local path, an #anchor, or a safe https:// URL."
);
const heading = requiredText(220);

const musicHeroDraftSchema = z
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

const musicSpotifyDraftSchema = z
  .object({
    releasesHeading: heading,
    artistUrl: text(2_048).refine(
      isSpotifyArtistUrl,
      "Use an open.spotify.com artist link or leave it empty."
    ),
    embedUrl: text(2_048).refine(
      isSpotifyEmbedUrl,
      "Use an open.spotify.com/embed link or leave it empty."
    ),
  })
  .strict();

const musicPlatformSaveItemSchema = z
  .object({
    id: recordId,
    title: requiredText(220),
    label: text(220),
    href: requiredHref,
    imageSrc: assetSource,
    iconKey: requiredText(64).regex(/^[a-z0-9][a-z0-9-]*$/),
    isPublished: z.boolean(),
  })
  .strict();

const musicPlatformsDraftSchema = z
  .object({
    items: z
      .array(musicPlatformSaveItemSchema)
      .max(32, "Keep the platform list to 32 destinations or fewer."),
  })
  .strict()
  .superRefine((value, context) => {
    const seen = new Set<string>();
    value.items.forEach((item, index) => {
      if (seen.has(item.id)) {
        context.addIssue({
          code: "custom",
          message: "Each platform can appear only once.",
          path: ["items", index, "id"],
        });
      }
      seen.add(item.id);
    });
  });

const musicSoundcloudSaveItemSchema = z
  .object({
    id: recordId,
    title: text(220),
    embedUrl: requiredText(2_048).refine(
      isSoundcloudTrackUrl,
      "Use a supported SoundCloud track URL."
    ),
    isPublished: z.boolean(),
  })
  .strict();

const musicSoundcloudDraftSchema = z
  .object({
    mixesHeading: heading,
    items: z
      .array(musicSoundcloudSaveItemSchema)
      .max(48, "Keep the SoundCloud list to 48 tracks or fewer."),
  })
  .strict()
  .superRefine((value, context) => {
    const seen = new Set<string>();
    value.items.forEach((item, index) => {
      if (seen.has(item.id)) {
        context.addIssue({
          code: "custom",
          message: "Each SoundCloud track can appear only once.",
          path: ["items", index, "id"],
        });
      }
      seen.add(item.id);
    });
  });

const versionMap = z.record(recordId, timestamp);
const heroVersionsSchema = z.object({ updatedAt: timestamp }).strict();
const spotifyVersionsSchema = z
  .object({
    settingsUpdatedAt: timestamp,
    presentationUpdatedAt: timestamp,
  })
  .strict();
const platformsVersionsSchema = z
  .object({ items: versionMap })
  .strict();
const soundcloudVersionsSchema = z
  .object({ presentationUpdatedAt: timestamp, items: versionMap })
  .strict();

const snapshotHeroDraftSchema = z
  .object({
    title: requiredText(220),
    subtitle: text(220),
    ctaLabel: text(220),
    ctaHref: optionalHref,
    backgroundSrc: legacyMediaSource,
    posterSrc: optionalLegacyAssetSource,
    mediaType: z.enum(["image", "video"]),
  })
  .strict();
const snapshotSpotifyDraftSchema = z
  .object({
    releasesHeading: heading,
    artistUrl: optionalHref,
    embedUrl: optionalHref,
  })
  .strict();
const snapshotPlatformEditorItemSchema = z
  .object({
    id: recordId,
    title: requiredText(220),
    label: text(220),
    href: requiredHref,
    imageSrc: optionalLegacyAssetSource,
    iconKey: text(220),
    isPublished: z.boolean(),
  })
  .strict();
const snapshotSoundcloudEditorItemSchema = z
  .object({
    id: recordId,
    title: text(220),
    embedUrl: requiredHref,
    isPublished: z.boolean(),
  })
  .strict();
const snapshotPlatformSchema = snapshotPlatformEditorItemSchema
  .extend({ updatedAt: timestamp })
  .strict();
const snapshotSoundcloudSchema = snapshotSoundcloudEditorItemSchema
  .extend({ updatedAt: timestamp })
  .strict();
const snapshotSocialSchema = z
  .object({
    id: recordId,
    label: requiredText(220),
    platform: requiredText(220),
    href: requiredHref,
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
const previewHref = text(2_048).transform((value) =>
  isSafeOptionalHref(value) ? value : ""
);
const previewMediaSource = text(2_048).transform((value) =>
  !value || isSafeAssetSource(value) || isHttpsUrl(value) ? value : ""
);
const previewImageSource = text(2_048).transform((value) =>
  !value || isSafeAssetSource(value) ? value : ""
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
        posterSrc: previewImageSource,
        mediaType: z.enum(["image", "video"]),
      })
      .strict(),
    spotify: z
      .object({
        releasesHeading: text(220),
        artistUrl: previewHref,
        embedUrl: previewHref,
      })
      .strict(),
    platforms: z
      .object({
        items: z.array(
          z
            .object({
              id: recordId,
              title: text(220),
              label: text(220),
              href: previewHref,
              imageSrc: previewImageSource,
              iconKey: text(220),
              isPublished: z.boolean(),
            })
            .strict()
        ),
      })
      .strict(),
    soundcloud: z
      .object({
        mixesHeading: text(220),
        items: z.array(
          z
            .object({
              id: recordId,
              title: text(220),
              embedUrl: previewHref,
              isPublished: z.boolean(),
            })
            .strict()
        ),
      })
      .strict(),
  })
  .strict();
const snapshotSchema = z
  .object({
    hero: snapshotHeroDraftSchema.extend({ updatedAt: timestamp }).strict(),
    spotify: snapshotSpotifyDraftSchema
      .extend({
        settingsUpdatedAt: timestamp,
        presentationUpdatedAt: timestamp,
      })
      .strict(),
    platforms: z.array(snapshotPlatformSchema),
    soundcloud: z
      .object({
        mixesHeading: heading,
        presentationUpdatedAt: timestamp,
        tracks: z.array(snapshotSoundcloudSchema),
      })
      .strict(),
    footer: editorFooterSchema,
  })
  .strict();

export function parseMusicHeroDraft(value: unknown) {
  return musicHeroDraftSchema.safeParse(value);
}

export function parseMusicSpotifyDraft(value: unknown) {
  return musicSpotifyDraftSchema.safeParse(value);
}

export function parseMusicPlatformsDraft(value: unknown) {
  return musicPlatformsDraftSchema.safeParse(value);
}

export function parseMusicSoundcloudDraft(value: unknown) {
  return musicSoundcloudDraftSchema.safeParse(value);
}

function issueMap(error: z.ZodError) {
  const errors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    errors[key] = [...(errors[key] || []), issue.message];
  }
  return errors;
}

export function parseMusicSectionSubmission(
  section: unknown,
  payload: unknown,
  versions: unknown,
  options: { requireExactCollectionVersions?: boolean } = {}
):
  | {
      success: true;
      data: {
        section: MusicEditorSection;
        payload: unknown;
        versions: unknown;
      };
    }
  | { success: false; fieldErrors: Record<string, string[]> } {
  const parsedSection = z.enum(MUSIC_EDITOR_SECTIONS).safeParse(section);
  if (!parsedSection.success) {
    return {
      success: false,
      fieldErrors: { section: ["Choose a valid Music section."] },
    };
  }

  const sectionParsers = {
    hero: [musicHeroDraftSchema, heroVersionsSchema],
    platforms: [musicPlatformsDraftSchema, platformsVersionsSchema],
    spotify: [musicSpotifyDraftSchema, spotifyVersionsSchema],
    soundcloud: [musicSoundcloudDraftSchema, soundcloudVersionsSchema],
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

  if (parsedSection.data === "platforms" || parsedSection.data === "soundcloud") {
    const payloadItems = (parsedPayload.data as { items: Array<{ id: string }> })
      .items;
    const expectedItems = (parsedVersions.data as {
      items: Record<string, string>;
    }).items;
    const payloadIds = new Set(payloadItems.map((item) => item.id));
    const expectedIds = Object.keys(expectedItems).sort();
    const missingSavedIds = expectedIds.filter((id) => !payloadIds.has(id));
    const missingReturnedVersions = options.requireExactCollectionVersions
      ? payloadItems.filter((item) => !(item.id in expectedItems)).map((item) => item.id)
      : [];
    if (missingSavedIds.length || missingReturnedVersions.length) {
      return {
        success: false,
        fieldErrors: {
          form: [
            options.requireExactCollectionVersions
              ? "The saved collection could not be confirmed. Reload before editing it again."
              : "Saved items cannot be deleted here. Hide an existing item, or reload if the collection changed.",
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

export function parseMusicEditorSnapshot(value: unknown): MusicEditorSnapshot | null {
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
      spotify: {
        releasesHeading: snapshot.spotify.releasesHeading,
        artistUrl: snapshot.spotify.artistUrl,
        embedUrl: snapshot.spotify.embedUrl,
      },
      platforms: {
        items: snapshot.platforms.map((item) => ({
          id: item.id,
          title: item.title,
          label: item.label,
          href: item.href,
          imageSrc: item.imageSrc,
          iconKey: item.iconKey,
          isPublished: item.isPublished,
        })),
      },
      soundcloud: {
        mixesHeading: snapshot.soundcloud.mixesHeading,
        items: snapshot.soundcloud.tracks.map((item) => ({
          id: item.id,
          title: item.title,
          embedUrl: item.embedUrl,
          isPublished: item.isPublished,
        })),
      },
    },
    versions: {
      hero: { updatedAt: snapshot.hero.updatedAt },
      spotify: {
        settingsUpdatedAt: snapshot.spotify.settingsUpdatedAt,
        presentationUpdatedAt: snapshot.spotify.presentationUpdatedAt,
      },
      platforms: {
        items: Object.fromEntries(
          snapshot.platforms.map((item) => [item.id, item.updatedAt])
        ),
      },
      soundcloud: {
        presentationUpdatedAt: snapshot.soundcloud.presentationUpdatedAt,
        items: Object.fromEntries(
          snapshot.soundcloud.tracks.map((item) => [item.id, item.updatedAt])
        ),
      },
    },
    footer: snapshot.footer,
  };
}

export function createFallbackMusicEditorSnapshot(): MusicEditorSnapshot {
  const fallbackTimestamp = new Date(0).toISOString();
  return {
    draft: {
      hero: FALLBACK_CONTENT.heroes.music,
      spotify: {
        releasesHeading: FALLBACK_CONTENT.musicPresentation.releasesHeading,
        artistUrl: FALLBACK_CONTENT.settings.spotifyArtistUrl,
        embedUrl: FALLBACK_CONTENT.settings.spotifyEmbedUrl,
      },
      platforms: {
        items: FALLBACK_CONTENT.musicPlatforms.map((item) => ({
          ...item,
          isPublished: true,
        })),
      },
      soundcloud: {
        mixesHeading: FALLBACK_CONTENT.musicPresentation.mixesHeading,
        items: FALLBACK_CONTENT.soundcloudTracks.map((item) => ({
          id: item.id,
          title: item.title || "",
          embedUrl: item.embedUrl,
          isPublished: true,
        })),
      },
    },
    versions: {
      hero: { updatedAt: fallbackTimestamp },
      spotify: {
        settingsUpdatedAt: fallbackTimestamp,
        presentationUpdatedAt: fallbackTimestamp,
      },
      platforms: {
        items: Object.fromEntries(
          FALLBACK_CONTENT.musicPlatforms.map((item) => [item.id, fallbackTimestamp])
        ),
      },
      soundcloud: {
        presentationUpdatedAt: fallbackTimestamp,
        items: Object.fromEntries(
          FALLBACK_CONTENT.soundcloudTracks.map((item) => [item.id, fallbackTimestamp])
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

export function getMusicSectionPayload(
  draft: MusicEditorDraft,
  section: MusicEditorSection
) {
  if (section === "platforms") {
    return {
      items: draft.platforms.items.map((item) => ({
        id: item.id,
        title: item.title,
        label: item.label,
        href: item.href,
        imageSrc: item.imageSrc,
        iconKey: detectSocialPlatform(
          item.iconKey,
          item.href,
          item.title,
          item.label
        ),
        isPublished: item.isPublished,
      })),
    };
  }
  if (section === "spotify") {
    return {
      ...draft.spotify,
      embedUrl: deriveSpotifyEmbedUrl(draft.spotify.artistUrl),
    };
  }
  return draft[section];
}

export function getMusicSectionVersions(
  versions: MusicEditorVersions,
  section: MusicEditorSection
) {
  return versions[section];
}

export function isMusicSectionDirty(
  baseline: MusicEditorDraft,
  draft: MusicEditorDraft,
  section: MusicEditorSection
) {
  return JSON.stringify(baseline[section]) !== JSON.stringify(draft[section]);
}

export function getDirtyMusicSections(
  baseline: MusicEditorDraft,
  draft: MusicEditorDraft
) {
  return MUSIC_EDITOR_SECTIONS.filter((section) =>
    isMusicSectionDirty(baseline, draft, section)
  );
}

export function moveMusicEditorItem<T>(items: T[], from: number, to: number) {
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

export const MUSIC_PREVIEW_UPDATE_MESSAGE = "music-preview-update" as const;

const musicPreviewUpdateSchema = z
  .object({
    type: z.literal(MUSIC_PREVIEW_UPDATE_MESSAGE),
    draft: previewDraftSchema,
    footer: editorFooterSchema,
    focusRequestId: z.number().int().nonnegative(),
    selectedSection: z.enum(MUSIC_EDITOR_SECTIONS),
  })
  .strict();

export type MusicPreviewUpdateMessage = z.infer<
  typeof musicPreviewUpdateSchema
>;

export function parseMusicPreviewUpdateMessage(
  value: unknown
): MusicPreviewUpdateMessage | null {
  const parsed = musicPreviewUpdateSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function deriveSpotifyEmbedUrl(value: string) {
  try {
    const url = new URL(value.trim());
    if (hasUnsafeUrlParts(url) || url.hostname.toLowerCase() !== "open.spotify.com") {
      return "";
    }

    const match = url.pathname.match(/^\/artist\/([A-Za-z0-9]+)\/?$/);
    return match ? `https://open.spotify.com/embed/artist/${match[1]}` : "";
  } catch {
    return "";
  }
}

export function createMusicPageViewDataFromEditor(
  draft: MusicEditorDraft,
  footer: MusicEditorFooter
): MusicPageViewData {
  const hasHeroBackground = Boolean(draft.hero.backgroundSrc);

  return {
    hero: {
      ...draft.hero,
      backgroundSrc:
        draft.hero.backgroundSrc || FALLBACK_CONTENT.heroes.music.backgroundSrc,
      mediaType: hasHeroBackground ? draft.hero.mediaType : "image",
    },
    platforms: draft.platforms.items
      .filter((item) => item.isPublished)
      .map((item) => ({
        id: item.id,
        title: item.title,
        label: item.label,
        href: item.href,
        imageSrc: item.imageSrc,
        iconKey: detectSocialPlatform(
          item.iconKey,
          item.href,
          item.title,
          item.label
        ),
      })),
    spotify: {
      heading: draft.spotify.releasesHeading,
      artistUrl: draft.spotify.artistUrl,
      embedUrl: deriveSpotifyEmbedUrl(draft.spotify.artistUrl),
    },
    soundcloud: {
      heading: draft.soundcloud.mixesHeading,
      tracks: draft.soundcloud.items
        .filter((item) => item.isPublished)
        .map((item) => ({
          id: item.id,
          title: item.title,
          embedUrl: item.embedUrl,
        })),
    },
    footer,
  };
}
