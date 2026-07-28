import Image from "next/image";
import Link from "next/link";
import {
  FaArrowDown,
  FaArrowRight,
  FaArrowUp,
  FaChartLine,
  FaCheckCircle,
  FaExclamationTriangle,
  FaExternalLinkAlt,
  FaImages,
  FaShieldAlt,
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
import { getPublicModules } from "@/lib/content/modules";
import type { HeroContent } from "@/lib/content/types";

export const metadata = {
  title: "Admin",
};

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

function getChange(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

function getEditorHref(key: string) {
  if (key === "gallery") return "/admin/media?view=studio";
  if (key === "video" || key === "showreel") {
    return "/admin/media?view=showreel";
  }
  if (key === "music") return "/admin/content#music-links";
  if (key === "contact") return "/admin/content#booking";
  return `/admin/content#${key}`;
}

function MetricCard({
  current,
  description,
  label,
  previous,
  value,
}: {
  current?: number;
  description: string;
  label: string;
  previous?: number;
  value: number | string;
}) {
  const change =
    typeof current === "number" && typeof previous === "number"
      ? getChange(current, previous)
      : undefined;

  return (
    <article className="rounded-[20px] border border-white/9 bg-[#101012]/92 p-4">
      <p className={labelClass}>{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-white">
        {value}
      </p>
      <div className="mt-2 flex min-h-5 items-center gap-2">
        {change === null ? (
          <span className="text-[10px] text-white/38">New activity</span>
        ) : typeof change === "number" ? (
          <span
            className={`inline-flex items-center gap-1 text-[10px] ${
              change > 0
                ? "text-emerald-200/64"
                : change < 0
                  ? "text-amber-200/64"
                  : "text-white/36"
            }`}
          >
            {change > 0 ? (
              <FaArrowUp className="text-[8px]" />
            ) : change < 0 ? (
              <FaArrowDown className="text-[8px]" />
            ) : null}
            {Math.abs(change).toFixed(0)}% vs previous 7d
          </span>
        ) : (
          <span className="text-[10px] text-white/36">{description}</span>
        )}
      </div>
      {typeof change === "number" || change === null ? (
        <p className="mt-1 text-[10px] text-white/28">{description}</p>
      ) : null}
    </article>
  );
}

function PageCard({
  description,
  editHref,
  hero,
  index,
  label,
  publicHref,
}: {
  description: string;
  editHref: string;
  hero?: HeroContent;
  index: number;
  label: string;
  publicHref: string;
}) {
  const imageSrc =
    hero?.mediaType === "video"
      ? hero.posterSrc || "/images/video-hero.jpg"
      : hero?.backgroundSrc || "/images/hero.jpg";

  return (
    <article className="group overflow-hidden rounded-[20px] border border-white/9 bg-black/24 transition hover:-translate-y-0.5 hover:border-white/16">
      <div className="relative aspect-[4/3] overflow-hidden bg-[#131315]">
        <Image
          alt=""
          className="object-cover opacity-72 transition duration-500 group-hover:scale-[1.03] group-hover:opacity-90"
          fill
          sizes="(min-width: 1280px) 20vw, (min-width: 640px) 40vw, 100vw"
          src={imageSrc}
          unoptimized={imageSrc.startsWith("https://")}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/18 to-black/22" />
        <div className="absolute inset-x-0 bottom-0 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-[9px] text-white/42">
                {String(index + 1).padStart(2, "0")} / PAGE
              </p>
              <h3 className="heading-ui mt-1 truncate text-lg font-semibold text-white">
                {label}
              </h3>
            </div>
            <span className="h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,0.55)]" />
          </div>
        </div>
      </div>
      <div className="p-3.5">
        <p className="line-clamp-2 min-h-9 text-xs leading-5 text-white/38">
          {description}
        </p>
        <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
          <Link
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-white px-3 text-xs font-semibold text-black transition hover:bg-white/84"
            href={editHref}
          >
            Edit page
            <FaArrowRight className="text-[9px]" />
          </Link>
          <Link
            aria-label={`Open ${label} on the live site`}
            className="grid h-10 w-10 place-items-center rounded-xl border border-white/9 bg-white/[0.04] text-[10px] text-white/52 transition hover:bg-white hover:text-black"
            href={publicHref}
            rel="noreferrer"
            target="_blank"
          >
            <FaExternalLinkAlt />
          </Link>
        </div>
      </div>
    </article>
  );
}

function TrafficBars({
  daily,
}: {
  daily: Array<{
    label: string;
    pageViews: number;
    outboundClicks: number;
    bookingSubmits: number;
  }>;
}) {
  const max = Math.max(
    ...daily.map((day) => Math.max(day.pageViews, day.outboundClicks)),
    1
  );
  const hasActivity = daily.some(
    (day) => day.pageViews > 0 || day.outboundClicks > 0
  );

  if (!hasActivity) {
    return (
      <div className="grid h-44 place-items-center rounded-[18px] border border-dashed border-white/10 text-center">
        <div>
          <FaChartLine className="mx-auto text-lg text-white/20" />
          <p className="mt-2 text-xs text-white/34">
            Waiting for the first public visit
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="grid h-44 items-end gap-1 border-b border-white/8"
      style={{
        gridTemplateColumns: `repeat(${daily.length}, minmax(5px, 1fr))`,
      }}
    >
      {daily.map((day) => (
        <div
          className="group relative flex h-full items-end justify-center gap-px"
          key={day.label}
          title={`${day.label}: ${day.pageViews} views, ${day.outboundClicks} clicks`}
        >
          <span
            className="w-[46%] rounded-t-sm bg-white/68 transition group-hover:bg-white"
            style={{ height: `${(day.pageViews / max) * 100}%` }}
          />
          <span
            className="w-[46%] rounded-t-sm bg-[#ff4d2e]/80 transition group-hover:bg-[#ff6b52]"
            style={{ height: `${(day.outboundClicks / max) * 100}%` }}
          />
          {day.bookingSubmits > 0 ? (
            <span className="absolute right-0 top-2 h-1.5 w-1.5 rounded-full bg-emerald-300" />
          ) : null}
        </div>
      ))}
    </div>
  );
}

function ReadinessPanel({ readiness }: { readiness: ProductionReadiness }) {
  const failed = readiness.checks.filter((check) => !check.ok);

  return (
    <section className={panelClass}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className={labelClass}>Production health</p>
          <h2 className="heading-ui mt-2 text-xl font-semibold text-white">
            {readiness.ready ? "All systems ready" : "Review before launch"}
          </h2>
          <p className="mt-2 text-sm leading-6 text-white/42">
            {readiness.passed} of {readiness.total} live checks passing.
          </p>
        </div>
        {readiness.ready ? (
          <FaCheckCircle className="mt-1 text-xl text-emerald-300" />
        ) : (
          <FaExclamationTriangle className="mt-1 text-xl text-amber-300" />
        )}
      </div>
      <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className={`h-full rounded-full ${
            readiness.ready ? "bg-emerald-300/78" : "bg-amber-300/78"
          }`}
          style={{
            width: `${
              readiness.total
                ? (readiness.passed / readiness.total) * 100
                : 0
            }%`,
          }}
        />
      </div>
      {failed.length ? (
        <div className="mt-4 grid gap-2">
          {failed.slice(0, 3).map((check) => (
            <Link
              className="flex items-center justify-between gap-3 rounded-xl border border-amber-300/12 bg-amber-400/[0.045] px-3 py-2.5 text-xs text-amber-100/68 transition hover:bg-amber-400/[0.08]"
              href={check.href}
              key={check.id}
            >
              <span className="truncate">{check.label}</span>
              <FaArrowRight className="shrink-0 text-[9px]" />
            </Link>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-xs text-emerald-100/52">
          Public URL, content, storage, access, email, and rate limits are
          healthy.
        </p>
      )}
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
  ] = await Promise.all([
    getPortfolioContent(),
    getAnalyticsSummary(),
    getBookingInquiries(),
    getSecurityEventData(),
    getProductionReadiness(),
  ]);
  const profileType = content.settings.portfolioType;
  const publicModules = getPublicModules(profileType);
  const current = analyticsResult.summary.current7Days;
  const previous = analyticsResult.summary.previous7Days;
  const analyticsAvailable =
    analyticsResult.isConfigured && !analyticsResult.loadError;
  const inquiriesAvailable =
    inquiriesResult.isConfigured && !inquiriesResult.loadError;
  const securityAvailable =
    securityResult.isConfigured && !securityResult.loadError;
  const securityScore = readiness.total
    ? Math.round((readiness.passed / readiness.total) * 100)
    : 0;

  return (
    <AdminShell
      active="dashboard"
      adminEmail={admin.email}
      description="Your portfolio, page by page — edit the public experience, understand visitors, and keep the site protected."
      portfolioType={profileType}
      title="Portfolio overview"
    >
      <div className="grid gap-4">
        <section className={panelClass}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className={labelClass}>Your website</p>
              <h2 className="heading-ui mt-2 text-2xl font-semibold text-white">
                Edit what your visitors see
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/42">
                The page order below mirrors the live {profileType} portfolio.
                Open any page and edit its sections in the same sequence.
              </p>
            </div>
            <Link
              className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl border border-white/9 bg-white/[0.04] px-3.5 text-xs font-semibold text-white/62 transition hover:bg-white hover:text-black"
              href="/admin/content"
            >
              Open site editor
              <FaArrowRight className="text-[9px]" />
            </Link>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
            {publicModules.map((module, index) => (
              <PageCard
                description={module.description}
                editHref={getEditorHref(module.key)}
                hero={
                  module.pageSlug
                    ? content.heroes[module.pageSlug]
                    : undefined
                }
                index={index}
                key={`${module.key}-${module.href}`}
                label={module.label}
                publicHref={module.href}
              />
            ))}
          </div>
        </section>

        {!analyticsAvailable || !inquiriesAvailable || !securityAvailable ? (
          <section className="flex flex-col gap-3 rounded-[20px] border border-amber-300/16 bg-amber-400/[0.055] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <FaExclamationTriangle className="mt-0.5 shrink-0 text-amber-200" />
              <div>
                <p className="text-sm font-semibold text-amber-50">
                  Some live monitoring data is unavailable
                </p>
                <p className="mt-1 text-xs leading-5 text-amber-100/55">
                  Unavailable sources are shown as unavailable, never as zero
                  activity. Open the relevant workspace for configuration
                  details.
                </p>
              </div>
            </div>
            <Link
              className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-amber-200/16 px-3.5 text-xs font-semibold text-amber-50 transition hover:bg-amber-100 hover:text-black"
              href={!securityAvailable ? "/admin/security" : "/admin/analytics"}
            >
              Review data source
              <FaArrowRight className="text-[9px]" />
            </Link>
          </section>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            current={analyticsAvailable ? current.pageViews : undefined}
            description={
              analyticsAvailable ? "Last 7 days" : "Analytics unavailable"
            }
            label="Page views"
            previous={analyticsAvailable ? previous.pageViews : undefined}
            value={analyticsAvailable ? formatNumber(current.pageViews) : "—"}
          />
          <MetricCard
            current={analyticsAvailable ? current.outboundClicks : undefined}
            description={
              analyticsAvailable ? "Last 7 days" : "Analytics unavailable"
            }
            label="Outbound clicks"
            previous={
              analyticsAvailable ? previous.outboundClicks : undefined
            }
            value={
              analyticsAvailable ? formatNumber(current.outboundClicks) : "—"
            }
          />
          <MetricCard
            description={
              inquiriesAvailable
                ? "Waiting for your reply"
                : "Inquiry inbox unavailable"
            }
            label="New inquiries"
            value={inquiriesAvailable ? inquiriesResult.summary.new : "—"}
          />
          <MetricCard
            description={
              securityAvailable
                ? `${securityResult.summary.total7d} protection signals handled`
                : "Event monitoring unavailable"
            }
            label="Security posture"
            value={`${securityScore}%`}
          />
        </section>

        <section className="grid gap-4 2xl:grid-cols-[1.45fr_0.55fr]">
          <div className={panelClass}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className={labelClass}>Visitor activity</p>
                <h2 className="heading-ui mt-2 text-xl font-semibold text-white">
                  30-day traffic pulse
                </h2>
                <p className="mt-2 text-sm text-white/40">
                  White is page views, orange is outbound intent.
                </p>
              </div>
              <Link
                className="inline-flex items-center gap-2 text-xs font-semibold text-white/48 transition hover:text-white"
                href="/admin/analytics"
              >
                Full insights
                <FaArrowRight className="text-[9px]" />
              </Link>
            </div>
            <div className="mt-6">
              {analyticsAvailable ? (
                <TrafficBars daily={analyticsResult.summary.daily} />
              ) : (
                <div className="grid min-h-48 place-items-center rounded-[18px] border border-dashed border-amber-300/16 bg-amber-400/[0.035] p-6 text-center">
                  <div>
                    <FaExclamationTriangle className="mx-auto text-lg text-amber-200" />
                    <p className="mt-3 text-sm font-semibold text-amber-50">
                      Analytics data is unavailable
                    </p>
                    <p className="mt-1 text-xs text-amber-100/48">
                      Check the Insights workspace before interpreting traffic.
                    </p>
                  </div>
                </div>
              )}
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <div className="rounded-xl border border-white/8 bg-black/22 px-3 py-2.5">
                <p className="text-[10px] text-white/34">30-day views</p>
                <p className="mt-1 text-lg font-semibold text-white">
                  {analyticsAvailable
                    ? analyticsResult.summary.pageViews
                    : "—"}
                </p>
              </div>
              <div className="rounded-xl border border-white/8 bg-black/22 px-3 py-2.5">
                <p className="text-[10px] text-white/34">Booking visits</p>
                <p className="mt-1 text-lg font-semibold text-white">
                  {analyticsAvailable
                    ? analyticsResult.summary.bookingPageViews
                    : "—"}
                </p>
              </div>
              <div className="rounded-xl border border-white/8 bg-black/22 px-3 py-2.5">
                <p className="text-[10px] text-white/34">
                  Inquiries delivered
                </p>
                <p className="mt-1 text-lg font-semibold text-white">
                  {analyticsAvailable
                    ? analyticsResult.summary.bookingSubmits
                    : "—"}
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-4">
            <ReadinessPanel readiness={readiness} />
            <section className={panelClass}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className={labelClass}>Security activity</p>
                  <h2 className="heading-ui mt-2 text-xl font-semibold text-white">
                    {securityAvailable
                      ? "Protection signals online"
                      : "Monitoring unavailable"}
                  </h2>
                </div>
                <span
                  className={`grid h-10 w-10 place-items-center rounded-xl border text-sm ${
                    securityAvailable
                      ? "border-emerald-300/14 bg-emerald-400/[0.06] text-emerald-200"
                      : "border-amber-300/16 bg-amber-400/[0.06] text-amber-200"
                  }`}
                >
                  <FaShieldAlt />
                </span>
              </div>
              <div className="mt-5 grid grid-cols-3 gap-2">
                <div className="rounded-xl border border-white/8 bg-black/22 p-3">
                  <p className="text-[9px] uppercase tracking-[0.12em] text-white/30">
                    24h
                  </p>
                  <p className="mt-2 text-xl font-semibold text-white">
                    {securityAvailable
                      ? securityResult.summary.total24h
                      : "—"}
                  </p>
                </div>
                <div className="rounded-xl border border-white/8 bg-black/22 p-3">
                  <p className="text-[9px] uppercase tracking-[0.12em] text-white/30">
                    Contact
                  </p>
                  <p className="mt-2 text-xl font-semibold text-white">
                    {securityAvailable
                      ? securityResult.summary.contactBlocked7d
                      : "—"}
                  </p>
                </div>
                <div className="rounded-xl border border-white/8 bg-black/22 p-3">
                  <p className="text-[9px] uppercase tracking-[0.12em] text-white/30">
                    Auth
                  </p>
                  <p className="mt-2 text-xl font-semibold text-white">
                    {securityAvailable
                      ? securityResult.summary.authFailures7d
                      : "—"}
                  </p>
                </div>
              </div>
              <Link
                className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-white/9 bg-white/[0.04] text-xs font-semibold text-white/58 transition hover:bg-white hover:text-black"
                href="/admin/security#threats"
              >
                Open security center
                <FaArrowRight className="text-[9px]" />
              </Link>
            </section>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-3">
          <Link
            className={`${panelClass} group transition hover:border-white/16 hover:bg-white/[0.055]`}
            href="/admin/content"
          >
            <span className="grid h-10 w-10 place-items-center rounded-xl border border-white/8 bg-white/[0.045] text-sm text-white/48">
              <FaArrowRight />
            </span>
            <h2 className="heading-ui mt-5 text-lg font-semibold text-white">
              Continue editing
            </h2>
            <p className="mt-2 text-sm leading-6 text-white/38">
              Change copy, imagery, typography, contact details, and links.
            </p>
          </Link>
          <Link
            className={`${panelClass} group transition hover:border-white/16 hover:bg-white/[0.055]`}
            href="/admin/media"
          >
            <span className="grid h-10 w-10 place-items-center rounded-xl border border-white/8 bg-white/[0.045] text-sm text-white/48">
              <FaImages />
            </span>
            <h2 className="heading-ui mt-5 text-lg font-semibold text-white">
              Media library
            </h2>
            <p className="mt-2 text-sm leading-6 text-white/38">
              Upload photos and video, then place them into Gallery or Showreel.
            </p>
          </Link>
          <Link
            className={`${panelClass} group transition hover:border-white/16 hover:bg-white/[0.055]`}
            href="/admin/analytics#inquiries"
          >
            <span className="grid h-10 w-10 place-items-center rounded-xl border border-white/8 bg-white/[0.045] text-sm text-white/48">
              <FaChartLine />
            </span>
            <h2 className="heading-ui mt-5 text-lg font-semibold text-white">
              Inquiry inbox
            </h2>
            <p className="mt-2 text-sm leading-6 text-white/38">
              {inquiriesResult.summary.new
                ? `${inquiriesResult.summary.new} new message${inquiriesResult.summary.new === 1 ? "" : "s"} waiting.`
                : "No unread messages. Your inbox is clear."}
            </p>
          </Link>
        </section>
      </div>
    </AdminShell>
  );
}
