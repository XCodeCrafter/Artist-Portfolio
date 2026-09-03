import { hasAuthSecuritySecret } from "@/lib/admin/security-secret";
import {
  createAdminServiceClient,
  hasAdminServiceEnv,
} from "@/lib/admin/service";
import { MEDIA_BUCKET } from "@/lib/admin/media";
import {
  getSupabasePublishableKey,
  getSupabaseUrl,
  hasSupabaseBrowserEnv,
} from "@/lib/supabase/env";
import { hasProductionSiteUrl } from "@/lib/site-url";
import { probeDatabaseRateLimit } from "@/lib/security/rate-limit";
import { NAVIGATION_DESTINATION_KEYS } from "@/lib/content/navigation";

export type ReadinessCheck = {
  id: string;
  label: string;
  ok: boolean;
  critical: boolean;
  detail: string;
  href: string;
};

export type ProductionReadiness = {
  checks: ReadinessCheck[];
  passed: number;
  total: number;
  criticalFailures: number;
  ready: boolean;
};

type NavigationSnapshotRow = {
  destination_key: string;
  is_visible: boolean;
};

function getNavigationSnapshotRows(value: unknown): NavigationSnapshotRow[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const items = (value as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];

  return items.filter((item): item is NavigationSnapshotRow => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    const row = item as Record<string, unknown>;
    return (
      typeof row.destination_key === "string" &&
      typeof row.is_visible === "boolean"
    );
  });
}

function hasEmailEnv() {
  return Boolean(
    process.env.RESEND_API_KEY &&
      process.env.BOOKING_TO_EMAIL &&
      process.env.BOOKING_FROM_EMAIL
  );
}

async function inspectSupabase() {
  const fallback = {
    schemaOk: false,
    storageOk: false,
    ownerOk: false,
    rateLimitOk: false,
  };
  const supabase = createAdminServiceClient();
  if (!supabase) return fallback;

  try {
    const [
      settingsResult,
      navigationManagerResult,
      navbarSocialLinksResult,
      musicEditorResult,
      galleryResult,
      mediaResult,
      videosResult,
      presentationResult,
      cncProgramsResult,
      inquiriesResult,
      recoveryResult,
      rateLimitResult,
      ownerResult,
      bucketResult,
    ] = await Promise.all([
      supabase
        .from("site_settings")
        .select(
          "id, portfolio_type, navigation_config_version, footer_effect, display_font, body_font, ui_font, hidden_nav_page_slugs_actor, hidden_nav_page_slugs_musician"
        )
        .eq("id", "main")
        .limit(1),
      supabase.rpc("get_site_navigation_v2_snapshot", { p_site_id: "main" }),
      supabase.rpc("get_navbar_social_links_v2_snapshot", {
        p_site_id: "main",
      }),
      supabase.rpc("get_music_page_v2_snapshot", { p_site_id: "main" }),
      supabase
        .from("gallery_images")
        .select(
          "id, is_mosaic, is_freelance_story, freelance_story_order"
        )
        .limit(1),
      supabase
        .from("media_assets")
        .select(
          "id, storage_bucket, storage_path, file_size, mime_type, deleted_at"
        )
        .limit(1),
      supabase
        .from("videos")
        .select("id, description, video_type, is_featured")
        .limit(1),
      supabase.from("gallery_presentation").select("id").limit(1),
      supabase
        .from("cnc_programs")
        .select(
          "id, file_name, dialect, source_code, preview_line_count, is_published"
        )
        .eq("id", "~schema-probe")
        .limit(1),
      supabase
        .from("booking_inquiries")
        .select(
          "id, inquiry_intent, resend_email_id, email_status, email_status_changed_at, email_status_provider_at, email_status_webhook_id"
        )
        .limit(1),
      supabase.from("admin_recovery_challenges").select("id").limit(1),
      probeDatabaseRateLimit(supabase),
      supabase
        .from("admin_profiles")
        .select("user_id")
        .eq("role", "owner")
        .eq("is_active", true)
        .limit(1),
      supabase.storage.listBuckets(),
    ]);

    const navigationRows = getNavigationSnapshotRows(
      navigationManagerResult.data
    );
    const navigationKeys = navigationRows.map(
      (row) => row.destination_key
    );
    const knownNavigationKeys = new Set<string>(NAVIGATION_DESTINATION_KEYS);
    const navigationCatalogOk =
      !navigationManagerResult.error &&
      settingsResult.data?.length === 1 &&
      navigationKeys.length >= NAVIGATION_DESTINATION_KEYS.length &&
      new Set(navigationKeys).size === navigationKeys.length &&
      NAVIGATION_DESTINATION_KEYS.every((key) =>
        navigationKeys.includes(key)
      ) &&
      Boolean(
        navigationRows.some(
          (row) =>
            knownNavigationKeys.has(row.destination_key) &&
            row.is_visible === true
        )
      );
    const schemaOk = [
      settingsResult,
      navigationManagerResult,
      navbarSocialLinksResult,
      musicEditorResult,
      galleryResult,
      mediaResult,
      videosResult,
      presentationResult,
      cncProgramsResult,
      inquiriesResult,
      recoveryResult,
    ].every((result) => !result.error) && navigationCatalogOk;

    return {
      schemaOk,
      rateLimitOk: rateLimitResult,
      ownerOk: !ownerResult.error && Boolean(ownerResult.data?.length),
      storageOk:
        !bucketResult.error &&
        Boolean(bucketResult.data?.some((bucket) => bucket.name === MEDIA_BUCKET)),
    };
  } catch {
    return fallback;
  }
}

