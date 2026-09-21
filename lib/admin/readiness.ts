import { cache } from "react";
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
import { NAVIGATION_DESTINATION_KEYS } from "@/lib/content/navigation";
import { getMediaUploadConfigSummary } from "@/lib/admin/media-upload-config";
import { parseHomeEditorSnapshot } from "@/lib/admin/home-editor";
import { parseMusicEditorSnapshot } from "@/lib/admin/music-editor";
import { parseBioEditorSnapshot } from "@/lib/admin/bio-editor";
import { parseGalleryEditorSnapshot } from "@/lib/admin/gallery-editor";
import { parseShowreelEditorSnapshot } from "@/lib/admin/showreel-editor";
import { parseContactEditorSnapshot } from "@/lib/admin/contact-editor";
import { parseNavbarSocialLinksSnapshot } from "@/lib/admin/navbar-social-links-editor";
import { footerContentSchema } from "@/lib/content/footer";

export type ReadinessStatus = "pass" | "fail" | "unknown";

export type ReadinessCheck = {
  id: string;
  label: string;
  status: ReadinessStatus;
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
  criticalUnknown: number;
  ready: boolean;
};

type NavigationSnapshotRow = {
  destination_key: string;
  is_visible: boolean;
};

function getNavigationSnapshotRows(value: unknown): NavigationSnapshotRow[] | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const items = (value as { items?: unknown }).items;
  if (!Array.isArray(items)) return null;

  const valid = items.every((item): item is NavigationSnapshotRow => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    const row = item as Record<string, unknown>;
    return (
      typeof row.destination_key === "string" &&
      typeof row.is_visible === "boolean"
    );
  });
  return valid ? items as NavigationSnapshotRow[] : null;
}

function hasEmailEnv() {
  return Boolean(
    process.env.RESEND_API_KEY?.trim() &&
      process.env.BOOKING_TO_EMAIL?.trim() &&
      process.env.BOOKING_FROM_EMAIL?.trim()
  );
}

function getExternalMediaDeliveryReadiness() {
  const summary = getMediaUploadConfigSummary();
  const imageKitReady = Object.values(summary.imagekit).every(Boolean);
  const r2Ready = Object.values(summary.r2).every(Boolean);

  if (summary.provider === null) {
    return {
      ok: false,
      detail:
        "MEDIA_UPLOAD_PROVIDER is unsupported; keep Supabase selected until a verified provider cutover.",
    };
  }

  if (summary.provider === "imagekit") {
    return {
      ok: summary.isAvailable,
      detail: summary.isAvailable
        ? "ImageKit is selected with an exact delivery endpoint and complete server credentials."
        : "ImageKit is selected, but its endpoint or server credentials are invalid.",
    };
  }

  if (summary.provider === "r2") {
    return {
      ok: summary.isAvailable,
      detail: summary.isAvailable
        ? "R2 is selected with its bucket, exact delivery origin, and server credentials configured."
        : "R2 is selected, but its bucket, delivery origin, or server credentials are invalid.",
    };
  }

  if (imageKitReady) {
    return {
      ok: true,
      detail:
        "The ImageKit pilot account is configured; Supabase remains the active uploader until controlled cutover.",
    };
  }

  if (r2Ready) {
    return {
      ok: true,
      detail:
        "Dormant R2 delivery is configured; Supabase remains the active uploader until controlled cutover.",
    };
  }

  return {
    ok: false,
    detail:
      "Configure the client-owned ImageKit pilot account before external media cutover.",
  };
}

function hasSafeMediaProcessorUrl() {
  const value = process.env.MEDIA_PROCESSOR_URL?.trim();
  if (!value) return false;

  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      (!url.port || url.port === "443") &&
      !url.hash
    );
  } catch {
    return false;
  }
}

function hasMediaProcessorEnv() {
  return Boolean(
    hasSafeMediaProcessorUrl() &&
      process.env.MEDIA_PROCESSOR_SECRET?.trim()
  );
}

const READINESS_TIMEOUT_MS = 5000;
type ReadResult = { data: unknown; error: unknown };
type AbortableRead = PromiseLike<ReadResult> & {
  abortSignal: (signal: AbortSignal) => PromiseLike<ReadResult>;
};
const UNKNOWN_RESULT: ReadResult = { data: null, error: { code: "READINESS_UNAVAILABLE" } };

