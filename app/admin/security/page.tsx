import AdminShell from "@/components/admin/AdminShell";
import SecurityCenter from "@/components/admin/SecurityCenter";
import { requireAdmin } from "@/lib/admin/auth";
import { getSecurityCenterData } from "@/lib/admin/security";
import { getPortfolioContent } from "@/lib/content";

export const metadata = {
  title: "Admin Security",
};

export const dynamic = "force-dynamic";

export default async function AdminSecurityPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const admin = await requireAdmin();
  const params = await searchParams;
  const [security, content] = await Promise.all([
    getSecurityCenterData(admin),
    getPortfolioContent(),
  ]);

  return (
    <AdminShell
      active="security"
      adminEmail={admin.email}
      description="See whether protection is healthy, what the guards stopped, and who can access the portfolio."
      hiddenNavPageSlugs={content.settings.hiddenNavPageSlugs}
      portfolioType={content.settings.portfolioType}
      title="Security center"
    >
      <SecurityCenter
        allowedEmails={security.allowedEmails}
        auditLogs={security.auditLogs}
        canManageAdmins={security.canManageAdmins}
        checks={security.checks}
        currentAdminId={admin.id}
        isConfigured={security.isConfigured}
        loadError={security.loadError}
        profiles={security.profiles}
        securitySummary={security.securitySummary}
        status={params.status}
      />
    </AdminShell>
  );
}
