"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  FaArrowDown,
  FaArrowUp,
  FaChartLine,
  FaEnvelope,
  FaExclamationTriangle,
  FaMinus,
  FaMousePointer,
  FaSearch,
} from "react-icons/fa";
import ActionButton from "@/components/admin/ActionButton";
import AdminDisclosure from "@/components/admin/AdminDisclosure";
import useUnsavedChangesGuard from "@/components/admin/useUnsavedChangesGuard";
import { deleteInquiry, updateInquiry } from "@/app/admin/analytics/actions";
import type { AnalyticsSummary } from "@/lib/admin/analytics";
import {
  ANALYTICS_RANGE_DAYS,
  getAnalyticsPageLabel,
} from "@/lib/admin/analytics-shared";
import type {
  BookingInquiry,
  InquiryEmailStatus,
  InquiryPagination,
  InquirySummary,
  InquiryStatus,
} from "@/lib/admin/inquiries";

type AnalyticsDashboardProps = {
  analytics: AnalyticsSummary;
  analyticsAvailable: boolean;
  analyticsConfigured: boolean;
  inquiries: BookingInquiry[];
  inquiriesAvailable: boolean;
  inquiriesConfigured: boolean;
  inquiryPagination: InquiryPagination;
  inquirySummary: InquirySummary;
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
  if (!iso) return "Not available";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

function formatShortDay(iso: string) {
  if (!iso) return "";
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
  rangeDays,
}: {
  current: number;
  previous: number;
  rangeDays: number;
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
      {neutral ? <FaMinus /> : positive ? <FaArrowUp /> : <FaArrowDown />}
      {Math.abs(change).toFixed(0)}% vs previous {rangeDays}d
    </span>
  );
}

function MetricCard({
  available = true,
  current,
  description,
  icon,
  label,
  previous,
  rangeDays,
  value,
}: {
  available?: boolean;
  current?: number;
  description: string;
  icon: ReactNode;
  label: string;
  previous?: number;
  rangeDays: number;
  value: number | string;
}) {
  return (
    <article className="rounded-[18px] border border-white/9 bg-[#101012]/90 p-4 shadow-[0_16px_52px_rgba(0,0,0,0.2)]">
      <div className="flex items-start justify-between gap-3">
        <p className={labelClass}>{label}</p>
        <span className="grid h-8 w-8 place-items-center rounded-xl border border-white/8 bg-white/[0.045] text-xs text-white/42">
          {icon}
        </span>
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-white">
        {available ? value : "—"}
      </p>
      <div className="mt-2 min-h-6">
        {available && typeof current === "number" && typeof previous === "number" ? (
          <TrendBadge current={current} previous={previous} rangeDays={rangeDays} />
        ) : (
          <span className="text-[11px] text-white/38">
            {available ? description : "Data source unavailable"}
          </span>
        )}
      </div>
    </article>
  );
}

function StatusNotice({
  analyticsConfigured,
  analyticsError,
  inquiriesConfigured,
  inquiriesError,
  status,
}: Pick<
  AnalyticsDashboardProps,
  | "analyticsConfigured"
  | "analyticsError"
  | "inquiriesConfigured"
  | "inquiriesError"
  | "status"
>) {
  const message = status ? statusCopy[status] : "";
  const notices = [
    !analyticsConfigured
      ? "Analytics is unavailable until the Supabase service key is configured."
      : analyticsError,
    !inquiriesConfigured
      ? "The inquiry inbox is unavailable until the Supabase service key is configured."
      : inquiriesError,
  ].filter(Boolean) as string[];

  if (!notices.length && !message) return null;

  return (
    <div className="grid gap-2">
      {notices.map((notice) => (
        <div
          className="rounded-xl border border-amber-300/20 bg-amber-400/[0.08] px-4 py-3 text-sm leading-6 text-amber-100"
          key={notice}
        >
          {notice} Values from this source are shown as unavailable, not zero.
        </div>
      ))}
      {message ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.07] px-4 py-3 text-sm leading-6 text-white/78">
          {message}
        </div>
      ) : null}
    </div>
  );
}

function UnavailablePanel({ title }: { title: string }) {
  return (
    <section className={`${sectionClass} grid min-h-64 place-items-center text-center`}>
      <div>
        <FaExclamationTriangle className="mx-auto text-xl text-amber-200/72" />
        <h2 className="heading-ui mt-3 text-xl font-semibold text-white">{title}</h2>
        <p className="mt-2 max-w-md text-sm leading-6 text-white/42">
          This source could not be verified. Refresh after checking the Supabase
          configuration; no activity is being inferred from missing data.
        </p>
      </div>
    </section>
  );
}

