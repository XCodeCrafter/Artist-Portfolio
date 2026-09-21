import {
  getAllowedAdminEmails,
  type AdminRole,
  type AdminUser,
} from "@/lib/admin/auth";
import {
  createAdminServiceClient,
  hasAdminServiceEnv,
} from "@/lib/admin/service";
import {
  getProductionReadiness,
  type ReadinessCheck,
} from "@/lib/admin/readiness";

export type AdminProfile = {
  userId: string;
  email: string;
  role: AdminRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  authUserFound: boolean | null;
  authCreatedAt: string;
  lastSignInAt: string;
  mfaEnrolled: boolean | null;
};

export type AuditLogEntry = {
  id: string;
  actorId: string;
  action: string;
  tableName: string;
  recordId: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type SecurityCheck = {
  id?: string;
  label: string;
  ok: boolean;
  status?: "pass" | "fail" | "unknown";
  critical?: boolean;
  href?: string;
  detail: string;
  verification?: "runtime" | "implemented";
};

export const SECURITY_EVENT_ACTIONS = [
  "security_contact_payload_too_large",
  "security_contact_invalid_payload",
  "security_contact_bad_origin",
  "security_contact_honeypot",
  "security_contact_too_fast",
  "security_contact_rate_limited",
  "security_contact_suspicious_user_agent",
  "security_analytics_payload_too_large",
  "security_analytics_invalid_payload",
  "security_analytics_bad_origin",
  "security_analytics_rate_limited",
  "security_analytics_suspicious_user_agent",
  "security_admin_bad_origin",
  "security_admin_login_rate_limited",
  "security_admin_password_reset_rate_limited",
  "security_admin_mfa_rate_limited",
  "security_admin_media_upload_rejected",
  "security_admin_session_revoke_failed",
  "security_admin_mfa_session_revoke_failed",
  "admin_login_failed",
  "admin_login_denied",
  "admin_mfa_verification_failed",
  "admin_password_reset_request_failed",
  "admin_password_update_failed",
  "booking_email_failed",
  "booking_email_tracking_failed",
  "booking_email_webhook_unmatched",
  "booking_inquiry_persistence_failed",
] as const;

export type SecurityEventAction = (typeof SECURITY_EVENT_ACTIONS)[number];

export type SecurityEventSummary = {
  total24h: number;
  total7d: number;
  honeypot7d: number;
  rateLimited7d: number;
  invalidPayload7d: number;
  oversizedPayload7d: number;
  tooFast7d: number;
  badOrigin7d: number;
  suspiciousUserAgent7d: number;
  contactBlocked7d: number;
  analyticsBlocked7d: number;
  adminBlocked7d: number;
  authFailures7d: number;
  operationsFailures7d: number;
  latestAt: string;
  isCapped: boolean;
  daily: Array<{
    label: string;
    contact: number;
    analytics: number;
    admin: number;
    auth: number;
    operations: number;
    total: number;
  }>;
  byAction: Record<SecurityEventAction, number>;
};

type AdminProfileRow = {
  user_id: string;
  email: string;
  role: AdminRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type AuditLogRow = {
  id: string;
  actor_id: string | null;
  action: string;
  table_name: string;
  record_id: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

function isAdminProfileRow(value: unknown): value is AdminProfileRow {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return typeof row.user_id === "string" && typeof row.email === "string" &&
    (row.role === "owner" || row.role === "admin") &&
    typeof row.is_active === "boolean" && typeof row.created_at === "string" &&
    typeof row.updated_at === "string";
}

function isAuditLogRow(value: unknown): value is AuditLogRow {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === "string" &&
    (row.actor_id === null || typeof row.actor_id === "string") &&
    typeof row.action === "string" && typeof row.table_name === "string" &&
    typeof row.record_id === "string" && typeof row.created_at === "string" &&
    Boolean(row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata));
}

function isReadableAuthUser(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const user = value as Record<string, unknown>;
  return typeof user.id === "string" &&
    typeof user.created_at === "string" &&
    (user.last_sign_in_at === undefined || typeof user.last_sign_in_at === "string") &&
    (user.factors === undefined || (Array.isArray(user.factors) && user.factors.every(factor =>
      factor && typeof factor === "object" && typeof factor.status === "string")));
}

const SECURITY_EVENT_SET = new Set<string>(SECURITY_EVENT_ACTIONS);
const ADMIN_AUTH_RATE_LIMIT_EVENT_SET = new Set<SecurityEventAction>([
  "security_admin_login_rate_limited",
  "security_admin_password_reset_rate_limited",
  "security_admin_mfa_rate_limited",
]);

function getRecentDayLabels(days: number) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  return Array.from({ length: days }, (_, index) => {
    const date = new Date(today);
    date.setUTCDate(today.getUTCDate() - (days - index - 1));
    return date.toISOString().slice(0, 10);
  });
}

function emptySecurityEventSummary(): SecurityEventSummary {
  return {
    total24h: 0,
    total7d: 0,
    honeypot7d: 0,
    rateLimited7d: 0,
    invalidPayload7d: 0,
    oversizedPayload7d: 0,
    tooFast7d: 0,
    badOrigin7d: 0,
    suspiciousUserAgent7d: 0,
    contactBlocked7d: 0,
    analyticsBlocked7d: 0,
    adminBlocked7d: 0,
    authFailures7d: 0,
    operationsFailures7d: 0,
    latestAt: "",
    isCapped: false,
    daily: getRecentDayLabels(7).map((label) => ({
      label,
      contact: 0,
      analytics: 0,
      admin: 0,
      auth: 0,
      operations: 0,
      total: 0,
    })),
    byAction: SECURITY_EVENT_ACTIONS.reduce(
      (counts, action) => ({ ...counts, [action]: 0 }),
      {} as Record<SecurityEventAction, number>
    ),
  };
}

function isSecurityEventAction(action: string): action is SecurityEventAction {
  return SECURITY_EVENT_SET.has(action);
}

function buildSecurityEventSummary(
  securityLogs: AuditLogEntry[],
  isCapped = false
): SecurityEventSummary {
  const summary = emptySecurityEventSummary();
  summary.isCapped = isCapped;
  const last24h = Date.now() - 24 * 60 * 60 * 1000;
  const dailyMap = new Map(
    summary.daily.map((day) => [day.label, day] as const)
  );

  for (const log of securityLogs) {
    if (!isSecurityEventAction(log.action)) continue;

    summary.total7d += 1;
    summary.byAction[log.action] += 1;

    let surface:
      | "contact"
      | "analytics"
      | "admin"
      | "auth"
      | "operations"
      | "" = "";

    if (
      log.action === "booking_email_failed" ||
      log.action === "booking_email_tracking_failed" ||
      log.action === "booking_email_webhook_unmatched" ||
      log.action === "booking_inquiry_persistence_failed" ||
      log.action === "security_admin_session_revoke_failed" ||
      log.action === "security_admin_mfa_session_revoke_failed"
    ) {
      summary.operationsFailures7d += 1;
      surface = "operations";
    } else if (ADMIN_AUTH_RATE_LIMIT_EVENT_SET.has(log.action)) {
      summary.authFailures7d += 1;
      surface = "auth";
    } else if (log.action.startsWith("security_contact_")) {
      summary.contactBlocked7d += 1;
      surface = "contact";
    } else if (log.action.startsWith("security_analytics_")) {
      summary.analyticsBlocked7d += 1;
      surface = "analytics";
    } else if (log.action.startsWith("security_admin_")) {
      summary.adminBlocked7d += 1;
      surface = "admin";
    } else if (
      log.action.startsWith("admin_login_") ||
      log.action.startsWith("admin_mfa_") ||
      log.action.startsWith("admin_password_")
    ) {
      summary.authFailures7d += 1;
      surface = "auth";
    }

    const createdAt = new Date(log.createdAt).getTime();
    if (!Number.isNaN(createdAt) && createdAt >= last24h) {
      summary.total24h += 1;
    }

    if (!summary.latestAt || log.createdAt > summary.latestAt) {
      summary.latestAt = log.createdAt;
    }

    const day = dailyMap.get(log.createdAt.slice(0, 10));
    if (day) {
      day.total += 1;
      if (surface) day[surface] += 1;
    }
  }

  summary.honeypot7d = summary.byAction.security_contact_honeypot;
  summary.rateLimited7d =
    summary.byAction.security_contact_rate_limited +
    summary.byAction.security_analytics_rate_limited +
    summary.byAction.security_admin_login_rate_limited +
    summary.byAction.security_admin_password_reset_rate_limited +
    summary.byAction.security_admin_mfa_rate_limited;
  summary.invalidPayload7d =
    summary.byAction.security_contact_invalid_payload +
    summary.byAction.security_analytics_invalid_payload;
  summary.oversizedPayload7d =
    summary.byAction.security_contact_payload_too_large +
    summary.byAction.security_analytics_payload_too_large;
  summary.tooFast7d = summary.byAction.security_contact_too_fast;
  summary.badOrigin7d =
    summary.byAction.security_contact_bad_origin +
    summary.byAction.security_analytics_bad_origin +
    summary.byAction.security_admin_bad_origin;
  summary.suspiciousUserAgent7d =
    summary.byAction.security_contact_suspicious_user_agent +
    summary.byAction.security_analytics_suspicious_user_agent;

  return summary;
}

function mapAdminProfile(row: AdminProfileRow): AdminProfile {
  return {
    userId: row.user_id,
    email: row.email,
    role: row.role,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    authUserFound: null,
    authCreatedAt: "",
    lastSignInAt: "",
    mfaEnrolled: null,
  };
}

function mapAuditLog(row: AuditLogRow): AuditLogEntry {
  return {
    id: row.id,
    actorId: row.actor_id || "",
    action: row.action,
    tableName: row.table_name,
    recordId: row.record_id,
    metadata: row.metadata || {},
    createdAt: row.created_at,
  };
}

function getSecurityChecks(
  readinessChecks: ReadinessCheck[],
  profiles: AdminProfile[],
  profilesReadReady = false,
  auditReadReady = false,
  latestAuditAt = "",
  authDirectoryReady = false
): SecurityCheck[] {
  const allowedEmails = getAllowedAdminEmails();
  const hasServiceKey = hasAdminServiceEnv();
  const isProduction = process.env.NODE_ENV === "production";
  const authorizationReady = hasServiceKey
    ? profilesReadReady && profiles.some((profile) => profile.isActive)
    : !isProduction && allowedEmails.length > 0;

  return [
    // Production checks have one source for Classic, V2 Overview and Security.
    // Only presentation-safe statuses cross this boundary, never provider errors
    // or environment values. The shared loader performs no write probes.
    ...readinessChecks.map((check): SecurityCheck => ({
      id: check.id,
      label: check.label,
      ok: check.ok,
      status: check.status,
      critical: check.critical,
      href: check.href,
      detail: check.detail,
      verification: "runtime",
    })),
    {
      id: "admin-authorization-source",
      label: "Admin Authorization Source",
      ok: authorizationReady,
      status: hasServiceKey && !profilesReadReady
        ? "unknown"
        : authorizationReady ? "pass" : "fail",
      critical: true,
      detail: hasServiceKey
        ? !profilesReadReady
          ? "Admin profiles could not be read. Their current authorization state is unknown; retry or inspect Supabase access."
          : authorizationReady
            ? "Active admin_profiles rows are authoritative."
            : "No active admin profiles were found. Configure admin access before production use."
        : isProduction
          ? "Production requires the server key and active admin profiles."
          : `${allowedEmails.length} local fallback email(s) in ADMIN_EMAILS.`,
      verification: "runtime",
    },
    {
      id: "admin-auth-directory",
      label: "Admin Auth Directory",
      ok: authDirectoryReady,
      status: authDirectoryReady ? "pass" : "unknown",
      critical: false,
      verification: "runtime",
      detail: authDirectoryReady
        ? "Supabase Auth users, MFA enrollment, and sign-in metadata are readable."
        : "Admin Auth metadata could not be verified with the server key.",
    },
    {
      id: "audit-read-path",
      label: "Audit Read Path",
      ok: auditReadReady,
      status: auditReadReady ? "pass" : "unknown",
      critical: true,
      verification: "runtime",
      detail: auditReadReady
        ? latestAuditAt
          ? `Audit storage is readable. Latest recorded event: ${latestAuditAt}. Write failures are reported separately by server actions.`
          : "Audit storage is readable. No events have been recorded yet; a safe write probe is not performed on page load."
        : "The audit log table could not be read. Audit writes also report explicit server errors.",
    },
    {
      id: "public-api-guards",
      label: "Public API Guards",
      ok: true,
      verification: "implemented",
      detail:
        "Contact and analytics APIs use payload limits, origin checks, bot filters, and audit logging.",
    },
    {
      id: "admin-action-guard",
      label: "Admin Action Guard",
      ok: true,
      verification: "implemented",
      detail:
        "Admin write actions verify same-origin requests before changing content or access.",
    },
  ];
}

async function getSecurityEventLogs(): Promise<{
  logs: AuditLogEntry[];
  isCapped: boolean;
  error?: unknown;
}> {
  const supabase = createAdminServiceClient();
  if (!supabase) return { logs: [], isCapped: false };

  const sevenDaysAgo = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data, error } = await supabase
    .from("audit_logs")
    .select("*")
    .in("action", [...SECURITY_EVENT_ACTIONS])
    .gte("created_at", sevenDaysAgo)
    .order("created_at", { ascending: false })
    .limit(1000)
    .returns<AuditLogRow[]>();

  const readable = !error && Array.isArray(data) && data.every(isAuditLogRow);
  return {
    logs: readable ? data.map(mapAuditLog) : [],
    isCapped: readable && data.length >= 1000,
    error: error || (readable ? undefined : true),
  };
}

