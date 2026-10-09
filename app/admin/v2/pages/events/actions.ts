"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { verifyAdminActionOrigin } from "@/lib/admin/action-security";
import { createAdminServiceClient } from "@/lib/admin/service";
import { writeAuditLog } from "@/lib/admin/audit";
import { isMissingBookingCalendarSchemaError } from "@/lib/admin/booking-calendar";
import { BOOKING_CALENDAR_MAX_PAYLOAD, bookingCalendarFieldErrors, bookingCalendarTimestampSchema, hasBookingCalendarTicketVisibility, isNewerBookingCalendarVersion, parseBookingCalendarSaveDraft, parseBookingCalendarSnapshot, type BookingCalendarSaveState } from "@/lib/booking-calendar";

function result(status: BookingCalendarSaveState["status"], message: string, extra: Partial<BookingCalendarSaveState> = {}): BookingCalendarSaveState {
  return { status, message, eventId: randomUUID(), ...extra };
}
export async function saveBookingCalendarV2(_previous: BookingCalendarSaveState, formData: FormData): Promise<BookingCalendarSaveState> {
  const admin = await requireAdmin();
  const payload = formData.get("payload");
  const version = bookingCalendarTimestampSchema.safeParse(formData.get("updatedAt"));
  if (typeof payload !== "string" || new TextEncoder().encode(payload).byteLength > BOOKING_CALENDAR_MAX_PAYLOAD || !version.success) {
    return result("invalid", "This calendar draft is incomplete or too large. Reload the saved version before trying again.");
  }
  let raw: unknown;
  try { raw = JSON.parse(payload); }
  catch { return result("invalid", "The calendar draft could not be read."); }
  const parsed = parseBookingCalendarSaveDraft(raw);
  if (!parsed.success) return result("invalid", "Fix the highlighted event fields before saving.", { fieldErrors: bookingCalendarFieldErrors(parsed.error) });
  if (!(await verifyAdminActionOrigin(admin.id, "booking-calendar-v2:save"))) {
    return result("security-error", "The request origin was blocked. Refresh Admin V2 and try again.");
  }
  const client = createAdminServiceClient();
  if (!client) return result("missing-service", "Supabase admin access is not configured, so nothing was saved.");
  try {
    const { data, error } = await client.rpc("save_booking_calendar_v2", { p_expected_updated_at: version.data, p_payload: parsed.data })
      .abortSignal(AbortSignal.timeout(10_000));
    if (error) {
      if (error.code === "40001") return result("conflict", "The calendar changed in another session. Your draft was kept; reload the saved calendar before editing again.");
      if (isMissingBookingCalendarSchemaError(error)) return result("migration-required", "Apply and verify calendar migrations 0053 and 0061 before saving, without replaying migrations already applied.");
      if (["22023", "23514", "22007", "22008"].includes(error.code || "")) return result("invalid", "The calendar contains invalid or outdated fields. Review the draft and try again.");
      console.error("Booking calendar save failed.", { code: error.code });
      return result("error", "The calendar save could not be confirmed. Reload before retrying.");
    }
    const snapshot = parseBookingCalendarSnapshot(data);
    if (!snapshot || !hasBookingCalendarTicketVisibility(data) || !isNewerBookingCalendarVersion(snapshot.updatedAt, version.data)
      || snapshot.draft.settings.showTicketLinks !== parsed.data.settings.showTicketLinks) {
      return result("error", "The save response could not be confirmed. Reload before editing the calendar again.");
    }
    await writeAuditLog({ actorId: admin.id, action: "booking_calendar_v2_save", tableName: "booking_calendar", recordId: "main", metadata: { enabled: snapshot.draft.settings.enabled, showTicketLinks: snapshot.draft.settings.showTicketLinks, eventCount: snapshot.draft.events.length, publishedCount: snapshot.draft.events.filter(event => event.published).length } });
    revalidatePath("/booking");
    revalidatePath("/admin/v2/pages/events");
    revalidatePath("/admin/v2-preview/contact");
    revalidatePath("/admin/v2");
    return result("saved", "Calendar saved. Only published events appear on the enabled public calendar.", { snapshot });
  } catch {
    return result("error", "The calendar save could not be confirmed. Reload before retrying; your draft was kept.");
  }
}