function ChartBars({ daily }: { daily: AnalyticsSummary["daily"] }) {
  const max = Math.max(
    ...daily.map((day) =>
      Math.max(day.pageViews, day.outboundClicks, day.bookingSubmits)
    ),
    1
  );

  return (
    <div
      className="grid h-56 min-w-[720px] items-end gap-1 border-b border-white/8"
      style={{ gridTemplateColumns: `repeat(${daily.length}, minmax(6px, 1fr))` }}
    >
      {daily.map((day) => (
        <div
          aria-label={`${formatShortDay(day.label)}: ${day.pageViews} views, ${day.outboundClicks} outbound clicks, ${day.bookingSubmits} accepted inquiries`}
          className="group relative flex h-full items-end justify-center gap-px pt-5"
          key={day.label}
          tabIndex={0}
        >
          <span
            className="w-[44%] rounded-t-sm bg-white/72 transition group-hover:bg-white group-focus:bg-white"
            style={{ height: `${(day.pageViews / max) * 100}%` }}
          />
          <span
            className="w-[44%] rounded-t-sm bg-[#ff4d2e]/82 transition group-hover:bg-[#ff6d53] group-focus:bg-[#ff6d53]"
            style={{ height: `${(day.outboundClicks / max) * 100}%` }}
          />
          {day.bookingSubmits ? (
            <span className="absolute right-0 top-3 h-1.5 w-1.5 rounded-full bg-emerald-300" />
          ) : null}
        </div>
      ))}
    </div>
  );
}

