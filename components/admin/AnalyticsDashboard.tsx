"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  FaArrowDown,
  FaArrowUp,
  FaChartLine,
  FaEnvelope,
  FaMinus,
  FaMousePointer,
} from "react-icons/fa";
import ActionButton from "@/components/admin/ActionButton";
import useUnsavedChangesGuard from "@/components/admin/useUnsavedChangesGuard";
import { deleteInquiry, updateInquiry } from "@/app/admin/analytics/actions";
import type { AnalyticsSummary } from "@/lib/admin/analytics";
import type {
  BookingInquiry,
  InquirySummary,
  InquiryStatus,
} from "@/lib/admin/inquiries";

type AnalyticsDashboardProps = {
  analytics: AnalyticsSummary;
  inquiries: BookingInquiry[];
  inquirySummary: InquirySummary;
  isConfigured: boolean;
  analyticsError?: string;
  inquiriesError?: string;
  status?: string;
};

const statusCopy: Record<string, string> = {
  deleted: "Inquiry deleted.",
  "delete-error": "Delete failed.",
  invalid: "Inquiry update is invalid.",
  "missing-service": "Server-side Supabase admin key is missing.",
  saved: "Inquiry saved.",
  "save-error": "Inquiry could not be saved.",
  "security-error": "Request origin was blocked. Refresh admin and try again.",
};

const sectionClass =
  "scroll-mt-28 rounded-[22px] border border-white/9 bg-[#0f0f11]/92 p-4 shadow-[0_18px_65px_rgba(0,0,0,0.24)] sm:p-5";
const itemClass =
  "rounded-[18px] border border-white/9 bg-black/24 p-4 transition hover:border-white/15";
const labelClass =
  "text-[11px] font-semibold uppercase tracking-[0.16em] text-white/46";
const inputClass =
  "mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3.5 py-2.5 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-white/30 disabled:cursor-not-allowed disabled:opacity-50";
const textareaClass = `${inputClass} min-h-24 resize-y leading-6`;
const buttonClass =
  "inline-flex min-h-10 items-center justify-center rounded-xl bg-white px-4 text-sm font-semibold text-black transition hover:bg-white/84 disabled:cursor-not-allowed disabled:opacity-45";
const dangerButtonClass =
  "inline-flex min-h-10 items-center justify-center rounded-xl border border-rose-300/22 px-4 text-sm font-semibold text-rose-100 transition hover:bg-rose-500/12 disabled:cursor-not-allowed disabled:opacity-45";

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

function formatShortDay(iso: string) {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${iso}T00:00:00.000Z`));
}

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

function TrendBadge({
  current,
  previous,
}: {
  current: number;
  previous: number;
}) {
  const change = getChange(current, previous);

  if (change === null) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-white/9 bg-white/[0.04] px-2 py-1 text-[10px] text-white/42">
        New activity
      </span>
    );
  }

  const positive = change > 0;
  const neutral = change === 0;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] ${
        neutral
          ? "border-white/9 bg-white/[0.04] text-white/42"
          : positive
            ? "border-emerald-300/16 bg-emerald-400/[0.07] text-emerald-100/72"
            : "border-amber-300/16 bg-amber-400/[0.07] text-amber-100/72"
      }`}
    >
      {neutral ? (
        <FaMinus className="text-[8px]" />
      ) : positive ? (
        <FaArrowUp className="text-[8px]" />
      ) : (
        <FaArrowDown className="text-[8px]" />
      )}
      {Math.abs(change).toFixed(0)}% vs previous 7d
    </span>
  );
}

