import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AdaptiveHero from "@/components/AdaptiveHero";
import GalleryFooter from "@/components/GalleryFooter";
import GalleryShowcase from "@/components/GalleryShowcase";
import { getPortfolioContent } from "@/lib/content";
import { isModuleEnabled } from "@/lib/content/modules";
import { createPageMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const content = await getPortfolioContent();

  return createPageMetadata(content, "gallery");
}

export default async function GalleryPage() {
  const content = await getPortfolioContent();
  const profileType = content.settings.portfolioType;

  if (!isModuleEnabled(profileType, "gallery")) {
    redirect("/bio");
  }

  const hero = content.heroes.gallery;
  const images = content.galleryImages;

  return (
    <main>
      <AdaptiveHero {...hero} />

      {images.length ? (
        <GalleryShowcase
          images={images}
          presentation={content.galleryPresentation}
        />
      ) : (
        <section className="mx-auto max-w-[1400px] px-5 py-14 sm:px-8 sm:py-18">
          <div className="rounded-[28px] border border-white/10 bg-white/[0.055] p-10 text-center text-white/65">
            Gallery images are coming soon.
          </div>
        </section>
      )}

      <GalleryFooter
        artistName={content.settings.artistName}
        contactBlurb={content.settings.contactBlurb}
        footerEffect={content.settings.footerEffect}
        location={content.settings.location}
        portfolioType={profileType}
        socialLinks={content.socialLinks}
        spotifyUrl={content.settings.spotifyArtistUrl}
        tagline={content.settings.tagline}
      />
    </main>
  );
}
