import type { Metadata } from "next";
import AdaptiveHero from "@/components/AdaptiveHero";
import NewsletterBlock from "@/components/NewsletterBlock";
import ShowreelWorks from "@/components/ShowreelWorks";
import { getPortfolioContent } from "@/lib/content";
import { createPageMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const content = await getPortfolioContent();

  return createPageMetadata(content, "video");
}

export default async function VideoPage() {
  const content = await getPortfolioContent();
  const hero = content.heroes.video;

  return (
    <main>
      <AdaptiveHero {...hero} />

      <ShowreelWorks
        presentation={content.videoPresentation}
        videos={content.videos}
      />

      <NewsletterBlock
        artistName={content.settings.artistName}
        contactBlurb={content.settings.contactBlurb}
        footerEffect={content.settings.footerEffect}
        location={content.settings.location}
        portfolioType={content.settings.portfolioType}
        socialLinks={content.socialLinks}
        spotifyUrl={content.settings.spotifyArtistUrl}
        tagline={content.settings.tagline}
      />
    </main>
  );
}
