import {
  FaChartLine,
  FaCheckCircle,
  FaExclamationTriangle,
} from "react-icons/fa";
import { InsightsDashboard } from "@/components/admin/AnalyticsDashboard";
import {
  ANALYTICS_RANGE_DAYS,
  getAnalyticsSummary,
  type AnalyticsRangeDays,
} from "@/lib/admin/analytics";
import { requireAdmin } from "@/lib/admin/auth";

export const metadata = { title: "Insights | Admin V2" };
export const dynamic = "force-dynamic";

export default async function AdminV2InsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const requestedRange = Number(params.range);
  const rangeDays = ANALYTICS_RANGE_DAYS.includes(
    requestedRange as AnalyticsRangeDays
  )
    ? (requestedRange as AnalyticsRangeDays)
    : 30;
  const analyticsResult = await getAnalyticsSummary({ rangeDays });
  const analyticsAvailable =
    analyticsResult.isConfigured && !analyticsResult.loadError;

  return (
    <div className="grid min-w-0 gap-4">
      <header className="relative min-w-0 overflow-hidden rounded-[26px] border border-white/9 bg-[radial-gradient(circle_at_88%_8%,rgba(255,59,31,0.18),transparent_34%),#0d0d0f] p-5 shadow-[0_22px_80px_rgba(0,0,0,0.34)] sm:p-6 lg:p-7">
        <div className="relative flex flex-col gap-6 2xl:flex-row 2xl:items-end 2xl:justify-between">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/34">
                Admin V2 · Performance
              </span>
              <span className="h-1 w-1 rounded-full bg-[#ff3b1f]" />
              <span
                className={`inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] ${
                  analyticsAvailable
                    ? "text-emerald-200/65"
                    : "text-amber-200/70"
                }`}
              >
                {analyticsAvailable ? (
                  <FaCheckCircle />
                ) : (
                  <FaExclamationTriangle />
                )}
                {analyticsAvailable ? "Analytics connected" : "Data unavailable"}
              </span>
            </div>
            <h1 className="heading-ui mt-3 text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl">
              Insights
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/48">
              See what visitors open, where they engage, and which contact
              actions succeed. Counts stay privacy-safe; messages themselves
              belong in the separate Inbox workspace.
            </p>
          </div>

          <div className="min-w-0 rounded-2xl border border-white/9 bg-black/24 p-4 2xl:w-[280px]">
            <FaChartLine className="text-[#ff664f]" />
            <p className="mt-3 text-lg font-semibold text-white">
              {analyticsAvailable
                ? analyticsResult.summary.lastEventAt
                  ? "Activity is flowing"
                  : "Ready for first visit"
                : "Check data connection"}
            </p>
            <p className="mt-1 text-[10px] leading-4 text-white/38">
              Reporting uses anonymous 30-minute sessions and coarse device,
              browser, and referral groups.
            </p>
          </div>
        </div>
      </header>

      <InsightsDashboard
        analytics={analyticsResult.summary}
        analyticsAvailable={analyticsAvailable}
        analyticsConfigured={analyticsResult.isConfigured}
        analyticsError={analyticsResult.loadError}
      />
    </div>
  );
}
