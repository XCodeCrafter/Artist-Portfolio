"use client";

import ActionButton from "@/components/admin/ActionButton";
import AdminDisclosure from "@/components/admin/AdminDisclosure";
import useUnsavedChangesGuard from "@/components/admin/useUnsavedChangesGuard";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  deleteAdminProfile,
  resetAdminMfa,
  revokeAdminSessions,
  saveAdminProfile,
} from "@/app/admin/security/actions";
import type {
  AdminProfile,
  AuditLogEntry,
  SecurityCheck,
  SecurityEventSummary,
} from "@/lib/admin/security";

type SecurityCenterProps = {
  currentAdminId: string;
  allowedEmails: string[];
  profiles: AdminProfile[];
  auditLogs: AuditLogEntry[];
  securitySummary: SecurityEventSummary;
  checks: SecurityCheck[];
  isConfigured: boolean;
  canManageAdmins: boolean;
  loadError?: string;
  status?: string;
};

const statusCopy: Record<string, string> = {
  "admin-not-found": "That admin profile no longer exists. Refresh this view.",
  deleted: "Admin profile deleted.",
  "deleted-audit-warning":
    "Admin profile deleted, but the audit event could not be recorded. Review the server log and Audit Read Path status.",
  "delete-error": "Admin profile could not be deleted.",
  invalid: "Admin profile input is invalid.",
  "last-owner-required":
    "At least one active owner must remain. Promote another admin before changing this owner.",
  "missing-service": "Server-side Supabase admin key is missing.",
  "auth-user-mismatch": "The email must exactly match the Supabase Auth user.",
  "mfa-reset": "Authenticator factors removed. The admin must enroll MFA again.",
  "mfa-reset-error": "Authenticator factors could not be reset.",
  "owner-required": "Only owner admins can manage admin profiles.",
  "profile-check-error":
    "The admin profile could not be verified before changing access.",
  saved: "Admin profile saved.",
  "saved-audit-warning":
    "Admin profile saved, but the audit event could not be recorded. Review the server log and Audit Read Path status.",
  "save-error": "Admin profile could not be saved.",
  "security-error": "Request origin was blocked. Refresh admin and try again.",
  "session-revoke-error":
    "Sessions could not be revoked. An inactive profile is still blocked by admin authorization, but existing Auth sessions must be revoked after repairing the database RPC.",
  "sessions-revoked": "All sessions for this admin were revoked.",
  "sessions-revoked-audit-warning":
    "Sessions were revoked, but the audit event could not be recorded. Review the server log and Audit Read Path status.",
  "self-protected": "Your own owner profile cannot be removed or demoted here.",
};

const sectionClass =
  "scroll-mt-28 rounded-[22px] border border-white/9 bg-[#0f0f11]/92 p-4 shadow-[0_18px_65px_rgba(0,0,0,0.24)] sm:p-5";
const itemClass =
  "rounded-[18px] border border-white/9 bg-black/24 p-4 transition duration-200 hover:border-white/15";
const labelClass =
  "text-[11px] font-semibold uppercase tracking-[0.16em] text-white/46";
const inputClass =
  "mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3.5 py-2.5 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-white/30 disabled:cursor-not-allowed disabled:opacity-50";
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
    weekday: "short",
    timeZone: "UTC",
  }).format(new Date(`${iso}T00:00:00.000Z`));
}

