import Link from "next/link";
import {
  FaArrowDown,
  FaArrowRight,
  FaArrowUp,
  FaChartLine,
  FaCheckCircle,
  FaExclamationTriangle,
  FaExternalLinkAlt,
  FaEye,
  FaEyeSlash,
  FaShieldAlt,
} from "react-icons/fa";
import AdminShell from "@/components/admin/AdminShell";
import { requireAdmin } from "@/lib/admin/auth";
import {
  getAnalyticsPageLabel,
  getAnalyticsSummary,
} from "@/lib/admin/analytics";
import { getBookingInquiries } from "@/lib/admin/inquiries";
import { getSecurityEventData } from "@/lib/admin/security";
import {
  getProductionReadiness,
  type ProductionReadiness,
} from "@/lib/admin/readiness";
import { getPortfolioContent } from "@/lib/content";
import { getProfilePublicModules } from "@/lib/content/modules";

export const metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

const panelClass =
  "rounded-[22px] border border-white/9 bg-[#0f0f11]/92 p-4 shadow-[0_18px_65px_rgba(0,0,0,0.24)] sm:p-5";
const labelClass =
  "text-[11px] font-semibold uppercase tracking-[0.16em] text-white/44";

function formatNumber(value: number) {
  return new Intl.NumberFormat("en", {
    notation: value >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

function getChange(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

function getEditorHref(key: string) {
  if (key === "gallery") return "/admin/media?view=studio";
  if (key === "video" || key === "showreel") return "/admin/media?view=showreel";
  if (key === "music") return "/admin/content#music-links";
  if (key === "contact") return "/admin/content#booking";
  return `/admin/content#${key}`;
}

function MetricCard({
  available = true,
  current,
  description,
  label,
  previous,
  value,
}: {
  available?: boolean;
  current?: number;
  description: string;
  label: string;
  previous?: number;
  value: number | string;
}) {
  const change =
    available && typeof current === "number" && typeof previous === "number"
      ? getChange(current, previous)
      : undefined;

  return (
    <article className="rounded-[18px] border border-white/9 bg-[#101012]/92 p-4">
      <p className={labelClass}>{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-white">
        {available ? value : "—"}
      </p>
      <div className="mt-2 min-h-5">
        {!available ? (
          <span className="text-[10px] text-amber-100/55">Source unavailable</span>
        ) : change === null ? (
          <span className="text-[10px] text-white/38">New activity · {description}</span>
        ) : typeof change === "number" ? (
          <span className={`inline-flex items-center gap-1 text-[10px] ${change > 0 ? "text-emerald-200/64" : change < 0 ? "text-amber-200/64" : "text-white/36"}`}>
            {change > 0 ? <FaArrowUp /> : change < 0 ? <FaArrowDown /> : null}
            {Math.abs(change).toFixed(0)}% vs previous 7d
          </span>
        ) : (
          <span className="text-[10px] text-white/36">{description}</span>
        )}
      </div>
    </article>
  );
}

function TrafficBars({ daily }: { daily: Awaited<ReturnType<typeof getAnalyticsSummary>>["summary"]["daily"] }) {
  const max = Math.max(...daily.map((day) => Math.max(day.pageViews, day.outboundClicks)), 1);
  const hasActivity = daily.some((day) => day.pageViews || day.outboundClicks);
  if (!hasActivity) {
    return (
      <div className="grid h-40 place-items-center rounded-[18px] border border-dashed border-white/10 text-center">
        <div><FaChartLine className="mx-auto text-lg text-white/20" /><p className="mt-2 text-xs text-white/34">Connected and waiting for the first public visit</p></div>
      </div>
    );
  }
  return (
    <div className="grid h-40 items-end gap-1 border-b border-white/8" style={{ gridTemplateColumns: `repeat(${daily.length}, minmax(4px, 1fr))` }}>
      {daily.map((day) => (
        <div className="group relative flex h-full items-end justify-center gap-px" key={day.label} title={`${day.label}: ${day.pageViews} views, ${day.outboundClicks} clicks`}>
          <span className="w-[46%] rounded-t-sm bg-white/68" style={{ height: `${(day.pageViews / max) * 100}%` }} />
          <span className="w-[46%] rounded-t-sm bg-[#ff4d2e]/80" style={{ height: `${(day.outboundClicks / max) * 100}%` }} />
        </div>
      ))}
    </div>
  );
}

function ReadinessPanel({ readiness }: { readiness: ProductionReadiness }) {
  const critical = readiness.checks.filter((check) => check.critical);
  const failed = critical.filter((check) => !check.ok);
  const passed = critical.length - failed.length;
  const percentage = critical.length ? Math.round((passed / critical.length) * 100) : 0;

  return (
    <section className={panelClass}>
      <div className="flex items-start justify-between gap-4">
        <div><p className={labelClass}>Production readiness</p><h2 className="heading-ui mt-2 text-xl font-semibold text-white">{readiness.ready ? "Ready for visitors" : "Action required"}</h2><p className="mt-2 text-sm text-white/42">{passed} of {critical.length} critical live checks pass.</p></div>
        <span className={`text-2xl ${readiness.ready ? "text-emerald-300" : "text-amber-300"}`}>{percentage}%</span>
      </div>
      <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-white/[0.06]"><div className={readiness.ready ? "h-full rounded-full bg-emerald-300/78" : "h-full rounded-full bg-amber-300/78"} style={{ width: `${percentage}%` }} /></div>
      {failed.length ? (
        <div className="mt-4 grid gap-2">
          {failed.slice(0, 3).map((check) => <Link className="flex items-center justify-between gap-3 rounded-xl border border-amber-300/12 bg-amber-400/[0.045] px-3 py-2.5 text-xs text-amber-100/68 transition hover:bg-amber-400/[0.08]" href={check.href} key={check.id}><span className="truncate">{check.label}</span><FaArrowRight /></Link>)}
          {failed.length > 3 ? <Link className="text-center text-[10px] font-semibold text-white/38 hover:text-white" href="/admin/security#health">+ {failed.length - 3} more critical checks</Link> : null}
        </div>
      ) : <p className="mt-4 text-xs text-emerald-100/52">URL, database, storage, access, email, and rate limits are verified.</p>}
    </section>
  );
}

export default async function AdminDashboardPage() {
  const admin = await requireAdmin();
  const [content, analyticsResult, inquiriesResult, securityResult, readiness] = await Promise.all([
    getPortfolioContent(),
    getAnalyticsSummary({ rangeDays: 30 }),
    getBookingInquiries({ page: 1 }),
    getSecurityEventData(),
    getProductionReadiness(),
  ]);
  const profileType = content.settings.portfolioType;
  const publicModules = getProfilePublicModules(profileType);
  const hiddenNavPageSlugs = new Set(content.settings.hiddenNavPageSlugs);
  const analyticsAvailable = analyticsResult.isConfigured && !analyticsResult.loadError;
  const inquiriesAvailable = inquiriesResult.isConfigured && !inquiriesResult.loadError;
  const securityAvailable = securityResult.isConfigured && !securityResult.loadError;
  const current = analyticsResult.summary.current7Days;
  const previous = analyticsResult.summary.previous7Days;
  const criticalChecks = readiness.checks.filter((check) => check.critical);
  const criticalFailures = criticalChecks.filter((check) => !check.ok);
  const readinessScore = criticalChecks.length ? Math.round(((criticalChecks.length - criticalFailures.length) / criticalChecks.length) * 100) : 0;
  const attention = [
    ...(!analyticsAvailable ? [{ label: "Analytics data is unavailable", detail: "Traffic values are hidden until the source recovers.", href: "/admin/analytics#health", tone: "warning" }] : []),
    ...(!inquiriesAvailable ? [{ label: "Inquiry database is unavailable", detail: "Inbox totals cannot be verified.", href: "/admin/analytics#inquiries", tone: "warning" }] : []),
    ...(!securityAvailable ? [{ label: "Protection monitoring is unavailable", detail: "Security event counters cannot be verified.", href: "/admin/security", tone: "warning" }] : []),
    ...(inquiriesAvailable && inquiriesResult.summary.new ? [{ label: `${inquiriesResult.summary.new} new ${inquiriesResult.summary.new === 1 ? "inquiry" : "inquiries"}`, detail: "A response may be waiting in your Inbox.", href: "/admin/analytics#inquiries", tone: "info" }] : []),
    ...criticalFailures.slice(0, 3).map((check) => ({ label: check.label, detail: check.detail, href: check.href, tone: "warning" })),
  ];

  return (
    <AdminShell active="dashboard" adminEmail={admin.email} description="See what needs attention, check visitor activity, and jump directly to the public page you want to edit." hiddenNavPageSlugs={content.settings.hiddenNavPageSlugs} portfolioType={profileType} title="Portfolio overview">
      <div className="grid gap-4">
        <section className={panelClass}>
          <div className="flex items-start justify-between gap-4"><div><p className={labelClass}>Needs attention</p><h2 className="heading-ui mt-2 text-xl font-semibold text-white">{attention.length ? `${attention.length} ${attention.length === 1 ? "item" : "items"} to review` : "Everything important looks calm"}</h2><p className="mt-2 text-sm text-white/42">Only actionable or unverifiable states appear here.</p></div>{attention.length ? <FaExclamationTriangle className="text-lg text-amber-300" /> : <FaCheckCircle className="text-lg text-emerald-300" />}</div>
          {attention.length ? <div className="mt-4 grid gap-2 lg:grid-cols-2">{attention.map((item, index) => <Link className="flex items-center justify-between gap-3 rounded-[16px] border border-white/8 bg-black/22 px-3.5 py-3 transition hover:border-white/16 hover:bg-white/[0.045]" href={item.href} key={`${item.label}-${index}`}><div className="min-w-0"><p className="truncate text-sm font-semibold text-white/76">{item.label}</p><p className="mt-1 truncate text-[11px] text-white/34">{item.detail}</p></div><FaArrowRight className="shrink-0 text-[9px] text-white/32" /></Link>)}</div> : null}
        </section>

        <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <MetricCard available={analyticsAvailable} current={current.pageViews} description="Last 7 days" label="Page views" previous={previous.pageViews} value={formatNumber(current.pageViews)} />
          <MetricCard available={analyticsAvailable} current={current.outboundClicks} description="Last 7 days" label="Outbound clicks" previous={previous.outboundClicks} value={formatNumber(current.outboundClicks)} />
          <MetricCard available={inquiriesAvailable} description="Waiting for review" label="New inquiries" value={inquiriesResult.summary.new} />
          <MetricCard description={`${criticalChecks.length - criticalFailures.length}/${criticalChecks.length} critical checks`} label="Production readiness" value={`${readinessScore}%`} />
        </section>

        <section className={panelClass}>
          <div><p className={labelClass}>Portfolio status</p><h2 className="heading-ui mt-2 text-xl font-semibold text-white">Pages and navbar visibility</h2><p className="mt-2 text-sm text-white/42">Every profile page stays editable even when its navbar link is hidden.</p></div>
          <div className="mt-5 divide-y divide-white/7 rounded-[18px] border border-white/8 bg-black/18">
            {publicModules.map((module, index) => {
              const visible = !module.pageSlug || !hiddenNavPageSlugs.has(module.pageSlug);
              return <article className="flex flex-wrap items-center gap-3 px-3.5 py-3" key={`${module.key}-${module.href}`}><span className="font-mono text-[9px] text-white/24">{String(index + 1).padStart(2, "0")}</span><div className="min-w-[130px] flex-1"><p className="text-sm font-semibold text-white/76">{module.label}</p><p className="mt-0.5 truncate text-[10px] text-white/32">{module.description}</p></div><span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[9px] ${visible ? "border-emerald-300/14 bg-emerald-400/[0.06] text-emerald-100/68" : "border-white/9 bg-white/[0.035] text-white/38"}`}>{visible ? <FaEye /> : <FaEyeSlash />}{visible ? "In navbar" : "Hidden"}</span><Link className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-white/9 px-3 text-[10px] font-semibold text-white/56 transition hover:bg-white hover:text-black" href={getEditorHref(module.key)}>Edit <FaArrowRight /></Link><Link aria-label={`Open ${module.label} on public site`} className="grid h-9 w-9 place-items-center rounded-xl border border-white/9 text-[10px] text-white/42 transition hover:bg-white hover:text-black" href={module.href} rel="noreferrer" target="_blank"><FaExternalLinkAlt /></Link></article>;
            })}
          </div>
        </section>

        <section className="grid gap-4 2xl:grid-cols-[1.35fr_0.65fr]">
          <div className={panelClass}>
            <div className="flex items-start justify-between gap-3"><div><p className={labelClass}>Visitor activity</p><h2 className="heading-ui mt-2 text-xl font-semibold text-white">30-day traffic pulse</h2><p className="mt-2 text-sm text-white/40">White is page views; orange is outbound intent.</p></div><Link className="inline-flex items-center gap-2 text-xs font-semibold text-white/48 hover:text-white" href="/admin/analytics">Full insights <FaArrowRight /></Link></div>
            <div className="mt-6">{analyticsAvailable ? <TrafficBars daily={analyticsResult.summary.daily} /> : <div className="grid min-h-40 place-items-center rounded-[18px] border border-dashed border-amber-300/16 text-center"><div><FaExclamationTriangle className="mx-auto text-amber-200" /><p className="mt-2 text-xs text-amber-100/55">Analytics source unavailable</p></div></div>}</div>
            {analyticsAvailable && analyticsResult.summary.recentEvents.length ? <div className="mt-5 border-t border-white/7 pt-4"><p className={labelClass}>Latest visitor activity</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{analyticsResult.summary.recentEvents.slice(0, 4).map((event) => <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-2.5" key={event.id}><div className="flex items-center justify-between gap-2"><span className="truncate text-xs font-semibold text-white/62">{getAnalyticsPageLabel(event.pagePath)}</span><span className="shrink-0 text-[9px] text-white/26">{formatDate(event.createdAt)}</span></div><p className="mt-1 truncate text-[10px] text-white/30">{event.eventName.replaceAll("_", " ")}{event.targetLabel ? ` · ${event.targetLabel}` : ""}</p></div>)}</div></div> : null}
          </div>
          <div className="grid gap-4"><ReadinessPanel readiness={readiness} /><section className={panelClass}><div className="flex items-start justify-between gap-3"><div><p className={labelClass}>System snapshot</p><h2 className="heading-ui mt-2 text-xl font-semibold text-white">Live sources</h2></div><FaShieldAlt className={securityAvailable ? "text-emerald-200" : "text-amber-200"} /></div><div className="mt-5 grid gap-2"><div className="flex items-center justify-between rounded-xl border border-white/8 bg-black/22 px-3 py-2.5 text-xs"><span className="text-white/46">Analytics</span><span className={analyticsAvailable ? "text-emerald-200" : "text-amber-200"}>{analyticsAvailable ? "Available" : "Unavailable"}</span></div><div className="flex items-center justify-between rounded-xl border border-white/8 bg-black/22 px-3 py-2.5 text-xs"><span className="text-white/46">Inbox</span><span className={inquiriesAvailable ? "text-emerald-200" : "text-amber-200"}>{inquiriesAvailable ? "Available" : "Unavailable"}</span></div><div className="flex items-center justify-between rounded-xl border border-white/8 bg-black/22 px-3 py-2.5 text-xs"><span className="text-white/46">Protection events · 7d</span><span className={securityAvailable ? "text-white/72" : "text-amber-200"}>{securityAvailable ? securityResult.summary.total7d : "—"}</span></div></div><Link className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-white/9 text-xs font-semibold text-white/56 transition hover:bg-white hover:text-black" href="/admin/security">Open security center <FaArrowRight /></Link></section></div>
        </section>
      </div>
    </AdminShell>
  );
}
