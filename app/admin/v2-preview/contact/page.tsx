import ContactPreviewRuntime from "@/components/admin/v2/ContactPreviewRuntime";
import { getAdminContactEditorData } from "@/lib/admin/contact";
import { getPublicBookingCalendar } from "@/lib/booking-calendar-data";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Contact preview",
  robots: { index: false, follow: false },
};

export default async function AdminV2ContactPreviewPage() {
  const [data, calendar] = await Promise.all([
    getAdminContactEditorData(), getPublicBookingCalendar(),
  ]);
  return <ContactPreviewRuntime initialSnapshot={data.snapshot} calendar={calendar} calendarToday={new Date().toISOString().slice(0, 10)} />;
}
