//artist-portfolio/app/sitemap.ts
import type { MetadataRoute } from "next";
import { getPortfolioContent } from "@/lib/content";
import { getPublicModules } from "@/lib/content/modules";
import { getSiteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

function isLoopbackHostname(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");

  return (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized === "127.0.0.1" ||
    normalized === "::1"
  );
}

function absoluteImageUrls(base: string, sources: string[]) {
  const baseUrl = new URL(base);

  return [
    ...new Set(
      sources.flatMap((source) => {
        const value = source.trim();
        if (!value) return [];

        try {
          const url = new URL(value, `${base}/`);
          const localHttpImage =
            url.protocol === "http:" &&
            isLoopbackHostname(baseUrl.hostname) &&
            isLoopbackHostname(url.hostname);

          return url.protocol === "https:" || localHttpImage ? [url.href] : [];
        } catch {
          return [];
        }
      })
    ),
  ];
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getSiteUrl();
  const content = await getPortfolioContent();
  const routes = [
    ...new Set([
      ...getPublicModules(content.settings.portfolioType).map(
        (module) => module.href
      ),
      "/privacy",
      "/terms",
    ]),
  ];

  const heroImage = (page: keyof typeof content.heroes) => {
    const hero = content.heroes[page];
    return hero.mediaType === "image" ? hero.backgroundSrc : hero.posterSrc;
  };
  const homeStoryFallbacks = content.galleryImages
    .filter((image) => image.isFreelanceStory)
    .sort(
      (first, second) =>
        first.freelanceStoryOrder - second.freelanceStoryOrder ||
        first.title.localeCompare(second.title)
    )
    .slice(0, 4);
  const homeStoryImages = [
    content.homePresentation.storyImage1Src,
    content.homePresentation.storyImage2Src,
    content.homePresentation.storyImage3Src,
    content.homePresentation.storyImage4Src,
  ].map((source, index) => source || homeStoryFallbacks[index]?.src || "");
  const homeInterludePoster =
    content.homePresentation.featurePosterSrc ||
    content.galleryPresentation.interludePosterSrc ||
    content.heroes.video.posterSrc ||
    "/images/video-hero.jpg";
  const imagesByRoute: Partial<Record<string, string[]>> = {
    "/": [
      heroImage("home"),
      content.aboutHome.imageSrc,
      homeInterludePoster,
      ...homeStoryImages,
      ...(content.settings.portfolioType === "musician"
        ? content.musicPlatforms.map((platform) => platform.imageSrc)
        : []),
    ],
    "/bio": [
      heroImage("bio"),
      ...content.bio.galleryImages.map((image) => image.src),
    ],
    "/gallery": [
      heroImage("gallery"),
      content.galleryPresentation.interludePosterSrc,
      ...content.galleryImages.map((image) => image.src),
    ],
    "/music": [
      heroImage("music"),
      ...content.musicPlatforms.map((platform) => platform.imageSrc),
    ],
    "/video": [
      heroImage("video"),
      ...content.videos.map((video) => video.thumbnailSrc),
    ],
    "/booking": [heroImage("booking")],
  };

  return routes.map((path) => {
    const images = absoluteImageUrls(base, imagesByRoute[path] ?? []);

    return {
      url: `${base}${path}`,
      ...(images.length ? { images } : {}),
    };
  });
}
