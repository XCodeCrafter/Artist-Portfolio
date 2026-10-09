import "server-only";
import { cache } from "react";
import { createPublicContentClient } from "@/lib/content/supabase";
import { parseBookingCalendarDraft, sortBookingCalendarEvents, type BookingCalendarDraft } from "@/lib/booking-calendar";

// No service key, cookie/session client, fallback announcements, or draft reads.
// A missing migration hides this additive section without breaking inquiries.
export const getPublicBookingCalendar = cache(async (): Promise<BookingCalendarDraft | null> => {
  const client = createPublicContentClient();
  if (!client) return null;
  try {
    const { data, error } = await client.rpc("get_public_booking_calendar_v1").abortSignal(AbortSignal.timeout(5_000));
    if (error || data === null) return null;
    const parsed = parseBookingCalendarDraft(data);
    if (!parsed.success || !parsed.data.settings.enabled || parsed.data.events.some(event => !event.published)) return null;
    return {
      settings: parsed.data.settings,
      // Also protect new code reading the pre-0061 public RPC during rollout.
      events: sortBookingCalendarEvents(parsed.data.events).map(event =>
        parsed.data.settings.showTicketLinks ? event : { ...event, ticketUrl: "" }
      ),
    };
  } catch { return null; }
});
