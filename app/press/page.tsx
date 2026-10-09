import type { Metadata } from "next";
import PressPageView from "@/components/press/PressPageView";
import { getPortfolioContent } from "@/lib/content";
import { getPublishedHomeDraft } from "@/lib/content/home.server";
import { createPageMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const content = await getPortfolioContent();
  return createPageMetadata(content, "press");
}

export default async function PressPage() {
  const content = await getPortfolioContent();
  const { press } = await getPublishedHomeDraft(content);

  return <PressPageView data={{
    press,
    footer: {
      artistName: content.settings.artistName,
      contactBlurb: content.settings.contactBlurb,
      footerEffect: content.settings.footerEffect,
      location: content.settings.location,
      socialLinks: content.socialLinks,
      tagline: content.settings.tagline,
    },
  }} />;
}
