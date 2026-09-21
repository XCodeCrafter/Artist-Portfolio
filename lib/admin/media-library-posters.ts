import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { isSafeManagedMediaSource } from "@/lib/media-source";
import type { MediaAsset } from "./media";

const POSTER_READ_TIMEOUT_MS = 5_000;
const POSTER_ROW_LIMIT = 500;
const source = z.string().max(2_048);
const homeSchema = z.object({ draft: z.object({
  hero: z.object({ backgroundSrc: source, posterSrc: source, mediaType: z.enum(["image", "video"]) }),
  feature: z.object({ videoSrc: source, posterSrc: source }),
}) });
const heroSchema = z.array(z.object({ page_slug: z.string(), background_src: source, poster_src: source, media_type: z.enum(["image", "video"]) }));
const videosSchema = z.array(z.object({ id: z.string(), embed_url: source, thumbnail_src: source }));
const gallerySchema = z.object({ interlude_video_src: source, interlude_poster_src: source });

type ReadResult = { data: unknown; error: unknown };

async function readOptionalPosters(read: (signal: AbortSignal) => PromiseLike<ReadResult>): Promise<unknown> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(() => read(controller.signal)).then((result) => result.error ? null : result.data).catch(() => null),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => { controller.abort(); resolve(null); }, POSTER_READ_TIMEOUT_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function isSafePoster(value: string) {
  if (!isSafeManagedMediaSource(value)) return false;
  // A saved video URL must never become an <img> request for a large video.
  // Unrecognized/extensionless sources deliberately keep the file-type icon.
  try {
    return /\.(?:avif|gif|jpe?g|png|webp)$/i.test(new URL(value, "https://local.invalid").pathname);
  } catch { return false; }
}

/** Optional, read-only enrichment. No thumbnail generation or provider calls. */
export async function getMediaLibraryPosters(
  client: SupabaseClient,
  assets: Pick<MediaAsset, "id" | "src" | "mediaType">[],
): Promise<Record<string, string>> {
  const videos = assets.filter((asset) => asset.mediaType === "video" && typeof asset.src === "string" && asset.src.length > 0);
  if (!videos.length) return {};

  const [homeData, heroData, videoData, galleryData] = await Promise.all([
    readOptionalPosters((signal) => client.from("home_page_config").select("draft").eq("id", "main").abortSignal(signal).maybeSingle()),
    readOptionalPosters((signal) => client.from("page_heroes").select("page_slug, background_src, poster_src, media_type").order("page_slug").limit(POSTER_ROW_LIMIT).abortSignal(signal)),
    readOptionalPosters((signal) => client.from("videos").select("id, embed_url, thumbnail_src").order("id").limit(POSTER_ROW_LIMIT).abortSignal(signal)),
    readOptionalPosters((signal) => client.from("gallery_presentation").select("interlude_video_src, interlude_poster_src").eq("id", "main").abortSignal(signal).maybeSingle()),
  ]);
  const bySource = new Map<string, string>();
  const sources = new Set(videos.map((asset) => asset.src));
  function add(videoSrc: string, posterSrc: string) {
    if (sources.has(videoSrc) && !bySource.has(videoSrc) && videoSrc !== posterSrc && isSafePoster(posterSrc)) bySource.set(videoSrc, posterSrc);
  }

  // Stable precedence: current HOME, Classic heroes, Showreel, Gallery.
  // Hidden sections still provide useful saved thumbnails in the admin library.
  const home = homeSchema.safeParse(homeData);
  if (home.success) {
    if (home.data.draft.hero.mediaType === "video") add(home.data.draft.hero.backgroundSrc, home.data.draft.hero.posterSrc);
    add(home.data.draft.feature.videoSrc, home.data.draft.feature.posterSrc);
  }
  const heroes = heroSchema.safeParse(heroData);
  if (heroes.success) {
    for (const hero of heroes.data) {
      // HOME V2 is authoritative; do not resurrect a retired Classic HOME pair.
      if (hero.media_type === "video" && !(home.success && hero.page_slug === "home")) add(hero.background_src, hero.poster_src);
    }
  }
  const showreel = videosSchema.safeParse(videoData);
  if (showreel.success) for (const video of showreel.data) add(video.embed_url, video.thumbnail_src);
  const gallery = gallerySchema.safeParse(galleryData);
  if (gallery.success) add(gallery.data.interlude_video_src, gallery.data.interlude_poster_src);

  return Object.fromEntries(videos.flatMap((asset) => {
    const poster = bySource.get(asset.src);
    return poster ? [[asset.id, poster]] : [];
  }));
}
