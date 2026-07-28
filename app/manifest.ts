import type { MetadataRoute } from "next";
import { getPortfolioContent } from "@/lib/content";
import { getSeoIdentity } from "@/lib/seo";

export const dynamic = "force-dynamic";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const content = await getPortfolioContent();
  const { brandName, description } = getSeoIdentity(content);

  return {
    name: brandName,
    short_name:
      brandName.length > 30 ? `${brandName.slice(0, 29).trimEnd()}…` : brandName,
    description,
    start_url: "/",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#050505",
    icons: [
      {
        src: "/favicon.ico",
        sizes: "16x16 32x32 48x48 256x256",
        type: "image/x-icon",
      },
    ],
  };
}
