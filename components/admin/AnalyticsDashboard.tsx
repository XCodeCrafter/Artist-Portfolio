"use client";

import ActionButton from "@/components/admin/ActionButton";

import { useEffect, useState, type ReactNode } from "react";
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
  "scroll-mt-28 rounded-[28px] border border-white/12 bg-white/[0.07] p-5 shadow-[0_22px_80px_rgba(0,0,0,0.28)] backdrop-blur-2xl sm:p-6";
const itemClass =
  "rounded-[24px] border border-white/10 bg-black/24 p-4 shadow-[0_16px_55px_rgba(0,0,0,0.18)] transition duration-300 hover:border-white/18 hover:bg-white/[0.055]";
const labelClass = "text-xs font-medium uppercase tracking-[0.18em] text-white/45";
const inputClass =
  "mt-2 w-full rounded-2xl border border-white/10 bg-black/28 px-3.5 py-2.5 text-sm text-white outline-none transition duration-300 placeholder:text-white/25 focus:border-white/35 focus:bg-black/36 disabled:cursor-not-allowed disabled:opacity-50";
const textareaClass = `${inputClass} min-h-24 resize-y leading-6`;
const buttonClass =
  "inline-flex h-10 items-center justify-center rounded-2xl bg-white px-4 text-sm font-semibold text-black transition duration-300 hover:bg-white/85 disabled:cursor-not-allowed disabled:opacity-45";
const dangerButtonClass =
  "inline-flex h-10 items-center justify-center rounded-2xl border border-red-300/25 px-4 text-sm font-semibold text-red-100 transition duration-300 hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-45";

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-white/[0.065] p-5 shadow-[0_16px_55px_rgba(0,0,0,0.18)] backdrop-blur-2xl transition duration-300 hover:-translate-y-1 hover:border-white/18 hover:bg-white/[0.095]">
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/42">
        {label}
      </div>
      <div className="mt-3 text-4xl font-semibold tracking-tight text-white">
        {value}
      </div>
    </div>
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
    <div className="mt-8 space-y-3">
      {!isConfigured ? (
        <div className="rounded-lg border border-amber-300/25 bg-amber-400/10 px-4 py-3 text-sm leading-6 text-amber-100">
          Supabase service role key is not configured. Analytics and inquiries
          are read-only empty.
        </div>
      ) : null}
      {analyticsError ? (
        <div className="rounded-lg border border-red-300/25 bg-red-500/10 px-4 py-3 text-sm leading-6 text-red-100">
          {analyticsError}
        </div>
      ) : null}
      {inquiriesError ? (
        <div className="rounded-lg border border-red-300/25 bg-red-500/10 px-4 py-3 text-sm leading-6 text-red-100">
          {inquiriesError}
        </div>
      ) : null}
      {message ? (
        <div className="rounded-lg border border-white/10 bg-white/10 px-4 py-3 text-sm leading-6 text-white/80">
          {message}
        </div>
      ) : null}
    </div>
  );
}

function RankingList({
  items,
  empty,
}: {
  items: Array<{ label: string; value: number; href?: string }>;
  empty: string;
}) {
  if (!items.length) {
    return <div className="text-sm text-white/45">{empty}</div>;
  }

  return (
    <div className="grid gap-3">
      {items.map((item) => (
        <div
          className="grid grid-cols-[1fr_auto] gap-4 rounded-md border border-white/10 bg-black/25 px-3 py-2 text-sm"
          key={`${item.label}-${item.href || ""}`}
        >
          <div className="min-w-0">
            {item.href ? (
              <a
                className="block truncate text-white/75 underline-offset-4 hover:text-white hover:underline"
                href={item.href}
                rel="noreferrer"
                target="_blank"
              >
                {item.label}
              </a>
            ) : (
              <span className="block truncate text-white/75">{item.label}</span>
            )}
          </div>
          <span className="font-semibold text-white">{item.value}</span>
        </div>
      ))}
    </div>
  );
}

