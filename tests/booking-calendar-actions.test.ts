import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveBookingCalendarV2 } from "@/app/admin/v2/pages/events/actions";
import { DEFAULT_BOOKING_CALENDAR_DRAFT, INITIAL_BOOKING_CALENDAR_SAVE_STATE } from "@/lib/booking-calendar";
const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), origin: vi.fn(), client: vi.fn(), audit: vi.fn(), revalidate: vi.fn(), rpc: vi.fn(), abort: vi.fn() }));
vi.mock("@/lib/admin/auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/admin/action-security", () => ({ verifyAdminActionOrigin: mocks.origin }));
vi.mock("@/lib/admin/service", () => ({ createAdminServiceClient: mocks.client }));
vi.mock("@/lib/admin/audit", () => ({ writeAuditLog: mocks.audit }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
const version = "2026-09-27T10:00:00.123456+00:00";
const nextVersion = "2026-09-27T10:00:01.123456+00:00";
function form(payload: unknown = DEFAULT_BOOKING_CALENDAR_DRAFT, updatedAt = version) {
  const data = new FormData(); data.set("payload", JSON.stringify(payload)); data.set("updatedAt", updatedAt); return data;
}
const save = (data = form()) => saveBookingCalendarV2(INITIAL_BOOKING_CALENDAR_SAVE_STATE, data);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdmin.mockResolvedValue({ id: "admin-1" }); mocks.origin.mockResolvedValue(true);
  mocks.client.mockReturnValue({ rpc: mocks.rpc }); mocks.audit.mockResolvedValue({ ok: true });
  mocks.rpc.mockReturnValue({ abortSignal: mocks.abort });
  mocks.abort.mockResolvedValue({ data: { draft: DEFAULT_BOOKING_CALENDAR_DRAFT, updatedAt: nextVersion }, error: null });
});
describe("Booking calendar server action", () => {
  it("authenticates before validation and client creation", async () => {
    mocks.requireAdmin.mockRejectedValueOnce(new Error("unauthorized"));
    await expect(save(new FormData())).rejects.toThrow("unauthorized");
    expect(mocks.client).not.toHaveBeenCalled(); expect(mocks.origin).not.toHaveBeenCalled();
  });
  it.each([null, {}, { ...DEFAULT_BOOKING_CALENDAR_DRAFT, unknown: true }])("rejects invalid payload before origin and data access", async payload => {
    expect((await save(form(payload))).status).toBe("invalid");
    expect(mocks.client).not.toHaveBeenCalled(); expect(mocks.origin).not.toHaveBeenCalled();
  });
  it("bounds malformed, oversized and wrong-version submissions", async () => {
    const malformed = form(); malformed.set("payload", "{"); expect((await save(malformed)).status).toBe("invalid");
    const oversized = form(); oversized.set("payload", "ž".repeat(400_000)); expect((await save(oversized)).status).toBe("invalid");
    expect((await save(form(DEFAULT_BOOKING_CALENDAR_DRAFT, "stale"))).status).toBe("invalid");
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it("checks origin before using the service client", async () => {
    mocks.origin.mockResolvedValue(false); expect((await save()).status).toBe("security-error");
    expect(mocks.origin).toHaveBeenCalledWith("admin-1", "booking-calendar-v2:save"); expect(mocks.client).not.toHaveBeenCalled();
  });
  it("reports missing service without writes", async () => {
    mocks.client.mockReturnValue(null); expect((await save()).status).toBe("missing-service"); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each([
    [{ code: "40001" }, "conflict"],
    [{ code: "PGRST202", message: "Could not find save_booking_calendar_v2" }, "migration-required"],
    [{ code: "22023" }, "invalid"], [{ code: "23514" }, "invalid"], [{ code: "XX000" }, "error"],
  ])("handles database failures without success side effects", async (error, status) => {
    vi.spyOn(console,"error").mockImplementation(() => {});
    mocks.abort.mockResolvedValue({ data: null, error }); expect((await save()).status).toBe(status);
    expect(mocks.audit).not.toHaveBeenCalled(); expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("fails closed on network exceptions and malformed successful responses", async () => {
    mocks.abort.mockRejectedValueOnce(new Error("offline")); expect((await save()).status).toBe("error");
    mocks.abort.mockResolvedValueOnce({ data: {}, error: null }); expect((await save()).status).toBe("error");
    expect(mocks.audit).not.toHaveBeenCalled();
  });
  it("sends exact CAS, accepts canonical snapshot, audits counts only and revalidates", async () => {
    const result = await save(); expect(result.status).toBe("saved"); expect(result.snapshot?.updatedAt).toBe(nextVersion);
    expect(mocks.rpc).toHaveBeenCalledWith("save_booking_calendar_v2", { p_expected_updated_at: version, p_payload: DEFAULT_BOOKING_CALENDAR_DRAFT });
    expect(mocks.abort).toHaveBeenCalledWith(expect.any(AbortSignal));
    expect(mocks.audit).toHaveBeenCalledWith({ actorId: "admin-1", action: "booking_calendar_v2_save", tableName: "booking_calendar", recordId: "main", metadata: { enabled: false, eventCount: 0, publishedCount: 0 } });
    expect(mocks.revalidate).toHaveBeenCalledWith("/booking"); expect(mocks.revalidate).toHaveBeenCalledWith("/admin/v2/pages/events");
    expect(mocks.revalidate).toHaveBeenCalledWith("/admin/v2-preview/contact"); expect(mocks.revalidate).toHaveBeenCalledWith("/admin/v2");
  });
});