function humanizeAction(action: string) {
  const value = action.replaceAll("_", " ");
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function Field({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={wide ? "sm:col-span-2" : ""}>
      <span className={labelClass}>{label}</span>
      {children}
    </label>
  );
}

function TextInput({
  name,
  defaultValue,
  required = false,
}: {
  name: string;
  defaultValue?: string;
  required?: boolean;
}) {
  return (
    <input
      className={inputClass}
      defaultValue={defaultValue}
      name={name}
      required={required}
      type="text"
    />
  );
}

function StatusNotice({
  status,
  isConfigured,
  loadError,
}: {
  status?: string;
  isConfigured: boolean;
  loadError?: string;
}) {
  const message = status ? statusCopy[status] : "";
  const statusIsError = Boolean(
    status &&
      (status.includes("error") ||
        status === "invalid" ||
        status === "admin-not-found" ||
        status === "auth-user-mismatch")
  );
  const statusIsWarning = Boolean(
    status &&
      (status.includes("warning") ||
        status === "last-owner-required" ||
        status === "self-protected")
  );

  if (!message && isConfigured && !loadError) return null;

  return (
    <div className="mt-8 space-y-3">
      {!isConfigured ? (
        <div className="rounded-lg border border-amber-300/25 bg-amber-400/10 px-4 py-3 text-sm leading-6 text-amber-100">
          Supabase service key is not configured. Security center is read-only
          and admin profiles cannot be verified.
        </div>
      ) : null}
      {loadError ? (
        <div className="rounded-lg border border-red-300/25 bg-red-500/10 px-4 py-3 text-sm leading-6 text-red-100">
          {loadError}
        </div>
      ) : null}
      {message ? (
        <div
          className={`rounded-lg border px-4 py-3 text-sm leading-6 ${
            statusIsError
              ? "border-red-300/25 bg-red-500/10 text-red-100"
              : statusIsWarning
                ? "border-amber-300/25 bg-amber-400/10 text-amber-100"
                : "border-emerald-300/20 bg-emerald-500/[0.08] text-emerald-100"
          }`}
        >
          {message}
        </div>
      ) : null}
    </div>
  );
}

function SecurityCheckCard({ check }: { check: SecurityCheck }) {
  return (
    <div className={itemClass}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold text-white">{check.label}</h3>
        <span
          className={`rounded-md border px-2 py-1 text-xs ${
            check.verification === "implemented"
              ? "border-sky-300/20 bg-sky-400/[0.07] text-sky-100/72"
              : check.ok
                ? "border-emerald-300/25 bg-emerald-500/10 text-emerald-100"
                : "border-red-300/25 bg-red-500/10 text-red-100"
          }`}
        >
          {check.verification === "implemented"
            ? "Implemented"
            : check.ok
              ? "Verified"
              : "Needs attention"}
        </span>
      </div>
      <p className="mt-3 text-sm leading-6 text-white/55">{check.detail}</p>
    </div>
  );
}

function CheckGrid({ checks }: { checks: SecurityCheck[] }) {
  const attentionChecks = checks.filter((check) => !check.ok);
  const passingChecks = checks.filter((check) => check.ok);
  const verifiedChecks = passingChecks.filter(
    (check) => check.verification !== "implemented"
  );
  const builtInChecks = passingChecks.filter(
    (check) => check.verification === "implemented"
  );

  return (
    <section className={sectionClass}>
      <div className="mb-5">
        <p className={labelClass}>Configuration</p>
        <h2 className="heading-ui mt-2 text-2xl text-white">Security Health</h2>
      </div>
      {attentionChecks.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {attentionChecks.map((check) => (
            <SecurityCheckCard check={check} key={check.label} />
          ))}
        </div>
      ) : null}
      <AdminDisclosure
        className={attentionChecks.length ? "mt-4" : ""}
        description="Live verification and built-in code coverage stay explicitly separated."
        id="passing-security-checks"
        title={`${verifiedChecks.length} live verified · ${builtInChecks.length} built-in`}
        variant="advanced"
      >
        <div className="grid gap-4 md:grid-cols-2">
          {passingChecks.map((check) => (
            <SecurityCheckCard check={check} key={check.label} />
          ))}
        </div>
      </AdminDisclosure>
    </section>
  );
}

function SecurityStatCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: number | string;
  detail: string;
}) {
  return (
    <div className="rounded-[18px] border border-white/9 bg-white/[0.04] p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">
        {label}
      </div>
      <div className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-white">
        {value}
      </div>
      <p className="mt-2 text-[11px] leading-5 text-white/34">{detail}</p>
    </div>
  );
}