function TrafficChart({ analytics }: { analytics: AnalyticsSummary }) {
  const hasActivity = analytics.daily.some(
    (day) => day.pageViews || day.outboundClicks || day.bookingSubmits
  );

  return (
    <section className={sectionClass}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className={labelClass}>Traffic pulse</p>
          <h2 className="heading-ui mt-2 text-2xl font-semibold text-white">
            Last {analytics.rangeDays} calendar days
          </h2>
          <p className="mt-2 text-sm text-white/42">
            Scroll the complete range horizontally on smaller screens.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 text-[11px] text-white/46">
          <span>● Page views</span>
          <span className="text-[#ff8d79]">● Outbound</span>
          <span className="text-emerald-200">● Inquiry</span>
        </div>
      </div>
      {hasActivity ? (
        <div className="mt-7 overflow-x-auto pb-2">
          <ChartBars daily={analytics.daily} />
          <div className="mt-2 flex min-w-[720px] justify-between text-[10px] text-white/28">
            <span>{formatShortDay(analytics.daily[0]?.label || "")}</span>
            <span>{formatShortDay(analytics.daily.at(-1)?.label || "")}</span>
          </div>
        </div>
      ) : (
        <div className="mt-7 grid min-h-56 place-items-center rounded-[18px] border border-dashed border-white/10 bg-black/18 p-8 text-center">
          <div>
            <FaChartLine className="mx-auto text-xl text-white/22" />
            <p className="mt-3 text-sm font-semibold text-white/58">No tracked activity yet</p>
            <p className="mt-1 text-xs text-white/34">The graph begins with the first verified public event.</p>
          </div>
        </div>
      )}
      <details className="mt-5 rounded-xl border border-white/8 bg-black/20 px-3 py-2">
        <summary className="cursor-pointer text-xs font-semibold text-white/48">View accessible daily data</summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-xs">
            <thead className="text-white/32"><tr><th className="py-2">Day</th><th>Views</th><th>Clicks</th><th>Inquiries</th></tr></thead>
            <tbody className="text-white/60">
              {analytics.daily.map((day) => (
                <tr className="border-t border-white/6" key={day.label}>
                  <td className="py-2">{formatShortDay(day.label)}</td><td>{day.pageViews}</td><td>{day.outboundClicks}</td><td>{day.bookingSubmits}</td>
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
    return <div className="rounded-[18px] border border-dashed border-white/10 p-8 text-center text-sm text-white/38">{empty}</div>;
  }
  const max = Math.max(...items.map((item) => item.value), 1);
  return (
    <div className="grid gap-4">
      {items.map((item, index) => (
        <div key={item.label}>
          <div className="flex items-center justify-between gap-4 text-sm">
            <span className="min-w-0 truncate text-white/68"><span className="mr-2 font-mono text-[10px] text-white/24">{String(index + 1).padStart(2, "0")}</span>{item.label}</span>
            <span className="shrink-0 font-semibold tabular-nums text-white">{item.value}<span className="ml-2 text-[10px] font-normal text-white/32">{total ? ((item.value / total) * 100).toFixed(0) : 0}%</span></span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-gradient-to-r from-[#ff3b1f] to-[#ff806b]" style={{ width: `${(item.value / max) * 100}%` }} /></div>
        </div>
      ))}
    </div>
  );
}

function RankingPanel({
  eyebrow,
  title,
  description,
  empty,
  items,
  total,
}: {
  eyebrow: string;
  title: string;
  description: string;
  empty: string;
  items: Array<{ label: string; value: number }>;
  total: number;
}) {
  return (
    <section className={sectionClass}>
      <p className={labelClass}>{eyebrow}</p>
      <h2 className="heading-ui mt-2 text-2xl font-semibold text-white">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-white/42">{description}</p>
      <div className="mt-6"><RankingBars empty={empty} items={items} total={total} /></div>
    </section>
  );
}

function ContactActivity({ analytics }: { analytics: AnalyticsSummary }) {
  const steps = [
    { label: "Portfolio page views", value: analytics.pageViews },
    { label: "Contact / Booking views", value: analytics.bookingPageViews },
    { label: "Accepted inquiries", value: analytics.bookingSubmits },
  ];
  const max = Math.max(...steps.map((step) => step.value), 1);
  return (
    <section className={sectionClass}>
      <p className={labelClass}>Contact activity</p>
      <h2 className="heading-ui mt-2 text-2xl font-semibold text-white">Independent activity counts</h2>
      <p className="mt-2 text-sm leading-6 text-white/42">These totals share a reporting window, but are not a session-linked conversion funnel. An inquiry is accepted when at least the inbox or e-mail delivery channel succeeds.</p>
      <div className="mt-6 grid gap-4">
        {steps.map((step, index) => (
          <div key={step.label}>
            <div className="flex items-end justify-between gap-3"><span className="text-xs text-white/52">{step.label}</span><span className="text-lg font-semibold tabular-nums text-white">{formatNumber(step.value)}</span></div>
            <div className="mt-2 h-8 overflow-hidden rounded-xl border border-white/8 bg-black/24"><div className={index === 2 ? "h-full bg-emerald-300/72" : index === 1 ? "h-full bg-[#ff4d2e]/72" : "h-full bg-white/62"} style={{ width: `${(step.value / max) * 100}%` }} /></div>
          </div>
        ))}
      </div>
    </section>
  );
}

function RecentEvents({ analytics }: { analytics: AnalyticsSummary }) {
  if (!analytics.recentEvents.length) return <div className="rounded-[18px] border border-dashed border-white/10 p-8 text-center text-sm text-white/38">No events in this range.</div>;
  return (
    <div className="grid gap-2">
      {analytics.recentEvents.map((event) => (
        <div className="grid gap-2 rounded-[16px] border border-white/8 bg-black/22 px-3.5 py-3 text-sm sm:grid-cols-[1fr_auto]" key={event.id}>
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full border border-white/9 px-2 py-0.5 text-[9px] uppercase tracking-[0.14em] text-white/40">{event.eventName.replaceAll("_", " ")}</span><span className="truncate font-semibold text-white/78">{getAnalyticsPageLabel(event.pagePath)}</span></div>{event.targetLabel ? <p className="mt-1 truncate text-xs text-white/38">→ {event.targetLabel}</p> : null}</div>
          <span className="text-[10px] text-white/28">{formatDate(event.createdAt)}</span>
        </div>
      ))}
    </div>
  );
}

function InquiryStatusBadge({ status }: { status: InquiryStatus }) {
  const tone = status === "new" ? "border-[#ff765f]/22 text-[#ffb3a7] bg-[#ff3b1f]/10" : status === "replied" ? "border-emerald-300/20 text-emerald-100 bg-emerald-500/8" : "border-white/9 text-white/48 bg-white/[0.035]";
  return <span className={`rounded-full border px-2.5 py-1 text-[10px] ${tone}`}>{status}</span>;
}

function DeliveryBadge({ status }: { status: InquiryEmailStatus }) {
  const negative = ["bounced", "complained", "failed", "suppressed"].includes(status);
  const positive = status === "delivered";
  const tone = negative
    ? "border-rose-300/20 bg-rose-500/[0.08] text-rose-100"
    : positive
      ? "border-emerald-300/20 bg-emerald-500/[0.08] text-emerald-100"
      : "border-white/9 bg-white/[0.035] text-white/42";
  return <span className={`rounded-full border px-2.5 py-1 text-[10px] ${tone}`}>Email: {status}</span>;
}

function InquiryCard({
  defaultOpen,
  disabled,
  inquiry,
  onDirty,
  onSubmit,
}: {
  defaultOpen?: boolean;
  disabled: boolean;
  inquiry: BookingInquiry;
  onDirty: (form: HTMLFormElement) => void;
  onSubmit: (form: HTMLFormElement) => boolean;
}) {
  const typeLabel = inquiry.inquiryType === "collaboration" ? "Collaboration" : "Booking";
  return (
    <AdminDisclosure badge={<span className="flex flex-wrap items-center gap-1.5"><InquiryStatusBadge status={inquiry.status} /><DeliveryBadge status={inquiry.emailStatus} /></span>} defaultOpen={defaultOpen} description={`${inquiry.email} · ${typeLabel} · ${formatDate(inquiry.createdAt)}`} id={`inquiry-${inquiry.id}`} title={inquiry.name} variant="item">
      <article>
        <a className="block truncate text-sm text-white/52 underline-offset-4 hover:text-white hover:underline" href={`mailto:${inquiry.email}`}>{inquiry.email}</a>
        <div className="mt-2 flex flex-wrap gap-2 text-[9px] uppercase tracking-[0.14em] text-white/32"><span>{inquiry.portfolioType}</span><span>·</span><span>{typeLabel}</span>{inquiry.emailStatusChangedAt ? <><span>·</span><span>email updated {formatDate(inquiry.emailStatusChangedAt)}</span></> : null}</div>
        <p className="mt-4 whitespace-pre-wrap rounded-xl border border-white/8 bg-black/24 p-4 text-sm leading-6 text-white/68">{inquiry.message}</p>
        <form
          action={updateInquiry}
          className="mt-4"
          onChangeCapture={(event) => onDirty(event.currentTarget)}
          onSubmit={(event) => {
            if (!onSubmit(event.currentTarget)) event.preventDefault();
          }}
        >
          <fieldset disabled={disabled}>
            <input name="id" type="hidden" value={inquiry.id} />
            <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
              <label><span className={labelClass}>Status</span><select className={inputClass} defaultValue={inquiry.status} name="status"><option value="new">New</option><option value="read">Read</option><option value="replied">Replied</option><option value="archived">Archived</option></select></label>
              <label><span className={labelClass}>Private notes</span><textarea className={textareaClass} defaultValue={inquiry.adminNotes} name="adminNotes" /></label>
            </div>
            <div className="mt-4 flex flex-wrap justify-end gap-2"><a className="inline-flex min-h-10 items-center justify-center rounded-xl border border-white/10 px-4 text-sm font-semibold text-white/64 transition hover:bg-white hover:text-black" href={`mailto:${inquiry.email}`}>Reply by email</a><ActionButton className={buttonClass} disabled={disabled} pendingLabel="Saving...">Save inquiry</ActionButton></div>
          </fieldset>
        </form>
        <form action={deleteInquiry} className="mt-3 flex justify-end border-t border-white/7 pt-3" onSubmit={(event) => {
          if (
            !window.confirm(`Delete the inquiry from ${inquiry.name}? This cannot be undone.`) ||
            !onSubmit(event.currentTarget)
          ) {
            event.preventDefault();
          }
        }}>
          <input name="id" type="hidden" value={inquiry.id} /><ActionButton className={dangerButtonClass} disabled={disabled} pendingLabel="Deleting...">Delete inquiry</ActionButton>
        </form>
      </article>
    </AdminDisclosure>
  );
}

function InquiriesSection({
  disabled,
  inquiries,
  inquiryPagination,
  inquirySummary,
  onDirty,
  onSubmit,
  rangeDays,
}: {
  disabled: boolean;
  inquiries: BookingInquiry[];
  inquiryPagination: InquiryPagination;
  inquirySummary: InquirySummary;
  onDirty: (form: HTMLFormElement) => void;
  onSubmit: (form: HTMLFormElement) => boolean;
  rangeDays: number;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<InquiryStatus | "all">("all");
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return inquiries.filter((inquiry) => {
      if (statusFilter !== "all" && inquiry.status !== statusFilter) return false;
      if (!needle) return true;
      return [inquiry.name, inquiry.email, inquiry.message, inquiry.adminNotes].some((value) => value.toLowerCase().includes(needle));
    });
  }, [inquiries, query, statusFilter]);
  const pageHref = (page: number) => `/admin/analytics?range=${rangeDays}&inquiryPage=${page}#inquiries`;

  return (
    <section className={sectionClass} id="inquiries">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div><p className={labelClass}>Inbox</p><h2 className="heading-ui mt-2 text-2xl font-semibold text-white">Contact inquiries</h2><p className="mt-2 text-sm text-white/42">Search the loaded page, update status, add notes, reply, or archive.</p></div>
        <div className="flex flex-wrap gap-2 text-[10px] text-white/46"><span className="rounded-full border border-white/9 px-2.5 py-1">{inquirySummary.new} new</span><span className="rounded-full border border-white/9 px-2.5 py-1">{inquirySummary.replied} replied</span><span className="rounded-full border border-white/9 px-2.5 py-1">{inquirySummary.total} total</span></div>
      </div>
      <div className="mt-5 grid gap-2 sm:grid-cols-[1fr_180px]">
        <label className="relative"><span className="sr-only">Search loaded inquiries</span><FaSearch className="absolute left-3.5 top-3.5 text-xs text-white/28" /><input className="w-full rounded-xl border border-white/10 bg-black/30 py-2.5 pl-9 pr-3 text-sm text-white outline-none focus:border-white/30" onChange={(event) => setQuery(event.target.value)} placeholder="Search this page…" type="search" value={query} /></label>
        <label><span className="sr-only">Filter by status</span><select className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none focus:border-white/30" onChange={(event) => setStatusFilter(event.target.value as InquiryStatus | "all")} value={statusFilter}><option value="all">All statuses</option><option value="new">New</option><option value="read">Read</option><option value="replied">Replied</option><option value="archived">Archived</option></select></label>
      </div>
      <p className="mt-3 text-[10px] text-white/32">Showing {inquiryPagination.from || 0}–{inquiryPagination.to || 0} of {inquirySummary.total} exact database records.</p>
      <div className="mt-4 grid gap-3">
        {visible.length ? visible.map((inquiry, index) => <InquiryCard defaultOpen={index === 0 && inquiry.status === "new"} disabled={disabled} inquiry={inquiry} key={inquiry.id} onDirty={onDirty} onSubmit={onSubmit} />) : <div className="rounded-[18px] border border-dashed border-white/10 p-8 text-center text-sm text-white/38">No inquiries match this page and filter.</div>}
      </div>
      {inquiryPagination.totalPages > 1 ? (
        <nav aria-label="Inquiry pages" className="mt-5 flex items-center justify-between gap-3 border-t border-white/7 pt-4">
          {inquiryPagination.page > 1 ? <Link className="rounded-xl border border-white/9 px-3 py-2 text-xs text-white/58 hover:bg-white hover:text-black" href={pageHref(inquiryPagination.page - 1)}>Previous</Link> : <span />}
          <span className="text-[10px] text-white/34">Page {inquiryPagination.page} of {inquiryPagination.totalPages}</span>
          {inquiryPagination.page < inquiryPagination.totalPages ? <Link className="rounded-xl border border-white/9 px-3 py-2 text-xs text-white/58 hover:bg-white hover:text-black" href={pageHref(inquiryPagination.page + 1)}>Next</Link> : <span />}
        </nav>
      ) : null}
    </section>
  );
}

type WorkspaceSection = { id: string; label: string; badge?: string; node: ReactNode };

export default function AnalyticsDashboard(props: AnalyticsDashboardProps) {
  const {
    analytics,
    analyticsAvailable,
    analyticsConfigured,
    analyticsError,
    inquiries,
    inquiriesAvailable,
    inquiriesConfigured,
    inquiriesError,
    inquiryPagination,
    inquirySummary,
    status,
  } = props;
  const [activeSectionId, setActiveSectionId] = useState("overview");
  const { clearDirty, confirmDiscard, hasUnsavedChanges, markDirty } = useUnsavedChangesGuard();
  const dirtyFormsRef = useRef<Set<HTMLFormElement>>(new Set());
  const unavailableAnalytics = <UnavailablePanel title="Analytics unavailable" />;
  const unavailableInquiries = <UnavailablePanel title="Inquiry inbox unavailable" />;
  const deliveryIssues = inquiries.filter((inquiry) =>
    ["bounced", "complained", "failed", "suppressed"].includes(
      inquiry.emailStatus
    )
  ).length;
  const deliveryKnown = inquiries.filter(
    (inquiry) => inquiry.emailStatus !== "unknown"
  ).length;

  function rememberInquiryDraft(form: HTMLFormElement) {
    dirtyFormsRef.current.add(form);
    markDirty();
  }

  function submitInquiryForm(form: HTMLFormElement) {
    const otherDraftForms = [...dirtyFormsRef.current].filter(
      (dirtyForm) => dirtyForm !== form && dirtyForm.isConnected
    );

    if (
      otherDraftForms.length > 0 &&
      !window.confirm(
        "You also have unsaved changes in another inquiry. Continuing reloads the Inbox and discards those drafts. Continue?"
      )
    ) {
      return false;
    }

    dirtyFormsRef.current.clear();
    clearDirty();
    return true;
  }

  const sections: WorkspaceSection[] = [
    {
      id: "overview",
      label: "Overview",
      node: analyticsAvailable ? <div className="grid gap-4 2xl:grid-cols-[1.4fr_0.6fr]"><TrafficChart analytics={analytics} /><ContactActivity analytics={analytics} /></div> : unavailableAnalytics,
    },
    {
      id: "acquisition",
      label: "Acquisition",
      badge: "Top 6",
      node: analyticsAvailable ? <div className="grid gap-4"><div className="rounded-[18px] border border-white/9 bg-[#101012]/90 p-4"><p className={labelClass}>Privacy-safe sessions</p><p className="mt-2 text-3xl font-semibold text-white">{formatNumber(analytics.uniqueSessions)}</p><p className="mt-1 text-xs text-white/36">Anonymous 30-minute browser sessions in this range; no raw IP or fingerprint.</p></div><div className="grid gap-4 xl:grid-cols-3"><RankingPanel description="Coarse referrer domains only; queries and full URLs are discarded." empty="No source data yet." eyebrow="Traffic sources" items={analytics.topSources} title="Where visits start" total={analytics.pageViews} /><RankingPanel description="Broad device category, derived without fingerprinting." empty="No device data yet." eyebrow="Devices" items={analytics.devices} title="Screen context" total={analytics.pageViews} /><RankingPanel description="Broad browser family only." empty="No browser data yet." eyebrow="Browsers" items={analytics.browsers} title="Browser mix" total={analytics.pageViews} /></div></div> : unavailableAnalytics,
    },
    {
      id: "content",
      label: "Content",
      badge: "Top 6",
      node: analyticsAvailable ? <RankingPanel description={`Share of tracked page views in the selected ${analytics.rangeDays}-day window.`} empty="No page views yet." eyebrow="Content performance" items={analytics.topPages} title="Top pages" total={analytics.pageViews} /> : unavailableAnalytics,
    },
    {
      id: "engagement",
      label: "Engagement",
      badge: "Top 6",
      node: analyticsAvailable ? <div className="grid gap-4 xl:grid-cols-3"><RankingPanel description="CTA, gallery, video, and contact interactions captured by a strict allowlist." empty="No engagement events yet." eyebrow="On-site engagement" items={analytics.engagements} title="Interaction signals" total={analytics.engagements.reduce((total, item) => total + item.value, 0)} /><RankingPanel description="External destinations grouped by the visitor-visible link label." empty="No outbound clicks yet." eyebrow="Outbound intent" items={analytics.topTargets} title="Chosen destinations" total={analytics.outboundClicks} /><ContactActivity analytics={analytics} /></div> : unavailableAnalytics,
    },
    {
      id: "events",
      label: "Live events",
      badge: "Latest 20",
      node: analyticsAvailable ? <section className={sectionClass}><p className={labelClass}>Privacy-safe stream</p><h2 className="heading-ui mt-2 text-2xl font-semibold text-white">Recent activity</h2><p className="mt-2 text-sm text-white/42">Latest events in the selected range. This is a capped recent list, not a total.</p><div className="mt-6"><RecentEvents analytics={analytics} /></div></section> : unavailableAnalytics,
    },
    {
      id: "inquiries",
      label: "Inbox",
      badge: inquiriesAvailable ? `${inquirySummary.new} new` : "—",
      node: inquiriesAvailable ? <InquiriesSection disabled={!inquiriesAvailable} inquiries={inquiries} inquiryPagination={inquiryPagination} inquirySummary={inquirySummary} onDirty={rememberInquiryDraft} onSubmit={submitInquiryForm} rangeDays={analytics.rangeDays} /> : unavailableInquiries,
    },
    {
      id: "health",
      label: "System health",
      node: (
        <section className={sectionClass}>
          <p className={labelClass}>Data confidence</p><h2 className="heading-ui mt-2 text-2xl font-semibold text-white">Monitoring sources</h2><p className="mt-2 text-sm text-white/42">A zero is shown only when its source loaded successfully. Revolutionary technology, apparently.</p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-[18px] border border-white/9 bg-black/22 p-4"><div className="flex items-center justify-between"><span className="font-semibold text-white">Analytics events</span><span className={analyticsAvailable ? "text-emerald-200" : "text-amber-200"}>{analyticsAvailable ? "Available" : "Unavailable"}</span></div><p className="mt-2 text-xs leading-5 text-white/38">{analyticsAvailable ? `${analytics.totalEvents} events in range · latest ${formatDate(analytics.lastEventAt)}` : analyticsError || "Configuration is incomplete."}</p></div>
            <div className="rounded-[18px] border border-white/9 bg-black/22 p-4"><div className="flex items-center justify-between"><span className="font-semibold text-white">Inquiry database</span><span className={inquiriesAvailable ? "text-emerald-200" : "text-amber-200"}>{inquiriesAvailable ? "Available" : "Unavailable"}</span></div><p className="mt-2 text-xs leading-5 text-white/38">{inquiriesAvailable ? `${inquirySummary.total} exact records · ${inquiryPagination.from}–${inquiryPagination.to} loaded · ${deliveryKnown} delivery states known${deliveryIssues ? ` · ${deliveryIssues} need attention` : ""}` : inquiriesError || "Configuration is incomplete."}</p></div>
          </div>
          {analyticsAvailable ? <div className="mt-4 grid gap-3 sm:grid-cols-3">{(["LCP", "INP", "CLS"] as const).map((name) => { const vital = analytics.webVitals.find((item) => item.name === name); return <div className="rounded-[16px] border border-white/8 bg-black/20 p-3" key={name}><div className="flex items-center justify-between"><span className="font-mono text-[10px] text-white/42">{name}</span><span className={vital?.rating === "good" ? "text-[10px] text-emerald-200" : vital ? "text-[10px] text-amber-200" : "text-[10px] text-white/30"}>{vital?.rating || "Waiting"}</span></div><p className="mt-2 text-lg font-semibold text-white">{vital ? `${name === "CLS" ? vital.value.toFixed(3) : Math.round(vital.value)}${name === "CLS" ? "" : " ms"}` : "—"}</p><p className="mt-1 text-[9px] text-white/28">{vital ? `p75 · ${vital.samples} samples` : "No samples in range"}</p></div>; })}</div> : null}
          {analytics.isCapped ? <div className="mt-4 rounded-xl border border-amber-300/16 bg-amber-400/[0.06] p-3 text-xs leading-5 text-amber-100/62">The raw event query reached 5,000 rows. Totals and comparisons are partial until server-side aggregation is added.</div> : null}
        </section>
      ),
    },
  ];

  useEffect(() => {
    const syncHash = () => {
      const hash = window.location.hash.replace(/^#/, "");
      if (sections.some((section) => section.id === hash)) setActiveSectionId(hash);
    };
    const frame = window.requestAnimationFrame(syncHash);
    window.addEventListener("hashchange", syncHash);
    return () => { window.cancelAnimationFrame(frame); window.removeEventListener("hashchange", syncHash); };
    // Section ids are static for the lifetime of this workspace.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeIndex = Math.max(0, sections.findIndex((section) => section.id === activeSectionId));
  const activeSection = sections[activeIndex];

  function openSection(id: string) {
    if (id === activeSectionId) return true;
    if (!confirmDiscard()) return false;
    dirtyFormsRef.current.clear();
    setActiveSectionId(id);
    const currentState = window.history.state && typeof window.history.state === "object" ? window.history.state : {};
    window.history.replaceState({ ...currentState }, "", `${window.location.pathname}${window.location.search}#${id}`);
    document.getElementById("analytics-workspace")?.scrollIntoView({ block: "start" });
    return true;
  }

  function onTabKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? sections.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + sections.length) % sections.length;
    const next = sections[nextIndex];
    if (!openSection(next.id)) return;
    window.requestAnimationFrame(() => {
      document.getElementById(`analytics-tab-${next.id}`)?.focus();
    });
  }

  return (
    <div className="grid gap-4">
      <StatusNotice analyticsConfigured={analyticsConfigured} analyticsError={analyticsError} inquiriesConfigured={inquiriesConfigured} inquiriesError={inquiriesError} status={status} />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-white/9 bg-[#0f0f11]/90 p-3">
        <div><p className={labelClass}>Reporting window</p><p className="mt-1 text-xs text-white/38">Every comparison uses the immediately preceding equal period.</p></div>
        <div className="flex rounded-xl border border-white/9 bg-black/24 p-1">
          {ANALYTICS_RANGE_DAYS.map((days) => <Link aria-current={analytics.rangeDays === days ? "page" : undefined} className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${analytics.rangeDays === days ? "bg-white text-black" : "text-white/44 hover:text-white"}`} href={`/admin/analytics?range=${days}#${activeSectionId}`} key={days}>{days}d</Link>)}
        </div>
      </div>

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard available={analyticsAvailable} current={analytics.currentPeriod.pageViews} description={`Page views · ${analytics.rangeDays} days`} icon={<FaChartLine />} label="Page views" previous={analytics.previousPeriod.pageViews} rangeDays={analytics.rangeDays} value={formatNumber(analytics.pageViews)} />
        <MetricCard available={analyticsAvailable} current={analytics.currentPeriod.outboundClicks} description={`External clicks · ${analytics.rangeDays} days`} icon={<FaMousePointer />} label="Outbound" previous={analytics.previousPeriod.outboundClicks} rangeDays={analytics.rangeDays} value={formatNumber(analytics.outboundClicks)} />
        <MetricCard available={inquiriesAvailable} current={inquirySummary.current7Days} description="New messages · last 7 days" icon={<FaEnvelope />} label="Inquiries" previous={inquirySummary.previous7Days} rangeDays={7} value={formatNumber(inquirySummary.current7Days)} />
        <MetricCard available={analyticsAvailable} description={`Inbox or e-mail accepted · ${analytics.rangeDays} days`} icon={<FaArrowUp />} label="Accepted inquiries" rangeDays={analytics.rangeDays} value={formatNumber(analytics.bookingSubmits)} />
      </section>

      <div className="sticky top-2 z-20 rounded-[20px] border border-white/9 bg-[#0f0f11]/95 p-2 shadow-2xl backdrop-blur-xl">
        <nav aria-label="Insights workspaces" className="flex gap-1 overflow-x-auto" role="tablist">
          {sections.map((section, index) => {
            const active = section.id === activeSection.id;
            return (
              <button aria-controls="analytics-panel" aria-selected={active} className={`min-h-12 min-w-[132px] flex-1 rounded-xl border px-3 py-2 text-left transition ${active ? "border-white/14 bg-white/[0.09] text-white" : "border-transparent text-white/44 hover:border-white/8 hover:bg-white/[0.045] hover:text-white"}`} id={`analytics-tab-${section.id}`} key={section.id} onClick={() => {
                if (openSection(section.id)) return;
                window.requestAnimationFrame(() => {
                  document.getElementById(`analytics-tab-${activeSection.id}`)?.focus();
                });
              }} onKeyDown={(event) => onTabKeyDown(event, index)} role="tab" tabIndex={active ? 0 : -1} type="button">
                <span className="font-mono text-[9px] text-white/28">{String(index).padStart(2, "0")}</span><span className="mt-0.5 flex items-center justify-between gap-2 text-xs font-semibold"><span>{section.label}</span>{section.badge ? <span className="rounded-full border border-white/8 px-1.5 py-0.5 text-[8px] tabular-nums text-white/34">{section.badge}</span> : null}</span>
              </button>
            );
          })}
        </nav>
        <div className="mt-2 flex flex-wrap items-center justify-end gap-2 px-2 text-[10px] text-white/30">
          {hasUnsavedChanges ? <span className="rounded-full border border-amber-300/18 bg-amber-400/[0.07] px-2 py-1 font-semibold text-amber-100/72">Unsaved inquiry</span> : null}
          <span className={`h-1.5 w-1.5 rounded-full ${analyticsAvailable ? "bg-emerald-300" : "bg-amber-300"}`} />
          {analyticsAvailable ? (analytics.lastEventAt ? `Updated ${formatDate(analytics.lastEventAt)}` : "Connected · waiting for first event") : "Analytics unavailable"}
        </div>
      </div>

      <div aria-labelledby={`analytics-tab-${activeSection.id}`} className="scroll-mt-28" id="analytics-panel" role="tabpanel"><div id="analytics-workspace">{activeSection.node}</div></div>
    </div>
  );
}
