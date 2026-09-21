import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import InboxWeeklySummary, { getInquiryWeeklyTrend } from "@/components/admin/InboxWeeklySummary";
import type { InquiryWeeklySummary } from "@/lib/admin/inquiries";

const window = { asOf: "2026-09-21T12:34:56.789Z", currentStart: "2026-09-14T12:34:56.789Z", previousStart: "2026-09-07T12:34:56.789Z" };
const available = (current7Days: number, previous7Days: number): InquiryWeeklySummary => ({ ...window, available: true, current7Days, previous7Days });
describe("V2 Inbox weekly received summary", () => {
  it("shows the real count and meaningful increase independently of status/analytics", () => {
    const html = renderToStaticMarkup(<InboxWeeklySummary weekly={available(4, 3)} />);
    expect(html).toContain("4 messages received in the last 7 days");
    expect(html).toContain("33% more (+1)");
    expect(html).toContain("Previous 7 days:");
    expect(html).toContain("not visitor analytics");
    expect(html).toContain("Independent of analytics consent");
    expect(html).toContain("including read, replied and archived messages");
    expect(html).toContain("Deleted messages are not included");
    expect(html).toContain("current page filter");
  });
  it("renders a genuine empty period as zero without an infinite percentage", () => {
    const html = renderToStaticMarkup(<InboxWeeklySummary weekly={available(0, 0)} />);
    expect(html).toContain("0 messages received in the last 7 days");
    expect(html).toContain("No messages in either period");
    expect(html).not.toMatch(/Infinity|NaN|unavailable/);
    expect(getInquiryWeeklyTrend(5, 0)).toEqual({ direction: "up", text: "5 more · previous period had 0" });
  });
  it("describes decrease, unchanged counts and small nonzero changes honestly", () => {
    expect(getInquiryWeeklyTrend(2, 4)).toEqual({ direction: "down", text: "50% fewer (−2)" });
    expect(getInquiryWeeklyTrend(0, 4)).toEqual({ direction: "down", text: "100% fewer (−4)" });
    expect(getInquiryWeeklyTrend(4, 4)).toEqual({ direction: "flat", text: "No change · 0%" });
    expect(getInquiryWeeklyTrend(1001, 1000)).toEqual({ direction: "up", text: "less than 1% more (+1)" });
  });
  it("renders absent and failed statistics as unavailable, never invented zeros", () => {
    for (const weekly of [undefined, { ...window, available: false, current7Days: null, previous7Days: null, error: "Received-message statistics are temporarily unavailable." } as const]) {
      const html = renderToStaticMarkup(<InboxWeeklySummary weekly={weekly} />);
      expect(html).toContain("Weekly message count unavailable");
      expect(html).toContain("Weekly statistics are unavailable, not zero");
      expect(html).toContain("Comparison unavailable");
      expect(html).not.toContain("0 messages received");
      expect(html).not.toContain("No messages in either period");
    }
  });
  it("exposes adjacent UTC windows with machine-readable bounds and no action controls", () => {
    const html = renderToStaticMarkup(<InboxWeeklySummary weekly={available(1, 2)} />);
    expect(html).toContain('aria-labelledby="inbox-weekly-title"');
    expect(html).toContain("Exact reporting window · UTC");
    for (const iso of Object.values(window)) expect(html).toContain(`dateTime="${iso}"`);
    expect(html).toContain("Start included, end excluded");
    expect(html).not.toMatch(/<form|<button|action=|mailto:|email@example/);
  });
});