function SecurityTimeline({ summary }: { summary: SecurityEventSummary }) {
  const max = Math.max(...summary.daily.map((day) => day.total), 1);
  const series = [
    { key: "contact" as const, label: "Contact", color: "bg-[#ff4d2e]" },
    { key: "analytics" as const, label: "Analytics", color: "bg-sky-300" },
    { key: "admin" as const, label: "Admin", color: "bg-rose-300" },
    { key: "auth" as const, label: "Auth", color: "bg-amber-300" },
    {
      key: "operations" as const,
      label: "Operations",
      color: "bg-violet-300",
    },
  ];

  return (
    <div className="rounded-[18px] border border-white/9 bg-black/22 p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className={labelClass}>Seven-day timeline</p>
          <h3 className="heading-ui mt-2 text-lg font-semibold text-white">
            Security signals by surface
          </h3>
        </div>
        <div className="flex flex-wrap gap-3 text-[10px] text-white/42">
          {series.map((item) => (
            <span className="inline-flex items-center gap-1.5" key={item.key}>
              <span className={`h-2 w-2 rounded-sm ${item.color}`} />
              {item.label}
            </span>
          ))}
        </div>
      </div>
      <div className="mt-6 grid h-48 grid-cols-7 items-end gap-2 border-b border-white/8">
        {summary.daily.map((day) => (
          <div
            aria-label={`${formatShortDay(day.label)}: ${day.total} security signals`}
            className="group relative flex h-full flex-col justify-end"
            key={day.label}
            tabIndex={0}
          >
            <div
              className="flex w-full flex-col-reverse overflow-hidden rounded-t-md"
              style={{ height: `${(day.total / max) * 100}%` }}
            >
              {series.map((item) =>
                day[item.key] > 0 ? (
                  <span
                    className={`min-h-1 w-full ${item.color}`}
                    key={item.key}
                    style={{
                      height: `${(day[item.key] / Math.max(day.total, 1)) * 100}%`,
                    }}
                  />
                ) : null
              )}
            </div>
            <span className="pointer-events-none absolute -top-7 left-1/2 z-10 hidden w-max -translate-x-1/2 rounded-lg border border-white/10 bg-black/95 px-2 py-1 text-[10px] text-white/70 group-hover:block group-focus:block">
              {formatShortDay(day.label)} · {day.total} signals
            </span>
          </div>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-7 gap-2 text-center text-[9px] text-white/28">
        {summary.daily.map((day) => (
          <span key={day.label}>{formatShortDay(day.label)}</span>
        ))}
      </div>
    </div>
  );
}

function ReasonBreakdown({ summary }: { summary: SecurityEventSummary }) {
  const reasons = [
    { label: "Honeypot caught", value: summary.honeypot7d },
    { label: "Rate limited", value: summary.rateLimited7d },
    { label: "Bad request origin", value: summary.badOrigin7d },
    { label: "Invalid payload", value: summary.invalidPayload7d },
    { label: "Oversized payload", value: summary.oversizedPayload7d },
    { label: "Submitted too fast", value: summary.tooFast7d },
    { label: "Suspicious client", value: summary.suspiciousUserAgent7d },
  ];
  const max = Math.max(...reasons.map((item) => item.value), 1);

  return (
    <div className="rounded-[18px] border border-white/9 bg-black/22 p-4 sm:p-5">
      <p className={labelClass}>Protection reasons</p>
      <h3 className="heading-ui mt-2 text-lg font-semibold text-white">
        What the guards stopped
      </h3>
      <div className="mt-5 grid gap-4">
        {reasons.map((reason) => (
          <div key={reason.label}>
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="text-white/52">{reason.label}</span>
              <span className="font-semibold tabular-nums text-white">
                {reason.value}
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="h-full rounded-full bg-emerald-300/72"
                style={{ width: `${(reason.value / max) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SecurityCountersSection({
  summary,
}: {
  summary: SecurityEventSummary;
}) {
  const protections = [
    "same-origin check",
    "request size limit",
    "schema validation",
    "dual honeypot fields",
    "minimum submit time",
    "bot user-agent block",
    "IP rate limiting",
    "analytics API guard",
    "admin action origin guard",
    "mandatory TOTP MFA / AAL2",
    "one-time recovery challenge",
    "HttpOnly secure auth cookies",
    "nonce-based script CSP",
    "media signature validation",
    "audit logging",
  ];

  return (
    <section className={sectionClass}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className={labelClass}>Protection activity</p>
          <h2 className="heading-ui mt-2 text-2xl font-semibold text-white">
            Recent guard signals
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/42">
            Blocked requests are successful defenses, not a failed security
            state. Configuration problems are shown separately in Health.
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full border px-3 py-1.5 text-[10px] ${
            summary.isCapped
              ? "border-amber-300/20 bg-amber-400/[0.07] text-amber-100/72"
              : "border-white/9 text-white/38"
          }`}
        >
          {summary.isCapped
            ? "Partial data · 1,000-event cap"
            : summary.latestAt
            ? `Latest ${formatDate(summary.latestAt)}`
            : "No signals yet"}
        </span>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SecurityStatCard
          detail="All blocked or failed security-sensitive actions"
          label="Signals · 24 hours"
          value={summary.total24h}
        />
        <SecurityStatCard
          detail="Contact form requests stopped by active guards"
          label="Contact protected · 7d"
          value={summary.contactBlocked7d}
        />
        <SecurityStatCard
          detail="Failed or denied login, MFA, and recovery attempts"
          label="Auth failures · 7d"
          value={summary.authFailures7d}
        />
        <SecurityStatCard
          detail="Email delivery and session-revoke failures"
          label="Operations alerts · 7d"
          value={summary.operationsFailures7d}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
        <SecurityTimeline summary={summary} />
        <ReasonBreakdown summary={summary} />
      </div>

      <details className="mt-4 rounded-[18px] border border-white/9 bg-black/22 p-4">
        <summary className="cursor-pointer text-xs font-semibold text-white/52">
          View built-in protection coverage
        </summary>
        <p className="mt-3 text-xs leading-5 text-white/34">
          These are code-level controls, not live probes. Their presence never
          increases the live posture score.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {protections.map((protection) => (
            <span
              className="rounded-full border border-emerald-300/14 bg-emerald-500/[0.06] px-3 py-1.5 text-xs text-emerald-100/68"
              key={protection}
            >
              {protection}
            </span>
          ))}
        </div>
      </details>
    </section>
  );
}

function AllowlistSection({ allowedEmails }: { allowedEmails: string[] }) {
  return (
    <section className={sectionClass}>
      <div className="mb-5">
        <p className={labelClass}>Environment</p>
        <h2 className="heading-ui mt-2 text-2xl text-white">Local fallback</h2>
      </div>
      {allowedEmails.length ? (
        <div className="flex flex-wrap gap-2">
          {allowedEmails.map((email) => (
            <span
              className="rounded-md border border-white/10 bg-black/25 px-3 py-2 text-sm text-white/70"
              key={email}
            >
              {email}
            </span>
          ))}
        </div>
      ) : (
        <div className="text-sm text-white/45">No local fallback emails configured.</div>
      )}
    </section>
  );
}

function AdminProfileForm({
  profile,
  canManageAdmins,
  isCurrentAdmin,
  mode = "edit",
}: {
  profile?: AdminProfile;
  canManageAdmins: boolean;
  isCurrentAdmin?: boolean;
  mode?: "edit" | "new";
}) {
  const disabled = !canManageAdmins;
  const mfaLabel =
    profile?.mfaEnrolled === true
      ? "MFA enrolled"
      : profile?.mfaEnrolled === false
        ? "MFA missing"
        : "MFA unknown";

  return (
    <AdminDisclosure
      badge={
        profile ? (
          <span className={`rounded-full border px-2 py-1 text-[9px] uppercase tracking-[0.1em] ${profile.isActive ? "border-emerald-300/15 text-emerald-100/65" : "border-white/10 text-white/35"}`}>
            {profile.isActive ? "Active" : "Inactive"}
          </span>
        ) : null
      }
      description={
        mode === "new"
          ? "Grant access to an existing Supabase Auth user."
          : `${profile?.role} · ${mfaLabel}${isCurrentAdmin ? " · Current session" : ""}`
      }
      id={mode === "new" ? "admin-profile-new" : `admin-profile-${profile?.userId}`}
      title={mode === "new" ? "+ Add admin" : profile?.email || "Admin profile"}
      variant="item"
    >
      <form action={saveAdminProfile}>
        <fieldset disabled={disabled}>
          <div className="grid gap-4 sm:grid-cols-2">
            {mode === "new" ? (
              <Field label="Supabase user ID" wide>
                <TextInput name="userId" required />
              </Field>
            ) : (
              <div className="sm:col-span-2">
                <span className={labelClass}>Supabase user ID</span>
                <code className="mt-2 block overflow-x-auto rounded-xl border border-white/8 bg-black/24 px-3.5 py-2.5 text-xs text-white/52">
                  {profile?.userId}
                </code>
                <input name="userId" type="hidden" value={profile?.userId} />
                <p className="mt-2 text-[11px] leading-5 text-white/32">
                  Identity is locked after creation. Create a new profile to
                  grant access to a different Auth user.
                </p>
              </div>
            )}
            <Field label="Email">
              <TextInput defaultValue={profile?.email} name="email" required />
            </Field>
            <Field label="Role">
              <select
                className={inputClass}
                defaultValue={profile?.role || "admin"}
                name="role"
              >
                <option value="admin">admin</option>
                <option value="owner">owner</option>
              </select>
            </Field>
          </div>

          <label className="mt-4 flex h-10 items-center gap-3 rounded-md border border-white/10 bg-black/25 px-3 text-sm text-white/75">
            <input
              className="h-4 w-4 accent-white"
              defaultChecked={profile?.isActive ?? true}
              name="isActive"
              type="checkbox"
            />
            Active
          </label>

          {profile ? (
            <div className="mt-4 grid gap-2 rounded-xl border border-white/8 bg-black/20 p-3 text-[11px] text-white/42 sm:grid-cols-2 xl:grid-cols-5">
              <div>
                <span className="block text-white/28">Auth user</span>
                <span className="mt-1 block text-white/62">
                  {profile.authUserFound === true
                    ? "Verified"
                    : profile.authUserFound === false
                      ? "Missing"
                      : "Unavailable"}
                </span>
              </div>
              <div>
                <span className="block text-white/28">MFA</span>
                <span
                  className={`mt-1 block ${
                    profile.mfaEnrolled === false
                      ? "text-amber-100/76"
                      : "text-white/62"
                  }`}
                >
                  {mfaLabel}
                </span>
              </div>
              <div>
                <span className="block text-white/28">Last sign-in</span>
                <span className="mt-1 block text-white/62">
                  {profile.lastSignInAt
                    ? formatDate(profile.lastSignInAt)
                    : "No recorded sign-in"}
                </span>
              </div>
              <div>
                <span className="block text-white/28">Access updated</span>
                <span className="mt-1 block text-white/62">
                  {formatDate(profile.updatedAt)}
                </span>
              </div>
              <div>
                <span className="block text-white/28">Auth created</span>
                <span className="mt-1 block text-white/62">
                  {profile.authCreatedAt
                    ? formatDate(profile.authCreatedAt)
                    : "Unavailable"}
                </span>
              </div>
            </div>
          ) : null}

          <div className="mt-5 flex justify-end">
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

      {profile ? (
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          <form
            action={revokeAdminSessions}
            onSubmit={(event) => {
              if (
                !window.confirm(
                  `Revoke every active session for ${profile.email}? They will need to sign in and pass MFA again.`
                )
              ) {
                event.preventDefault();
              }
            }}
          >
            <input name="userId" type="hidden" value={profile.userId} />
            <ActionButton
              className={dangerButtonClass}
              disabled={disabled || isCurrentAdmin}
              pendingLabel="Revoking..."
              title={
                isCurrentAdmin
                  ? "Use sign out for the current session. Another owner can revoke all of your sessions."
                  : undefined
              }
            >
              Revoke all sessions
            </ActionButton>
          </form>
          <form
            action={resetAdminMfa}
            onSubmit={(event) => {
              if (
                !window.confirm(
                  `Reset MFA for ${profile.email}? They will need to enroll again.`
                )
              ) {
                event.preventDefault();
              }
            }}
          >
            <input name="userId" type="hidden" value={profile.userId} />
            <ActionButton
              className={dangerButtonClass}
              disabled={disabled}
              pendingLabel="Resetting..."
            >
              Reset MFA
            </ActionButton>
          </form>
          <form
            action={deleteAdminProfile}
            onSubmit={(event) => {
              if (
                !window.confirm(
                  `Delete the admin profile for ${profile.email}? This cannot be undone.`
                )
              ) {
                event.preventDefault();
              }
            }}
          >
            <input name="userId" type="hidden" value={profile.userId} />
            <ActionButton
              className={dangerButtonClass}
              disabled={disabled || isCurrentAdmin}
              pendingLabel="Deleting..."
            >
              Delete
            </ActionButton>
          </form>
        </div>
      ) : null}
    </AdminDisclosure>
  );
}

function AdminProfilesSection({
  profiles,
  canManageAdmins,
  currentAdminId,
}: {
  profiles: AdminProfile[];
  canManageAdmins: boolean;
  currentAdminId: string;
}) {
  return (
    <section className={sectionClass} id="admin-profiles">
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className={labelClass}>Access</p>
          <h2 className="heading-ui mt-2 text-2xl text-white">Admin Profiles</h2>
        </div>
        <span className="text-sm text-white/45">
          {canManageAdmins ? "Owner controls enabled" : "Owner role required"}
        </span>
      </div>

      <div className="grid gap-4">
        {profiles.map((profile) => (
          <AdminProfileForm
            canManageAdmins={canManageAdmins}
            isCurrentAdmin={profile.userId === currentAdminId}
            key={profile.userId}
            profile={profile}
          />
        ))}
        <AdminProfileForm canManageAdmins={canManageAdmins} mode="new" />
      </div>
    </section>
  );
}

function getAuditCategory(action: string) {
  if (
    action.startsWith("security_") ||
    action.startsWith("admin_login_") ||
    action.startsWith("admin_password_") ||
    action.startsWith("booking_email_") ||
    action === "booking_inquiry_persistence_failed"
  ) {
    return "protection";
  }
  if (
    action.startsWith("admin_profile_") ||
    action.startsWith("admin_mfa_") ||
    action.startsWith("admin_sessions_")
  ) {
    return "access";
  }
  return "content";
}

function AuditLogSection({
  auditLogs,
  profiles,
}: {
  auditLogs: AuditLogEntry[];
  profiles: AdminProfile[];
}) {
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const profileEmails = useMemo(
    () => new Map(profiles.map((profile) => [profile.userId, profile.email])),
    [profiles]
  );
  const visibleLogs = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return auditLogs.filter((entry) => {
      if (category !== "all" && getAuditCategory(entry.action) !== category) {
        return false;
      }
      if (!normalizedQuery) return true;

      const haystack = [
        entry.action,
        entry.tableName,
        entry.recordId,
        profileEmails.get(entry.actorId) || entry.actorId,
        JSON.stringify(entry.metadata),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [auditLogs, category, profileEmails, query]);

  return (
    <section className={sectionClass}>
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className={labelClass}>Audit</p>
          <h2 className="heading-ui mt-2 text-2xl text-white">Recent Activity</h2>
        </div>
        <span className="text-sm text-white/45">
          {visibleLogs.length} of {auditLogs.length} latest entries
        </span>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_180px]">
        <label>
          <span className="sr-only">Search audit log</span>
          <input
            className={inputClass}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search action, actor, or record…"
            type="search"
            value={query}
          />
        </label>
        <label>
          <span className="sr-only">Filter audit category</span>
          <select
            className={inputClass}
            onChange={(event) => setCategory(event.target.value)}
            value={category}
          >
            <option value="all">All activity</option>
            <option value="protection">Protection</option>
            <option value="access">Admin access</option>
            <option value="content">Content & media</option>
          </select>
        </label>
      </div>

      {visibleLogs.length ? (
        <div className="grid gap-3">
          {visibleLogs.map((entry) => (
            <div className={itemClass} key={entry.id}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="font-semibold text-white">
                    {humanizeAction(entry.action)}
                  </h3>
                  <p className="mt-1 text-xs text-white/45">
                    {entry.tableName || "system"}
                    {entry.recordId
                      ? ` / ${profileEmails.get(entry.recordId) || entry.recordId}`
                      : ""}
                  </p>
                </div>
                <span className="text-xs text-white/40">
                  {formatDate(entry.createdAt)}
                </span>
              </div>
              <div className="mt-3 text-xs text-white/42">
                <div>
                  Actor: {profileEmails.get(entry.actorId) || entry.actorId || "System"}
                </div>
                <details className="mt-3 rounded-xl border border-white/8 bg-black/24 px-3 py-2">
                  <summary className="cursor-pointer font-semibold text-white/46">
                    View technical details
                  </summary>
                  <pre className="mt-3 overflow-auto border-t border-white/7 pt-3 text-[11px] leading-5 text-white/42">
                    {JSON.stringify(entry.metadata, null, 2)}
                  </pre>
                </details>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-white/10 bg-black/25 p-6 text-sm text-white/45">
          {auditLogs.length
            ? "No audit entries match these filters."
            : "No audit logs yet."}
        </div>
      )}
    </section>
  );
}

function SecurityPosture({
  checks,
  profiles,
  summary,
}: {
  checks: SecurityCheck[];
  profiles: AdminProfile[];
  summary: SecurityEventSummary;
}) {
  const liveChecks = checks.filter(
    (check) => check.verification !== "implemented"
  );
  const builtInChecks = checks.filter(
    (check) => check.verification === "implemented"
  );
  const verified = liveChecks.filter((check) => check.ok).length;
  const attention = liveChecks.length - verified;
  const score = liveChecks.length
    ? Math.round((verified / liveChecks.length) * 100)
    : 0;

  return (
    <section className="grid gap-3 xl:grid-cols-[1.2fr_0.8fr]">
      <article
        className={`relative overflow-hidden rounded-[22px] border p-5 ${
          attention
            ? "border-amber-300/18 bg-amber-400/[0.055]"
            : "border-emerald-300/16 bg-emerald-400/[0.05]"
        }`}
      >
        <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.09),transparent_67%)]" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className={labelClass}>Live security posture</p>
            <h2 className="heading-ui mt-2 text-2xl font-semibold text-white">
              {attention ? "Attention recommended" : "Portfolio protected"}
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-white/46">
              {attention
                ? `${attention} live check${attention === 1 ? "" : "s"} need review.`
                : "Every live runtime check is passing."}
              {" "}Built-in controls are reported separately and never pad
              this score.
            </p>
          </div>
          <div
            className="grid h-24 w-24 shrink-0 place-items-center rounded-full p-2"
            style={{
              background: `conic-gradient(#6ee7b7 ${score}%, rgba(255,255,255,0.08) ${score}% 100%)`,
            }}
          >
            <div className="grid h-full w-full place-items-center rounded-full bg-[#101012] text-center">
              <span>
                <span className="block text-2xl font-semibold text-white">
                  {score}%
                </span>
                <span className="text-[9px] uppercase tracking-[0.12em] text-white/32">
                  live
                </span>
              </span>
            </div>
          </div>
        </div>
      </article>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-2">
        <div className="rounded-[18px] border border-white/9 bg-white/[0.04] p-4">
          <p className={labelClass}>Live verified</p>
          <p className="mt-3 text-3xl font-semibold text-white">
            {verified}/{liveChecks.length}
          </p>
          <p className="mt-2 text-[11px] text-white/32">
            Runtime and configuration checks
          </p>
        </div>
        <div className="rounded-[18px] border border-white/9 bg-white/[0.04] p-4">
          <p className={labelClass}>Built-in coverage</p>
          <p className="mt-3 text-3xl font-semibold text-white">
            {builtInChecks.length}
          </p>
          <p className="mt-2 text-[11px] text-white/32">
            Code-level guard groups
          </p>
        </div>
        <div className="rounded-[18px] border border-white/9 bg-white/[0.04] p-4">
          <p className={labelClass}>Protected · 7d</p>
          <p className="mt-3 text-3xl font-semibold text-white">
            {summary.total7d}
          </p>
          <p className="mt-2 text-[11px] text-white/32">
            Security signals handled
          </p>
        </div>
        <div className="rounded-[18px] border border-white/9 bg-white/[0.04] p-4">
          <p className={labelClass}>Admins</p>
          <p className="mt-3 text-3xl font-semibold text-white">
            {profiles.filter((profile) => profile.isActive).length}
          </p>
          <p className="mt-2 text-[11px] text-white/32">
            Active access profiles
          </p>
        </div>
      </div>
    </section>
  );
}

type SecurityWorkspaceSection = {
  id: string;
  number: string;
  label: string;
  description: string;
  count?: number;
  node: ReactNode;
};

const securityHashAliases: Record<string, string> = {
  health: "configuration",
  threats: "activity",
  allowlist: "configuration",
  "admin-profiles": "access",
};

function normalizeSecurityHash(hash: string) {
  const value = hash.replace(/^#/, "");
  return securityHashAliases[value] || value;
}

export default function SecurityCenter({
  currentAdminId,
  allowedEmails,
  profiles,
  auditLogs,
  securitySummary,
  checks,
  isConfigured,
  canManageAdmins,
  loadError,
  status,
}: SecurityCenterProps) {
  const [activeSectionId, setActiveSectionId] = useState("overview");
  const {
    clearDirty,
    confirmDiscard,
    hasUnsavedChanges,
    markDirty,
  } = useUnsavedChangesGuard(
    "You have unsaved admin profile changes. Switch views and discard them?"
  );
  const dirtyFormsRef = useRef<Set<HTMLFormElement>>(new Set());

  useEffect(() => {
    const syncHash = () => {
      const hash = normalizeSecurityHash(window.location.hash);
      if (hash) setActiveSectionId(hash);
    };
    const frame = window.requestAnimationFrame(syncHash);
    window.addEventListener("hashchange", syncHash);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("hashchange", syncHash);
    };
  }, []);
  const sections: SecurityWorkspaceSection[] = [
    {
      id: "overview",
      number: "00",
      label: "Overview",
      description:
        "Live posture, built-in coverage, protection activity, and admin access at a glance.",
      count: checks.filter(
        (check) => check.verification !== "implemented" && !check.ok
      ).length,
      node: (
        <SecurityPosture
          checks={checks}
          profiles={profiles}
          summary={securitySummary}
        />
      ),
    },
    {
      id: "activity",
      number: "01",
      label: "Protection activity",
      description: "Blocked requests, auth failures, and operational signals.",
      count: securitySummary.total7d,
      node: <SecurityCountersSection summary={securitySummary} />,
    },
    {
      id: "access",
      number: "02",
      label: "Admin access",
      description: "Roles, MFA state, sign-ins, sessions, and access profiles.",
      count: profiles.length,
      node: (
        <AdminProfilesSection
          canManageAdmins={canManageAdmins && isConfigured && !loadError}
          currentAdminId={currentAdminId}
          profiles={profiles}
        />
      ),
    },
    {
      id: "audit",
      number: "03",
      label: "Audit Log",
      description: "Recent admin actions and security event metadata.",
      count: auditLogs.length,
      node: <AuditLogSection auditLogs={auditLogs} profiles={profiles} />,
    },
    {
      id: "configuration",
      number: "04",
      label: "Configuration",
      description:
        "Runtime checks, code-level controls, and development fallback settings.",
      count: checks.filter(
        (check) => check.verification !== "implemented" && !check.ok
      ).length,
      node: (
        <div className="grid gap-4">
          <CheckGrid checks={checks} />
          {process.env.NODE_ENV !== "production" ? (
            <AllowlistSection allowedEmails={allowedEmails} />
          ) : null}
        </div>
      ),
    },
  ];
  const activeSection =
    sections.find((section) => section.id === activeSectionId) || sections[0];

  function openSection(id: string) {
    if (id === activeSection.id) return true;
    if (!confirmDiscard()) return false;

    dirtyFormsRef.current.clear();
    setActiveSectionId(id);
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}${window.location.search}#${id}`
    );
    document
      .getElementById("security-workspace")
      ?.scrollIntoView({ block: "start" });
    return true;
  }

  function rememberDirtyForm(target: EventTarget | null) {
    if (!(target instanceof Element)) return;
    const form = target.closest<HTMLFormElement>("form");
    if (!form) return;

    dirtyFormsRef.current.add(form);
    markDirty();
  }

  function submitSecurityForm(form: HTMLFormElement) {
    const otherDraftForms = [...dirtyFormsRef.current].filter(
      (dirtyForm) => dirtyForm !== form && dirtyForm.isConnected
    );

    if (
      otherDraftForms.length > 0 &&
      !window.confirm(
        "You also have unsaved changes in another admin profile. Continuing reloads this view and discards those drafts. Continue?"
      )
    ) {
      return false;
    }

    dirtyFormsRef.current.clear();
    clearDirty();
    return true;
  }

  function handleTabKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number
  ) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      return;
    }

    event.preventDefault();
    let nextIndex = index;
    if (event.key === "ArrowLeft") {
      nextIndex = (index - 1 + sections.length) % sections.length;
    } else if (event.key === "ArrowRight") {
      nextIndex = (index + 1) % sections.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = sections.length - 1;
    }

    const nextSection = sections[nextIndex];
    if (!openSection(nextSection.id)) return;
    window.requestAnimationFrame(() => {
      document.getElementById(`security-tab-${nextSection.id}`)?.focus();
    });
  }

  return (
    <div
      className="grid gap-4"
      onChangeCapture={(event) => {
        const target = event.target;
        if (
          (target instanceof HTMLInputElement ||
            target instanceof HTMLSelectElement ||
            target instanceof HTMLTextAreaElement) &&
          target.name &&
          target.closest("form")
        ) {
          rememberDirtyForm(target);
        }
      }}
      onSubmit={(event) => {
        if (event.defaultPrevented) return;
        const form = event.target;
        if (
          form instanceof HTMLFormElement &&
          !submitSecurityForm(form)
        ) {
          event.preventDefault();
        }
      }}
    >
      <StatusNotice
        isConfigured={isConfigured}
        loadError={loadError}
        status={status}
      />

      {securitySummary.isCapped ? (
        <div
          className="rounded-xl border border-amber-300/22 bg-amber-400/[0.08] px-4 py-3 text-sm leading-6 text-amber-100/80"
          role="status"
        >
          The seven-day query reached its 1,000-event limit. Security totals
          shown here are minimums; open the Supabase audit_logs table for the
          full history.
        </div>
      ) : null}

      <div className="sticky top-3 z-20 rounded-[22px] border border-white/9 bg-[#0f0f11]/95 p-2 shadow-[0_14px_38px_rgba(0,0,0,0.3)] backdrop-blur-xl">
        {hasUnsavedChanges ? (
          <div
            className="mb-2 rounded-lg border border-amber-300/18 bg-amber-400/[0.06] px-3 py-2 text-[11px] text-amber-100/70"
            role="status"
          >
            Unsaved admin profile changes
          </div>
        ) : null}
        <nav
          aria-label="Security views"
          className="admin-scrollbar-none flex snap-x gap-1 overflow-x-auto"
          role="tablist"
        >
          {sections.map((section, index) => {
            const active = section.id === activeSection.id;

            return (
              <button
                aria-controls={`security-panel-${section.id}`}
                aria-selected={active}
                className={`min-h-12 min-w-[148px] flex-1 snap-start rounded-xl border px-3 py-2 text-left transition ${
                  active
                    ? "border-white/14 bg-white/[0.09] text-white"
                    : "border-transparent text-white/48 hover:border-white/8 hover:bg-white/[0.045] hover:text-white"
                }`}
                id={`security-tab-${section.id}`}
                key={section.id}
                onClick={() => {
                  if (openSection(section.id)) return;
                  window.requestAnimationFrame(() => {
                    document
                      .getElementById(`security-tab-${activeSection.id}`)
                      ?.focus();
                  });
                }}
                onKeyDown={(event) => handleTabKeyDown(event, index)}
                role="tab"
                tabIndex={active ? 0 : -1}
                type="button"
              >
                <span className="flex items-center justify-between gap-2 text-xs font-semibold">
                  <span>
                    <span className="mr-2 text-[9px] tracking-[0.12em] text-white/28">
                      {section.number}
                    </span>
                    {section.label}
                  </span>
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
      </div>

      <div className="scroll-mt-28" id="security-workspace">
        {sections
          .filter((section) => section.id !== activeSection.id)
          .map((section) => (
            <div
              aria-labelledby={`security-tab-${section.id}`}
              hidden
              id={`security-panel-${section.id}`}
              key={section.id}
              role="tabpanel"
            />
          ))}
        <div
          aria-labelledby={`security-tab-${activeSection.id}`}
          id={`security-panel-${activeSection.id}`}
          key={activeSection.id}
          role="tabpanel"
          tabIndex={0}
        >
          {activeSection.node}
        </div>
      </div>
    </div>
  );
}
