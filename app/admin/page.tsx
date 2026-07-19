import Link from "next/link";
import {
  FaArrowRight,
  FaCheckCircle,
  FaExclamationTriangle,
} from "react-icons/fa";
import AdminShell from "@/components/admin/AdminShell";
import { requireAdmin } from "@/lib/admin/auth";
import { getAnalyticsSummary } from "@/lib/admin/analytics";
import { getBookingInquiries } from "@/lib/admin/inquiries";
import { getSecurityEventData } from "@/lib/admin/security";
import {
  getProductionReadiness,
  type ProductionReadiness,
} from "@/lib/admin/readiness";
import { getPortfolioContent } from "@/lib/content";
import {
  getAdminModules,
  getPublicModules,
  isModuleEnabled,
} from "@/lib/content/modules";

export const metadata = {
  title: "Admin",
};

export const dynamic = "force-dynamic";

const panelClass =
  "rounded-[28px] border border-white/12 bg-white/[0.075] p-5 shadow-[0_24px_90px_rgba(0,0,0,0.38)] backdrop-blur-2xl sm:p-6";

function MiniBars({ values }: { values: number[] }) {
  const safeValues = values.length ? values : [1, 1, 1, 1, 1, 1, 1];
  const max = Math.max(...safeValues, 1);

  return (
    <div className="flex h-14 items-end gap-1.5">
      {safeValues.slice(-10).map((value, index) => (
        <span
          className="min-h-2 flex-1 rounded-full bg-gradient-to-t from-[#ff3b1f] to-white/90 opacity-85 shadow-[0_0_22px_rgba(255,59,31,0.22)]"
          key={`${value}-${index}`}
          style={{ height: `${Math.max((value / max) * 100, 12)}%` }}
        />
      ))}
    </div>
  );
}

function MetricCard({
  label,
  value,
  hint,
  values,
}: {
  label: string;
  value: number | string;
  hint: string;
  values?: number[];
}) {
  return (
    <article className="group rounded-[26px] border border-white/10 bg-white/[0.065] p-5 shadow-[0_18px_65px_rgba(0,0,0,0.26)] backdrop-blur-2xl transition duration-300 hover:-translate-y-1 hover:border-white/18 hover:bg-white/[0.095]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/42">
            {label}
          </p>
          <p className="mt-3 text-4xl font-semibold tracking-tight text-white">
            {value}
          </p>
        </div>
        <span className="h-3 w-3 rounded-full bg-[#ff3b1f] shadow-[0_0_28px_rgba(255,59,31,0.7)]" />
      </div>
      {values ? <div className="mt-5"><MiniBars values={values} /></div> : null}
      <p className="mt-4 text-sm leading-6 text-white/48">{hint}</p>
    </article>
  );
}

function ModuleCard({
  href,
  label,
  description,
}: {
  href: string;
  label: string;
  description: string;
}) {
  return (
    <Link
      className="group rounded-[26px] border border-white/10 bg-black/20 p-5 text-white transition duration-300 hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.08] hover:shadow-[0_22px_80px_rgba(0,0,0,0.34)]"
      href={href}
    >
      <span className="flex items-center justify-between gap-4">
        <span className="text-lg font-semibold">{label}</span>
        <span className="grid h-9 w-9 place-items-center rounded-2xl border border-white/10 bg-white/[0.06] text-white/55 transition group-hover:bg-white group-hover:text-black">
          <FaArrowRight aria-hidden="true" className="text-xs" />
        </span>
      </span>
      <span className="mt-3 block text-sm leading-6 text-white/48">
        {description}
      </span>
    </Link>
  );
}

