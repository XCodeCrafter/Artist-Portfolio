import AdminShell from "@/components/admin/AdminShell";
import AnalyticsDashboard from "@/components/admin/AnalyticsDashboard";
import { requireAdmin } from "@/lib/admin/auth";
import { getAnalyticsSummary } from "@/lib/admin/analytics";
import { getBookingInquiries } from "@/lib/admin/inquiries";

export const metadata = {
  title: "Admin Analytics",
};

export const dynamic = "force-dynamic";

export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const admin = await requireAdmin();
  const params = await searchParams;
  const [analyticsResult, inquiriesResult] = await Promise.all([
    getAnalyticsSummary(),
    getBookingInquiries(),
  ]);

  return (
    <AdminShell
      active="analytics"
      adminEmail={admin.email}
      description="Track traffic, outbound clicks, conversion events, and incoming collaboration or booking messages."
      title="Analytics"
    >
      <AnalyticsDashboard
        analytics={analyticsResult.summary}
        analyticsError={analyticsResult.loadError}
        inquiries={inquiriesResult.inquiries}
        inquiriesError={inquiriesResult.loadError}
        inquirySummary={inquiriesResult.summary}
        isConfigured={
          analyticsResult.isConfigured && inquiriesResult.isConfigured
        }
        status={params.status}
      />
    </AdminShell>
  );
}
