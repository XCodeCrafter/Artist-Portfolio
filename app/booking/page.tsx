// artist-portfolio/app/booking/page.tsx
import type { Metadata } from "next";
import ContactPageView, {
  type ContactPageViewData,
} from "@/components/contact/ContactPageView";
import { getPortfolioContent } from "@/lib/content";
import { createPageMetadata } from "@/lib/seo";
import { getPublicBookingCalendar } from "@/lib/booking-calendar-data";

export async function generateMetadata(): Promise<Metadata> {
  const content = await getPortfolioContent();

  return createPageMetadata(content, "booking");
}

export default async function BookingPage() {
  const [content, calendar] = await Promise.all([
    getPortfolioContent(),
    getPublicBookingCalendar(),
  ]);
  const data: ContactPageViewData = {
    calendar,
    calendarToday: new Date().toISOString().slice(0, 10),
    hero: content.heroes.booking,
    details: {
      contactBlurb: content.settings.contactBlurb,
      location: content.settings.location,
    },
  };

  return <ContactPageView data={data} />;
}
