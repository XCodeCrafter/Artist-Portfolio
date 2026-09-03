import type { Metadata } from "next";
import GalleryPageView, {
  type GalleryPageViewData,
} from "@/components/gallery/GalleryPageView";
import { getPortfolioContent } from "@/lib/content";
import { createPageMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const content = await getPortfolioContent();

  return createPageMetadata(content, "gallery");
}

export default async function GalleryPage() {
  const content = await getPortfolioContent();
  const data: GalleryPageViewData = {
    hero: content.heroes.gallery,
    images: content.galleryImages,
    presentation: content.galleryPresentation,
    footer: {
      artistName: content.settings.artistName,
      contactBlurb: content.settings.contactBlurb,
      footerEffect: content.settings.footerEffect,
      location: content.settings.location,
      socialLinks: content.socialLinks,
      tagline: content.settings.tagline,
    },
  };

  return <GalleryPageView data={data} />;
}
