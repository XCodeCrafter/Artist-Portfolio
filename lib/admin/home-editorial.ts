import { z } from "zod";
import { heroFramingSchema } from "@/lib/content/hero-framing";
import { isSafeLocalMediaPath, isSafeManagedMediaSource } from "@/lib/media-source";

const text = (max: number) => z.string().trim().max(max);
export function isSafeEditorialHttpsUrl(value: string) {
  if (/[\\\s\u0000-\u001f\u007f]/.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && (!url.port || url.port === "443");
  } catch { return false; }
}
export function isSafeEditorialHref(value: string) {
  return !value || /^#[A-Za-z][A-Za-z0-9_-]*$/.test(value) || isSafeLocalMediaPath(value) || isSafeEditorialHttpsUrl(value);
}
const href = text(2048).refine(isSafeEditorialHref, "Use a local path or a safe https:// URL.");
export const homeEditorialImageSchema = z.object({
  src: text(2048).refine(value => !value || isSafeManagedMediaSource(value), "Choose a local image or an image from this site's Media Library."),
  alt: text(500),
  framing: heroFramingSchema.nullable(),
}).strict().refine(value => Boolean(value.src) || value.framing === null, "Choose an image before setting its crop.");

export const HOME_PLAYBACK_KINDS = ["none", "audio", "spotify", "youtube"] as const;
export type HomePlayback = { kind: (typeof HOME_PLAYBACK_KINDS)[number]; url: string };
/** Build only known provider embeds. Never accept arbitrary iframe HTML or a supplied embed origin. */
export function getHomePlaybackEmbedUrl(playback: HomePlayback): string | null {
  if (!isSafeEditorialHttpsUrl(playback.url)) return null;
  const url = new URL(playback.url);
  if (playback.kind === "spotify" && url.hostname === "open.spotify.com") {
    const match = url.pathname.match(/^\/(?:intl-[a-z]{2}\/)?(?:embed\/)?(track|album|playlist)\/([A-Za-z0-9]{22})\/?$/);
    return match ? `https://open.spotify.com/embed/${match[1]}/${match[2]}` : null;
  }
  if (playback.kind === "youtube") {
    const id = url.hostname === "youtu.be" ? url.pathname.slice(1)
      : ["youtube.com", "www.youtube.com", "m.youtube.com", "www.youtube-nocookie.com"].includes(url.hostname)
        ? url.pathname === "/watch" ? url.searchParams.get("v") : url.pathname.match(/^\/(?:embed|shorts)\/([A-Za-z0-9_-]{11})\/?$/)?.[1]
        : null;
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  }
  return null;
}
export function isSafeHomePlayback(playback: HomePlayback) {
  if (playback.kind === "none") return playback.url === "";
  if (playback.kind === "audio") {
    if (!(isSafeLocalMediaPath(playback.url) || isSafeEditorialHttpsUrl(playback.url))) return false;
    try { return /\.(mp3|m4a|ogg|wav)$/i.test(new URL(playback.url, "https://portfolio.invalid").pathname); }
    catch { return false; }
  }
  return Boolean(getHomePlaybackEmbedUrl(playback));
}
const playbackSchema = z.object({ kind: z.enum(HOME_PLAYBACK_KINDS), url: text(2048) }).strict()
  .refine(isSafeHomePlayback, "Use a direct .mp3, .m4a, .ogg or .wav URL, or a supported Spotify / YouTube link matching the selected source.")
  .transform(value => ({ ...value, url: value.kind === "spotify" || value.kind === "youtube" ? new URL(value.url).href : value.url }));

