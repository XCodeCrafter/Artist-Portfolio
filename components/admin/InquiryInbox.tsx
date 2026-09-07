"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  FaArchive,
  FaCheckCircle,
  FaEnvelope,
  FaExclamationTriangle,
  FaEye,
  FaReply,
  FaSearch,
} from "react-icons/fa";
import {
  deleteInquiry as deleteClassicInquiry,
  updateInquiry as updateClassicInquiry,
} from "@/app/admin/analytics/actions";
import {
  deleteInquiry as deleteV2Inquiry,
  updateInquiry as updateV2Inquiry,
} from "@/app/admin/v2/inbox/actions";
import ActionButton from "@/components/admin/ActionButton";
import AdminDisclosure from "@/components/admin/AdminDisclosure";
import useUnsavedChangesGuard, {
  getGuardedFormSubmitter,
  isGuardedFormResubmission,
  type GuardedFormSubmitter,
} from "@/components/admin/useUnsavedChangesGuard";
import type { ContactDeliveryStatus } from "@/lib/admin/contact";
import {
  getAdminInquiryPagePath,
  type AdminInquirySurface,
} from "@/lib/admin/inquiry-routes";
import type {
  BookingInquiry,
  InquiryEmailStatus,
  InquiryPagination,
  InquirySummary,
  InquiryStatus,
} from "@/lib/admin/inquiries";
import { getStoredInquiryLabel } from "@/lib/inquiries";

const statusCopy: Record<string, string> = {
  deleted: "Inquiry deleted.",
  "deleted-audit-warning":
    "Inquiry deleted, but its audit record could not be verified. Review Security activity.",
  "delete-error": "Delete failed. The inquiry is still stored.",
  invalid: "The inquiry update is invalid.",
  "missing-service": "Server-side Supabase admin access is unavailable.",
  "not-found": "That inquiry no longer exists. The Inbox has been refreshed.",
  saved: "Inquiry saved.",
  "saved-audit-warning":
    "Inquiry saved, but its audit record could not be verified. Review Security activity.",
  "save-error": "Inquiry could not be saved.",
  "security-error": "Request origin was blocked. Refresh Admin V2 and try again.",
};

const sectionClass =
  "min-w-0 scroll-mt-28 rounded-[22px] border border-white/9 bg-[#0f0f11]/92 p-4 shadow-[0_18px_65px_rgba(0,0,0,0.24)] sm:p-5";
const labelClass =
  "text-[11px] font-semibold uppercase tracking-[0.16em] text-white/46";
const inputClass =
  "mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3.5 py-2.5 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-white/30 disabled:cursor-not-allowed disabled:opacity-50";
const textareaClass = `${inputClass} min-h-24 resize-y leading-6`;
const buttonClass =
  "inline-flex min-h-10 items-center justify-center rounded-xl bg-white px-4 text-sm font-semibold text-black transition hover:bg-white/84 disabled:cursor-not-allowed disabled:opacity-45";
const dangerButtonClass =
  "inline-flex min-h-10 items-center justify-center rounded-xl border border-rose-300/22 px-4 text-sm font-semibold text-rose-100 transition hover:bg-rose-500/12 disabled:cursor-not-allowed disabled:opacity-45";

type PendingInquiryDraft = {
  adminNotes: string;
  id: string;
  status: InquiryStatus;
};

const inquiryStatuses: InquiryStatus[] = ["new", "read", "replied", "archived"];
const successfulInquiryNotices = new Set([
  "saved",
  "saved-audit-warning",
  "deleted",
  "deleted-audit-warning",
]);

function pendingDraftKey(surface: AdminInquirySurface) {
  return `artist-admin:${surface}:pending-inquiry-draft`;
}

