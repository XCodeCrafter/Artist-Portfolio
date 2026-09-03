// artist-portfolio/app/booking/page.tsx
import type { Metadata } from "next";
import ContactPageView, {
  type ContactPageViewData,
} from "@/components/contact/ContactPageView";
import { getPortfolioContent } from "@/lib/content";
import { createPageMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const content = await getPortfolioContent();

  return createPageMetadata(content, "booking");
}

export default async function BookingPage() {
  const content = await getPortfolioContent();
  const data: ContactPageViewData = {
    hero: content.heroes.booking,
    details: {
      contactBlurb: content.settings.contactBlurb,
      location: content.settings.location,
    },
  };

  return <ContactPageView data={data} />;
}
