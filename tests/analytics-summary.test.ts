import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ service: vi.fn(), env: vi.fn() }));
vi.mock("@/lib/admin/service", () => ({ createAdminServiceClient: mocks.service, hasAdminServiceEnv: mocks.env }));
import { buildAnalyticsSummary, getAnalyticsSummary, type AnalyticsEventRow } from "@/lib/admin/analytics";
let id = 0;
function row(event_name: string, metadata: Record<string, unknown> = {}, rest: Partial<AnalyticsEventRow> = {}): AnalyticsEventRow {
  return { id: String(++id), event_name, page_path: "/", target_label: "", target_url: "", created_at: "2026-09-20T12:00:00.000Z", metadata: { collectionVersion: 2, ...metadata }, ...rest };
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-20T13:00:00.000Z")); vi.clearAllMocks(); mocks.env.mockReturnValue(true); });
afterEach(() => { vi.useRealTimers(); });

describe("corrected analytics summaries", () => {
  it("counts only page-view sessions, not delayed actions or technical events", () => {
    const summary = buildAnalyticsSummary([
      row("page_view", { sessionId: "a", acquisitionSource: "Instagram" }),
      row("page_view", { sessionId: "a", acquisitionSource: "Instagram" }),
      row("page_view", { sessionId: "b", acquisitionSource: "Spotify" }),
      row("engagement", { sessionId: "c", action: "video_open" }),
    ], 7);
    expect(summary.pageViews).toBe(3); expect(summary.uniqueSessions).toBe(2);
    expect(summary.topSources).toEqual([{ label: "Instagram", value: 1 }, { label: "Spotify", value: 1 }]);
  });
  it("excludes legacy measurements and reports their presence without rewriting history", () => {
    const summary = buildAnalyticsSummary([row("page_view", { collectionVersion: undefined, sessionId: "legacy", referrerDomain: "Internal navigation" }), row("page_view", { sessionId: "new" })], 7);
    expect(summary.pageViews).toBe(1); expect(summary.legacyEvents).toBe(1); expect(summary.uniqueSessions).toBe(1);
    expect(summary.topSources).toEqual([{ label: "Direct / unknown", value: 1 }]);
  });
  it("groups renamed platform links by stable destination and never makes telemetry clickable", () => {
    const summary = buildAnalyticsSummary([row("outbound_click", { destination: "Spotify" }, { target_label: "One", target_url: "https://open.spotify.com" }), row("outbound_click", { destination: "Spotify" }, { target_label: "Renamed", target_url: "https://open.spotify.com" })], 7);
    expect(summary.topTargets).toEqual([{ label: "Spotify", value: 2, href: "" }]);
    expect(summary.recentEvents.every((event) => event.targetUrl === "")).toBe(true);
  });
  it("keeps contact-open distinct from form-start and omits inaccurate legacy vitals", () => {
    const summary = buildAnalyticsSummary([row("engagement", { action: "contact_open" }), row("engagement", { action: "contact_start" }), row("web_vital", { collectionVersion: undefined, name: "CLS", value: 0.01 })], 7);
    expect(summary.engagements).toEqual([{ label: "Contact link opens", value: 1 }, { label: "Contact forms started", value: 1 }]);
    expect(summary.webVitals).toEqual([]);
  });
  it("detects an API cap below the requested 5000 rows using the exact count", async () => {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const name of ["select", "gte", "order", "limit"]) chain[name] = vi.fn(() => chain);
    chain.returns = vi.fn(async () => ({ data: [row("page_view")], error: null, count: 1001 }));
    mocks.service.mockReturnValue({ from: () => chain });
    const result = await getAnalyticsSummary({ rangeDays: 7 });
    expect(chain.select).toHaveBeenCalledWith("*", { count: "exact" });
    expect(result.summary.isCapped).toBe(true); expect(result.summary.matchingEvents).toBe(1001);
  });
  it("fails closed on missing count rather than trusting a short response", async () => {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const name of ["select", "gte", "order", "limit"]) chain[name] = vi.fn(() => chain);
    chain.returns = vi.fn(async () => ({ data: [], error: null, count: null })); mocks.service.mockReturnValue({ from: () => chain });
    expect((await getAnalyticsSummary()).summary.isCapped).toBe(true);
  });
});