function persistPendingDraft(
  surface: AdminInquirySurface,
  form: HTMLFormElement
) {
  const data = new FormData(form);
  const id = String(data.get("id") || "");
  const status = String(data.get("status") || "");
  const adminNotes = String(data.get("adminNotes") || "");
  if (!id || !inquiryStatuses.includes(status as InquiryStatus)) return;

  try {
    window.sessionStorage.setItem(
      pendingDraftKey(surface),
      JSON.stringify({ id, status, adminNotes })
    );
  } catch {
    // The in-page dirty guard still protects the draft if session storage is unavailable.
  }
}

function clearPendingDraft(surface: AdminInquirySurface) {
  try {
    window.sessionStorage.removeItem(pendingDraftKey(surface));
  } catch {
    // Nothing else is required when storage is unavailable.
  }
}

function readPendingDraft(
  surface: AdminInquirySurface
): PendingInquiryDraft | null {
  try {
    const raw = window.sessionStorage.getItem(pendingDraftKey(surface));
    if (!raw) return null;
    const draft = JSON.parse(raw) as Partial<PendingInquiryDraft>;
    if (
      typeof draft.id !== "string" ||
      typeof draft.adminNotes !== "string" ||
      !inquiryStatuses.includes(draft.status as InquiryStatus)
    ) {
      clearPendingDraft(surface);
      return null;
    }
    return draft as PendingInquiryDraft;
  } catch {
    clearPendingDraft(surface);
    return null;
  }
}

export function isInquiryFormDirty(form: HTMLFormElement) {
  const status = form.elements.namedItem("status");
  const adminNotes = form.elements.namedItem("adminNotes");
  if (
    !(status instanceof HTMLSelectElement) ||
    !(adminNotes instanceof HTMLTextAreaElement)
  ) {
    return false;
  }
  return (
    status.value !== form.dataset.initialStatus ||
    adminNotes.value !== form.dataset.initialAdminNotes
  );
}