export const homeReleaseSchema = z.object({
  eyebrow: text(220), title: text(220), subtitle: text(500), body: text(2000),
  background: homeEditorialImageSchema, cover: homeEditorialImageSchema,
  releaseTitle: text(220), artist: text(220), note: text(500), playback: playbackSchema,
  primaryLabel: text(100), primaryHref: href, secondaryLabel: text(100), secondaryHref: href,
}).strict().superRefine((value, context) => {
  if (value.primaryLabel && !value.primaryHref) context.addIssue({ code: "custom", path: ["primaryHref"], message: "Add a destination or clear the button label." });
  if (value.secondaryLabel && !value.secondaryHref) context.addIssue({ code: "custom", path: ["secondaryHref"], message: "Add a destination or clear the button label." });
});
export const HOME_WORK_IDS = ["music", "photography", "film", "live"] as const;
export const homeWorkSchema = z.object({
  eyebrow: text(220), title: text(220), body: text(2000), note: text(500), background: homeEditorialImageSchema,
  cards: z.array(z.object({
    id: z.enum(HOME_WORK_IDS), title: text(220), body: text(1000), href,
    image: homeEditorialImageSchema, tone: z.enum(["mono", "red"]),
  }).strict()).length(4).refine(items => new Set(items.map(item => item.id)).size === 4, "Include each work card exactly once."),
}).strict();
export const HOME_PRESS_KINDS = ["review", "interview", "radio", "feature"] as const;
export const MAX_HOME_PRESS_ITEMS = 20;
const pressId = z.string().uuid();
const pressDate = text(10).refine(value => {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000-")) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Use a real date in YYYY-MM-DD format.");
export const homePressItemSchema = z.object({
  id: pressId, kind: z.enum(HOME_PRESS_KINDS), title: text(220).min(1), quote: text(1500),
  publication: text(220).min(1), date: pressDate, href,
  image: homeEditorialImageSchema, visible: z.boolean(),
}).strict().refine(value => Boolean(value.quote || value.image.src || value.href), "Add a quotation, clipping or source link.");
export const homePressSchema = z.object({
  eyebrow: text(220), title: text(220), body: text(2000), buttonLabel: text(100), background: homeEditorialImageSchema,
  featuredId: z.union([z.literal(""), pressId]), items: z.array(homePressItemSchema).max(MAX_HOME_PRESS_ITEMS),
}).strict().superRefine((value, context) => {
  if (new Set(value.items.map(item => item.id)).size !== value.items.length) context.addIssue({ code: "custom", path: ["items"], message: "Each press item needs a unique ID." });
  if (value.featuredId && !value.items.some(item => item.id === value.featuredId && item.visible)) context.addIssue({ code: "custom", path: ["featuredId"], message: "Choose a visible press item or clear the featured selection." });
});

export type HomeEditorialImage = z.infer<typeof homeEditorialImageSchema>;
export type HomeRelease = z.infer<typeof homeReleaseSchema>;
export type HomeWork = z.infer<typeof homeWorkSchema>;
export type HomePressItem = z.infer<typeof homePressItemSchema>;
export type HomePress = z.infer<typeof homePressSchema>;

// The editor preview must keep following incomplete typing. Publication stays
// strict; these bounded shape-only schemas are sanitized before rendering.
const previewImage = z.object({ ...homeEditorialImageSchema.shape, src: text(2048) });
const previewPressItem = z.object({ ...homePressItemSchema.shape, title: text(220), publication: text(220),
  date: text(10), href: text(2048), image: previewImage }).strict();
export const homeEditorialPreviewSchemas = {
  release: z.object({ ...homeReleaseSchema.shape, background: previewImage, cover: previewImage,
    primaryHref: text(2048), secondaryHref: text(2048),
    playback: z.object({ kind: z.enum(HOME_PLAYBACK_KINDS), url: text(2048) }).strict(),
  }).strict(),
  work: z.object({ ...homeWorkSchema.shape, background: previewImage,
    cards: z.array(z.object({ id: z.enum(HOME_WORK_IDS), title: text(220), body: text(1000),
      href: text(2048), image: previewImage, tone: z.enum(["mono", "red"]) }).strict()).length(4),
  }).strict(),
  press: z.object({ ...homePressSchema.shape, background: previewImage, items: z.array(previewPressItem).max(MAX_HOME_PRESS_ITEMS) }).strict(),
};
export function sanitizeHomeEditorialPreview(draft: { release: HomeRelease; work: HomeWork; press: HomePress }) {
  const cleanImage = (image: HomeEditorialImage) => {
    if (image.src && !isSafeManagedMediaSource(image.src)) { image.src = ""; image.framing = null; }
  };
  for (const image of [draft.release.background, draft.release.cover, draft.work.background, draft.press.background,
    ...draft.work.cards.map(card => card.image), ...draft.press.items.map(item => item.image)]) cleanImage(image);
  for (const key of ["primaryHref", "secondaryHref"] as const) if (!isSafeEditorialHref(draft.release[key])) draft.release[key] = "";
  for (const item of [...draft.work.cards, ...draft.press.items]) if (!isSafeEditorialHref(item.href)) item.href = "";
  if (!isSafeHomePlayback(draft.release.playback)) draft.release.playback = { kind: "none", url: "" };
  for (const item of draft.press.items) if (!pressDate.safeParse(item.date).success) item.date = "";
  return draft;
}

const photo = (name: string, alt: string): HomeEditorialImage => ({ src: `/images/home-editorial/${name}.webp`, alt, framing: null });
const portraitPhoto = (name: string, alt: string): HomeEditorialImage => ({ ...photo(name, alt), framing: {
  desktop: { fit: "cover", x: 75, y: 50, zoom: 1 }, mobile: { fit: "cover", x: 75, y: 50, zoom: 1 },
} });
export function createHomeEditorialDefaults(): { release: HomeRelease; work: HomeWork; press: HomePress } {
  return {
    release: {
      eyebrow: "LATEST RELEASE", title: "A SOUND OF ITS OWN.", subtitle: "", body: "",
      background: photo("press", "Illustrative microphone backstage"), cover: photo("guitar", "Illustrative guitarist on stage"),
      releaseTitle: "", artist: "", note: "Some songs sound better after dark.", playback: { kind: "none", url: "" },
      primaryLabel: "", primaryHref: "", secondaryLabel: "ALL MUSIC", secondaryHref: "/music",
    },
    work: {
      eyebrow: "SELECTED WORK", title: "STORIES IN\nDIFFERENT\nFORMS.", body: "Music, images, film, live moments — different languages, same truth.",
      note: "SAME HUMAN.\nDIFFERENT STORIES.", background: photo("studio", "Illustrative studio atmosphere"),
      cards: [
        { id: "music", title: "MUSIC", body: "Songs, sounds and everything in between.", href: "/music", image: portraitPhoto("guitar", "Illustrative live guitar performance"), tone: "mono" },
        { id: "photography", title: "PHOTOGRAPHY", body: "People, places, and the in-between.", href: "/gallery", image: portraitPhoto("studio", "Illustrative studio portrait"), tone: "mono" },
        { id: "film", title: "FILM & ACTING", body: "Other characters, same curiosity.", href: "/video", image: portraitPhoto("guitar", "Illustrative performer silhouette"), tone: "red" },
        { id: "live", title: "LIVE", body: "A shared moment. Always different.", href: "/booking#events", image: photo("live", "Illustrative performer facing an audience"), tone: "mono" },
      ],
    },
    press: {
      eyebrow: "PRESS & REVIEWS", title: "WORDS FROM\nELSEWHERE.", body: "Conversations, radio sessions and stories behind the music.",
      buttonLabel: "EXPLORE ALL PRESS", background: photo("press", "Illustrative microphone backstage"), featuredId: "", items: [],
    },
  };
}
