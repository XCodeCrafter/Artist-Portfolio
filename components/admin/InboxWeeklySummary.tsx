import { FaArrowDown, FaArrowUp, FaEnvelope, FaMinus } from "react-icons/fa";
import type { InquiryWeeklySummary } from "@/lib/admin/inquiries";

const number = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });
const timestamp = new Intl.DateTimeFormat("en", {
  dateStyle: "medium", timeStyle: "short", timeZone: "UTC",
});

export function getInquiryWeeklyTrend(current: number, previous: number) {
  const difference = current - previous;
  if (previous === 0) return {
    direction: difference === 0 ? "flat" : "up",
    text: difference === 0 ? "No messages in either period" : `${number.format(difference)} more · previous period had 0`,
  } as const;
  if (difference === 0) return { direction: "flat", text: "No change · 0%" } as const;
  const percent = (Math.abs(difference) / previous) * 100;
  const percentLabel = percent < 1 ? "less than 1%" : `${number.format(percent)}%`;
  return {
    direction: difference > 0 ? "up" : "down",
    text: `${percentLabel} ${difference > 0 ? "more" : "fewer"} (${difference > 0 ? "+" : "−"}${number.format(Math.abs(difference))})`,
  } as const;
}

export default function InboxWeeklySummary({ weekly }: { weekly?: InquiryWeeklySummary }) {
  const trend = weekly?.available ? getInquiryWeeklyTrend(weekly.current7Days, weekly.previous7Days) : null;
  const Icon = trend?.direction === "up" ? FaArrowUp : trend?.direction === "down" ? FaArrowDown : FaMinus;
  return (
    <section aria-labelledby="inbox-weekly-title" className="grid min-w-0 gap-5 rounded-[22px] border border-white/9 bg-[radial-gradient(circle_at_92%_12%,rgba(255,59,31,0.10),transparent_45%),#101012] p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/38">Inbox activity · not visitor analytics</p>
        <h2 className="heading-ui mt-2 flex items-center gap-2 text-xl font-semibold text-white" id="inbox-weekly-title"><FaEnvelope aria-hidden="true" className="text-sm text-[#ff806c]" />Received · last 7 days</h2>
        <p className="mt-2 max-w-2xl text-xs leading-5 text-white/42">All stored messages received during the last 7 × 24 hours, including read, replied and archived messages. Independent of analytics consent and the current page filter; this is not the “New” status count. Deleted messages are not included.</p>
        {weekly?.available ? (
          <details className="mt-3 text-[10px] leading-5 text-white/38">
            <summary className="w-fit cursor-pointer rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/60">Exact reporting window · UTC</summary>
            <p className="mt-2">Current: <time dateTime={weekly.currentStart}>{timestamp.format(new Date(weekly.currentStart))}</time> to <time dateTime={weekly.asOf}>{timestamp.format(new Date(weekly.asOf))}</time>.</p>
            <p>Previous: <time dateTime={weekly.previousStart}>{timestamp.format(new Date(weekly.previousStart))}</time> to <time dateTime={weekly.currentStart}>{timestamp.format(new Date(weekly.currentStart))}</time>.</p>
            <p>Start included, end excluded. Snapshot taken when this page loaded.</p>
          </details>
        ) : <p className="mt-3 text-xs leading-5 text-amber-100/70" role="status">Weekly statistics are unavailable, not zero. This does not prevent using the Inbox when its messages are available.</p>}
      </div>
      <div className="min-w-0 rounded-2xl border border-white/9 bg-black/20 p-4 lg:min-w-[230px]">
        <p className="text-4xl font-semibold tabular-nums tracking-[-0.05em] text-white" aria-label={weekly?.available ? `${weekly.current7Days} messages received in the last 7 days` : "Weekly message count unavailable"}>{weekly?.available ? number.format(weekly.current7Days) : "—"}</p>
        <p className="mt-2 text-xs text-white/44">Previous 7 days: <span className="font-semibold tabular-nums text-white/70">{weekly?.available ? number.format(weekly.previous7Days) : "—"}</span></p>
        {trend ? <p className="mt-3 inline-flex items-center gap-2 rounded-lg border border-white/9 px-2 py-1.5 text-[11px] leading-4 text-white/65"><Icon aria-hidden="true" className="shrink-0 text-[9px]" /><span>{trend.text}</span></p> : <p className="mt-3 text-[11px] text-white/35">Comparison unavailable</p>}
      </div>
    </section>
  );
}