export async function getSecurityEventData(): Promise<{
  summary: SecurityEventSummary;
  isConfigured: boolean;
  loadError?: string;
}> {
  if (!hasAdminServiceEnv()) {
    return {
      summary: emptySecurityEventSummary(),
      isConfigured: false,
    };
  }

  const { logs, isCapped, error } = await getSecurityEventLogs();

  return {
    summary: buildSecurityEventSummary(logs, isCapped),
    isConfigured: true,
    loadError: error
      ? "Unable to load security event counters from Supabase."
      : undefined,
  };
}

export async function getSecurityCenterData(currentAdmin: AdminUser): Promise<{
  profiles: AdminProfile[];
  auditLogs: AuditLogEntry[];
  securitySummary: SecurityEventSummary;
  checks: SecurityCheck[];
  allowedEmails: string[];
  isConfigured: boolean;
  canManageAdmins: boolean;
  loadError?: string;
}> {
  const allowedEmails =
    process.env.NODE_ENV === "production" ? [] : getAllowedAdminEmails();
  const readinessPromise = getProductionReadiness().catch(() => ({
    checks: [{
      id: "production-readiness",
      label: "Production checks",
      ok: false,
      status: "unknown" as const,
      critical: true,
      detail: "Production configuration could not be checked. Retry or inspect the server configuration; no failed setting has been confirmed.",
      href: "/admin/v2/security#configuration",
    }],
  }));

  if (!hasAdminServiceEnv()) {
    const readiness = await readinessPromise;
    return {
      profiles: [],
      auditLogs: [],
      securitySummary: emptySecurityEventSummary(),
      checks: getSecurityChecks(readiness.checks, []),
      allowedEmails,
      isConfigured: false,
      canManageAdmins: false,
    };
  }

  const supabase = createAdminServiceClient();
  if (!supabase) {
    const readiness = await readinessPromise;
    return {
      profiles: [],
      auditLogs: [],
      securitySummary: emptySecurityEventSummary(),
      checks: getSecurityChecks(readiness.checks, []),
      allowedEmails,
      isConfigured: false,
      canManageAdmins: false,
    };
  }

  const [
    profilesResult,
    logsResult,
    securityLogsResult,
    authDirectoryResult,
    readiness,
  ] = await Promise.all([
    Promise.resolve(supabase
      .from("admin_profiles")
      .select("*")
      .order("created_at", { ascending: false })
      .returns<AdminProfileRow[]>())
      .catch(() => ({ data: null, error: true })),
    Promise.resolve(supabase
      .from("audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100)
      .returns<AuditLogRow[]>())
      .catch(() => ({ data: null, error: true })),
    getSecurityEventLogs()
      .catch(() => ({ logs: [], isCapped: false, error: true })),
    supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
      .catch(() => ({ data: null, error: true })),
    readinessPromise,
  ]);

  const profilesReadReady = !profilesResult.error &&
    Array.isArray(profilesResult.data) && profilesResult.data.every(isAdminProfileRow);
  const auditReadReady = !logsResult.error &&
    Array.isArray(logsResult.data) && logsResult.data.every(isAuditLogRow);
  const authDirectoryReady = !authDirectoryResult.error &&
    Array.isArray(authDirectoryResult.data?.users) &&
    authDirectoryResult.data.users.every(isReadableAuthUser);
  const authUsersById = new Map(
    (authDirectoryReady ? authDirectoryResult.data?.users || [] : [])
      .map((user) => [user.id, user])
  );
  const profiles = (profilesReadReady ? profilesResult.data || [] : []).map((row) => {
    const profile = mapAdminProfile(row);
    const authUser = authUsersById.get(profile.userId);

    return {
      ...profile,
      authUserFound: authDirectoryReady ? Boolean(authUser) : null,
      authCreatedAt: authUser?.created_at || "",
      lastSignInAt: authUser?.last_sign_in_at || "",
      mfaEnrolled: authUser
        ? Boolean(
            authUser.factors?.some((factor) => factor.status === "verified")
          )
        : null,
    };
  });
  const auditLogs = (auditReadReady ? logsResult.data || [] : []).map(mapAuditLog);

  return {
    profiles,
    auditLogs,
    securitySummary: buildSecurityEventSummary(
      securityLogsResult.logs,
      securityLogsResult.isCapped
    ),
    checks: getSecurityChecks(
      readiness.checks,
      profiles,
      profilesReadReady,
      auditReadReady,
      auditLogs[0]?.createdAt || "",
      authDirectoryReady
    ),
    allowedEmails,
    isConfigured: true,
    canManageAdmins: currentAdmin.role === "owner",
    loadError:
      !profilesReadReady ||
      !auditReadReady ||
      !authDirectoryReady ||
      securityLogsResult.error
        ? "Unable to load security data from Supabase."
        : undefined,
  };
}
