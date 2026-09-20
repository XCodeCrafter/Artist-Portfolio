import { z } from "zod";
import { FALLBACK_CONTENT } from "@/lib/content/fallback";
import type { AboutHomeContent, HeroContent, PortfolioContent } from "@/lib/content/types";
import { isSafeLocalMediaPath, isSafeManagedMediaSource } from "@/lib/media-source";

export const HOME_CONTENT_SECTIONS = ["hero", "about", "cnc", "feature", "stories"] as const;
export const HOME_EDITOR_SECTIONS = ["layout", ...HOME_CONTENT_SECTIONS] as const;
export type HomeContentSection = (typeof HOME_CONTENT_SECTIONS)[number];
export type HomeEditorSection = (typeof HOME_EDITOR_SECTIONS)[number];
export const HOME_SECTION_LABELS: Record<HomeEditorSection, string> = {
  layout: "Sections & order", hero: "Hero", about: "About", cnc: "Code in motion",
  feature: "The interlude", stories: "Stories",
};
export type HomeEditorDraft = {
  layout: Array<{ id: HomeContentSection; enabled: boolean }>;
  hero: HeroContent;
  about: AboutHomeContent;
  cnc: { eyebrow: string; title: string; body: string };
  feature: {
    title: string; body: string; ctaLabel: string; ctaHref: string;
    videoSrc: string; posterSrc: string; label: string; meta: string; eyebrow: string;
  };
  stories: {
    title: string; body: string; ctaLabel: string; ctaHref: string;
    label: string; scrollLabel: string;
    images: Array<{ src: string; title: string; body: string; alt: string }>;
  };
};
export type HomeEditorVersions = { updatedAt: string };
export type HomeEditorSnapshot = { draft: HomeEditorDraft; versions: HomeEditorVersions };
export type HomeSaveState = {
  status: "idle" | "saved" | "invalid" | "conflict" | "security-error" | "missing-service" | "migration-required" | "error";
  message: string;
  eventId: string;
  section?: HomeEditorSection;
  fieldErrors?: Record<string, string[]>;
  canonicalSection?: unknown;
  versions?: unknown;
  savedAt?: string;
};
export const INITIAL_HOME_SAVE_STATE: HomeSaveState = { status: "idle", message: "", eventId: "" };

const text = (max: number) => z.string().trim().max(max);
const timestamp = z.string().max(64).refine(
  (value) => /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value)),
  "Invalid saved version. Reload this editor."
);
const versionsSchema = z.object({ updatedAt: timestamp }).strict();
function isHttpsUrl(value: string) {
  if (/[\\\u0000-\u001f\u007f]/.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && (!url.port || url.port === "443");
  } catch { return false; }
}
export function isSafeHomeHref(value: string) {
  return !value || /^#[A-Za-z][A-Za-z0-9_-]*$/.test(value) || isSafeLocalMediaPath(value) || isHttpsUrl(value);
}
const href = text(2_048).refine(isSafeHomeHref, "Use a local path, an #anchor, or a safe https:// URL.");
const media = text(2_048).refine(
  (value) => !value || isSafeManagedMediaSource(value),
  "Choose a local file or one uploaded to this site's Media Library."
);
const layoutSchema = z.array(z.object({ id: z.enum(HOME_CONTENT_SECTIONS), enabled: z.boolean() }).strict())
  .length(HOME_CONTENT_SECTIONS.length)
  .refine((rows) => new Set(rows.map((row) => row.id)).size === HOME_CONTENT_SECTIONS.length, "Include every section exactly once.")
  .refine((rows) => rows.some((row) => row.enabled), "Keep at least one Home section visible.");
