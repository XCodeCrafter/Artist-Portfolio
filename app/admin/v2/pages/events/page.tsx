import BookingCalendarEditor from "@/components/admin/v2/BookingCalendarEditor";
import { requireAdmin } from "@/lib/admin/auth";
import { getAdminBookingCalendarData } from "@/lib/admin/booking-calendar";
import Link from "next/link";
import { LIVE_CONTACT_PAGE_LABEL } from "@/lib/content/live-contact";

export const metadata = { title: "Events calendar · Admin V2" };
export const dynamic = "force-dynamic";

export default async function AdminV2EventsPage() {
  await requireAdmin();
  const calendar = await getAdminBookingCalendarData();
  return <div className="grid min-w-0 gap-4">
    <header className="rounded-[26px] border border-white/9 bg-[#0d0d0f]/88 p-5 shadow-[0_22px_80px_rgba(0,0,0,0.34)] backdrop-blur-2xl sm:p-6 lg:p-7">
      <div className="flex flex-wrap items-center gap-2"><span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/34">Admin V2</span><span className="h-1 w-1 rounded-full bg-[#ff3b1f]" /><span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-200/55">Visual page editor</span></div>
      <h1 className="heading-ui mt-3 text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl">Events calendar</h1>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-white/46">This calendar is a section of {LIVE_CONTACT_PAGE_LABEL}, not a separate public page. Add concerts and performances, select an event in the preview, edit its details, then save. Private booking inquiries stay separate.</p>
      <Link className="mt-4 inline-flex min-h-11 items-center rounded-xl border border-white/15 px-4 text-sm text-white hover:bg-white/10" href="/admin/v2/pages/contact">← {LIVE_CONTACT_PAGE_LABEL}: Hero &amp; contact form</Link>
    </header>
    <BookingCalendarEditor snapshot={calendar.snapshot} disabled={!calendar.isConfigured || calendar.migrationRequired || Boolean(calendar.loadError)} migrationRequired={calendar.migrationRequired} loadError={calendar.loadError} />
  </div>;
}