function ReadinessPanel({ readiness }: { readiness: ProductionReadiness }) {
  const tone = readiness.ready
    ? "border-emerald-300/20 bg-emerald-400/[0.07]"
    : "border-amber-300/20 bg-amber-400/[0.07]";

  return (
    <section className={`${panelClass} ${tone}`} id="readiness">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/42">
            Production readiness
          </p>
          <h2 className="heading-ui mt-2 text-2xl font-semibold tracking-tight text-white">
            {readiness.ready
              ? "Ready for public traffic"
              : `${readiness.criticalFailures} production item${readiness.criticalFailures === 1 ? "" : "s"} need attention`}
          </h2>
          <p className="mt-3 text-sm leading-6 text-white/52">
            Live checks cover the public URL, database schema, media storage,
            admin access, email delivery, and rate limiting.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {readiness.ready ? (
            <FaCheckCircle className="text-2xl text-emerald-300" />
          ) : (
            <FaExclamationTriangle className="text-2xl text-amber-300" />
          )}
          <div>
            <p className="text-2xl font-semibold text-white">
              {readiness.passed}/{readiness.total}
            </p>
            <p className="text-xs text-white/45">checks passing</p>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        {readiness.checks.map((check) => (
          <Link
            className="group flex min-h-24 items-start gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 transition hover:border-white/20 hover:bg-white/[0.06]"
            href={check.href}
            key={check.id}
          >
            {check.ok ? (
              <FaCheckCircle className="mt-0.5 shrink-0 text-emerald-300" />
            ) : (
              <FaExclamationTriangle className="mt-0.5 shrink-0 text-amber-300" />
            )}
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-white">
                {check.label}
              </span>
              <span className="mt-1 block text-xs leading-5 text-white/46">
                {check.detail}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export default async function AdminDashboardPage() {
  const admin = await requireAdmin();
  const [
    content,
    analyticsResult,
    inquiriesResult,
    securityResult,
    readiness,
  ] =
    await Promise.all([
      getPortfolioContent(),
      getAnalyticsSummary(),
      getBookingInquiries(),
      getSecurityEventData(),
      getProductionReadiness(),
    ]);
  const profileType = content.settings.portfolioType;
  const adminModules = getAdminModules(profileType);
  const publicModules = getPublicModules(profileType);
  const musicEnabled = isModuleEnabled(profileType, "music");
  const dailyValues = analyticsResult.summary.daily.map(
    (day) => day.pageViews + day.outboundClicks
  );

  const stats = [
    {
      label: "Page views",
      value: analyticsResult.summary.pageViews,
      hint: "Recent portfolio traffic.",
      values: dailyValues,
    },
    {
      label: "New inquiries",
      value: inquiriesResult.summary.new,
      hint: "Fresh messages waiting in inbox.",
    },
    {
      label: "Threats 24h",
      value: securityResult.summary.total24h,
      hint: "Blocked or suspicious requests.",
    },
    {
      label: "Active modules",
      value: publicModules.length,
      hint: "Public modules enabled for this profile.",
    },
    ...(musicEnabled
      ? [
          {
            label: "Music links",
            value: content.musicPlatforms.length,
            hint: "Streaming and release destinations.",
          },
          {
            label: "SoundCloud tracks",
            value: content.soundcloudTracks.length,
            hint: "Embedded audio items.",
          },
        ]
      : [
          {
            label: "Gallery images",
            value: content.galleryImages.length,
            hint: "Published actor portfolio photos.",
          },
          {
            label: "Actor credits",
            value: content.actorCredits.length,
            hint: "Film, theatre, TV, and training credits.",
          },
        ]),
  ];

  return (
    <AdminShell
      active="dashboard"
      adminEmail={admin.email}
      description="Control content, media, analytics, security, and portfolio modes from one calm command center."
      portfolioType={profileType}
      title="Portfolio Control"
    >
      <div className="grid gap-5">
        <ReadinessPanel readiness={readiness} />

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {stats.map((stat) => (
            <MetricCard
              hint={stat.hint}
              key={stat.label}
              label={stat.label}
              value={stat.value}
              values={stat.values}
            />
          ))}
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
          <div className={panelClass}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/42">
                  Live overview
                </p>
                <h2 className="heading-ui mt-2 text-2xl font-semibold tracking-tight text-white">
                  Traffic Pulse
                </h2>
              </div>
              <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-white/45">
                Last 30 days
              </span>
            </div>
            <div className="mt-8">
              <MiniBars values={dailyValues} />
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-3xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs text-white/42">Outbound clicks</p>
                <p className="mt-2 text-2xl font-semibold text-white">
                  {analyticsResult.summary.outboundClicks}
                </p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs text-white/42">Submits</p>
                <p className="mt-2 text-2xl font-semibold text-white">
                  {analyticsResult.summary.bookingSubmits}
                </p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs text-white/42">Honeypot traps</p>
                <p className="mt-2 text-2xl font-semibold text-white">
                  {securityResult.summary.honeypot7d}
                </p>
              </div>
            </div>
          </div>

          <div className={panelClass}>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/42">
              Current Site
            </p>
            <h2 className="heading-ui mt-2 text-2xl font-semibold tracking-tight text-white">
              {content.settings.artistName}
            </h2>
            <p className="mt-3 text-sm leading-6 text-white/52">
              {content.settings.description}
            </p>
            <div className="mt-5 grid gap-3 text-sm">
              <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <span className="text-white/42">Location</span>
                <span className="truncate text-white/80">
                  {content.settings.location || "Not set"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <span className="text-white/42">Public modules</span>
                <span className="truncate text-white/80">
                  {publicModules.map((module) => module.label).join(" / ")}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <span className="text-white/42">Social links</span>
                <span className="text-white/80">{content.socialLinks.length}</span>
              </div>
            </div>
          </div>
        </section>

        <section className={panelClass}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/42">
                Workspaces
              </p>
              <h2 className="heading-ui mt-2 text-2xl font-semibold tracking-tight text-white">
                Admin Modules
              </h2>
            </div>
            <span className="text-sm text-white/45">
              {adminModules.length} active tools
            </span>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {adminModules.map((module) => (
              <ModuleCard
                description={module.description}
                href={module.href}
                key={module.key}
                label={module.label}
              />
            ))}
          </div>
        </section>
      </div>
    </AdminShell>
  );
}
