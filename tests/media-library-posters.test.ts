import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getMediaLibraryPosters } from "@/lib/admin/media-library-posters";

type Reply = { data: unknown; error: unknown };
const video = (id: string, src = `/media/${id}.mp4`) => ({ id, src, mediaType: "video" as const });
const hero = (page_slug: string, background_src: string, poster_src: string) => ({ page_slug, background_src, poster_src, media_type: "video" });
const home = (backgroundSrc = "/media/home.mp4", posterSrc = "/images/home.jpg") => ({ draft: {
  hero: { backgroundSrc, posterSrc, mediaType: "video" },
  feature: { videoSrc: "/media/feature.mp4", posterSrc: "/images/feature.webp" },
} });

function createClient(replies: Record<string, Reply | Promise<Reply>> = {}) {
  const signals: AbortSignal[] = [];
  const queries: Array<{ table: string; select: ReturnType<typeof vi.fn>; order: ReturnType<typeof vi.fn>; limit: ReturnType<typeof vi.fn>; eq: ReturnType<typeof vi.fn> }> = [];
  const from = vi.fn((table: string) => {
    const query = {
      table,
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockReturnThis(),
      abortSignal: vi.fn(function (this: unknown, signal: AbortSignal) {
        signals.push(signal);
        return this;
      }),
      then: (resolve: (value: Reply) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(replies[table] ?? { data: null, error: null }).then(resolve, reject),
    };
    queries.push(query);
    return query;
  });
  return { client: { from } as unknown as SupabaseClient, from, queries, signals };
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://portfolio.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT", "https://ik.imagekit.io/portfolio");
  vi.stubEnv("NEXT_PUBLIC_MEDIA_ORIGIN", "https://media.portfolio.test");
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("Media library saved video posters", () => {
  it("does not query anything when there are no videos to enrich", async () => {
    const fake = createClient();
    expect(await getMediaLibraryPosters(fake.client, [])).toEqual({});
    expect(await getMediaLibraryPosters(fake.client, [{ id: "photo", src: "/images/photo.jpg", mediaType: "image" }])).toEqual({});
    expect(fake.from).not.toHaveBeenCalled();
  });

  it("uses exact saved associations from HOME, heroes, Showreel and Gallery", async () => {
    const fake = createClient({
      home_page_config: { data: home(), error: null },
      page_heroes: { data: [hero("music", "/media/music.mp4", "/images/music.png")], error: null },
      videos: { data: [{ id: "scene", embed_url: "/media/scene.mp4", thumbnail_src: "/images/scene.jpg" }], error: null },
      gallery_presentation: { data: { interlude_video_src: "/media/gallery.mp4", interlude_poster_src: "/images/gallery.avif" }, error: null },
    });
    expect(await getMediaLibraryPosters(fake.client, [video("home"), video("feature"), video("music"), video("scene"), video("gallery"), video("unknown")])).toEqual({
      home: "/images/home.jpg", feature: "/images/feature.webp", music: "/images/music.png", scene: "/images/scene.jpg", gallery: "/images/gallery.avif",
    });
    expect(fake.from.mock.calls.map(([table]) => table)).toEqual(["home_page_config", "page_heroes", "videos", "gallery_presentation"]);
    expect(fake.queries.find((query) => query.table === "page_heroes")?.order).toHaveBeenCalledWith("page_slug");
    expect(fake.queries.find((query) => query.table === "videos")?.order).toHaveBeenCalledWith("id");
    expect(fake.queries.find((query) => query.table === "videos")?.limit).toHaveBeenCalledWith(500);
    expect(fake.queries.find((query) => query.table === "home_page_config")?.eq).toHaveBeenCalledWith("id", "main");
    expect(fake.signals).toHaveLength(4);
  });

  it("prefers current HOME, then ordered heroes, then Showreel over Gallery", async () => {
    const fake = createClient({
      home_page_config: { data: home("/media/shared.mp4", "/images/current.jpg"), error: null },
      page_heroes: { data: [hero("bio", "/media/shared.mp4", "/images/bio.jpg"), hero("home", "/media/shared.mp4", "/images/old.jpg"), hero("music", "/media/second.mp4", "/images/second.jpg")], error: null },
      videos: { data: [
        { id: "a", embed_url: "/media/shared.mp4", thumbnail_src: "/images/showreel.jpg" },
        { id: "b", embed_url: "/media/second.mp4", thumbnail_src: "/images/showreel.jpg" },
        { id: "c", embed_url: "/media/third.mp4", thumbnail_src: "/images/third.jpg" },
        { id: "d", embed_url: "/media/third.mp4", thumbnail_src: "/images/duplicate.jpg" },
      ], error: null },
      gallery_presentation: { data: { interlude_video_src: "/media/third.mp4", interlude_poster_src: "/images/gallery.jpg" }, error: null },
    });
    expect(await getMediaLibraryPosters(fake.client, [video("first", "/media/shared.mp4"), video("duplicate", "/media/shared.mp4"), video("second"), video("third")])).toEqual({
      first: "/images/current.jpg", duplicate: "/images/current.jpg", second: "/images/second.jpg", third: "/images/third.jpg",
    });
  });

  it("does not resurrect retired Classic HOME pairs when current HOME exists", async () => {
    const fake = createClient({
      home_page_config: { data: home(), error: null },
      page_heroes: { data: [hero("home", "/media/retired.mp4", "/images/retired.jpg")], error: null },
    });
    expect(await getMediaLibraryPosters(fake.client, [video("retired")])).toEqual({});
  });

  it("keeps Classic HOME as a fallback on installations without HOME V2", async () => {
    const fake = createClient({
      home_page_config: { data: null, error: { code: "42P01" } },
      page_heroes: { data: [hero("home", "/media/home.mp4", "/images/classic.jpg")], error: null },
    });
    expect(await getMediaLibraryPosters(fake.client, [video("home")])).toEqual({ home: "/images/classic.jpg" });
  });

  it("does not treat HOME image heroes as a video poster association", async () => {
    const saved = home(); saved.draft.hero.mediaType = "image";
    const fake = createClient({ home_page_config: { data: saved, error: null } });
    expect(await getMediaLibraryPosters(fake.client, [video("home")])).toEqual({});
  });

  it("does not guess from partial sources, filenames, other video URLs or image assets", async () => {
    const fake = createClient({ videos: { data: [
      { id: "scene", embed_url: "/other/scene.mp4", thumbnail_src: "/images/scene.jpg" },
      { id: "query", embed_url: "/media/query.mp4?changed=1", thumbnail_src: "/images/query.jpg" },
      { id: "photo", embed_url: "/media/photo.mp4", thumbnail_src: "/images/photo.jpg" },
    ], error: null } });
    expect(await getMediaLibraryPosters(fake.client, [video("scene"), video("query"), { ...video("photo"), mediaType: "image" }])).toEqual({});
  });

  it.each([
    "https://tracker.example/pixel.jpg", "//tracker.example/pixel.jpg", "javascript:alert(1)", "data:image/png;base64,abc",
    "https://portfolio.supabase.co.evil.test/storage/v1/object/public/poster.jpg", "https://ik.imagekit.io/other/media/poster.jpg",
    "https://user:password@portfolio.supabase.co/storage/v1/object/public/poster.jpg", "/media/movie.mp4", "/images/unknown", "/images/unsafe\\poster.jpg",
  ])("rejects unsafe or non-image poster %s", async (thumbnail_src) => {
    const fake = createClient({ videos: { data: [{ id: "video", embed_url: "/media/video.mp4", thumbnail_src }], error: null } });
    expect(await getMediaLibraryPosters(fake.client, [video("video")])).toEqual({});
  });

  it.each([
    "https://portfolio.supabase.co/storage/v1/object/public/portfolio-media/poster.jpg",
    "https://ik.imagekit.io/portfolio/media/poster.webp",
    "https://media.portfolio.test/media/poster.png",
  ])("accepts an image on the configured media provider: %s", async (thumbnail_src) => {
    const fake = createClient({ videos: { data: [{ id: "video", embed_url: "/media/video.mp4", thumbnail_src }], error: null } });
    expect(await getMediaLibraryPosters(fake.client, [video("video")])).toEqual({ video: thumbnail_src });
  });

  it("isolates malformed and failed sources without dropping a valid source", async () => {
    const fake = createClient({
      home_page_config: { data: { draft: { hero: "broken", feature: null } }, error: null },
      page_heroes: { data: [hero("video", "/media/video.mp4", "/images/error.jpg")], error: { code: "42501" } },
      videos: { data: [{ id: "video", embed_url: "/media/video.mp4", thumbnail_src: 42 }], error: null },
      gallery_presentation: { data: { interlude_video_src: "/media/video.mp4", interlude_poster_src: "/images/good.jpg" }, error: null },
    });
    expect(await getMediaLibraryPosters(fake.client, [video("video")])).toEqual({ video: "/images/good.jpg" });
  });

  it("catches rejected database reads and malformed response envelopes", async () => {
    const fake = createClient({
      videos: Promise.reject(new Error("private backend detail")),
      home_page_config: Promise.resolve(null as unknown as Reply),
    });
    expect(await getMediaLibraryPosters(fake.client, [video("video")])).toEqual({});
  });

  it("catches synchronous database client failures", async () => {
    const fake = createClient();
    fake.from.mockImplementation(() => { throw new Error("private backend detail"); });
    expect(await getMediaLibraryPosters(fake.client, [video("video")])).toEqual({});
  });

  it("bounds all optional reads with a deadline and aborts hanging requests", async () => {
    vi.useFakeTimers();
    const hanging = new Promise<Reply>(() => {});
    const fake = createClient({ home_page_config: hanging, page_heroes: hanging, videos: hanging, gallery_presentation: hanging });
    const result = getMediaLibraryPosters(fake.client, [video("video")]);
    await vi.advanceTimersByTimeAsync(5_000);
    await expect(result).resolves.toEqual({});
    expect(fake.signals).toHaveLength(4);
    expect(fake.signals.every((signal) => signal.aborted)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("safely returns asset IDs that coincide with object prototype names", async () => {
    const fake = createClient({ videos: { data: [{ id: "video", embed_url: "/media/video.mp4", thumbnail_src: "/images/video.jpg" }], error: null } });
    const posters = await getMediaLibraryPosters(fake.client, [video("__proto__", "/media/video.mp4"), video("constructor", "/media/video.mp4")]);
    expect(Object.hasOwn(posters, "__proto__")).toBe(true);
    expect(posters.constructor).toBe("/images/video.jpg");
    expect(Object.getPrototypeOf(posters)).toBe(Object.prototype);
  });
});
