import {
  FaCheckCircle,
  FaExclamationTriangle,
  FaShieldAlt,
  FaUserAlt,
} from "react-icons/fa";
import SecurityCenter from "@/components/admin/SecurityCenter";
import { requireAdmin } from "@/lib/admin/auth";
import { getSecurityCenterData } from "@/lib/admin/security";

export const metadata = { title: "Security & Access | Admin V2" };
export const dynamic = "force-dynamic";

export default async function AdminV2SecurityPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const admin = await requireAdmin();
  const params = await searchParams;
  const security = await getSecurityCenterData(admin);
  const attentionCount = security.checks.filter(
    (check) => check.verification !== "implemented" && !check.ok
  ).length;
  const activeAdminCount = security.profiles.filter(
    (profile) => profile.isActive
  ).length;
  const healthy =
    security.isConfigured && !security.loadError && attentionCount === 0;

  return (
    <div className="grid min-w-0 gap-4">
      <header className="relative min-w-0 overflow-hidden rounded-[26px] border border-white/9 bg-[radial-gradient(circle_at_88%_8%,rgba(255,59,31,0.18),transparent_34%),#0d0d0f] p-5 shadow-[0_22px_80px_rgba(0,0,0,0.34)] sm:p-6 lg:p-7">
        <div className="relative flex flex-col gap-6 2xl:flex-row 2xl:items-end 2xl:justify-between">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/34">
                Admin V2 · Settings
              </span>
              <span className="h-1 w-1 rounded-full bg-[#ff3b1f]" />
              <span
                className={`inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] ${
                  healthy ? "text-emerald-200/65" : "text-amber-200/70"
                }`}
              >
                {healthy ? <FaCheckCircle /> : <FaExclamationTriangle />}
                {healthy ? "Protection healthy" : "Review recommended"}
              </span>
            </div>
            <h1 className="heading-ui mt-3 text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl">
              Security &amp; access
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/48">
              See whether protection is healthy, who can enter the dashboard,
              and what needs attention. Start with Overview; technical checks
              stay out of the way under Advanced.
            </p>
          </div>

          <div className="grid min-w-0 gap-2 sm:grid-cols-3 2xl:w-[540px]">
            <div className="min-w-0 rounded-2xl border border-white/9 bg-black/24 p-3.5">
              <FaShieldAlt className="text-[#ff664f]" />
              <p className="mt-3 text-lg font-semibold tabular-nums text-white">
                {attentionCount}
              </p>
              <p className="mt-1 text-[10px] leading-4 text-white/38">
                live checks need attention
              </p>
            </div>
            <div className="min-w-0 rounded-2xl border border-white/9 bg-black/24 p-3.5">
              <FaUserAlt className="text-white/56" />
              <p className="mt-3 text-lg font-semibold tabular-nums text-white">
                {activeAdminCount}
              </p>
              <p className="mt-1 text-[10px] leading-4 text-white/38">
                active admin profiles
              </p>
            </div>
            <div className="min-w-0 rounded-2xl border border-white/9 bg-black/24 p-3.5">
              <FaShieldAlt className="text-white/56" />
              <p className="mt-3 text-lg font-semibold tabular-nums text-white">
                {security.securitySummary.total7d}
              </p>
              <p className="mt-1 text-[10px] leading-4 text-white/38">
                signals recorded in 7 days
              </p>
            </div>
          </div>
        </div>
      </header>

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
        surface="v2"
      />
    </div>
  );
}