/** Isolate a failed dependency and bound every diagnostic; never publish raw errors. */
async function readSafely(read: () => PromiseLike<ReadResult>): Promise<ReadResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      Promise.resolve().then(read).catch(() => UNKNOWN_RESULT),
      new Promise<ReadResult>((resolve) => {
        timer = setTimeout(() => resolve(UNKNOWN_RESULT), READINESS_TIMEOUT_MS);
      }),
    ]);
    return isRecord(result) && "data" in result && "error" in result ? result as ReadResult : UNKNOWN_RESULT;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function readDatabase(read: () => AbortableRead) {
  return readSafely(() => read().abortSignal(AbortSignal.timeout(READINESS_TIMEOUT_MS)));
}

function errorCode(error: unknown) {
  return error && typeof error === "object" && "code" in error && typeof error.code === "string"
    ? error.code : null;
}

function schemaErrorStatus(error: unknown): ReadinessStatus {
  // A missing exposed interface is known; a timeout or denied permission is not.
  return ["42P01", "42703", "42883", "PGRST202", "PGRST204", "PGRST205"].includes(errorCode(error) ?? "")
    ? "fail" : "unknown";
}

function combineStatuses(statuses: ReadinessStatus[]): ReadinessStatus {
  if (statuses.includes("fail")) return "fail";
  return statuses.includes("unknown") ? "unknown" : "pass";
}

