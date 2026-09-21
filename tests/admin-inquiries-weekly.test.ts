import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), configured: vi.fn(), service: vi.fn() }));
vi.mock("@/lib/admin/auth", () => ({ requireAdmin: mocks.auth }));
vi.mock("@/lib/admin/service", () => ({ hasAdminServiceEnv: mocks.configured, createAdminServiceClient: mocks.service }));
import { getBookingInquiries, getInquiryWeeklyWindow } from "@/lib/admin/inquiries";

const asOf = "2026-09-21T12:34:56.789Z";
const currentStart = "2026-09-14T12:34:56.789Z";
const previousStart = "2026-09-07T12:34:56.789Z";
type ResultOverride = { count?: unknown; error?: unknown; throws?: boolean; hangs?: boolean };
type QueryRecord = { table: string; columns?: string; options?: { count?: string; head?: boolean }; status?: string; lower?: string; upper?: string; range?: [number, number]; signal?: AbortSignal };
function fixture(overrides: { current?: ResultOverride; previous?: ResultOverride; total?: ResultOverride; status?: ResultOverride; empty?: boolean } = {}) {
  const queries: QueryRecord[] = [];
  const data = (overrides.empty ? [] : [
    ["2026-09-07T12:34:56.788Z", "new"], // Before both periods.
    [previousStart, "new"],
    ["2026-09-14T12:34:56.788Z", "read"],
    [currentStart, "replied"],
    ["2026-09-21T12:34:56.788Z", "archived"],
    [asOf, "new"], // Half-open upper bound excludes this row.
    ["2026-09-22T12:34:56.789Z", "new"],
  ]).map(([created_at, status], index) => ({ id: String(index), name: "Private name", email: "private@example.com", message: "Private message", admin_notes: "Private notes", created_at, updated_at: created_at, status }));
  const from = vi.fn((table: string) => {
    const query: QueryRecord = { table };
    queries.push(query);
    const getOverride = () => query.lower === currentStart ? overrides.current : query.lower === previousStart ? overrides.previous : query.status ? overrides.status : overrides.total;
    const result = () => {
      const override = getOverride();
      if (override?.throws) throw new Error("Private provider response");
      const filtered = data.filter((row) => (!query.status || row.status === query.status) && (!query.lower || row.created_at >= query.lower) && (!query.upper || row.created_at < query.upper));
      return { count: override && "count" in override ? override.count : filtered.length, error: override?.error || null };
    };
    const chain = {
      select(columns: string, options?: QueryRecord["options"]) { query.columns = columns; query.options = options; return chain; },
      order() { return chain; },
      range(start: number, end: number) { query.range = [start, end]; return chain; },
      eq(_column: string, status: string) { query.status = status; return chain; },
      gte(_column: string, start: string) { query.lower = start; return chain; },
      lt(_column: string, end: string) { query.upper = end; return chain; },
      abortSignal(signal: AbortSignal) { query.signal = signal; return chain; },
      returns: async () => ({ data, error: null }),
      then: (resolve: (value: ReturnType<typeof result>) => unknown, reject: (error: unknown) => unknown) => {
        if (!getOverride()?.hangs) return Promise.resolve().then(result).then(resolve, reject);
        return new Promise<ReturnType<typeof result>>((_resolve, fail) => {
          if (query.signal?.aborted) { fail(new Error("aborted")); return; }
          query.signal?.addEventListener("abort", () => fail(new Error("aborted")), { once: true });
        }).then(resolve, reject);
      },
    };
    return chain;
  });
  mocks.service.mockReturnValue({ from });
  return { queries, from };
}
beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date(asOf));
  mocks.auth.mockResolvedValue({ id: "admin" }); mocks.configured.mockReturnValue(true);
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("exact, private Inbox weekly counting", () => {
  it("authenticates before creating any service-role query", async () => {
    const service = fixture(); await getBookingInquiries();
    expect(mocks.auth.mock.invocationCallOrder[0]).toBeLessThan(mocks.service.mock.invocationCallOrder[0]);
    expect(service.queries).toHaveLength(8);
    mocks.auth.mockRejectedValue(new Error("unauthorized")); mocks.service.mockClear(); mocks.configured.mockClear();
    await expect(getBookingInquiries()).rejects.toThrow("unauthorized");
    expect(mocks.service).not.toHaveBeenCalled();
    expect(mocks.configured).not.toHaveBeenCalled();
  });
  it("counts retained arrivals of every status across exact, adjacent half-open windows", async () => {
    const service = fixture(); const result = await getBookingInquiries();
    expect(result.loadError).toBeUndefined();
    expect(result.summary.weekly).toEqual({ available: true, asOf, currentStart, previousStart, current7Days: 2, previous7Days: 2 });
    expect(result.summary.new).toBe(4); // Different from messages received this week.
    const weeklyQueries = service.queries.filter((query) => query.lower);
    expect(weeklyQueries).toMatchObject([
      { table: "booking_inquiries", columns: "id", options: { count: "exact", head: true }, lower: currentStart, upper: asOf },
      { table: "booking_inquiries", columns: "id", options: { count: "exact", head: true }, lower: previousStart, upper: currentStart },
    ]);
    expect(weeklyQueries.every((query) => query.signal instanceof AbortSignal)).toBe(true);
    expect(service.queries.every((query) => query.table === "booking_inquiries")).toBe(true);
    expect(JSON.stringify(result.summary.weekly)).not.toMatch(/private|email|message|admin_notes/);
  });
  it("returns genuine zeros when both exact counts are verified empty", async () => {
    fixture({ empty: true }); const result = await getBookingInquiries();
    expect(result.summary.weekly).toMatchObject({ available: true, current7Days: 0, previous7Days: 0 });
    expect(result.inquiries).toEqual([]); expect(result.loadError).toBeUndefined();
  });
  it.each(["current", "previous"] as const)("isolates a %s count failure from the working Inbox", async (period) => {
    fixture({ [period]: { error: { code: "XX000", message: "Sensitive provider details" } } });
    const result = await getBookingInquiries();
    expect(result.loadError).toBeUndefined(); expect(result.inquiries.length).toBeGreaterThan(0);
    expect(result.summary.total).toBe(7); expect(result.summary.weekly).toMatchObject({ available: false, current7Days: null, previous7Days: null });
    expect(JSON.stringify(result.summary.weekly)).not.toContain("Sensitive");
  });
  it("also isolates a thrown weekly query without logging message data", async () => {
    fixture({ current: { throws: true } }); const result = await getBookingInquiries();
    expect(result.loadError).toBeUndefined(); expect(result.inquiries).toHaveLength(7);
    expect(result.summary.weekly?.available).toBe(false);
  });
  it("bounds weekly requests to five seconds and releases a stalled report without disabling Inbox", async () => {
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    fixture({ current: { hangs: true } });
    const pending = getBookingInquiries();
    await Promise.resolve();
    controller.abort();
    const result = await pending;
    expect(timeout).toHaveBeenCalledTimes(2);
    expect(timeout).toHaveBeenCalledWith(5_000);
    expect(result.inquiries).toHaveLength(7); expect(result.loadError).toBeUndefined();
    expect(result.summary.weekly?.available).toBe(false);
  });
  it("does not infer a zero comparison when only the previous count is missing", async () => {
    fixture({ previous: { count: null } }); const result = await getBookingInquiries();
    expect(result.summary.weekly).toMatchObject({ available: false, current7Days: null, previous7Days: null });
    expect(result.inquiries).toHaveLength(7); expect(result.loadError).toBeUndefined();
  });
  it.each([null, undefined, -1, 1.5, Number.NaN, Infinity, "2", Number.MAX_SAFE_INTEGER + 1])("does not turn an invalid weekly count (%s) into zero", async (count) => {
    fixture({ current: { count } }); const result = await getBookingInquiries();
    expect(result.summary.weekly).toMatchObject({ available: false, current7Days: null, previous7Days: null });
    expect(result.loadError).toBeUndefined(); expect(result.inquiries).toHaveLength(7);
  });
  it.each([null, undefined, -1, Number.NaN])("still fails closed when core Inbox totals are invalid (%s)", async (count) => {
    fixture({ total: { count } }); const result = await getBookingInquiries();
    expect(result.loadError).toBeTruthy(); expect(result.inquiries).toEqual([]);
    expect(result.summary.weekly?.available).toBe(false);
  });
  it("does not change the fixed reporting range with the loaded Inbox page", async () => {
    const service = fixture(); const result = await getBookingInquiries({ page: 3 });
    expect(result.summary.weekly).toMatchObject({ asOf, currentStart, previousStart });
    expect(service.queries.filter((query) => query.lower).every((query) => query.range === undefined)).toBe(true);
  });
  it("does not fabricate status cards when a status count is missing", async () => {
    fixture({ status: { count: null } }); const result = await getBookingInquiries();
    expect(result.loadError).toBeTruthy(); expect(result.inquiries).toEqual([]);
  });
  it("makes unavailable configuration explicit instead of showing an empty weekly result", async () => {
    mocks.configured.mockReturnValue(false); const result = await getBookingInquiries();
    expect(result.isConfigured).toBe(false); expect(result.summary.weekly).toMatchObject({ available: false, current7Days: null, previous7Days: null });
    expect(mocks.service).not.toHaveBeenCalled();
  });
  it("also distinguishes a missing service client from verified empty statistics", async () => {
    mocks.service.mockReturnValue(null); const result = await getBookingInquiries();
    expect(result.isConfigured).toBe(false); expect(result.summary.weekly?.available).toBe(false);
  });
  it("uses equal UTC durations through a daylight-saving boundary", () => {
    const window = getInquiryWeeklyWindow(new Date("2026-03-30T12:34:56.789Z"));
    expect(Date.parse(window.asOf) - Date.parse(window.currentStart)).toBe(7 * 24 * 60 * 60 * 1000);
    expect(Date.parse(window.currentStart) - Date.parse(window.previousStart)).toBe(7 * 24 * 60 * 60 * 1000);
  });
});
