import BookingCalendarEditor from "@/components/admin/v2/BookingCalendarEditor";
import { requireAdmin } from "@/lib/admin/auth";
import { getAdminBookingCalendarData } from "@/lib/admin/booking-calendar";

export const metadata = { title: "Events calendar · Admin V2" };
export const dynamic = "force-dynamic";

export default async function AdminV2EventsPage() {
  await requireAdmin();
  const calendar = await getAdminBookingCalendarData();
  return <div className="grid min-w-0 gap-4">
    <header className="rounded-[26px] border border-white/9 bg-[#0d0d0f]/88 p-5 shadow-[0_22px_80px_rgba(0,0,0,0.34)] backdrop-blur-2xl sm:p-6 lg:p-7">
      <div className="flex flex-wrap items-center gap-2"><span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/34">Admin V2</span><span className="h-1 w-1 rounded-full bg-[#ff3b1f]" /><span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-200/55">Visual page editor</span></div>
      <h1 className="heading-ui mt-3 text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl">Events calendar</h1>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-white/46">Add concerts, performances and other public events to Bookings. Select an event in the same calendar visitors see, edit its details, then save. Your private booking inquiries stay separate.</p>
    </header>
    <BookingCalendarEditor snapshot={calendar.snapshot} disabled={!calendar.isConfigured || calendar.migrationRequired || Boolean(calendar.loadError)} migrationRequired={calendar.migrationRequired} loadError={calendar.loadError} />
  </div>;
}