function readStatus(result: ReadResult, validate: (value: unknown) => boolean): ReadinessStatus {
  if (result.error) return schemaErrorStatus(result.error);
  try { return validate(result.data) ? "pass" : "unknown"; }
  catch { return "unknown"; }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function inspectSupabase(includeSchema: boolean) {
  const fallback = { schema: "unknown", storage: "unknown", owner: "unknown", rateLimit: "unknown", session: "unknown" } as const;
  let supabase: ReturnType<typeof createAdminServiceClient>;
  try { supabase = createAdminServiceClient(); }
  catch { return fallback; }
  if (!supabase) return fallback;
  const client = supabase;

  const schemaPromise = includeSchema ? (async (): Promise<ReadinessStatus> => {
    const results = await Promise.all([
      readDatabase(() => client.from("site_settings").select(
        "id, portfolio_type, navigation_config_version, footer_effect, display_font, body_font, ui_font, footer_content, hidden_nav_page_slugs_actor, hidden_nav_page_slugs_musician"
      ).eq("id", "main").limit(1)),
      readDatabase(() => client.rpc("get_site_navigation_v2_snapshot", { p_site_id: "main" })),
      readDatabase(() => client.rpc("get_navbar_social_links_v2_snapshot", { p_site_id: "main" })),
      readDatabase(() => client.rpc("get_home_page_v2_snapshot", { p_site_id: "main" })),
      readDatabase(() => client.rpc("get_music_page_v2_snapshot", { p_site_id: "main" })),
      readDatabase(() => client.rpc("get_bio_page_v2_snapshot", { p_site_id: "main" })),
      readDatabase(() => client.rpc("get_gallery_page_v2_snapshot", { p_site_id: "main" })),
      readDatabase(() => client.rpc("get_showreel_page_v2_snapshot", { p_site_id: "main" })),
      readDatabase(() => client.rpc("get_contact_page_v2_snapshot", { p_site_id: "main" })),
      readDatabase(() => client.rpc("get_media_pipeline_v1_snapshot", { p_asset_id: "~schema-probe" })),
      readDatabase(() => client.rpc("get_media_library_v2_usage").limit(1)),
      readDatabase(() => client.from("gallery_images").select("id, is_mosaic, is_freelance_story, freelance_story_order").limit(1)),
      readDatabase(() => client.from("media_assets").select("id, storage_bucket, storage_path, file_size, mime_type, deleted_at").limit(1)),
      readDatabase(() => client.from("videos").select("id, description, video_type, is_featured").limit(1)),
      readDatabase(() => client.from("gallery_presentation").select("id").limit(1)),
      readDatabase(() => client.from("cnc_programs").select("id, file_name, dialect, source_code, preview_line_count, is_published").eq("id", "~schema-probe").limit(1)),
      readDatabase(() => client.from("booking_inquiries").select("id, inquiry_intent, resend_email_id, email_status, email_status_changed_at, email_status_provider_at, email_status_webhook_id").limit(1)),
      readDatabase(() => client.from("admin_recovery_challenges").select("id").limit(1)),
    ]);
    const [settings, navigation, social, home, music, bio, gallery, showreel, contact, pipeline, usage, ...tables] = results;
    const navigationRows = navigation.error ? null : getNavigationSnapshotRows(navigation.data);
    let navigationStatus: ReadinessStatus = navigation.error ? schemaErrorStatus(navigation.error) : "unknown";
    if (navigationRows) {
      const keys = navigationRows.map(row => row.destination_key);
      navigationStatus = new Set(keys).size === keys.length && NAVIGATION_DESTINATION_KEYS.every(key => keys.includes(key)) &&
        navigationRows.some(row => row.is_visible && NAVIGATION_DESTINATION_KEYS.includes(row.destination_key as typeof NAVIGATION_DESTINATION_KEYS[number]))
        ? "pass" : "fail";
    }
    const settingsStatus = !settings.error && Array.isArray(settings.data) && settings.data.length === 0
      ? "fail" : readStatus(settings, value => Array.isArray(value) && value.length === 1 && isRecord(value[0]) && value[0].id === "main" && footerContentSchema.safeParse(value[0].footer_content).success);
    // The read-only pipeline RPC deliberately receives an absent asset, never an upload or job.
    const pipelineStatus = errorCode(pipeline.error) === "23503" ? "pass" : readStatus(pipeline, isRecord);
    return combineStatuses([
      settingsStatus, navigationStatus,
      readStatus(social, value => Boolean(parseNavbarSocialLinksSnapshot(value))),
      readStatus(home, value => Boolean(parseHomeEditorSnapshot(value))),
      readStatus(music, value => Boolean(parseMusicEditorSnapshot(value))),
      readStatus(bio, value => Boolean(parseBioEditorSnapshot(value))),
      readStatus(gallery, value => Boolean(parseGalleryEditorSnapshot(value))),
      readStatus(showreel, value => Boolean(parseShowreelEditorSnapshot(value))),
      readStatus(contact, value => Boolean(parseContactEditorSnapshot(value))),
      pipelineStatus,
      readStatus(usage, value => Array.isArray(value) && value.every(row => isRecord(row) && typeof row.asset_id === "string" && typeof row.reference_label === "string" && Number.isFinite(Number(row.reference_count)) && Number(row.reference_count) > 0)),
      ...tables.map(result => readStatus(result, value => Array.isArray(value) && value.every(isRecord))),
    ]);
  })() : Promise.resolve<ReadinessStatus>("unknown");

  const [schema, ownerResult, bucketResult, rateLimitResult, sessionResult] = await Promise.all([
    schemaPromise,
    readDatabase(() => client.from("admin_profiles").select("user_id").eq("role", "owner").eq("is_active", true).limit(1)),
    readSafely(() => client.storage.getBucket(MEDIA_BUCKET)),
    // Read only a synthetic bucket: do not fetch visitor hashes or consume a rate-limit slot.
    readDatabase(() => client.from("security_rate_limits").select("bucket, window_started_at, expires_at, request_count, updated_at").eq("bucket", "system:readiness").limit(1)),
    readDatabase(() => client.rpc("is_admin_session_active", {
      p_user_id: "00000000-0000-4000-8000-000000000000",
      p_session_id: "00000000-0000-4000-8000-000000000000",
    })),
  ]);
  let storage: ReadinessStatus = "unknown";
  if (bucketResult.error) {
    const error = bucketResult.error;
    if (isRecord(error) && (error.status === 404 || error.statusCode === "404" || error.code === "NoSuchBucket")) storage = "fail";
  } else if (isRecord(bucketResult.data) && bucketResult.data.name === MEDIA_BUCKET) storage = "pass";
  const owner = !ownerResult.error && Array.isArray(ownerResult.data) && ownerResult.data.length === 0
    ? "fail" : readStatus(ownerResult, value => Array.isArray(value) && value.length > 0 && value.every(row => isRecord(row) && typeof row.user_id === "string" && Boolean(row.user_id)));
  return {
    schema, storage, owner,
    rateLimit: readStatus(rateLimitResult, value => Array.isArray(value) && value.every(isRecord)),
    session: readStatus(sessionResult, value => typeof value === "boolean"),
  };
}

async function inspectAuthSettings(): Promise<ReadinessStatus> {
  if (!hasSupabaseBrowserEnv()) return "unknown";

  try {
    const response = await fetch(`${getSupabaseUrl()}/auth/v1/settings`, {
      cache: "no-store",
      headers: { apikey: getSupabasePublishableKey() },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return "unknown";

    const settings = (await response.json()) as { disable_signup?: unknown };
    if (!isRecord(settings) || typeof settings.disable_signup !== "boolean") return "unknown";
    return settings.disable_signup ? "pass" : "fail";
  } catch {
    return "unknown";
  }
}

// React cache deduplicates Classic's Overview + Security consumers within one
// server render only. A fresh request always rechecks the dependencies.
export const getProductionReadiness = cache(async function getProductionReadiness(
  { includeSchema = true }: { includeSchema?: boolean } = {}
): Promise<ProductionReadiness> {
  const authConfigured = hasSupabaseBrowserEnv();
  const serviceConfigured = hasAdminServiceEnv();
  const externalMedia = getExternalMediaDeliveryReadiness();
  const [supabase, publicSignup] = await Promise.all([
    inspectSupabase(includeSchema),
    inspectAuthSettings(),
  ]);

  const inputs: (Omit<ReadinessCheck, "status"> & { status?: ReadinessStatus })[] = [
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
      label: "Server credential",
      ok: serviceConfigured,
      critical: true,
      detail: serviceConfigured
        ? "Server-only Supabase key is configured. Write access has not been tested."
        : "Add SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY.",
      href: "/admin/security#health",
    },
    {
      id: "database-schema",
      label: "Database read interfaces",
      status: supabase.schema,
      ok: supabase.schema === "pass",
      critical: true,
      detail: supabase.schema === "pass"
        ? "Read-only checks cover the required editor snapshots, footer content (0039) and Media usage (0040). Write permissions and full migration integrity are not tested."
        : supabase.schema === "fail"
          ? "A required database interface or main configuration is missing or incomplete. Review the existing migrations and verification SQL through 0040; do not rerun migrations blindly."
          : "Database interfaces could not be verified. Check connectivity and server permissions, then retry; this does not prove that a migration is missing.",
      href: "/admin/security#health",
    },
    {
      id: "session-boundary",
      label: "Admin session boundary",
      status: supabase.session,
      ok: supabase.session === "pass",
      critical: true,
      detail: supabase.session === "pass"
        ? "The read-only session-revocation check responds correctly. No real session was read or revoked."
        : supabase.session === "fail"
          ? "The required session check is unavailable. Review migration 0038 and its verification SQL."
          : "The session boundary could not be verified. Check connectivity and server permissions, then retry.",
      href: "/admin/security#health",
    },
    {
      id: "media-storage",
      label: "Media storage",
      status: supabase.storage,
      ok: supabase.storage === "pass",
      critical: true,
      detail: supabase.storage === "pass"
        ? `Storage bucket ${MEDIA_BUCKET} exists. Uploads, object access and provider delivery are not tested.`
        : supabase.storage === "fail"
          ? `Storage reports that the ${MEDIA_BUCKET} bucket does not exist. Review the bucket setup.`
          : "Storage could not be verified. Check connectivity and server permissions before changing any bucket.",
      href: "/admin/media#upload",
    },
    {
      id: "external-media-delivery",
      label: "External media pilot",
      ok: externalMedia.ok,
      critical: false,
      detail: externalMedia.detail,
      href: "/admin/media#upload",
    },
    {
      id: "media-processor",
      label: "Media optimizer worker",
      ok: hasMediaProcessorEnv(),
      critical: false,
      detail: hasMediaProcessorEnv()
        ? "The asynchronous media processor handoff is configured."
        : "Select the durable optimizer runtime, then configure its URL and server-only shared secret.",
      href: "/admin/media#upload",
    },
    {
      id: "admin-access",
      label: "Admin access",
      status: supabase.owner,
      ok: supabase.owner === "pass",
      critical: true,
      detail: supabase.owner === "pass"
        ? "An active owner profile is configured as the authorization source."
        : supabase.owner === "fail"
          ? "No usable active owner configuration was found. Review admin profiles and their schema."
          : "Active owner access could not be verified. Check connectivity and server permissions, then retry.",
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
      status: publicSignup,
      ok: publicSignup === "pass",
      critical: true,
      detail: publicSignup === "pass"
        ? "Supabase public account registration is disabled."
        : publicSignup === "fail"
          ? "Supabase reports that public registration is enabled. Disable new user signups in Supabase Auth settings."
          : "Public signup settings could not be verified. Check Supabase Auth settings or retry; a failed request does not mean signup is enabled.",
      href: "/admin/security#health",
    },
    {
      id: "email",
      label: "Contact delivery",
      ok: hasEmailEnv(),
      critical: true,
      detail: hasEmailEnv()
        ? "Resend and booking addresses are configured. Actual email delivery has not been tested."
        : "Configure Resend and booking sender/recipient addresses.",
      href: "/admin/security#health",
    },
    {
      id: "delivery-webhook",
      label: "Delivery monitoring",
      ok: Boolean(process.env.RESEND_WEBHOOK_SECRET?.trim()),
      critical: false,
      detail: process.env.RESEND_WEBHOOK_SECRET?.trim()
        ? "The webhook signing secret is configured. Provider registration and live delivery events have not been tested."
        : "Set RESEND_WEBHOOK_SECRET after creating the Resend webhook.",
      href: "/admin/security#health",
    },
    {
      id: "retention-scheduler",
      label: "Retention scheduler",
      ok: Boolean(process.env.CRON_SECRET?.trim()),
      critical: false,
      detail: process.env.CRON_SECRET?.trim()
        ? "The maintenance endpoint secret is configured. Scheduler execution has not been tested."
        : "Set CRON_SECRET in Vercel for the daily maintenance job.",
      href: "/admin/security#health",
    },
    {
      id: "deep-health-monitor",
      label: "Dependency health monitor",
      ok: Boolean(process.env.HEALTHCHECK_SECRET?.trim()),
      critical: false,
      detail: process.env.HEALTHCHECK_SECRET?.trim()
        ? "The protected health endpoint secret is configured. An external monitor has not been tested."
        : "Set HEALTHCHECK_SECRET for deep dependency monitoring.",
      href: "/admin/security#health",
    },
    {
      id: "rate-limit",
      label: "Rate-limit storage",
      status: combineStatuses([supabase.rateLimit, hasAuthSecuritySecret() ? "pass" : "fail"]),
      ok: supabase.rateLimit === "pass" && hasAuthSecuritySecret(),
      critical: true,
      detail:
        supabase.rateLimit === "pass" && hasAuthSecuritySecret()
          ? "Rate-limit storage is readable and the signing secret is configured. The atomic write RPC was not called or tested."
          : !hasAuthSecuritySecret() || supabase.rateLimit === "fail"
            ? "Review rate-limit schema (0018) and AUTH_SECURITY_SECRET. This check never consumes a rate-limit slot."
            : "Rate-limit storage could not be verified. Check connectivity and server permissions, then retry.",
      href: "/admin/security#health",
    },
    {
      id: "captcha",
      label: "Auth CAPTCHA",
      ok: Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim()),
      critical: false,
      detail: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim()
        ? "The Turnstile site key is configured. Supabase provider settings and a real challenge have not been tested."
        : "Optional: configure Turnstile in Supabase and set its public site key.",
      href: "/admin/security#health",
    },
  ];
  // Overview already loads all editors: omit the deep schema check there instead
  // of repeating every content snapshot or showing a check that did not run.
  const checks: ReadinessCheck[] = inputs
    .filter(check => includeSchema || check.id !== "database-schema")
    .map(check => {
      const status = check.status ?? (check.ok ? "pass" : "fail");
      return { ...check, status, ok: status === "pass" };
    });
  const passed = checks.filter((check) => check.ok).length;
  const criticalFailures = checks.filter(
    (check) => check.critical && check.status === "fail"
  ).length;
  const criticalUnknown = checks.filter(check => check.critical && check.status === "unknown").length;

  return {
    checks,
    passed,
    total: checks.length,
    criticalFailures,
    criticalUnknown,
    ready: criticalFailures === 0 && criticalUnknown === 0,
  };
});
