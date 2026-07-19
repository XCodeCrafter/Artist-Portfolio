import {
  getAllowedAdminEmails,
  type AdminRole,
  type AdminUser,
} from "@/lib/admin/auth";
import {
  createAdminServiceClient,
  hasAdminServiceEnv,
} from "@/lib/admin/service";
import { hasSupabaseBrowserEnv } from "@/lib/supabase/env";

export type AdminProfile = {
  userId: string;
  email: string;
  role: AdminRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
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
  label: string;
  ok: boolean;
  detail: string;
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
  latestAt: string;
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

const SECURITY_EVENT_SET = new Set<string>(SECURITY_EVENT_ACTIONS);

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
    latestAt: "",
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
  securityLogs: AuditLogEntry[]
): SecurityEventSummary {
  const summary = emptySecurityEventSummary();
  const last24h = Date.now() - 24 * 60 * 60 * 1000;

  for (const log of securityLogs) {
    if (!isSecurityEventAction(log.action)) continue;

    summary.total7d += 1;
    summary.byAction[log.action] += 1;

    if (log.action.startsWith("security_contact_")) {
      summary.contactBlocked7d += 1;
    } else if (log.action.startsWith("security_analytics_")) {
      summary.analyticsBlocked7d += 1;
    } else if (log.action.startsWith("security_admin_")) {
      summary.adminBlocked7d += 1;
    }

    const createdAt = new Date(log.createdAt).getTime();
    if (!Number.isNaN(createdAt) && createdAt >= last24h) {
      summary.total24h += 1;
    }

    if (!summary.latestAt || log.createdAt > summary.latestAt) {
      summary.latestAt = log.createdAt;
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

function getSecurityChecks(profiles: AdminProfile[]): SecurityCheck[] {
  const allowedEmails = getAllowedAdminEmails();
  const hasServiceKey = hasAdminServiceEnv();
  const isProduction = process.env.NODE_ENV === "production";
  const activeOwners = profiles.filter(
    (profile) => profile.isActive && profile.role === "owner"
  ).length;

  return [
    {
      label: "Supabase Auth",
      ok: hasSupabaseBrowserEnv(),
      detail: hasSupabaseBrowserEnv()
        ? "Public Supabase auth variables are configured."
        : "Set NEXT_PUBLIC_SUPABASE_URL and a publishable/anon key.",
    },
    {
      label: "Server Admin Key",
      ok: hasAdminServiceEnv(),
      detail: hasAdminServiceEnv()
        ? "Server-side Supabase service key is configured."
        : "Set SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY.",
    },
    {
      label: "Admin Authorization Source",
      ok: hasServiceKey
        ? profiles.some((profile) => profile.isActive)
        : !isProduction && allowedEmails.length > 0,
      detail: hasServiceKey
        ? "Active admin_profiles rows are authoritative."
        : isProduction
          ? "Production requires the server key and active admin profiles."
          : `${allowedEmails.length} local fallback email(s) in ADMIN_EMAILS.`,
    },
    {
      label: "Owner Profile",
      ok: (!hasServiceKey && !isProduction) || activeOwners > 0,
      detail:
        activeOwners > 0
          ? `${activeOwners} active owner profile(s).`
          : hasServiceKey
            ? "Create at least one active owner in admin_profiles."
            : "Production admin access requires a service key and an active owner profile.",
    },
    {
      label: "Redis Rate Limit",
      ok: Boolean(
        (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL) &&
          (process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN)
      ),
      detail: "Admin auth and public form rate limiting depend on Upstash Redis.",
    },
    {
      label: "Email Delivery",
      ok: Boolean(
        process.env.RESEND_API_KEY &&
          process.env.BOOKING_TO_EMAIL &&
          process.env.BOOKING_FROM_EMAIL
      ),
      detail: "Booking email delivery depends on Resend and sender settings.",
    },
    {
      label: "Public API Guards",
      ok: true,
      detail:
        "Contact and analytics APIs use payload limits, origin checks, bot filters, and audit logging.",
    },
    {
      label: "Admin Action Guard",
      ok: true,
      detail:
        "Admin write actions verify same-origin requests before changing content or access.",
    },
  ];
}

async function getSecurityEventLogs(): Promise<{
  logs: AuditLogEntry[];
  error?: unknown;
}> {
  const supabase = createAdminServiceClient();
  if (!supabase) return { logs: [] };

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

  return {
    logs: (data || []).map(mapAuditLog),
    error,
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

  const { logs, error } = await getSecurityEventLogs();

  return {
    summary: buildSecurityEventSummary(logs),
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
  const allowedEmails = getAllowedAdminEmails();

  if (!hasAdminServiceEnv()) {
    return {
      profiles: [],
      auditLogs: [],
      securitySummary: emptySecurityEventSummary(),
      checks: getSecurityChecks([]),
      allowedEmails,
      isConfigured: false,
      canManageAdmins: false,
    };
  }

  const supabase = createAdminServiceClient();
  if (!supabase) {
    return {
      profiles: [],
      auditLogs: [],
      securitySummary: emptySecurityEventSummary(),
      checks: getSecurityChecks([]),
      allowedEmails,
      isConfigured: false,
      canManageAdmins: false,
    };
  }

  const [profilesResult, logsResult, securityLogsResult] = await Promise.all([
    supabase
      .from("admin_profiles")
      .select("*")
      .order("created_at", { ascending: false })
      .returns<AdminProfileRow[]>(),
    supabase
      .from("audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100)
      .returns<AuditLogRow[]>(),
    getSecurityEventLogs(),
  ]);

  const profiles = (profilesResult.data || []).map(mapAdminProfile);
  const auditLogs = (logsResult.data || []).map(mapAuditLog);

  return {
    profiles,
    auditLogs,
    securitySummary: buildSecurityEventSummary(securityLogsResult.logs),
    checks: getSecurityChecks(profiles),
    allowedEmails,
    isConfigured: true,
    canManageAdmins: currentAdmin.role === "owner",
    loadError:
      profilesResult.error || logsResult.error || securityLogsResult.error
        ? "Unable to load security data from Supabase."
        : undefined,
  };
}
