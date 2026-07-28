// artist-portfolio/app/music/page.tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AdaptiveHero from "@/components/AdaptiveHero";
import MusicPlatformsExt from "@/components/MusicPlatforms_ext";
import NewsletterBlock from "@/components/NewsletterBlock";
import SoundcloudCarousel from "@/components/SoundcloudCarousel";
import SpotifyEmbed from "@/components/SpotifyEmbed";
import { getPortfolioContent } from "@/lib/content";
import { createPageMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const content = await getPortfolioContent();

  return createPageMetadata(content, "music");
}

export default async function MusicPage() {
  const content = await getPortfolioContent();
  if (content.settings.portfolioType === "actor") {
    redirect("/video");
  }

  const hero = content.heroes.music;

  return (
    <main>
      <AdaptiveHero {...hero} />

      <div id="music">
        <MusicPlatformsExt cards={content.musicPlatforms} />

        <section className="mx-auto max-w-[1400px] px-5 sm:px-8 py-14 sm:py-18">
          <h2
            className="text-5xl sm:text-7xl font-semibold tracking-tight text-white"
            data-reveal="up"
          >
            LATEST RELEASES
          </h2>

          <div className="mt-8" data-reveal="up" data-reveal-delay="140">
            <SpotifyEmbed
              embedUrl={content.settings.spotifyEmbedUrl}
              openUrl={content.settings.spotifyArtistUrl}
              title="Spotify Releases"
              heightMobile={352}
              heightDesktop={520}
            />
          </div>
        </section>

        <section className="mx-auto max-w-[1400px] px-5 sm:px-8 pb-18">
          <h2
            className="text-5xl sm:text-7xl font-semibold tracking-tight text-white"
            data-reveal="up"
          >
            LATEST MIXES
          </h2>

          <div className="mt-8">
            <SoundcloudCarousel
              items={content.soundcloudTracks}
              showTitles={false}
              autoPlay={false}
            />
          </div>
        </section>

        <div className="mt-16">
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
        </div>
      </div>
    </main>
  );
}
