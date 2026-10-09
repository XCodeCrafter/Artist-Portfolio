import { describe, expect, it } from "vitest";
import { BOOKING_CALENDAR_MAX_PAYLOAD, DEFAULT_BOOKING_CALENDAR_DRAFT, createFallbackBookingCalendarSnapshot, hasBookingCalendarTicketVisibility, isNewerBookingCalendarVersion, isSafeBookingCalendarTicketUrl, isValidBookingCalendarDate, isValidBookingCalendarTimeZone, parseBookingCalendarDraft, parseBookingCalendarSaveDraft, parseBookingCalendarSnapshot, sortBookingCalendarEvents, type BookingCalendarEvent } from "@/lib/booking-calendar";

const event: BookingCalendarEvent = { id: "11111111-1111-4111-8111-111111111111", title: "Live show", description: "", date: "2026-10-09", time: "19:30", timezone: "Europe/Prague", city: "Prague", venue: "Music room", kind: "Concert", ticketUrl: "https://tickets.example.com/show", status: "scheduled", published: true };
const draft = () => ({ settings: { ...DEFAULT_BOOKING_CALENDAR_DRAFT.settings, enabled: true }, events: [{ ...event }] });
describe("Booking calendar strict shared contracts", () => {
  it("starts disabled, empty and without fictional announcements", () => {
    expect(DEFAULT_BOOKING_CALENDAR_DRAFT.events).toEqual([]);
    expect(DEFAULT_BOOKING_CALENDAR_DRAFT.settings.enabled).toBe(false);
    expect(DEFAULT_BOOKING_CALENDAR_DRAFT.settings.showTicketLinks).toBe(false);
    expect(parseBookingCalendarDraft(DEFAULT_BOOKING_CALENDAR_DRAFT).success).toBe(true);
    const fallback = createFallbackBookingCalendarSnapshot();
    fallback.draft.settings.title = "Changed";
    expect(DEFAULT_BOOKING_CALENDAR_DRAFT.settings.title).not.toBe("Changed");
  });
  it("reads legacy calendars with ticket links off but requires an explicit choice for saving", () => {
    const legacy = draft();
    delete legacy.settings.showTicketLinks;
    const parsed = parseBookingCalendarDraft(legacy);
    expect(parsed.success).toBe(true);
    if (!parsed.success) throw parsed.error;
    expect(parsed.data.settings.showTicketLinks).toBe(false);
    expect(parsed.data.events).toEqual(legacy.events);
    expect(parseBookingCalendarSaveDraft(legacy).success).toBe(false);
    expect(hasBookingCalendarTicketVisibility({ draft: legacy })).toBe(false);
    expect(hasBookingCalendarTicketVisibility({ draft: parsed.data })).toBe(true);
  });
  it.each([false, true])("preserves event URLs and statuses when ticket visibility is %s", showTicketLinks => {
    const payload = { ...draft(), settings: { ...draft().settings, showTicketLinks }, events: [{ ...event, status: "sold_out" }] };
    expect(parseBookingCalendarSaveDraft(payload)).toMatchObject({ success: true, data: payload });
  });
  it.each([null, "false", 0])("rejects invalid ticket visibility %s rather than silently disabling it", showTicketLinks => {
    const payload = { ...draft(), settings: { ...draft().settings, showTicketLinks } };
    expect(parseBookingCalendarDraft(payload).success).toBe(false);
    expect(parseBookingCalendarSaveDraft(payload).success).toBe(false);
    expect(hasBookingCalendarTicketVisibility({ draft: payload })).toBe(false);
  });
  it("confirms strictly newer versions without losing PostgreSQL microseconds", () => {
    const previous = "2026-09-27T14:01:02.123456+00:00";
    expect(isNewerBookingCalendarVersion("2026-09-27T14:01:02.123457Z", previous)).toBe(true);
    expect(isNewerBookingCalendarVersion("2026-09-27T14:01:02.124Z", previous)).toBe(true);
    expect(isNewerBookingCalendarVersion("2026-09-27T16:01:02.123456+02:00", previous)).toBe(false);
    expect(isNewerBookingCalendarVersion("2026-09-27T14:01:02.123455Z", previous)).toBe(false);
  });
  it.each(["2026-02-29", "2026-04-31", "2026-13-01", "2026-00-10", "2026-1-01", "1899-12-31", "2200-01-01", "2026-10-09T00:00:00Z"])("rejects impossible/noncanonical date %s", value => expect(isValidBookingCalendarDate(value)).toBe(false));
  it.each(["2028-02-29", "1900-01-01", "2199-12-31"])("accepts %s", value => expect(isValidBookingCalendarDate(value)).toBe(true));
  it.each(["UTC", "Europe/Prague", "America/New_York"])("accepts IANA time zone %s", value => expect(isValidBookingCalendarTimeZone(value)).toBe(true));
  it.each(["", "Fake/Zone", "+02:00", "EST", "Europe/Prague;DROP"])("rejects unsupported time zone %s", value => expect(isValidBookingCalendarTimeZone(value)).toBe(false));
  it.each(["", "https://tickets.example.com", "https://tickets.example.com:443/path?q=show#tickets"])("accepts safe optional ticket URL %s", value => expect(isSafeBookingCalendarTicketUrl(value)).toBe(true));
  it.each(["http://example.com", "javascript:alert(1)", "//example.com", "https://user:password@example.com", "https://example.com:3000", "https://example.com\\@other.com", "https://127.0.0.1", "https://localhost", "https://site.local", "https://foo.test", "https://example.com/space here", "https://example.com/\n", "https://[::1]/"])("rejects unsafe URL %s", value => expect(isSafeBookingCalendarTicketUrl(value)).toBe(false));
  it.each([{ time: "24:00" }, { time: "19:60" }, { status: "deleted" }, { published: "true" }, { title: " " }, { venue: "" }, { id: "not-an-id" }, { id: "00000000-0000-0000-0000-000000000000" }, { privateNotes: "No hidden fields" }, { description: "x".repeat(2001) }])("rejects malformed event %j", patch => {
    expect(parseBookingCalendarDraft({ ...draft(), events: [{ ...event, ...patch }] }).success).toBe(false);
  });
  it("rejects unknown root/settings fields and duplicate case-insensitive IDs", () => {
    expect(parseBookingCalendarDraft({ ...draft(), secret: true }).success).toBe(false);
    expect(parseBookingCalendarDraft({ ...draft(), settings: { ...draft().settings, secret: true } }).success).toBe(false);
    expect(parseBookingCalendarDraft({ ...draft(), events: [event, { ...event }] }).success).toBe(false);
  });
  it("bounds collection count and serialized UTF-8 bytes below the action boundary", () => {
    const events = Array.from({ length: 251 }, (_, index) => ({ ...event, id: `11111111-1111-4111-8111-${String(index).padStart(12,"0")}` }));
    expect(parseBookingCalendarDraft({ ...draft(), events }).success).toBe(false);
    const multibyte = { ...draft(), events: events.slice(0,250).map(item => ({ ...item, description: "ž".repeat(2_000) })) };
    expect(JSON.stringify(multibyte).length).toBeLessThan(BOOKING_CALENDAR_MAX_PAYLOAD);
    expect(new TextEncoder().encode(JSON.stringify(multibyte)).length).toBeGreaterThan(BOOKING_CALENDAR_MAX_PAYLOAD);
    expect(parseBookingCalendarDraft(multibyte).success).toBe(false);
  });
  it("sorts without mutating source arrays and preserves microsecond CAS versions", () => {
    const later = { ...event, date: "2026-11-01", id: "22222222-2222-4222-8222-222222222222" };
    const events = [later, event];
    expect(sortBookingCalendarEvents(events)).toEqual([event, later]);
    expect(events).toEqual([later, event]);
    const updatedAt = "2026-09-27T14:01:02.123456+00:00";
    expect(parseBookingCalendarSnapshot({ draft: { ...draft(), events }, updatedAt })?.updatedAt).toBe(updatedAt);
    expect(parseBookingCalendarSnapshot({ draft: draft(), updatedAt: "yesterday" })).toBeNull();
  });
});
