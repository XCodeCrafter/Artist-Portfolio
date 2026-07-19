"use client";

import ActionButton from "@/components/admin/ActionButton";

import { useEffect, useState, type ReactNode } from "react";
import {
  deleteAdminProfile,
  resetAdminMfa,
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
  deleted: "Admin profile deleted.",
  "delete-error": "Admin profile could not be deleted.",
  invalid: "Admin profile input is invalid.",
  "missing-service": "Server-side Supabase admin key is missing.",
  "auth-user-mismatch": "The email must exactly match the Supabase Auth user.",
  "mfa-reset": "Authenticator factors removed. The admin must enroll MFA again.",
  "mfa-reset-error": "Authenticator factors could not be reset.",
  "owner-required": "Only owner admins can manage admin profiles.",
  saved: "Admin profile saved.",
  "save-error": "Admin profile could not be saved.",
  "security-error": "Request origin was blocked. Refresh admin and try again.",
  "self-protected": "Your own owner profile cannot be removed or demoted here.",
};

const sectionClass =
  "scroll-mt-28 rounded-[28px] border border-white/12 bg-white/[0.07] p-5 shadow-[0_22px_80px_rgba(0,0,0,0.28)] backdrop-blur-2xl sm:p-6";
const itemClass =
  "rounded-[24px] border border-white/10 bg-black/24 p-4 shadow-[0_16px_55px_rgba(0,0,0,0.18)] transition duration-300 hover:border-white/18 hover:bg-white/[0.055]";
const labelClass = "text-xs font-medium uppercase tracking-[0.18em] text-white/45";
const inputClass =
  "mt-2 w-full rounded-2xl border border-white/10 bg-black/28 px-3.5 py-2.5 text-sm text-white outline-none transition duration-300 placeholder:text-white/25 focus:border-white/35 focus:bg-black/36 disabled:cursor-not-allowed disabled:opacity-50";
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
        <div className="rounded-lg border border-white/10 bg-white/10 px-4 py-3 text-sm leading-6 text-white/80">
          {message}
        </div>
      ) : null}
    </div>
  );
}