function formatDate(iso: string) {
  if (!iso) return "Not available";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

function InquiryStatusBadge({ status }: { status: InquiryStatus }) {
  const tone =
    status === "new"
      ? "border-[#ff765f]/22 bg-[#ff3b1f]/10 text-[#ffb3a7]"
      : status === "replied"
        ? "border-emerald-300/20 bg-emerald-500/8 text-emerald-100"
        : "border-white/9 bg-white/[0.035] text-white/48";
  return (
    <span className={`rounded-full border px-2.5 py-1 text-[10px] ${tone}`}>
      {status}
    </span>
  );
}

function DeliveryBadge({ status }: { status: InquiryEmailStatus }) {
  const failed = ["bounced", "complained", "failed", "suppressed"].includes(
    status
  );
  const delayed = status === "delayed";
  const positive = status === "delivered";
  const tone = failed
    ? "border-rose-300/20 bg-rose-500/[0.08] text-rose-100"
    : delayed
      ? "border-amber-300/20 bg-amber-500/[0.08] text-amber-100"
      : positive
        ? "border-emerald-300/20 bg-emerald-500/[0.08] text-emerald-100"
        : "border-white/9 bg-white/[0.035] text-white/42";
  const failedCopy: Record<string, { long: string; short: string }> = {
    bounced: {
      long: "Notification bounced · message saved",
      short: "Email bounced",
    },
    complained: {
      long: "Recipient marked email as spam · message saved",
      short: "Spam complaint",
    },
    failed: {
      long: "Notification failed · message saved",
      short: "Email failed",
    },
    suppressed: {
      long: "Notification suppressed · message saved",
      short: "Email suppressed",
    },
  };
  const copy = failed
    ? failedCopy[status].long
    : delayed
      ? "Notification delayed · message saved"
      : positive
        ? "Notification delivered"
        : `Email: ${status}`;
  const shortCopy = failed
    ? failedCopy[status].short
    : delayed
      ? "Email delayed"
      : positive
        ? "Delivered"
        : `Email ${status}`;

  return (
    <span className={`rounded-full border px-2.5 py-1 text-[10px] ${tone}`}>
      <span className="sm:hidden">{shortCopy}</span>
      <span className="hidden sm:inline">{copy}</span>
    </span>
  );
}

function InquiryCard({
  defaultOpen,
  disabled,
  inquiry,
  onDirty,
  onSubmit,
  page,
  rangeDays,
  resultStatus,
  surface,
}: {
  defaultOpen?: boolean;
  disabled: boolean;
  inquiry: BookingInquiry;
  onDirty: (form: HTMLFormElement) => void;
  onSubmit: (
    form: HTMLFormElement,
    submitter?: GuardedFormSubmitter,
    onAccepted?: () => void
  ) => boolean;
  page: number;
  rangeDays: number;
  resultStatus?: string;
  surface: AdminInquirySurface;
}) {
  const typeLabel = getStoredInquiryLabel(inquiry);
  const updateAction =
    surface === "v2" ? updateV2Inquiry : updateClassicInquiry;
  const deleteAction =
    surface === "v2" ? deleteV2Inquiry : deleteClassicInquiry;
  const updateFormRef = useRef<HTMLFormElement | null>(null);
  const workflowStatusRef = useRef<HTMLSelectElement | null>(null);
  const adminNotesRef = useRef<HTMLTextAreaElement | null>(null);
  const onDirtyRef = useRef(onDirty);

  useEffect(() => {
    onDirtyRef.current = onDirty;
  }, [onDirty]);

  useEffect(() => {
    if (updateFormRef.current) {
      onDirtyRef.current(updateFormRef.current);
    }
  }, []);

  useEffect(() => {
    if (resultStatus && successfulInquiryNotices.has(resultStatus)) {
      clearPendingDraft(surface);
      if (workflowStatusRef.current) {
        workflowStatusRef.current.value = inquiry.status;
      }
      if (adminNotesRef.current) {
        adminNotesRef.current.value = inquiry.adminNotes;
      }
      if (updateFormRef.current) {
        onDirtyRef.current(updateFormRef.current);
      }
      return;
    }
    const recoveredDraft = readPendingDraft(surface);
    if (recoveredDraft?.id !== inquiry.id) return;
    if (workflowStatusRef.current) {
      workflowStatusRef.current.value = recoveredDraft.status;
    }
    if (adminNotesRef.current) {
      adminNotesRef.current.value = recoveredDraft.adminNotes;
    }
    if (updateFormRef.current) {
      onDirtyRef.current(updateFormRef.current);
    }
  }, [inquiry.adminNotes, inquiry.id, inquiry.status, resultStatus, surface]);

  return (
    <AdminDisclosure
      badge={
        <span className="flex max-w-[120px] flex-wrap items-center justify-end gap-1.5 sm:max-w-none">
          <InquiryStatusBadge status={inquiry.status} />
          <DeliveryBadge status={inquiry.emailStatus} />
        </span>
      }
      defaultOpen={defaultOpen}
      description={`${inquiry.email} · ${typeLabel} · ${formatDate(inquiry.createdAt)}`}
      id={`inquiry-${inquiry.id}`}
      title={inquiry.name}
      variant="item"
    >
      <article className="min-w-0">
        <a
          className="block break-all text-sm text-white/52 underline-offset-4 hover:text-white hover:underline"
          href={`mailto:${inquiry.email}`}
          rel="noreferrer"
          target="_blank"
        >
          {inquiry.email}
        </a>
        <div className="mt-2 flex flex-wrap gap-2 text-[9px] uppercase tracking-[0.14em] text-white/32">
          <span>{inquiry.portfolioType || "no legacy profile"}</span>
          <span>·</span>
          <span>{typeLabel}</span>
          {inquiry.emailStatusChangedAt ? (
            <>
              <span>·</span>
              <span>email updated {formatDate(inquiry.emailStatusChangedAt)}</span>
            </>
          ) : null}
        </div>
        <p className="mt-4 whitespace-pre-wrap break-words rounded-xl border border-white/8 bg-black/24 p-4 text-sm leading-6 text-white/68">
          {inquiry.message}
        </p>
        <form
          action={updateAction}
          className="mt-4"
          data-initial-admin-notes={inquiry.adminNotes}
          data-initial-status={inquiry.status}
          onChangeCapture={(event) => onDirty(event.currentTarget)}
          onSubmit={(event) => {
            if (
              !onSubmit(
                event.currentTarget,
                getGuardedFormSubmitter(event.nativeEvent),
                () => persistPendingDraft(surface, event.currentTarget)
              )
            ) {
              event.preventDefault();
            }
          }}
          ref={updateFormRef}
        >
          <fieldset disabled={disabled}>
            <input name="id" type="hidden" value={inquiry.id} />
            <input name="page" type="hidden" value={page} />
            <input name="rangeDays" type="hidden" value={rangeDays} />
            <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
              <label>
                <span className={labelClass}>Workflow status</span>
                <select
                  className={inputClass}
                  defaultValue={inquiry.status}
                  name="status"
                  ref={workflowStatusRef}
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
                  maxLength={4000}
                  name="adminNotes"
                  ref={adminNotesRef}
                />
                <span className="mt-1 block text-[10px] text-white/30">
                  Only dashboard admins can see this note.
                </span>
              </label>
            </div>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <a
                className="inline-flex min-h-10 items-center justify-center rounded-xl border border-white/10 px-4 text-sm font-semibold text-white/64 transition hover:bg-white hover:text-black"
                href={`mailto:${inquiry.email}`}
                rel="noreferrer"
                target="_blank"
              >
                Reply in email app
              </a>
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
          action={deleteAction}
          className="mt-4 flex flex-col items-end gap-2 border-t border-rose-300/10 pt-4"
          onSubmit={(event) => {
            if (
              (!isGuardedFormResubmission(event.currentTarget) &&
                !window.confirm(
                  `Delete the inquiry from ${inquiry.name}? This cannot be undone.`
                )) ||
              !onSubmit(
                event.currentTarget,
                getGuardedFormSubmitter(event.nativeEvent),
                () => clearPendingDraft(surface)
              )
            ) {
              event.preventDefault();
            }
          }}
        >
          <input name="id" type="hidden" value={inquiry.id} />
          <input name="page" type="hidden" value={page} />
          <input name="rangeDays" type="hidden" value={rangeDays} />
          <p className="max-w-sm text-right text-[10px] leading-4 text-white/28">
            Archive with the status above for normal cleanup. Delete is
            immediate and cannot be undone.
          </p>
          <ActionButton
            className={dangerButtonClass}
            disabled={disabled}
            pendingLabel="Deleting..."
          >
            Delete inquiry
          </ActionButton>
        </form>
      </article>
    </AdminDisclosure>
  );
}

export type InquiryInboxViewProps = {
  disabled: boolean;
  inquiries: BookingInquiry[];
  inquiryPagination: InquiryPagination;
  inquirySummary: InquirySummary;
  onDirty: (form: HTMLFormElement) => void;
  onSubmit: (
    form: HTMLFormElement,
    submitter?: GuardedFormSubmitter,
    onAccepted?: () => void
  ) => boolean;
  rangeDays?: number;
  resultStatus?: string;
  surface: AdminInquirySurface;
};

export function InquiryInboxView({
  disabled,
  inquiries,
  inquiryPagination,
  inquirySummary,
  onDirty,
  onSubmit,
  rangeDays = 30,
  resultStatus,
  surface,
}: InquiryInboxViewProps) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<InquiryStatus | "all">(
    "all"
  );

  useEffect(() => {
    if (
      resultStatus &&
      (successfulInquiryNotices.has(resultStatus) || resultStatus === "not-found")
    ) {
      clearPendingDraft(surface);
    }
  }, [resultStatus, surface]);
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return inquiries.filter((inquiry) => {
      if (statusFilter !== "all" && inquiry.status !== statusFilter) {
        return false;
      }
      if (!needle) return true;
      return [
        inquiry.name,
        inquiry.email,
        inquiry.message,
        inquiry.adminNotes,
      ].some((value) => value.toLowerCase().includes(needle));
    });
  }, [inquiries, query, statusFilter]);
  const visibleIds = useMemo(
    () => new Set(visible.map((inquiry) => inquiry.id)),
    [visible]
  );
  const sectionId = surface === "v2" ? "messages" : "inquiries";
  const emptyInbox = inquirySummary.total === 0;

  return (
    <section className={sectionClass} id={sectionId}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className={labelClass}>Inbox</p>
          <h2 className="heading-ui mt-2 text-2xl font-semibold text-white">
            Contact inquiries
          </h2>
          <p className="mt-2 text-sm leading-6 text-white/42">
            Read the message, reply in your email app, then update its workflow
            status or add a private note.
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
            {inquirySummary.total} total
          </span>
        </div>
      </div>
      <div
        className={`z-20 mt-5 grid min-w-0 gap-2 rounded-[18px] border border-white/8 bg-[#0d0d0f]/96 p-2 backdrop-blur-xl sm:grid-cols-[1fr_240px] ${
          surface === "v2" ? "sticky top-[76px] lg:top-3" : ""
        }`}
      >
        <label className="relative min-w-0">
          <span className="sr-only">Search the currently loaded page</span>
          <FaSearch className="absolute left-3.5 top-3.5 text-xs text-white/28" />
          <input
            className="w-full rounded-xl border border-white/10 bg-black/30 py-2.5 pl-9 pr-3 text-sm text-white outline-none focus:border-white/30"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search this loaded page…"
            type="search"
            value={query}
          />
        </label>
        <label>
          <span className="sr-only">Filter the currently loaded page by status</span>
          <select
            className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none focus:border-white/30"
            onChange={(event) =>
              setStatusFilter(event.target.value as InquiryStatus | "all")
            }
            value={statusFilter}
          >
            <option value="all">All statuses on this page</option>
            <option value="new">New on this page</option>
            <option value="read">Read on this page</option>
            <option value="replied">Replied on this page</option>
            <option value="archived">Archived on this page</option>
          </select>
        </label>
      </div>
      <p
        aria-live="polite"
        className="mt-3 text-[10px] leading-5 text-white/32"
        role="status"
      >
        Showing {inquiryPagination.from || 0}–{inquiryPagination.to || 0} of{" "}
        {inquirySummary.total} exact database records. Search and filter apply
        only to these loaded rows. {visible.length} of {inquiries.length} loaded{" "}
        {inquiries.length === 1 ? "message matches" : "messages match"} the
        current view.
      </p>
      <div className="mt-4 grid gap-3">
        {inquiries.map((inquiry) => (
          <div hidden={!visibleIds.has(inquiry.id)} key={inquiry.id}>
            <InquiryCard
              defaultOpen={
                inquiry.id === visible[0]?.id && inquiry.status === "new"
              }
              disabled={disabled}
              inquiry={inquiry}
              onDirty={onDirty}
              onSubmit={onSubmit}
              page={inquiryPagination.page}
              rangeDays={rangeDays}
              resultStatus={resultStatus}
              surface={surface}
            />
          </div>
        ))}
        {!visible.length ? (
          <div
            className="rounded-[18px] border border-dashed border-white/10 p-8 text-center text-sm text-white/38"
            role="status"
          >
            {emptyInbox
              ? "No inquiries have arrived yet."
              : "No inquiries match the search and status filter on this loaded page."}
          </div>
        ) : null}
      </div>
      {inquiryPagination.totalPages > 1 ? (
        <nav
          aria-label="Inquiry pages"
          className="mt-5 flex items-center justify-between gap-3 border-t border-white/7 pt-4"
        >
          {inquiryPagination.page > 1 ? (
            <Link
              className="rounded-xl border border-white/9 px-3 py-2 text-xs text-white/58 hover:bg-white hover:text-black"
              href={getAdminInquiryPagePath(
                surface,
                inquiryPagination.page - 1,
                rangeDays
              )}
            >
              Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-[10px] text-white/34">
            Page {inquiryPagination.page} of {inquiryPagination.totalPages}
          </span>
          {inquiryPagination.page < inquiryPagination.totalPages ? (
            <Link
              className="rounded-xl border border-white/9 px-3 py-2 text-xs text-white/58 hover:bg-white hover:text-black"
              href={getAdminInquiryPagePath(
                surface,
                inquiryPagination.page + 1,
                rangeDays
              )}
            >
              Next
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </section>
  );
}

type InquiryInboxProps = {
  delivery: ContactDeliveryStatus;
  inquiries: BookingInquiry[];
  inquiriesAvailable: boolean;
  inquiriesConfigured: boolean;
  inquiryPagination: InquiryPagination;
  inquirySummary: InquirySummary;
  inquiriesError?: string;
  status?: string;
};

function SummaryCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: number | string;
}) {
  return (
    <article className="min-w-0 rounded-[18px] border border-white/9 bg-[#101012]/90 p-4">
      <div className="flex items-start justify-between gap-3">
        <p className={labelClass}>{label}</p>
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-white/8 bg-white/[0.045] text-xs text-white/42">
          {icon}
        </span>
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-white">
        {value}
      </p>
    </article>
  );
}

export default function InquiryInbox({
  delivery,
  inquiries,
  inquiriesAvailable,
  inquiriesConfigured,
  inquiryPagination,
  inquirySummary,
  inquiriesError,
  status,
}: InquiryInboxProps) {
  const {
    clearDirty,
    hasUnsavedChanges,
    markDirty,
    prepareFormSubmission,
  } =
    useUnsavedChangesGuard();
  const dirtyFormsRef = useRef<Set<HTMLFormElement>>(new Set());
  const deliveryIssues = inquiries.filter((inquiry) =>
    ["bounced", "complained", "failed", "suppressed"].includes(
      inquiry.emailStatus
    )
  ).length;

  function rememberInquiryDraft(form: HTMLFormElement) {
    for (const dirtyForm of dirtyFormsRef.current) {
      if (!dirtyForm.isConnected) dirtyFormsRef.current.delete(dirtyForm);
    }
    if (isInquiryFormDirty(form)) {
      dirtyFormsRef.current.add(form);
      markDirty();
      return;
    }
    dirtyFormsRef.current.delete(form);
    if (dirtyFormsRef.current.size === 0) clearDirty();
  }

  function submitInquiryForm(
    form: HTMLFormElement,
    submitter?: GuardedFormSubmitter,
    onAccepted?: () => void
  ) {
    if (isGuardedFormResubmission(form)) return true;

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
    otherDraftForms.forEach((dirtyForm) => dirtyForm.reset());
    dirtyFormsRef.current.clear();
    onAccepted?.();
    return prepareFormSubmission(form, submitter);
  }

  const message = status ? statusCopy[status] : "";
  const statusNeedsAttention = Boolean(
    status && status !== "saved" && status !== "deleted"
  );

  return (
    <div className="grid min-w-0 gap-4">
      {!inquiriesConfigured || inquiriesError ? (
        <div
          className="rounded-xl border border-amber-300/20 bg-amber-400/[0.08] px-4 py-3 text-sm leading-6 text-amber-100"
          role="alert"
        >
          {inquiriesConfigured
            ? inquiriesError
            : "The inquiry Inbox is unavailable until Supabase service access is configured."}{" "}
          Values from this source are shown as unavailable, not zero.
        </div>
      ) : null}
      {message ? (
        <div
          className={`rounded-xl border px-4 py-3 text-sm leading-6 ${
            statusNeedsAttention
              ? "border-amber-300/20 bg-amber-400/[0.08] text-amber-100"
              : "border-white/10 bg-white/[0.07] text-white/78"
          }`}
          role={statusNeedsAttention ? "alert" : "status"}
        >
          {message}
        </div>
      ) : null}

      <section className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard
          icon={<FaEnvelope />}
          label="New"
          value={inquiriesAvailable ? inquirySummary.new : "—"}
        />
        <SummaryCard
          icon={<FaEye />}
          label="Read"
          value={inquiriesAvailable ? inquirySummary.read : "—"}
        />
        <SummaryCard
          icon={<FaReply />}
          label="Replied"
          value={inquiriesAvailable ? inquirySummary.replied : "—"}
        />
        <SummaryCard
          icon={<FaArchive />}
          label="Archived"
          value={inquiriesAvailable ? inquirySummary.archived : "—"}
        />
        <SummaryCard
          icon={<FaEnvelope />}
          label="Total"
          value={inquiriesAvailable ? inquirySummary.total : "—"}
        />
      </section>

      <section className="rounded-[22px] border border-white/9 bg-[#0f0f11]/92 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className={labelClass}>Delivery status</p>
            <p className="mt-2 text-sm leading-6 text-white/48">
              Configuration presence is shown here; delivered badges on each
              message are the actual provider result.
            </p>
          </div>
          {hasUnsavedChanges ? (
            <span
              className="rounded-full border border-amber-300/18 bg-amber-400/[0.07] px-3 py-1.5 text-[10px] font-semibold text-amber-100/72"
              role="status"
            >
              Unsaved inquiry changes
            </span>
          ) : null}
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <div className="rounded-[16px] border border-white/8 bg-black/22 p-3.5">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              {delivery.inboxConfigured && inquiriesAvailable ? (
                <FaCheckCircle className="text-emerald-300" />
              ) : (
                <FaExclamationTriangle className="text-amber-300" />
              )}
              Inbox storage
            </div>
            <p className="mt-2 text-xs leading-5 text-white/38">
              {delivery.inboxConfigured
                ? inquiriesAvailable
                  ? "Supabase service access is present and this Inbox loaded successfully."
                  : "Supabase service access is present; the current Inbox read is not verified."
                : "Storage is not configured in this runtime."}
            </p>
          </div>
          <div className="rounded-[16px] border border-white/8 bg-black/22 p-3.5">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              {delivery.emailConfigured ? (
                <FaCheckCircle className="text-emerald-300" />
              ) : (
                <FaExclamationTriangle className="text-amber-300" />
              )}
              Email notification
            </div>
            <p className="mt-2 text-xs leading-5 text-white/38">
              {delivery.emailConfigured
                ? "Sender and recipient settings are present; sending is not live-verified here."
                : "Not configured yet. Stored Inbox messages remain available."}
            </p>
          </div>
          <div className="rounded-[16px] border border-white/8 bg-black/22 p-3.5">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              {delivery.webhookConfigured ? (
                <FaCheckCircle className="text-emerald-300" />
              ) : (
                <FaExclamationTriangle className="text-amber-300" />
              )}
              Delivery tracking
            </div>
            <p className="mt-2 text-xs leading-5 text-white/38">
              {delivery.webhookConfigured
                ? "Webhook secret is present; provider registration and event receipt are not live-verified."
                : "Webhook tracking is not configured yet."}
            </p>
          </div>
        </div>
        {deliveryIssues ? (
          <p className="mt-3 text-[10px] leading-5 text-rose-100/64">
            {deliveryIssues} notification issue{deliveryIssues === 1 ? "" : "s"}{" "}
            on this loaded page. Every affected message is still stored in the
            Inbox.
          </p>
        ) : null}
      </section>

      {inquiriesAvailable ? (
        <InquiryInboxView
          disabled={!inquiriesAvailable}
          inquiries={inquiries}
          inquiryPagination={inquiryPagination}
          inquirySummary={inquirySummary}
          onDirty={rememberInquiryDraft}
          onSubmit={submitInquiryForm}
          resultStatus={status}
          surface="v2"
        />
      ) : (
        <section className={`${sectionClass} grid min-h-64 place-items-center text-center`}>
          <div>
            <FaExclamationTriangle className="mx-auto text-xl text-amber-200/72" />
            <h2 className="heading-ui mt-3 text-xl font-semibold text-white">
              Inquiry Inbox unavailable
            </h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-white/42">
              Refresh after checking the Supabase configuration. Missing data
              is not treated as an empty Inbox.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
