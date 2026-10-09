// artist-portfolio/app/page.tsx
import type { Metadata } from "next";
import HomePageView from "@/components/home/HomePageView";
import JsonLd from "@/components/JsonLd";
import NewsletterBlock from "@/components/NewsletterBlock";
import { getPortfolioContent } from "@/lib/content";
import { getPublishedCncPrograms } from "@/lib/content/cnc-programs.server";
import { getPublishedHomeDraft } from "@/lib/content/home.server";
import { withHomeSeoContent } from "@/lib/content/home-seo";
import { createHomeJsonLd, createPageMetadata } from "@/lib/seo";
import { createHomeEditorialDefaults } from "@/lib/admin/home-editorial";

export async function generateMetadata(): Promise<Metadata> {
  const content = await getPortfolioContent();
  const home = await getPublishedHomeDraft(content);
  return createPageMetadata(withHomeSeoContent(content, home), "home");
}

export default async function HomePage() {
  const content = await getPortfolioContent();
  const home = await getPublishedHomeDraft(content);
  const programs = home.layout.some((section) => section.id === "cnc" && section.enabled)
    ? await getPublishedCncPrograms()
    : [];

  return (
    <div className="home-page" data-home-transitions={content.settings.homeSectionTransitionsEnabled ? "on" : undefined}>
      <JsonLd data={createHomeJsonLd(withHomeSeoContent(content, home))} />
      <HomePageView data={{ ...home, press: createHomeEditorialDefaults().press }} programs={programs} sectionTransitionsEnabled={content.settings.homeSectionTransitionsEnabled} />
      <NewsletterBlock
        artistName={content.settings.artistName}
        contactBlurb={content.settings.contactBlurb}
        footerEffect={content.settings.footerEffect}
        location={content.settings.location}
        socialLinks={content.socialLinks}
        tagline={content.settings.tagline}
      />
    </div>
  );
}
