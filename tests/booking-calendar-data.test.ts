import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAdminBookingCalendarData, isMissingBookingCalendarSchemaError } from "@/lib/admin/booking-calendar";
import { getPublicBookingCalendar } from "@/lib/booking-calendar-data";
import { DEFAULT_BOOKING_CALENDAR_DRAFT } from "@/lib/booking-calendar";
const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), service: vi.fn(), publicClient: vi.fn(), rpc: vi.fn(), abort: vi.fn() }));
vi.mock("@/lib/admin/auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/admin/service", () => ({ createAdminServiceClient: mocks.service }));
vi.mock("@/lib/content/supabase", () => ({ createPublicContentClient: mocks.publicClient }));
vi.mock("react", () => ({ cache: <T,>(fn: T) => fn }));
const snapshot = { draft: DEFAULT_BOOKING_CALENDAR_DRAFT, updatedAt: "2026-09-27T10:00:00.123456+00:00" };
const event = { id: "11111111-1111-4111-8111-111111111111", title: "Upcoming show", description: "", date: "2026-10-09", time: "19:30", timezone: "UTC", city: "City", venue: "Venue", kind: "Show", ticketUrl: "https://tickets.example.com/show", status: "scheduled", published: true };
beforeEach(() => {
  vi.clearAllMocks(); mocks.requireAdmin.mockResolvedValue({ id: "admin" });
  mocks.rpc.mockReturnValue({ abortSignal: mocks.abort }); mocks.abort.mockResolvedValue({ data: snapshot, error: null });
  mocks.service.mockReturnValue({ rpc: mocks.rpc }); mocks.publicClient.mockReturnValue({ rpc: mocks.rpc });
});
describe("Booking calendar readers", () => {
  it("authenticates before creating an admin client", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("unauthorized")); await expect(getAdminBookingCalendarData()).rejects.toThrow("unauthorized"); expect(mocks.service).not.toHaveBeenCalled();
  });
  it("returns configured and parsed private snapshot", async () => {
    expect(await getAdminBookingCalendarData()).toEqual({ snapshot, isConfigured: true, migrationRequired: false });
    expect(mocks.rpc).toHaveBeenCalledWith("get_booking_calendar_v2_snapshot"); expect(mocks.abort).toHaveBeenCalledWith(expect.any(AbortSignal));
  });
  it("keeps the pre-0061 admin snapshot readable but disables saving until migration", async () => {
    const legacy = structuredClone(DEFAULT_BOOKING_CALENDAR_DRAFT);
    delete legacy.settings.showTicketLinks;
    const raw = { draft: { ...legacy, events: [event] }, updatedAt: snapshot.updatedAt };
    mocks.abort.mockResolvedValue({ data: raw, error: null });
    expect(await getAdminBookingCalendarData()).toEqual({
      snapshot: { ...raw, draft: { ...raw.draft, settings: { ...legacy.settings, showTicketLinks: false } } },
      isConfigured: true, migrationRequired: true,
    });
  });
  it("returns disabled read-only fallback when service is missing", async () => {
    mocks.service.mockReturnValue(null); expect(await getAdminBookingCalendarData()).toMatchObject({ isConfigured: false, migrationRequired: false, snapshot: { draft: { settings: { enabled: false }, events: [] } } });
  });
  it("differentiates missing migration from unrelated failure", async () => {
    mocks.abort.mockResolvedValue({ error: { code: "PGRST202", message: "get_booking_calendar_v2_snapshot" } });
    expect(await getAdminBookingCalendarData()).toMatchObject({ migrationRequired: true });
    expect(isMissingBookingCalendarSchemaError({ code: "PGRST202", message: "other_rpc" })).toBe(false);
    vi.spyOn(console,"error").mockImplementation(() => {}); mocks.abort.mockResolvedValue({ error: { code: "XX000" } });
    expect(await getAdminBookingCalendarData()).toMatchObject({ migrationRequired: false, loadError: expect.any(String) });
  });
  it("does not enable writes with malformed data or a timeout", async () => {
    vi.spyOn(console,"error").mockImplementation(() => {}); mocks.abort.mockResolvedValue({ data: {}, error: null });
    expect(await getAdminBookingCalendarData()).toHaveProperty("loadError"); mocks.abort.mockRejectedValue(new Error("timeout"));
    expect(await getAdminBookingCalendarData()).toHaveProperty("loadError");
  });
  it("public reader uses only the anonymous content client and exact projection", async () => {
    const draft = { ...DEFAULT_BOOKING_CALENDAR_DRAFT, settings: { ...DEFAULT_BOOKING_CALENDAR_DRAFT.settings, enabled: true } };
    mocks.abort.mockResolvedValue({ data: draft, error: null }); expect(await getPublicBookingCalendar()).toEqual(draft);
    expect(mocks.rpc).toHaveBeenCalledWith("get_public_booking_calendar_v1"); expect(mocks.service).not.toHaveBeenCalled(); expect(mocks.requireAdmin).not.toHaveBeenCalled();
  });
  it.each([undefined, false, true])("public ticket projection is enabled only by explicit true: %s", async showTicketLinks => {
    const settings = { ...DEFAULT_BOOKING_CALENDAR_DRAFT.settings, enabled: true, showTicketLinks };
    if (showTicketLinks === undefined) delete settings.showTicketLinks;
    mocks.abort.mockResolvedValue({ data: { settings, events: [event] }, error: null });
    expect(await getPublicBookingCalendar()).toEqual({
      settings: { ...settings, showTicketLinks: showTicketLinks === true },
      events: [{ ...event, ticketUrl: showTicketLinks ? event.ticketUrl : "" }],
    });
    expect(event.ticketUrl).toBe("https://tickets.example.com/show");
  });
  it.each([null, {}, DEFAULT_BOOKING_CALENDAR_DRAFT])("public reader hides missing, malformed or disabled calendar", async data => {
    mocks.abort.mockResolvedValue({ data, error: null }); expect(await getPublicBookingCalendar()).toBeNull();
  });
  it("rejects any unexpected private drafts in public response", async () => {
    mocks.abort.mockResolvedValue({ data: { settings: { ...DEFAULT_BOOKING_CALENDAR_DRAFT.settings, enabled: true }, events: [{ id: "11111111-1111-4111-8111-111111111111", title: "Private", description: "", date: "2026-10-09", time: "19:30", timezone: "UTC", city: "City", venue: "Venue", kind: "Show", ticketUrl: "", status: "scheduled", published: false }] }, error: null });
    expect(await getPublicBookingCalendar()).toBeNull();
  });
  it("public lookup degrades without service or hosted mutations", async () => {
    mocks.publicClient.mockReturnValueOnce(null); expect(await getPublicBookingCalendar()).toBeNull();
    mocks.abort.mockRejectedValueOnce(new Error("timeout")); expect(await getPublicBookingCalendar()).toBeNull();
    mocks.abort.mockResolvedValueOnce({ data: null, error: { code: "PGRST202" } }); expect(await getPublicBookingCalendar()).toBeNull();
  });
});
