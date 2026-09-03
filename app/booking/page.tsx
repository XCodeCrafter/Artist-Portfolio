// artist-portfolio/app/booking/page.tsx
import type { Metadata } from "next";
import AdaptiveHero from "@/components/AdaptiveHero";
import BookingForm from "@/components/BookingForm";
import { getPortfolioContent } from "@/lib/content";
import { createPageMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const content = await getPortfolioContent();

  return createPageMetadata(content, "booking");
}

export default async function BookingPage() {
  const content = await getPortfolioContent();
  const hero = content.heroes.booking;

  return (
    <main>
      <AdaptiveHero {...hero} />

      <section className="public-nav-anchor py-24 md:py-32" id="form">
        <BookingForm
          contactBlurb={content.settings.contactBlurb}
          location={content.settings.location}
        />
      </section>
    </main>
  );
}
