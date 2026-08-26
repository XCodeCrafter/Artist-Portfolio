// artist-portfolio/app/page.tsx
import type { Metadata } from "next";
import AboutHome from "@/components/AboutHome";
import AdaptiveHero from "@/components/AdaptiveHero";
import CncCodeShowcase from "@/components/CncCodeShowcase";
import GalleryShowcase from "@/components/GalleryShowcase";
import JsonLd from "@/components/JsonLd";
import MusicPlatforms from "@/components/MusicPlatforms";
import NewsletterBlock from "@/components/NewsletterBlock";
import { getPortfolioContent, type GalleryImage } from "@/lib/content";
import { getPublishedCncPrograms } from "@/lib/content/cnc-programs.server";
import { createHomeJsonLd, createPageMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const content = await getPortfolioContent();

  return createPageMetadata(content, "home");
}

export default async function HomePage() {
  const [content, cncPrograms] = await Promise.all([
    getPortfolioContent(),
    getPublishedCncPrograms(),
  ]);
  const hero = content.heroes.home;
  const profileType = content.settings.portfolioType;
  const videoHero = content.heroes.video;
  const homePresentation = content.homePresentation;
  const interludeVideoSrc =
    homePresentation.featureVideoSrc ||
    content.galleryPresentation.interludeVideoSrc ||
    (videoHero.mediaType === "video"
      ? videoHero.backgroundSrc
      : "/media/hero-loop.mp4");
  const interludePosterSrc =
    homePresentation.featurePosterSrc ||
    content.galleryPresentation.interludePosterSrc ||
    videoHero.posterSrc ||
    "/images/video-hero.jpg";
  const baseStoryImages = content.galleryImages
    .filter((image) => image.isFreelanceStory)
    .sort(
      (first, second) =>
        first.freelanceStoryOrder - second.freelanceStoryOrder ||
        first.title.localeCompare(second.title)
    )
    .slice(0, 4);
  const storySources = [
    homePresentation.storyImage1Src,
    homePresentation.storyImage2Src,
    homePresentation.storyImage3Src,
    homePresentation.storyImage4Src,
  ];
  const storyTitles = [
    homePresentation.storyImage1Title,
    homePresentation.storyImage2Title,
    homePresentation.storyImage3Title,
    homePresentation.storyImage4Title,
  ];
  const storyBodies = [
    homePresentation.storyImage1Body,
    homePresentation.storyImage2Body,
    homePresentation.storyImage3Body,
    homePresentation.storyImage4Body,
  ];
  const homeStoryImages = storySources
    .map((source, index): GalleryImage | null => {
      const base = baseStoryImages[index];
      const src = source || base?.src;
      if (!src) return null;

      return {
        id: `home-story-${index + 1}`,
        title:
          storyTitles[index] ||
          homePresentation.storyTitle ||
          base?.title ||
          `Artist story ${index + 1}`,
        src,
        alt: base?.alt || `Artist story frame ${index + 1}`,
        caption:
          storyBodies[index] ||
          homePresentation.storyBody ||
          base?.caption ||
          "",
        category: base?.category || "Story",
        isMosaic: false,
        isFreelanceStory: true,
        freelanceStoryOrder: (index + 1) * 10,
      };
    })
    .filter((image): image is GalleryImage => Boolean(image));

  return (
    <>
      <JsonLd data={createHomeJsonLd(content)} />
      <main>
        <AdaptiveHero {...hero} />
        <AboutHome content={content.aboutHome} />
        {cncPrograms.length ? (
          <CncCodeShowcase programs={cncPrograms} />
        ) : null}
        <GalleryShowcase
          images={homeStoryImages}
          interludeBody={homePresentation.featureBody}
          interludeCtaHref={homePresentation.featureCtaHref || "/video"}
          interludeCtaLabel={
            homePresentation.featureCtaLabel || "WATCH SHOWREEL"
          }
          interludePosterSrc={interludePosterSrc}
          interludeVideoSrc={interludeVideoSrc}
          interludeTitle={homePresentation.featureTitle}
          mode="narrative"
          presentation={content.galleryPresentation}
          storyBody={homePresentation.storyBody}
          storyCtaHref={homePresentation.storyCtaHref || "/gallery"}
          storyCtaLabel={
            homePresentation.storyCtaLabel || "VIEW GALLERY"
          }
          storyTitle={homePresentation.storyTitle}
        />
        {profileType === "musician" ? (
          <MusicPlatforms cards={content.musicPlatforms} />
        ) : null}
      </main>
      <NewsletterBlock
        artistName={content.settings.artistName}
        contactBlurb={content.settings.contactBlurb}
        footerEffect={content.settings.footerEffect}
        location={content.settings.location}
        portfolioType={profileType}
        socialLinks={content.socialLinks}
        spotifyUrl={content.settings.spotifyArtistUrl}
        tagline={content.settings.tagline}
      />
    </>
  );
}