function DailyBars({ daily }: { daily: AnalyticsSummary["daily"] }) {
  if (!daily.length) {
    return <div className="text-sm text-white/45">No daily data yet.</div>;
  }

  const max = Math.max(
    ...daily.map((day) => day.pageViews + day.outboundClicks),
    1
  );

  return (
    <div className="grid gap-3">
      {daily.map((day) => {
        const total = day.pageViews + day.outboundClicks;
        const width = `${Math.max((total / max) * 100, 3)}%`;

        return (
          <div className="grid gap-2" key={day.label}>
            <div className="flex items-center justify-between text-xs text-white/45">
              <span>{day.label}</span>
              <span>
                {day.pageViews} views / {day.outboundClicks} clicks
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#ff3b1f] via-white/80 to-white shadow-[0_0_24px_rgba(255,59,31,0.28)]"
                style={{ width }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RecentEvents({ analytics }: { analytics: AnalyticsSummary }) {
  if (!analytics.recentEvents.length) {
    return <div className="text-sm text-white/45">No events yet.</div>;
  }

  return (
    <div className="grid gap-3">
      {analytics.recentEvents.map((event) => (
        <div
          className="rounded-md border border-white/10 bg-black/25 px-3 py-2 text-sm"
          key={event.id}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold text-white">{event.eventName}</span>
            <span className="text-xs text-white/40">
              {formatDate(event.createdAt)}
            </span>
          </div>
          <div className="mt-1 truncate text-white/55">
            {event.pagePath}
            {event.targetLabel ? ` -> ${event.targetLabel}` : ""}
          </div>
        </div>
      ))}
    </div>
  );
}

function InquiryStatusBadge({ status }: { status: InquiryStatus }) {
  const tone =
    status === "new"
      ? "border-red-300/25 text-red-100 bg-red-500/10"
      : status === "replied"
        ? "border-emerald-300/25 text-emerald-100 bg-emerald-500/10"
        : "border-white/10 text-white/55 bg-white/5";

  return (
    <span className={`rounded-md border px-2 py-1 text-xs ${tone}`}>
      {status}
    </span>
  );
}

function InquiryMeta({
  inquiry,
}: {
  inquiry: BookingInquiry;
}) {
  const typeLabel =
    inquiry.inquiryType === "collaboration"
      ? "Let's work together"
      : "Booking";

  return (
    <div className="mt-3 flex flex-wrap gap-2 text-xs uppercase tracking-[0.18em] text-white/45">
      <span className="rounded-md border border-white/10 px-2 py-1">
        {inquiry.portfolioType}
      </span>
      <span className="rounded-md border border-white/10 px-2 py-1">
        {typeLabel}
      </span>
    </div>
  );
}

function InquiryCard({
  inquiry,
  disabled,
}: {
  inquiry: BookingInquiry;
  disabled: boolean;
}) {
  return (
    <article className={itemClass}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-lg font-semibold text-white">{inquiry.name}</h3>
            <InquiryStatusBadge status={inquiry.status} />
          </div>
          <a
            className="mt-1 block text-sm text-white/60 underline-offset-4 hover:text-white hover:underline"
            href={`mailto:${inquiry.email}`}
          >
            {inquiry.email}
          </a>
          <InquiryMeta inquiry={inquiry} />
        </div>
        <span className="text-xs text-white/40">{formatDate(inquiry.createdAt)}</span>
      </div>

      <p className="mt-4 whitespace-pre-wrap rounded-md border border-white/10 bg-black/25 p-4 text-sm leading-6 text-white/75">
        {inquiry.message}
      </p>

      <form action={updateInquiry} className="mt-4">
        <fieldset disabled={disabled}>
          <input name="id" type="hidden" value={inquiry.id} />
          <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
            <label>
              <span className={labelClass}>Status</span>
              <select
                className={inputClass}
                defaultValue={inquiry.status}
                name="status"
              >
                <option value="new">new</option>
                <option value="read">read</option>
                <option value="replied">replied</option>
                <option value="archived">archived</option>
              </select>
            </label>
            <label>
              <span className={labelClass}>Admin notes</span>
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
              Save
            </ActionButton>
          </div>
        </fieldset>
      </form>

      <form action={deleteInquiry} className="mt-3 flex justify-end">
        <input name="id" type="hidden" value={inquiry.id} />
        <ActionButton
          className={dangerButtonClass}
          disabled={disabled}
          pendingLabel="Deleting..."
        >
          Delete
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className={labelClass}>Inbox</p>
          <h2 className="heading-ui mt-2 text-2xl text-white">
            Contact Inquiries
          </h2>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-white/50">
          <span>Total {inquirySummary.total}</span>
          <span>New {inquirySummary.new}</span>
          <span>Read {inquirySummary.read}</span>
          <span>Replied {inquirySummary.replied}</span>
          <span>Archived {inquirySummary.archived}</span>
        </div>
      </div>

      <div className="mt-5 grid gap-4">
        {inquiries.length ? (
          inquiries.map((inquiry) => (
            <InquiryCard
              disabled={disabled}
              inquiry={inquiry}
              key={inquiry.id}
            />
          ))
        ) : (
          <div className="rounded-lg border border-white/10 bg-black/25 p-6 text-sm text-white/45">
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
  kicker: string;
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
  const [activeSectionId, setActiveSectionId] = useState("traffic");

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
      id: "traffic",
      label: "Traffic",
      kicker: "Daily",
      description: "Page views and outbound clicks across recent days.",
      count: analytics.daily.length,
      node: (
        <section className={sectionClass}>
          <p className={labelClass}>Traffic</p>
          <h2 className="heading-ui mt-2 text-2xl text-white">
            Daily Activity
          </h2>
          <div className="mt-5">
            <DailyBars daily={analytics.daily} />
          </div>
        </section>
      ),
    },
    {
      id: "pages",
      label: "Pages",
      kicker: "Top",
      description: "Most viewed public pages.",
      count: analytics.topPages.length,
      node: (
        <section className={sectionClass}>
          <p className={labelClass}>Pages</p>
          <h2 className="heading-ui mt-2 text-2xl text-white">Top Pages</h2>
          <div className="mt-5">
            <RankingList empty="No page views yet." items={analytics.topPages} />
          </div>
        </section>
      ),
    },
    {
      id: "links",
      label: "Links",
      kicker: "Outbound",
      description: "External links visitors clicked most.",
      count: analytics.topTargets.length,
      node: (
        <section className={sectionClass}>
          <p className={labelClass}>Links</p>
          <h2 className="heading-ui mt-2 text-2xl text-white">
            Top Outbound Clicks
          </h2>
          <div className="mt-5">
            <RankingList
              empty="No outbound clicks yet."
              items={analytics.topTargets}
            />
          </div>
        </section>
      ),
    },
    {
      id: "events",
      label: "Events",
      kicker: "Recent",
      description: "Latest analytics events received by the site.",
      count: analytics.recentEvents.length,
      node: (
        <section className={sectionClass}>
          <p className={labelClass}>Events</p>
          <h2 className="heading-ui mt-2 text-2xl text-white">Recent Events</h2>
          <div className="mt-5">
            <RecentEvents analytics={analytics} />
          </div>
        </section>
      ),
    },
    {
      id: "inquiries",
      label: "Inquiries",
      kicker: "Inbox",
      description: "Contact messages, statuses, notes, and deletes.",
      count: inquirySummary.total,
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
    <div className="grid gap-6">
      <StatusNotice
        analyticsError={analyticsError}
        inquiriesError={inquiriesError}
        isConfigured={isConfigured}
        status={status}
      />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Page views" value={analytics.pageViews} />
        <StatCard label="Outbound clicks" value={analytics.outboundClicks} />
        <StatCard label="Inquiry submits" value={analytics.bookingSubmits} />
        <StatCard label="New inquiries" value={inquirySummary.new} />
      </section>

      <div>
        <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className={labelClass}>Workspace</p>
            <h2 className="heading-ui mt-2 text-2xl font-semibold tracking-tight text-white">
              Analytics Modules
            </h2>
          </div>
          <span className="text-sm text-white/45">{activeSection.label}</span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {sections.map((section) => {
            const active = section.id === activeSection.id;

            return (
              <button
                aria-pressed={active}
                className={`min-h-[154px] rounded-[24px] border p-4 text-left shadow-[0_16px_55px_rgba(0,0,0,0.18)] backdrop-blur-2xl transition duration-300 hover:-translate-y-1 ${
                  active
                    ? "border-white/24 bg-white/[0.13] text-white"
                    : "border-white/10 bg-white/[0.055] text-white/70 hover:border-white/18 hover:bg-white/[0.09] hover:text-white"
                }`}
                key={section.id}
                onClick={() => openSection(section.id)}
                type="button"
              >
                <span className="block text-xs uppercase tracking-[0.18em] text-white/45">
                  {section.kicker}
                </span>
                <span className="mt-3 block text-lg font-semibold">
                  {section.label}
                </span>
                <span className="mt-2 block text-sm leading-6 text-white/50">
                  {section.description}
                </span>
                {typeof section.count === "number" ? (
                  <span className="mt-3 inline-flex rounded-md border border-white/10 px-2 py-1 text-xs text-white/45">
                    {section.count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-6 scroll-mt-28" id="analytics-workspace">
        {activeSection.node}
      </div>
    </div>
  );
}
