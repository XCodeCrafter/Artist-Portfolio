import type { Metadata } from "next";
import ShowreelPageView from "@/components/video/ShowreelPageView";
import { getPortfolioContent } from "@/lib/content";
import { createPageMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const content = await getPortfolioContent();

  return createPageMetadata(content, "video");
}

export default async function VideoPage() {
  const content = await getPortfolioContent();
  const data = {
    hero: content.heroes.video,
    presentation: content.videoPresentation,
    videos: content.videos,
    footer: {
      artistName: content.settings.artistName,
      contactBlurb: content.settings.contactBlurb,
      footerEffect: content.settings.footerEffect,
      location: content.settings.location,
      socialLinks: content.socialLinks,
      tagline: content.settings.tagline,
    },
  };

  return <ShowreelPageView data={data} />;
}
