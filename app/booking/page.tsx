// artist-portfolio/app/booking/page.tsx
import type { Metadata } from "next";
import AdaptiveHero from "@/components/AdaptiveHero";
import BookingForm from "@/components/BookingForm";
import { getPortfolioContent } from "@/lib/content";

export const metadata: Metadata = {
  title: "Contact",
  description: "Get in touch about bookings, collaborations, and projects.",
  alternates: { canonical: "/booking" },
};

export default async function BookingPage() {
  const content = await getPortfolioContent();
  const hero = content.heroes.booking;

  return (
    <>
      <AdaptiveHero {...hero} />

      <section id="form" className="py-24 md:py-32 scroll-mt-24">
        <BookingForm
          contactBlurb={content.settings.contactBlurb}
          location={content.settings.location}
          portfolioType={content.settings.portfolioType}
        />
      </section>
    </>
  );
}
