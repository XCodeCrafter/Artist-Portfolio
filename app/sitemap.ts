//artist-portfolio/app/sitemap.ts
import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base =
    process.env.SITE_URL?.startsWith("http")
      ? process.env.SITE_URL
      : "https://example.com";

  const now = new Date();

  const routes = ["/", "/bio", "/music", "/video", "/booking"];

  return routes.map((path) => ({
    url: `${base}${path}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: path === "/" ? 1 : 0.7,
  }));
}