function CheckGrid({ checks }: { checks: SecurityCheck[] }) {
  return (
    <section className={sectionClass}>
      <div className="mb-5">
        <p className={labelClass}>Configuration</p>
        <h2 className="heading-ui mt-2 text-2xl text-white">Security Health</h2>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {checks.map((check) => (
          <div className={itemClass} key={check.label}>
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-semibold text-white">{check.label}</h3>
              <span
                className={`rounded-md border px-2 py-1 text-xs ${
                  check.ok
                    ? "border-emerald-300/25 bg-emerald-500/10 text-emerald-100"
                    : "border-red-300/25 bg-red-500/10 text-red-100"
                }`}
              >
                {check.ok ? "OK" : "Needs attention"}
              </span>
            </div>
            <p className="mt-3 text-sm leading-6 text-white/55">
              {check.detail}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function SecurityStatCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number | string;
  tone?: "neutral" | "warning";
}) {
  return (
    <div
      className={`rounded-[24px] border p-4 shadow-[0_16px_55px_rgba(0,0,0,0.18)] backdrop-blur-2xl transition duration-300 hover:-translate-y-1 ${
        tone === "warning"
          ? "border-amber-300/25 bg-amber-400/10"
          : "border-white/10 bg-white/[0.055] hover:border-white/18 hover:bg-white/[0.085]"
      }`}
    >
      <div className="text-xs uppercase tracking-[0.18em] text-white/45">
        {label}
      </div>
      <div className="mt-3 text-3xl font-semibold text-white">{value}</div>
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
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className={labelClass}>Threat Monitor</p>
          <h2 className="heading-ui mt-2 text-2xl text-white">
            Blocked Activity
          </h2>
        </div>
        <span className="text-sm text-white/45">
          {summary.latestAt ? `Latest ${formatDate(summary.latestAt)}` : "No events yet"}
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SecurityStatCard
          label="Threat events 24h"
          tone={summary.total24h > 0 ? "warning" : "neutral"}
          value={summary.total24h}
        />
        <SecurityStatCard label="Threat events 7d" value={summary.total7d} />
        <SecurityStatCard
          label="Contact blocked"
          value={summary.contactBlocked7d}
        />
        <SecurityStatCard
          label="Analytics blocked"
          value={summary.analyticsBlocked7d}
        />
        <SecurityStatCard label="Admin blocked" value={summary.adminBlocked7d} />
        <SecurityStatCard label="Honeypot traps" value={summary.honeypot7d} />
        <SecurityStatCard label="Rate limited" value={summary.rateLimited7d} />
        <SecurityStatCard label="Bad origins" value={summary.badOrigin7d} />
        <SecurityStatCard
          label="Invalid payloads"
          value={summary.invalidPayload7d}
        />
        <SecurityStatCard label="Too fast" value={summary.tooFast7d} />
        <SecurityStatCard
          label="Suspicious clients"
          value={summary.suspiciousUserAgent7d}
        />
      </div>

      <div className="mt-5 rounded-lg border border-white/10 bg-black/25 p-4">
        <div className="text-xs uppercase tracking-[0.18em] text-white/45">
          Active protections
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {protections.map((protection) => (
            <span
              className="rounded-md border border-emerald-300/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100"
              key={protection}
            >
              {protection}
            </span>
          ))}
        </div>
      </div>
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

  return (
    <div className={itemClass}>
      <form action={saveAdminProfile}>
        <fieldset disabled={disabled}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-white">
                {mode === "new" ? "New admin profile" : profile?.email}
              </h3>
              {isCurrentAdmin ? (
                <p className="mt-1 text-xs text-white/45">Current session</p>
              ) : null}
            </div>
            {profile ? (
              <span
                className={`rounded-md border px-2 py-1 text-xs ${
                  profile.isActive
                    ? "border-emerald-300/25 bg-emerald-500/10 text-emerald-100"
                    : "border-white/10 bg-white/5 text-white/45"
                }`}
              >
                {profile.isActive ? "Active" : "Inactive"}
              </span>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Supabase user ID" wide>
              <TextInput
                defaultValue={profile?.userId}
                name="userId"
                required
              />
            </Field>
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
          <form action={resetAdminMfa}>
            <input name="userId" type="hidden" value={profile.userId} />
            <ActionButton
              className={dangerButtonClass}
              disabled={disabled}
              pendingLabel="Resetting..."
            >
              Reset MFA
            </ActionButton>
          </form>
          <form action={deleteAdminProfile}>
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
    </div>
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

function AuditLogSection({ auditLogs }: { auditLogs: AuditLogEntry[] }) {
  return (
    <section className={sectionClass}>
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className={labelClass}>Audit</p>
          <h2 className="heading-ui mt-2 text-2xl text-white">Recent Activity</h2>
        </div>
        <span className="text-sm text-white/45">{auditLogs.length} entries</span>
      </div>

      {auditLogs.length ? (
        <div className="grid gap-3">
          {auditLogs.map((entry) => (
            <div className={itemClass} key={entry.id}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="font-semibold text-white">{entry.action}</h3>
                  <p className="mt-1 text-xs text-white/45">
                    {entry.tableName || "system"}
                    {entry.recordId ? ` / ${entry.recordId}` : ""}
                  </p>
                </div>
                <span className="text-xs text-white/40">
                  {formatDate(entry.createdAt)}
                </span>
              </div>
              <div className="mt-3 grid gap-2 text-xs text-white/45 sm:grid-cols-2">
                <div>Actor: {entry.actorId || "unknown"}</div>
                <pre className="overflow-auto rounded-md border border-white/10 bg-black/35 p-3 text-white/50">
                  {JSON.stringify(entry.metadata, null, 2)}
                </pre>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-white/10 bg-black/25 p-6 text-sm text-white/45">
          No audit logs yet.
        </div>
      )}
    </section>
  );
}

type SecurityWorkspaceSection = {
  id: string;
  label: string;
  kicker: string;
  description: string;
  count?: number;
  node: ReactNode;
};

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
  const [activeSectionId, setActiveSectionId] = useState("health");

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
  const sections: SecurityWorkspaceSection[] = [
    {
      id: "health",
      label: "Health",
      kicker: "Configuration",
      description: "Supabase, service key, allowlist, Redis, and email checks.",
      count: checks.filter((check) => !check.ok).length,
      node: <CheckGrid checks={checks} />,
    },
    {
      id: "threats",
      label: "Threats",
      kicker: "Monitor",
      description: "Blocked contact, analytics, and admin-origin attempts.",
      count: securitySummary.total7d,
      node: <SecurityCountersSection summary={securitySummary} />,
    },
    {
      id: "allowlist",
      label: "Local fallback",
      kicker: "Environment",
      description: "Development-only fallback emails from ADMIN_EMAILS.",
      count: allowedEmails.length,
      node: <AllowlistSection allowedEmails={allowedEmails} />,
    },
    {
      id: "admin-profiles",
      label: "Admin Profiles",
      kicker: "Access",
      description: "Owner/admin roles and active Supabase admin profiles.",
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
      label: "Audit Log",
      kicker: "Activity",
      description: "Recent admin actions and security event metadata.",
      count: auditLogs.length,
      node: <AuditLogSection auditLogs={auditLogs} />,
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
      .getElementById("security-workspace")
      ?.scrollIntoView({ block: "start" });
  }

  return (
    <div className="grid gap-6">
      <StatusNotice
        isConfigured={isConfigured}
        loadError={loadError}
        status={status}
      />

      <div>
        <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className={labelClass}>Workspace</p>
            <h2 className="heading-ui mt-2 text-2xl font-semibold tracking-tight text-white">
              Security Modules
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

      <div className="mt-6 scroll-mt-28" id="security-workspace">
        {activeSection.node}
      </div>
    </div>
  );
}
