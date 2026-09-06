import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getAdminAnalyticsPath } from "@/lib/admin/analytics-routes";
import { ANALYTICS_RANGE_DAYS } from "@/lib/admin/analytics-shared";

const v2Page = readFileSync(
  new URL("../app/admin/v2/insights/page.tsx", import.meta.url),
  "utf8"
);
const classicPage = readFileSync(
  new URL("../app/admin/analytics/page.tsx", import.meta.url),
  "utf8"
);
const overview = readFileSync(
  new URL("../app/admin/v2/page.tsx", import.meta.url),
  "utf8"
);
const shellCatalog = readFileSync(
  new URL("../lib/admin/v2-shell.ts", import.meta.url),
  "utf8"
);
const shell = readFileSync(
  new URL("../components/admin/v2/AdminV2Shell.tsx", import.meta.url),
  "utf8"
);
const workspace = readFileSync(
  new URL("../components/admin/AnalyticsDashboard.tsx", import.meta.url),
  "utf8"
);

describe("Admin V2 Insights routing", () => {
  it("uses only fixed classic and V2 report paths", () => {
    expect(getAdminAnalyticsPath("classic")).toBe("/admin/analytics");
    expect(getAdminAnalyticsPath("v2")).toBe("/admin/v2/insights");
    expect(ANALYTICS_RANGE_DAYS).toEqual([7, 30, 90, 180]);
  });

  it("authenticates before loading service-role analytics and never loads Inbox", () => {
    expect(v2Page.indexOf("await requireAdmin()"))
      .toBeGreaterThan(-1);
    expect(v2Page.indexOf("await requireAdmin()"))
      .toBeLessThan(v2Page.indexOf("await getAnalyticsSummary"));
    expect(v2Page).toContain("<InsightsDashboard");
    expect(v2Page).not.toContain("getBookingInquiries");
    expect(v2Page).not.toContain("inquiryPage");
  });

  it("keeps the Classic analytics and Inbox route intact", () => {
    expect(classicPage).toContain("getAnalyticsSummary");
    expect(classicPage).toContain("getBookingInquiries");
    expect(classicPage).toContain("<AnalyticsDashboard");
  });

  it("is discoverable in the V2 overview and sidebar", () => {
    expect(overview).toContain('href="/admin/v2/insights"');
    expect(shellCatalog).toContain('href: "/admin/v2/insights"');
    expect(shellCatalog).toContain('key: "insights"');
    expect(shell).toContain("insights: <FaChartLine />");
  });
});

describe("Admin V2 Insights workspace contract", () => {
  it("renders only analytics workspaces with plain-language V2 labels", () => {
    expect(workspace).toContain("export function InsightsDashboard");
    expect(workspace).toContain('["content", "popular-pages", "Popular pages"]');
    expect(workspace).toContain('["acquisition", "visitors", "Visitors"]');
    expect(workspace).toContain('["engagement", "interactions", "Interactions"]');
    expect(workspace).toContain('["events", "recent-activity", "Recent activity"]');
    expect(workspace).toContain('["health", "data-health", "Data health"]');
    expect(workspace).toContain("surface=\"v2\"");
    expect(workspace).toContain("inquiries={[]}");
  });

  it("keeps range navigation on its originating fixed surface", () => {
    expect(workspace).toContain("getAdminAnalyticsPath(surface)");
    expect(workspace).not.toContain(
      'href={`/admin/analytics?range=${days}#${activeSectionId}`}'
    );
  });

  it("preserves accessible navigation and avoids the V2 mobile header", () => {
    expect(workspace).toContain('role="tablist"');
    expect(workspace).toContain('aria-selected={active}');
    expect(workspace).toContain('role="tabpanel"');
    expect(workspace).toContain('event.key !== "ArrowLeft"');
    expect(workspace).toContain('event.key === "Home"');
    expect(workspace).toContain('event.key === "End"');
    expect(workspace).toContain('"top-[76px] lg:top-3"');
    expect(workspace).toContain("View accessible daily data");
  });

  it("makes partial and retention-limited reports explicit", () => {
    expect(workspace).toContain("5,000-event read limit");
    expect(workspace).toContain("preceding");
    expect(workspace).toContain("180-day comparison can be incomplete");
    expect(workspace).toContain("Values from this source are shown as unavailable, not zero.");
  });
});