function MetricCard({
  current,
  description,
  icon,
  label,
  previous,
  value,
}: {
  current?: number;
  description: string;
  icon: ReactNode;
  label: string;
  previous?: number;
  value: number | string;
}) {
  return (
    <article className="rounded-[20px] border border-white/9 bg-[#101012]/90 p-4 shadow-[0_16px_52px_rgba(0,0,0,0.2)] sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <p className={labelClass}>{label}</p>
        <span className="grid h-8 w-8 place-items-center rounded-xl border border-white/8 bg-white/[0.045] text-xs text-white/42">
          {icon}
        </span>
      </div>
      <p className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl">
        {value}
      </p>
      <div className="mt-3 min-h-6">
        {typeof current === "number" && typeof previous === "number" ? (
          <TrendBadge current={current} previous={previous} />
        ) : (
          <span className="text-[11px] text-white/38">{description}</span>
        )}
      </div>
      {typeof current === "number" && typeof previous === "number" ? (
        <p className="mt-2 text-[11px] text-white/32">{description}</p>
      ) : null}
    </article>
  );
}

function StatusNotice({
  status,
  isConfigured,
  analyticsError,
  inquiriesError,
}: {
  status?: string;
  isConfigured: boolean;
  analyticsError?: string;
  inquiriesError?: string;
}) {
  const message = status ? statusCopy[status] : "";

  if (!message && isConfigured && !analyticsError && !inquiriesError) {
    return null;
  }

  return (
    <div className="grid gap-2">
      {!isConfigured ? (
        <div className="rounded-xl border border-amber-300/20 bg-amber-400/[0.08] px-4 py-3 text-sm leading-6 text-amber-100">
          Analytics is in preview mode until the Supabase service key is
          configured.
        </div>
      ) : null}
      {analyticsError ? (
        <div className="rounded-xl border border-rose-300/20 bg-rose-500/[0.08] px-4 py-3 text-sm leading-6 text-rose-100">
          {analyticsError}
        </div>
      ) : null}
      {inquiriesError ? (
        <div className="rounded-xl border border-rose-300/20 bg-rose-500/[0.08] px-4 py-3 text-sm leading-6 text-rose-100">
          {inquiriesError}
        </div>
      ) : null}
      {message ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.07] px-4 py-3 text-sm leading-6 text-white/78">
          {message}
        </div>
      ) : null}
    </div>
  );
}

function ChartBars({
  daily,
}: {
  daily: AnalyticsSummary["daily"];
}) {
  const max = Math.max(
    ...daily.map((day) =>
      Math.max(day.pageViews, day.outboundClicks, day.bookingSubmits)
    ),
    1
  );

  return (
    <div
      className="grid h-56 items-end gap-1.5 border-b border-white/8"
      style={{
        gridTemplateColumns: `repeat(${daily.length}, minmax(10px, 1fr))`,
      }}
    >
      {daily.map((day) => {
        const viewHeight = (day.pageViews / max) * 100;
        const clickHeight = (day.outboundClicks / max) * 100;
        const submitHeight = (day.bookingSubmits / max) * 100;

        return (
          <div
            aria-label={`${formatShortDay(day.label)}: ${day.pageViews} views, ${day.outboundClicks} outbound clicks, ${day.bookingSubmits} inquiry deliveries`}
            className="group relative flex h-full items-end justify-center gap-[2px] pt-5"
            key={day.label}
            tabIndex={0}
          >
            <span
              className="w-[44%] rounded-t-sm bg-white/72 transition group-hover:bg-white group-focus:bg-white"
              style={{ height: `${viewHeight}%` }}
            />
            <span
              className="w-[44%] rounded-t-sm bg-[#ff4d2e]/82 transition group-hover:bg-[#ff6d53] group-focus:bg-[#ff6d53]"
              style={{ height: `${clickHeight}%` }}
            />
            {submitHeight > 0 ? (
              <span
                className="absolute right-0 h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,0.7)]"
                style={{ bottom: `max(${submitHeight}%, 3px)` }}
              />
            ) : null}
            <span className="pointer-events-none absolute -top-6 left-1/2 z-10 hidden w-max -translate-x-1/2 rounded-lg border border-white/10 bg-black/95 px-2 py-1.5 text-[10px] text-white/72 shadow-xl group-hover:block group-focus:block">
              {formatShortDay(day.label)} · {day.pageViews} views ·{" "}
              {day.outboundClicks} clicks · {day.bookingSubmits} inquiries
            </span>
          </div>
        );
      })}
    </div>
  );
}

