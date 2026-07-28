// artist-portfolio/app/bio/page.tsx
import type { Metadata } from "next";
import AdaptiveHero from "@/components/AdaptiveHero";
import ActorResumeBlock from "@/components/ActorResume";
import BioScrollGallery from "@/components/BioScrollGallery";
import JsonLd from "@/components/JsonLd";
import NewsletterBlock from "@/components/NewsletterBlock";
import { getPortfolioContent } from "@/lib/content";
import { createBioJsonLd, createPageMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const content = await getPortfolioContent();

  return createPageMetadata(content, "bio");
}

export default async function BioPage() {
  const content = await getPortfolioContent();
  const hero = content.heroes.bio;
  const isActor = content.settings.portfolioType === "actor";

  return (
    <>
      <JsonLd data={createBioJsonLd(content)} />
      <main>
        <AdaptiveHero {...hero} />

        <div id="bio">
          <BioScrollGallery
            images={content.bio.galleryImages.map((image) => ({
              src: image.src,
              alt: image.alt,
            }))}
            topLabel={content.bio.topLabel}
            introText={content.bio.introText}
            caption={content.bio.caption}
          >
            {content.bio.paragraphs.map((paragraph) => (
              <p
                key={paragraph.id}
                data-reveal="up"
                data-reveal-delay={String(paragraph.revealDelay)}
              >
                {paragraph.body}
              </p>
            ))}
          </BioScrollGallery>
        </div>

        {isActor ? (
          <ActorResumeBlock
            credits={content.actorCredits}
            resume={content.actorResume}
          />
        ) : null}
      </main>

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
    </>
  );
}