function requireCtaDestination(value: { ctaLabel: string; ctaHref: string }, context: z.RefinementCtx) {
  // HOME has historically kept a scroll target even when its CTA label is hidden.
  if (value.ctaLabel && !value.ctaHref) context.addIssue({ code: "custom", path: ["ctaHref"], message: "Add a destination for this button, or clear its label." });
}
const schemas = {
  layout: layoutSchema,
  hero: z.object({
    title: text(220).min(1), subtitle: text(500), ctaLabel: text(220), ctaHref: href,
    backgroundSrc: media.refine(Boolean, "Choose a hero image or video."), posterSrc: media,
    mediaType: z.enum(["image", "video"]),
  }).strict().superRefine(requireCtaDestination),
  about: z.object({
    heading: text(500), body: text(10_000), ctaLabel: text(220), ctaHref: href,
    imageSrc: media, imageAlt: text(1_000),
  }).strict().superRefine(requireCtaDestination),
  cnc: z.object({ eyebrow: text(500), title: text(500), body: text(10_000) }).strict(),
  feature: z.object({
    title: text(500), body: text(10_000), ctaLabel: text(220), ctaHref: href,
    videoSrc: media, posterSrc: media, label: text(500), meta: text(500), eyebrow: text(500),
  }).strict().superRefine(requireCtaDestination),
  stories: z.object({
    title: text(500), body: text(10_000), ctaLabel: text(220), ctaHref: href,
    label: text(500), scrollLabel: text(1_000),
    images: z.array(z.object({ src: media, title: text(500), body: text(10_000), alt: text(1_000) }).strict()).length(4),
  }).strict().superRefine(requireCtaDestination),
};

// Persisted legacy content must remain visible and repairable, including old
// media URLs. Save validation is stricter; preview sanitization is separate.
const legacyText = z.string().max(50_000);
const legacyDraftSchema = z.object({
  layout: layoutSchema,
  hero: z.object({ title: legacyText, subtitle: legacyText, ctaLabel: legacyText, ctaHref: legacyText, backgroundSrc: legacyText, posterSrc: legacyText, mediaType: z.enum(["image", "video"]) }).strict(),
  about: z.object({ heading: legacyText, body: legacyText, ctaLabel: legacyText, ctaHref: legacyText, imageSrc: legacyText, imageAlt: legacyText }).strict(),
  cnc: z.object({ eyebrow: legacyText, title: legacyText, body: legacyText }).strict(),
  feature: z.object({ title: legacyText, body: legacyText, ctaLabel: legacyText, ctaHref: legacyText, videoSrc: legacyText, posterSrc: legacyText, label: legacyText, meta: legacyText, eyebrow: legacyText }).strict(),
  stories: z.object({ title: legacyText, body: legacyText, ctaLabel: legacyText, ctaHref: legacyText, label: legacyText, scrollLabel: legacyText, images: z.array(z.object({ src: legacyText, title: legacyText, body: legacyText, alt: legacyText }).strict()).length(4) }).strict(),
}).strict();