async function inspectAuthSettings() {
  if (!hasSupabaseBrowserEnv()) return false;

  try {
    const response = await fetch(`${getSupabaseUrl()}/auth/v1/settings`, {
      cache: "no-store",
      headers: { apikey: getSupabasePublishableKey() },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return false;

    const settings = (await response.json()) as { disable_signup?: unknown };
    return settings.disable_signup === true;
  } catch {
    return false;
  }
}

export async function getProductionReadiness(): Promise<ProductionReadiness> {
  const authConfigured = hasSupabaseBrowserEnv();
  const serviceConfigured = hasAdminServiceEnv();
  const [supabase, publicSignupDisabled] = await Promise.all([
    serviceConfigured
      ? inspectSupabase()
      : Promise.resolve({
          schemaOk: false,
          storageOk: false,
          ownerOk: false,
          rateLimitOk: false,
        }),
    inspectAuthSettings(),
  ]);

  const checks: ReadinessCheck[] = [
    {
      id: "site-url",
      label: "Production URL",
      ok: hasProductionSiteUrl(),
      critical: true,
      detail: hasProductionSiteUrl()
        ? "Canonical HTTPS URL is configured."
        : "Set SITE_URL and NEXT_PUBLIC_SITE_URL to the public HTTPS domain.",
      href: "/admin/security#health",
    },
    {
      id: "supabase-auth",
      label: "Supabase Auth",
      ok: authConfigured,
      critical: true,
      detail: authConfigured
        ? "Public authentication configuration is available."
        : "Add the Supabase URL and publishable key.",
      href: "/admin/security#health",
    },
    {
      id: "service-key",
      label: "Server write access",
      ok: serviceConfigured,
      critical: true,
      detail: serviceConfigured
        ? "Server-only Supabase key is configured."
        : "Add SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY.",
      href: "/admin/security#health",
    },
    {
      id: "database-schema",
      label: "Database migrations",
      ok: supabase.schemaOk,
      critical: true,
      detail: supabase.schemaOk
        ? "Required tables and columns are available."
        : "Apply all Supabase migrations through 0029.",
      href: "/admin/security#health",
    },
    {
      id: "media-storage",
      label: "Media storage",
      ok: supabase.storageOk,
      critical: true,
      detail: supabase.storageOk
        ? `Storage bucket ${MEDIA_BUCKET} is available.`
        : `Create or migrate the ${MEDIA_BUCKET} storage bucket.`,
      href: "/admin/media#upload",
    },
    {
      id: "admin-access",
      label: "Admin access",
      ok: supabase.ownerOk,
      critical: true,
      detail: supabase.ownerOk
        ? "An active owner profile is configured as the authorization source."
        : "Create at least one active owner profile.",
      href: "/admin/security#admin-profiles",
    },
    {
      id: "auth-security-secret",
      label: "Auth security secret",
      ok: hasAuthSecuritySecret(),
      critical: true,
      detail: hasAuthSecuritySecret()
        ? "Recovery and auth identifiers use a server-only signing secret."
        : "Set AUTH_SECURITY_SECRET to at least 32 random characters.",
      href: "/admin/security#health",
    },
    {
      id: "public-signup",
      label: "Public signup disabled",
      ok: publicSignupDisabled,
      critical: true,
      detail: publicSignupDisabled
        ? "Supabase public account registration is disabled."
        : "Disable new user signups in Supabase Auth settings.",
      href: "/admin/security#health",
    },
    {
      id: "email",
      label: "Contact delivery",
      ok: hasEmailEnv(),
      critical: true,
      detail: hasEmailEnv()
        ? "Resend and booking addresses are configured."
        : "Configure Resend and booking sender/recipient addresses.",
      href: "/admin/security#health",
    },
    {
      id: "delivery-webhook",
      label: "Delivery monitoring",
      ok: Boolean(process.env.RESEND_WEBHOOK_SECRET),
      critical: false,
      detail: process.env.RESEND_WEBHOOK_SECRET
        ? "Signed Resend delivery events are connected."
        : "Set RESEND_WEBHOOK_SECRET after creating the Resend webhook.",
      href: "/admin/security#health",
    },
    {
      id: "retention-scheduler",
      label: "Retention scheduler",
      ok: Boolean(process.env.CRON_SECRET),
      critical: false,
      detail: process.env.CRON_SECRET
        ? "Authenticated daily retention maintenance is configured."
        : "Set CRON_SECRET in Vercel for the daily maintenance job.",
      href: "/admin/security#health",
    },
    {
      id: "deep-health-monitor",
      label: "Dependency health monitor",
      ok: Boolean(process.env.HEALTHCHECK_SECRET),
      critical: false,
      detail: process.env.HEALTHCHECK_SECRET
        ? "Authenticated database and storage health checks are available."
        : "Set HEALTHCHECK_SECRET for deep dependency monitoring.",
      href: "/admin/security#health",
    },
    {
      id: "rate-limit",
      label: "Rate limiting",
      ok: supabase.rateLimitOk && hasAuthSecuritySecret(),
      critical: true,
      detail:
        supabase.rateLimitOk && hasAuthSecuritySecret()
          ? "Atomic Supabase database rate limiting is available."
          : "Apply migration 0018 and configure AUTH_SECURITY_SECRET.",
      href: "/admin/security#health",
    },
    {
      id: "captcha",
      label: "Auth CAPTCHA",
      ok: Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY),
      critical: false,
      detail: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
        ? "Turnstile is available on admin login and recovery."
        : "Optional: configure Turnstile in Supabase and set its public site key.",
      href: "/admin/security#health",
    },
  ];
  const passed = checks.filter((check) => check.ok).length;
  const criticalFailures = checks.filter(
    (check) => check.critical && !check.ok
  ).length;

  return {
    checks,
    passed,
    total: checks.length,
    criticalFailures,
    ready: criticalFailures === 0,
  };
}
