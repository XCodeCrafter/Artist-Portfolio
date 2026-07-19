//artist-portfolio/app/sitemap.ts
import type { MetadataRoute } from "next";
import { getPortfolioContent } from "@/lib/content";
import { getPublicModules } from "@/lib/content/modules";
import { getSiteUrl } from "@/lib/site-url";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getSiteUrl();

  const now = new Date();
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

  return routes.map((path) => ({
    url: `${base}${path}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: path === "/" ? 1 : 0.7,
  }));
}
