//artist-portfolio/app/robots.ts
import type { MetadataRoute } from "next";
import {
  getSiteUrl,
  isNonProductionVercelDeployment,
} from "@/lib/site-url";

export default function robots(): MetadataRoute.Robots {
  if (isNonProductionVercelDeployment()) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }

  const base = getSiteUrl();
  const privatePaths = ["/api"];

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: privatePaths,
      },
      {
        userAgent: [
          "OAI-SearchBot",
          "Claude-SearchBot",
          "Claude-User",
          "PerplexityBot",
          "Applebot",
          "Google-Extended",
        ],
        allow: "/",
        disallow: privatePaths,
      },
      {
        userAgent: ["GPTBot", "ClaudeBot", "Applebot-Extended"],
        disallow: "/",
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