function TrafficChart({ analytics }: { analytics: AnalyticsSummary }) {
  const hasActivity = analytics.daily.some(
    (day) =>
      day.pageViews > 0 ||
      day.outboundClicks > 0 ||
      day.bookingSubmits > 0
  );

  return (
    <section className={sectionClass}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className={labelClass}>Traffic pulse</p>
          <h2 className="heading-ui mt-2 text-2xl font-semibold text-white">
            Last {analytics.rangeDays} calendar days
          </h2>
          <p className="mt-2 text-sm leading-6 text-white/42">
            Every day is shown, including zero-activity days.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 text-[11px] text-white/46">
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm bg-white/72" />
            Page views
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm bg-[#ff4d2e]/82" />
            Outbound clicks
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
            Inquiry delivered
          </span>
        </div>
      </div>

      {hasActivity ? (
        <>
          <div className="mt-7 sm:hidden">
            <ChartBars daily={analytics.daily.slice(-14)} />
            <div className="mt-2 flex justify-between text-[10px] text-white/28">
              <span>{formatShortDay(analytics.daily.at(-14)?.label || "")}</span>
              <span>{formatShortDay(analytics.daily.at(-1)?.label || "")}</span>
            </div>
          </div>
          <div className="mt-7 hidden sm:block">
            <ChartBars daily={analytics.daily} />
            <div className="mt-2 flex justify-between text-[10px] text-white/28">
              <span>{formatShortDay(analytics.daily[0]?.label || "")}</span>
              <span>{formatShortDay(analytics.daily.at(-1)?.label || "")}</span>
            </div>
          </div>
        </>
      ) : (
        <div className="mt-7 grid min-h-56 place-items-center rounded-[18px] border border-dashed border-white/10 bg-black/18 p-8 text-center">
          <div>
            <FaChartLine className="mx-auto text-xl text-white/22" />
            <p className="mt-3 text-sm font-semibold text-white/58">
              No tracked activity yet
            </p>
            <p className="mt-1 text-xs text-white/34">
              The chart will begin with the first public page view.
            </p>
          </div>
        </div>
      )}

      <details className="mt-5 rounded-xl border border-white/8 bg-black/20 px-3 py-2">
        <summary className="cursor-pointer text-xs font-semibold text-white/48">
          View accessible daily data
        </summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-xs">
            <thead className="text-white/32">
              <tr>
                <th className="py-2 font-medium">Day</th>
                <th className="py-2 font-medium">Views</th>
                <th className="py-2 font-medium">Clicks</th>
                <th className="py-2 font-medium">Inquiries</th>
              </tr>
            </thead>
            <tbody className="text-white/60">
              {analytics.daily.map((day) => (
                <tr className="border-t border-white/6" key={day.label}>
                  <td className="py-2">{formatShortDay(day.label)}</td>
                  <td className="py-2 tabular-nums">{day.pageViews}</td>
                  <td className="py-2 tabular-nums">{day.outboundClicks}</td>
                  <td className="py-2 tabular-nums">{day.bookingSubmits}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

function RankingBars({
  empty,
  items,
  total,
}: {
  empty: string;
  items: Array<{ label: string; value: number }>;
  total: number;
}) {
  if (!items.length) {
    return (
      <div className="rounded-[18px] border border-dashed border-white/10 p-8 text-center text-sm text-white/38">
        {empty}
      </div>
    );
  }

  const max = Math.max(...items.map((item) => item.value), 1);

  return (
    <div className="grid gap-4">
      {items.map((item, index) => {
        const share = total > 0 ? (item.value / total) * 100 : 0;

        return (
          <div key={item.label}>
            <div className="flex items-center justify-between gap-4 text-sm">
              <span className="min-w-0 truncate text-white/68">
                <span className="mr-2 font-mono text-[10px] text-white/24">
                  {String(index + 1).padStart(2, "0")}
                </span>
                {item.label}
              </span>
              <span className="shrink-0 font-semibold tabular-nums text-white">
                {item.value}
                <span className="ml-2 text-[10px] font-normal text-white/32">
                  {share.toFixed(0)}%
                </span>
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#ff3b1f] to-[#ff806b]"
                style={{ width: `${(item.value / max) * 100}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ContactActivity({ analytics }: { analytics: AnalyticsSummary }) {
  const steps = [
    { label: "Portfolio page views", value: analytics.pageViews },
    { label: "Booking page views", value: analytics.bookingPageViews },
    { label: "Inquiry emails delivered", value: analytics.bookingSubmits },
  ];
  const max = Math.max(...steps.map((step) => step.value), 1);

  return (
    <section className={sectionClass}>
      <p className={labelClass}>Contact activity</p>
      <h2 className="heading-ui mt-2 text-2xl font-semibold text-white">
        Independent activity counts
      </h2>
      <p className="mt-2 text-sm leading-6 text-white/42">
        These totals share a reporting window, but are not linked to individual
        sessions or presented as a conversion funnel.
      </p>
      <div className="mt-6 grid gap-3">
        {steps.map((step, index) => {
          const width = (step.value / max) * 100;

          return (
            <div key={step.label}>
              <div className="flex items-end justify-between gap-3">
                <span className="text-xs text-white/52">{step.label}</span>
                <span className="text-lg font-semibold tabular-nums text-white">
                  {formatNumber(step.value)}
                </span>
              </div>
              <div className="mt-2 h-9 overflow-hidden rounded-xl border border-white/8 bg-black/24">
                <div
                  className={`h-full rounded-xl ${
                    index === 2
                      ? "bg-emerald-300/72"
                      : index === 1
                        ? "bg-[#ff4d2e]/72"
                        : "bg-white/62"
                  }`}
                  style={{ width: `${width}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function RecentEvents({ analytics }: { analytics: AnalyticsSummary }) {
  if (!analytics.recentEvents.length) {
    return (
      <div className="rounded-[18px] border border-dashed border-white/10 p-8 text-center text-sm text-white/38">
        No events yet.
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      {analytics.recentEvents.map((event) => (
        <div
          className="grid gap-2 rounded-[16px] border border-white/8 bg-black/22 px-3.5 py-3 text-sm sm:grid-cols-[1fr_auto]"
          key={event.id}
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-white/9 px-2 py-0.5 text-[9px] uppercase tracking-[0.14em] text-white/40">
                {event.eventName.replaceAll("_", " ")}
              </span>
              <span className="truncate font-semibold text-white/78">
                {event.pagePath || "/"}
              </span>
            </div>
            {event.targetLabel ? (
              <p className="mt-1 truncate text-xs text-white/38">
                → {event.targetLabel}
              </p>
            ) : null}
          </div>
          <span className="text-[10px] text-white/28">
            {formatDate(event.createdAt)}
          </span>
        </div>
      ))}
    </div>
  );
}

function InquiryStatusBadge({ status }: { status: InquiryStatus }) {
  const tone =
    status === "new"
      ? "border-[#ff765f]/22 text-[#ffb3a7] bg-[#ff3b1f]/10"
      : status === "replied"
        ? "border-emerald-300/20 text-emerald-100 bg-emerald-500/8"
        : "border-white/9 text-white/48 bg-white/[0.035]";

  return (
    <span className={`rounded-full border px-2.5 py-1 text-[10px] ${tone}`}>
      {status}
    </span>
  );
}

function InquiryCard({
  inquiry,
  disabled,
}: {
  inquiry: BookingInquiry;
  disabled: boolean;
}) {
  const typeLabel =
    inquiry.inquiryType === "collaboration"
      ? "Collaboration"
      : "Booking";

  return (
    <article className={itemClass}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-semibold text-white">
              {inquiry.name}
            </h3>
            <InquiryStatusBadge status={inquiry.status} />
          </div>
          <a
            className="mt-1 block truncate text-sm text-white/52 underline-offset-4 hover:text-white hover:underline"
            href={`mailto:${inquiry.email}`}
          >
            {inquiry.email}
          </a>
          <div className="mt-2 flex flex-wrap gap-2 text-[9px] uppercase tracking-[0.14em] text-white/32">
            <span>{inquiry.portfolioType}</span>
            <span>·</span>
            <span>{typeLabel}</span>
          </div>
        </div>
        <span className="text-[10px] text-white/28">
          {formatDate(inquiry.createdAt)}
        </span>
      </div>

      <p className="mt-4 whitespace-pre-wrap rounded-xl border border-white/8 bg-black/24 p-4 text-sm leading-6 text-white/68">
        {inquiry.message}
      </p>

      <form action={updateInquiry} className="mt-4">
        <fieldset disabled={disabled}>
          <input name="id" type="hidden" value={inquiry.id} />
          <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
            <label>
              <span className={labelClass}>Status</span>
              <select
                className={inputClass}
                defaultValue={inquiry.status}
                name="status"
              >
                <option value="new">New</option>
                <option value="read">Read</option>
                <option value="replied">Replied</option>
                <option value="archived">Archived</option>
              </select>
            </label>
            <label>
              <span className={labelClass}>Private notes</span>
              <textarea
                className={textareaClass}
                defaultValue={inquiry.adminNotes}
                name="adminNotes"
              />
            </label>
          </div>
          <div className="mt-4 flex justify-end">
            <ActionButton
              className={buttonClass}
              disabled={disabled}
              pendingLabel="Saving..."
            >
              Save inquiry
            </ActionButton>
          </div>
        </fieldset>
      </form>

      <form
        action={deleteInquiry}
        className="mt-3 flex justify-end border-t border-white/7 pt-3"
        onSubmit={(event) => {
          if (
            !window.confirm(
              `Delete the inquiry from ${inquiry.name}? This cannot be undone.`
            )
          ) {
            event.preventDefault();
          }
        }}
      >
        <input name="id" type="hidden" value={inquiry.id} />
        <ActionButton
          className={dangerButtonClass}
          disabled={disabled}
          pendingLabel="Deleting..."
        >
          Delete inquiry
        </ActionButton>
      </form>
    </article>
  );
}

function InquiriesSection({
  inquiries,
  inquirySummary,
  disabled,
}: {
  inquiries: BookingInquiry[];
  inquirySummary: InquirySummary;
  disabled: boolean;
}) {
  return (
    <section className={sectionClass} id="inquiries">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className={labelClass}>Inbox</p>
          <h2 className="heading-ui mt-2 text-2xl font-semibold text-white">
            Contact inquiries
          </h2>
          <p className="mt-2 text-sm text-white/42">
            Read, annotate, reply, and archive new opportunities.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-[10px] text-white/46">
          <span className="rounded-full border border-white/9 px-2.5 py-1">
            {inquirySummary.new} new
          </span>
          <span className="rounded-full border border-white/9 px-2.5 py-1">
            {inquirySummary.replied} replied
          </span>
          <span className="rounded-full border border-white/9 px-2.5 py-1">
            {inquirySummary.total} loaded
          </span>
        </div>
      </div>

      <div className="mt-5 grid gap-3">
        {inquiries.length ? (
          inquiries.map((inquiry) => (
            <InquiryCard
              disabled={disabled}
              inquiry={inquiry}
              key={inquiry.id}
            />
          ))
        ) : (
          <div className="rounded-[18px] border border-dashed border-white/10 p-8 text-center text-sm text-white/38">
            No contact inquiries yet.
          </div>
        )}
      </div>
    </section>
  );
}

type AnalyticsWorkspaceSection = {
  id: string;
  label: string;
  description: string;
  count?: number;
  node: ReactNode;
};

export default function AnalyticsDashboard({
  analytics,
  inquiries,
  inquirySummary,
  isConfigured,
  analyticsError,
  inquiriesError,
  status,
}: AnalyticsDashboardProps) {
  const disabled = !isConfigured || Boolean(inquiriesError);
  const [activeSectionId, setActiveSectionId] = useState("overview");
  const {
    clearDirty,
    confirmDiscard,
    hasUnsavedChanges,
    markDirty,
  } = useUnsavedChangesGuard();
  const inquiryPeriods = useMemo(() => {
    const latestDay = analytics.daily.at(-1)?.label;
    const now = latestDay
      ? new Date(`${latestDay}T23:59:59.999Z`).getTime()
      : Math.max(
          ...inquiries.map((item) => new Date(item.createdAt).getTime()),
          0
        );
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    const current = inquiries.filter((item) => {
      const time = new Date(item.createdAt).getTime();
      return time >= now - sevenDays;
    }).length;
    const previous = inquiries.filter((item) => {
      const time = new Date(item.createdAt).getTime();
      return time >= now - sevenDays * 2 && time < now - sevenDays;
    }).length;
    return { current, previous };
  }, [analytics.daily, inquiries]);
  useEffect(() => {
    const syncHash = () => {
      const hash = window.location.hash.replace(/^#/, "");
      if (hash) setActiveSectionId(hash);
    };
    const frame = window.requestAnimationFrame(syncHash);
    window.addEventListener("hashchange", syncHash);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("hashchange", syncHash);
    };
  }, []);

  const sections: AnalyticsWorkspaceSection[] = [
    {
      id: "overview",
      label: "Overview",
      description: "30-day traffic and contact activity",
      node: (
        <div className="grid gap-4 2xl:grid-cols-[1.45fr_0.55fr]">
          <TrafficChart analytics={analytics} />
          <ContactActivity analytics={analytics} />
        </div>
      ),
    },
    {
      id: "pages",
      label: "Top pages",
      description: "Where visitors spend attention",
      count: analytics.topPages.length,
      node: (
        <section className={sectionClass}>
          <p className={labelClass}>Content performance</p>
          <h2 className="heading-ui mt-2 text-2xl font-semibold text-white">
            Top pages
          </h2>
          <p className="mt-2 text-sm text-white/42">
            Share of all tracked page views in the current 30-day window.
          </p>
          <div className="mt-6">
            <RankingBars
              empty="No page views yet."
              items={analytics.topPages}
              total={analytics.pageViews}
            />
          </div>
        </section>
      ),
    },
    {
      id: "links",
      label: "Outbound",
      description: "Destinations visitors chose",
      count: analytics.topTargets.length,
      node: (
        <section className={sectionClass}>
          <p className={labelClass}>Outbound intent</p>
          <h2 className="heading-ui mt-2 text-2xl font-semibold text-white">
            Top destinations
          </h2>
          <p className="mt-2 text-sm text-white/42">
            External destinations are grouped by their visible link label.
          </p>
          <div className="mt-6">
            <RankingBars
              empty="No outbound clicks yet."
              items={analytics.topTargets}
              total={analytics.outboundClicks}
            />
          </div>
        </section>
      ),
    },
    {
      id: "events",
      label: "Events",
      description: "Latest privacy-safe telemetry",
      count: analytics.recentEvents.length,
      node: (
        <section className={sectionClass}>
          <p className={labelClass}>Event stream</p>
          <h2 className="heading-ui mt-2 text-2xl font-semibold text-white">
            Recent activity
          </h2>
          <p className="mt-2 text-sm text-white/42">
            Latest page views, outbound clicks, and inquiry deliveries.
          </p>
          <div className="mt-6">
            <RecentEvents analytics={analytics} />
          </div>
        </section>
      ),
    },
    {
      id: "inquiries",
      label: "Inbox",
      description: "Messages, status and private notes",
      count: inquirySummary.new,
      node: (
        <InquiriesSection
          disabled={disabled}
          inquiries={inquiries}
          inquirySummary={inquirySummary}
        />
      ),
    },
  ];
  const activeSection =
    sections.find((section) => section.id === activeSectionId) || sections[0];

  function openSection(id: string) {
    if (id === activeSectionId) return;
    if (!confirmDiscard()) return;

    setActiveSectionId(id);
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}#${id}`
    );
    document
      .getElementById("analytics-workspace")
      ?.scrollIntoView({ block: "start" });
  }

  return (
    <div
      className="grid gap-4"
      onChangeCapture={markDirty}
      onSubmit={(event) => {
        if (!event.defaultPrevented) clearDirty();
      }}
    >
      <StatusNotice
        analyticsError={analyticsError}
        inquiriesError={inquiriesError}
        isConfigured={isConfigured}
        status={status}
      />

      <section className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
        <MetricCard
          current={analytics.current7Days.pageViews}
          description="Page views in the last 7 days"
          icon={<FaChartLine />}
          label="Page views"
          previous={analytics.previous7Days.pageViews}
          value={formatNumber(analytics.current7Days.pageViews)}
        />
        <MetricCard
          current={analytics.current7Days.outboundClicks}
          description="External clicks in the last 7 days"
          icon={<FaMousePointer />}
          label="Outbound clicks"
          previous={analytics.previous7Days.outboundClicks}
          value={formatNumber(analytics.current7Days.outboundClicks)}
        />
        <MetricCard
          current={inquiryPeriods.current}
          description="New messages received in the last 7 days"
          icon={<FaEnvelope />}
          label="Inquiries"
          previous={inquiryPeriods.previous}
          value={formatNumber(inquiryPeriods.current)}
        />
        <MetricCard
          description="Successfully delivered inquiry emails · 30 days"
          icon={<FaArrowUp />}
          label="Inquiry deliveries"
          value={formatNumber(analytics.bookingSubmits)}
        />
      </section>

      <div className="flex flex-col gap-3 rounded-[22px] border border-white/9 bg-[#0f0f11]/90 p-3 sm:flex-row sm:items-center sm:justify-between">
        <nav
          aria-label="Analytics views"
          className="grid flex-1 gap-1 sm:grid-cols-5"
        >
          {sections.map((section) => {
            const active = section.id === activeSection.id;

            return (
              <button
                aria-pressed={active}
                className={`min-h-12 rounded-xl border px-3 py-2 text-left transition ${
                  active
                    ? "border-white/14 bg-white/[0.09] text-white"
                    : "border-transparent text-white/48 hover:border-white/8 hover:bg-white/[0.045] hover:text-white"
                }`}
                key={section.id}
                onClick={() => openSection(section.id)}
                type="button"
              >
                <span className="flex items-center justify-between gap-2 text-xs font-semibold">
                  {section.label}
                  {typeof section.count === "number" ? (
                    <span className="rounded-full border border-white/8 px-1.5 py-0.5 text-[9px] tabular-nums text-white/36">
                      {section.count}
                    </span>
                  ) : null}
                </span>
                <span className="mt-1 hidden truncate text-[10px] text-white/30 lg:block">
                  {section.description}
                </span>
              </button>
            );
          })}
        </nav>
        <div className="flex shrink-0 items-center gap-2 px-1 text-[10px] text-white/30">
          {hasUnsavedChanges ? (
            <span className="rounded-full border border-amber-300/18 bg-amber-400/[0.07] px-2 py-1 font-semibold text-amber-100/72">
              Unsaved changes
            </span>
          ) : null}
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              analytics.lastEventAt ? "bg-emerald-300" : "bg-white/25"
            }`}
          />
          {analytics.lastEventAt
            ? `Data through ${formatDate(analytics.lastEventAt)}`
            : "Waiting for first event"}
          {analytics.isCapped ? " · 5,000+ events, partial view" : ""}
        </div>
      </div>

      <div className="scroll-mt-28" id="analytics-workspace">
        {activeSection.node}
      </div>
    </div>
  );
}
