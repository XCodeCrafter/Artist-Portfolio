import "server-only";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminServiceClient } from "@/lib/admin/service";
import { createFallbackBookingCalendarSnapshot, hasBookingCalendarTicketVisibility, parseBookingCalendarSnapshot, type BookingCalendarSnapshot } from "@/lib/booking-calendar";

type CalendarDatabaseError = { code?: string | null; message?: string | null; details?: string | null; hint?: string | null };
export function isMissingBookingCalendarSchemaError(error?: CalendarDatabaseError | null) {
  return Boolean(error && ["PGRST202", "PGRST205", "42883", "42P01"].includes(error.code || "") &&
    /booking_calendar/.test([error.message, error.details, error.hint].filter(Boolean).join(" ")));
}
export type AdminBookingCalendarData = {
  snapshot: BookingCalendarSnapshot; isConfigured: boolean; migrationRequired: boolean; loadError?: string;
};
export async function getAdminBookingCalendarData(): Promise<AdminBookingCalendarData> {
  await requireAdmin();
  const fallback = createFallbackBookingCalendarSnapshot();
  const client = createAdminServiceClient();
  if (!client) return { snapshot: fallback, isConfigured: false, migrationRequired: false };
  try {
    const { data, error } = await client.rpc("get_booking_calendar_v2_snapshot").abortSignal(AbortSignal.timeout(5_000));
    if (error && isMissingBookingCalendarSchemaError(error)) return { snapshot: fallback, isConfigured: true, migrationRequired: true };
    const snapshot = !error && parseBookingCalendarSnapshot(data);
    if (snapshot) return { snapshot, isConfigured: true, migrationRequired: !hasBookingCalendarTicketVisibility(data) };
    console.error("Booking calendar snapshot could not be confirmed.", { code: error?.code });
  } catch { console.error("Booking calendar snapshot request failed."); }
  return { snapshot: fallback, isConfigured: true, migrationRequired: false, loadError: "Events could not be loaded. Editing is disabled until the calendar is reachable." };
}
