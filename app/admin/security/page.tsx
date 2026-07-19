import AdminShell from "@/components/admin/AdminShell";
import SecurityCenter from "@/components/admin/SecurityCenter";
import { requireAdmin } from "@/lib/admin/auth";
import { getSecurityCenterData } from "@/lib/admin/security";

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
  const security = await getSecurityCenterData(admin);

  return (
    <AdminShell
      active="security"
      adminEmail={admin.email}
      description="Review login controls, admin allowlist, audit trail, honeypots, rate limits, and blocked activity counters."
      title="Security Center"
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
