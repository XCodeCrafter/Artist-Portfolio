// artist-portfolio/app/bio/page.tsx
import type { Metadata } from "next";
import BioPageView, {
  type BioPageViewData,
} from "@/components/bio/BioPageView";
import JsonLd from "@/components/JsonLd";
import { getPortfolioContent } from "@/lib/content";
import { createBioJsonLd, createPageMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const content = await getPortfolioContent();

  return createPageMetadata(content, "bio");
}

export default async function BioPage() {
  const content = await getPortfolioContent();
  const data: BioPageViewData = {
    hero: content.heroes.bio,
    bio: content.bio,
    resume: content.actorResume,
    hasResumeDetails: content.hasActorResume,
    credits: content.actorCredits,
    footer: {
      artistName: content.settings.artistName,
      contactBlurb: content.settings.contactBlurb,
      footerEffect: content.settings.footerEffect,
      location: content.settings.location,
      socialLinks: content.socialLinks,
      tagline: content.settings.tagline,
    },
  };

  return (
    <>
      <JsonLd data={createBioJsonLd(content)} />
      <BioPageView data={data} />
    </>
  );
}