function issueMap(error: z.ZodError, prefix = "") {
  const errors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = `${prefix}${issue.path.join(".") || "form"}`;
    errors[key] = [...(errors[key] || []), issue.message];
  }
  return errors;
}
export function parseHomeSectionSubmission(section: unknown, payload: unknown, versions: unknown):
  | { success: true; data: { section: HomeEditorSection; payload: unknown; versions: HomeEditorVersions } }
  | { success: false; fieldErrors: Record<string, string[]> } {
  const selected = z.enum(HOME_EDITOR_SECTIONS).safeParse(section);
  if (!selected.success) return { success: false, fieldErrors: { section: ["Choose a valid Home section."] } };
  const parsed = schemas[selected.data].safeParse(payload);
  const version = versionsSchema.safeParse(versions);
  if (!parsed.success || !version.success) return {
    success: false,
    fieldErrors: { ...(!parsed.success ? issueMap(parsed.error) : {}), ...(!version.success ? issueMap(version.error, "versions.") : {}) },
  };
  return { success: true, data: { section: selected.data, payload: parsed.data, versions: version.data } };
}
export function parseHomeEditorDraft(value: unknown): HomeEditorDraft | null {
  const parsed = legacyDraftSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
export function parseHomeEditorSnapshot(value: unknown): HomeEditorSnapshot | null {
  const parsed = z.object({ draft: legacyDraftSchema, versions: versionsSchema }).strict().safeParse(value);
  return parsed.success ? parsed.data : null;
}
export function createHomeDraftFromContent(content: PortfolioContent): HomeEditorDraft {
  const presentation = content.homePresentation;
  const gallery = content.galleryPresentation;
  const video = content.heroes.video;
  const baseImages = content.galleryImages.filter((item) => item.isFreelanceStory)
    .sort((first, second) => first.freelanceStoryOrder - second.freelanceStoryOrder || first.title.localeCompare(second.title)).slice(0, 4);
  return {
    layout: HOME_CONTENT_SECTIONS.map((id) => ({ id, enabled: true })),
    hero: { ...content.heroes.home }, about: { ...content.aboutHome },
    cnc: {
      eyebrow: "ENGINEERING DETAIL / 01", title: "CODE, IN\nMOTION.",
      body: "The preview keeps HOME concise. The full viewer is built for long programs, including the main sequence, M30 boundary and R/Q-driven labels or subprograms below it.",
    },
    feature: {
      title: presentation.featureTitle, body: presentation.featureBody,
      ctaLabel: presentation.featureCtaLabel || "WATCH SHOWREEL", ctaHref: presentation.featureCtaHref || "/video",
      videoSrc: presentation.featureVideoSrc || gallery.interludeVideoSrc || (video.mediaType === "video" ? video.backgroundSrc : "/media/hero-loop.mp4"),
      posterSrc: presentation.featurePosterSrc || gallery.interludePosterSrc || video.posterSrc || "/images/video-hero.jpg",
      label: gallery.interludeLabel, meta: gallery.interludeMeta, eyebrow: gallery.interludeEyebrow,
    },
    stories: {
      title: presentation.storyTitle, body: presentation.storyBody,
      ctaLabel: presentation.storyCtaLabel || "VIEW GALLERY", ctaHref: presentation.storyCtaHref || "/gallery",
      label: gallery.storyLabel, scrollLabel: gallery.storyScrollLabel,
      images: [1, 2, 3, 4].map((position, index) => {
        const base = baseImages[index];
        return {
          src: presentation[`storyImage${position}Src` as keyof typeof presentation] || base?.src || "",
          title: presentation[`storyImage${position}Title` as keyof typeof presentation] || presentation.storyTitle || base?.title || `Artist story ${position}`,
          body: presentation[`storyImage${position}Body` as keyof typeof presentation] || presentation.storyBody || base?.caption || "",
          alt: base?.alt || `Artist story frame ${position}`,
        };
      }),
    },
  };
}
export function createFallbackHomeEditorSnapshot(): HomeEditorSnapshot {
  return { draft: createHomeDraftFromContent(FALLBACK_CONTENT), versions: { updatedAt: new Date(0).toISOString() } };
}
export function getHomeSectionPayload(draft: HomeEditorDraft, section: HomeEditorSection) { return draft[section]; }
export function isHomeSectionDirty(baseline: HomeEditorDraft, draft: HomeEditorDraft, section: HomeEditorSection) {
  return JSON.stringify(baseline[section]) !== JSON.stringify(draft[section]);
}
export function getDirtyHomeSections(baseline: HomeEditorDraft, draft: HomeEditorDraft) {
  return HOME_EDITOR_SECTIONS.filter((section) => isHomeSectionDirty(baseline, draft, section));
}
export const HOME_PREVIEW_UPDATE_MESSAGE = "home-preview-update" as const;
export type HomePreviewUpdateMessage = { type: typeof HOME_PREVIEW_UPDATE_MESSAGE; draft: HomeEditorDraft; selectedSection: HomeEditorSection; focusRequestId: number };
export function parseHomePreviewUpdateMessage(value: unknown): HomePreviewUpdateMessage | null {
  const parsed = z.object({ type: z.literal(HOME_PREVIEW_UPDATE_MESSAGE), draft: legacyDraftSchema, selectedSection: z.enum(HOME_EDITOR_SECTIONS), focusRequestId: z.number().int().nonnegative() }).strict().safeParse(value);
  if (!parsed.success) return null;
  const draft = parsed.data.draft;
  for (const section of [draft.hero, draft.about, draft.feature, draft.stories]) {
    if (!isSafeHomeHref(section.ctaHref)) section.ctaHref = "";
  }
  const safeMedia = (src: string) => !src || isSafeManagedMediaSource(src) || isHttpsUrl(src) ? src : "";
  draft.hero.backgroundSrc = safeMedia(draft.hero.backgroundSrc);
  draft.hero.posterSrc = safeMedia(draft.hero.posterSrc);
  draft.about.imageSrc = safeMedia(draft.about.imageSrc);
  draft.feature.videoSrc = safeMedia(draft.feature.videoSrc);
  draft.feature.posterSrc = safeMedia(draft.feature.posterSrc);
  draft.stories.images.forEach((item) => { item.src = safeMedia(item.src); });
  return parsed.data;
}
