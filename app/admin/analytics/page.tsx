import AdminShell from "@/components/admin/AdminShell";
import AnalyticsDashboard from "@/components/admin/AnalyticsDashboard";
import { requireAdmin } from "@/lib/admin/auth";
import {
  ANALYTICS_RANGE_DAYS,
  getAnalyticsSummary,
  type AnalyticsRangeDays,
} from "@/lib/admin/analytics";
import { getBookingInquiries } from "@/lib/admin/inquiries";
import { getPortfolioContent } from "@/lib/content";

export const metadata = {
  title: "Admin Analytics",
};

export const dynamic = "force-dynamic";

export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{
    inquiryPage?: string;
    range?: string;
    status?: string;
  }>;
}) {
  const admin = await requireAdmin();
  const params = await searchParams;
  const requestedRange = Number(params.range);
  const rangeDays = ANALYTICS_RANGE_DAYS.includes(
    requestedRange as AnalyticsRangeDays
  )
    ? (requestedRange as AnalyticsRangeDays)
    : 30;
  const inquiryPage = Math.max(1, Number.parseInt(params.inquiryPage || "1", 10) || 1);
  const [analyticsResult, inquiriesResult, content] = await Promise.all([
    getAnalyticsSummary({ rangeDays }),
    getBookingInquiries({ page: inquiryPage }),
    getPortfolioContent(),
  ]);

  return (
    <AdminShell
      active="analytics"
      adminEmail={admin.email}
      description="Understand visitor trends, page performance, contact activity, and incoming collaboration or booking messages."
      hiddenNavPageSlugs={content.settings.hiddenNavPageSlugs}
      portfolioType={content.settings.portfolioType}
      title="Insights"
    >
      <AnalyticsDashboard
        analytics={analyticsResult.summary}
        analyticsAvailable={
          analyticsResult.isConfigured && !analyticsResult.loadError
        }
        analyticsConfigured={analyticsResult.isConfigured}
        analyticsError={analyticsResult.loadError}
        inquiries={inquiriesResult.inquiries}
        inquiriesAvailable={
          inquiriesResult.isConfigured && !inquiriesResult.loadError
        }
        inquiriesConfigured={inquiriesResult.isConfigured}
        inquiriesError={inquiriesResult.loadError}
        inquiryPagination={inquiriesResult.pagination}
        inquirySummary={inquiriesResult.summary}
        status={params.status}
      />
    </AdminShell>
  );
}
