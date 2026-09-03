import "server-only";

import { requireAdmin } from "@/lib/admin/auth";
import { createAdminServiceClient, hasAdminServiceEnv } from "@/lib/admin/service";
import { normalizeHiddenNavPageSlugs } from "@/lib/content/modules";
import {
  isMissingNavigationSchemaError,
  normalizeNavigationConfigVersion,
  resolveNavigationConfig,
  type NavigationAvailabilityContext,
  type NavigationConfig,
  type NavigationConfigVersion,
  type StoredNavigationRow,
} from "@/lib/content/navigation";
import { FALLBACK_CONTENT } from "@/lib/content/fallback";
import { normalizePortfolioType } from "@/lib/content/profile";
import type { PageSlug, PortfolioType } from "@/lib/content/types";

type NavigationSettingsSnapshot = {
  artistName: string;
  portfolioType: PortfolioType;
  hiddenPageSlugs: PageSlug[];
  configVersion: NavigationConfigVersion;
  rows: StoredNavigationRow[];
};

type NavigationSettingsRow = {
  artist_name?: unknown;
  portfolio_type?: unknown;
  hidden_nav_page_slugs_actor?: unknown;
  hidden_nav_page_slugs_musician?: unknown;
  navigation_config_version?: unknown;
};

type NavigationManagerSnapshot = {
  artistName?: unknown;
  portfolioType?: unknown;
  hiddenNavPageSlugsActor?: unknown;
  hiddenNavPageSlugsMusician?: unknown;
  configVersion?: unknown;
  items?: unknown;
};

type SupabaseErrorLike = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

export type AdminNavigationData = {
  artistName: string;
  navigation: NavigationConfig;
  configVersion: NavigationConfigVersion;
  availability: NavigationAvailabilityContext;
  isConfigured: boolean;
  migrationRequired: boolean;
  loadError?: string;
};

function getErrorText(error: SupabaseErrorLike | null | undefined) {
  return [error?.message, error?.details, error?.hint]
    .filter((value): value is string => Boolean(value))
    .join(" ");
}

export function isMissingNavigationManagerSchemaError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as SupabaseErrorLike;
  const message = getErrorText(candidate);
  return (
    candidate.code === "PGRST202" ||
    ((candidate.code === "42883" ||
      /schema cache|could not find|does not exist|unknown function/i.test(
        message
      )) &&
      /get_site_navigation_v2_snapshot|save_site_navigation_v2/i.test(message) &&
      /(schema cache|could not find|does not exist|unknown function)/i.test(message))
  );
}

export function isNavigationWriteConflict(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as SupabaseErrorLike;
  return (
    candidate.code === "40001" ||
    /site_navigation_changed/i.test(getErrorText(candidate))
  );
}

function isStoredNavigationRow(value: unknown): value is StoredNavigationRow {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.destination_key === "string" &&
    typeof row.is_visible === "boolean" &&
    Number.isInteger(row.sort_order) &&
    (row.updated_at === undefined ||
      row.updated_at === null ||
      typeof row.updated_at === "string")
  );
}

function mapSnapshot(value: unknown): NavigationSettingsSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const snapshot = value as NavigationManagerSnapshot;
  if (!Array.isArray(snapshot.items)) return null;

  const portfolioType = normalizePortfolioType(
    typeof snapshot.portfolioType === "string" ? snapshot.portfolioType : null
  );
  const rows = snapshot.items.filter(isStoredNavigationRow);
  if (rows.length !== snapshot.items.length) return null;

  return {
    artistName:
      typeof snapshot.artistName === "string" && snapshot.artistName.trim()
        ? snapshot.artistName
        : FALLBACK_CONTENT.settings.artistName,
    portfolioType,
    hiddenPageSlugs: normalizeHiddenNavPageSlugs(
      portfolioType === "actor"
        ? snapshot.hiddenNavPageSlugsActor
        : snapshot.hiddenNavPageSlugsMusician
    ),
    configVersion: normalizeNavigationConfigVersion(snapshot.configVersion),
    rows,
  };
}

function mapDirectSettings(
  value: NavigationSettingsRow | null | undefined,
  rows: readonly StoredNavigationRow[]
): NavigationSettingsSnapshot | null {
  if (!value) return null;
  const portfolioType = normalizePortfolioType(
    typeof value.portfolio_type === "string" ? value.portfolio_type : null
  );
  return {
    artistName:
      typeof value.artist_name === "string" && value.artist_name.trim()
        ? value.artist_name
        : FALLBACK_CONTENT.settings.artistName,
    portfolioType,
    hiddenPageSlugs: normalizeHiddenNavPageSlugs(
      portfolioType === "actor"
        ? value.hidden_nav_page_slugs_actor
        : value.hidden_nav_page_slugs_musician
    ),
    configVersion: normalizeNavigationConfigVersion(
      value.navigation_config_version
    ),
    rows: [...rows],
  };
}

function fallbackResult(input: {
  isConfigured: boolean;
  migrationRequired?: boolean;
  loadError?: string;
}): AdminNavigationData {
  return {
    artistName: FALLBACK_CONTENT.settings.artistName,
    navigation: FALLBACK_CONTENT.navigation,
    configVersion: FALLBACK_CONTENT.settings.navigationConfigVersion,
    availability: {
      hasPublishedCncPrograms: false,
      hasResumeContent: false,
    },
    isConfigured: input.isConfigured,
    migrationRequired: input.migrationRequired ?? false,
    ...(input.loadError ? { loadError: input.loadError } : {}),
  };
}

async function loadLegacySnapshot(
  supabase: NonNullable<ReturnType<typeof createAdminServiceClient>>
) {
  const [settingsResult, navigationResult] = await Promise.all([
    supabase
      .from("site_settings")
      .select(
        "artist_name,portfolio_type,hidden_nav_page_slugs_actor,hidden_nav_page_slugs_musician,navigation_config_version"
      )
      .eq("id", "main")
      .maybeSingle<NavigationSettingsRow>(),
    supabase
      .from("site_navigation_items")
      .select("destination_key,is_visible,sort_order,updated_at")
      .eq("site_id", "main")
      .order("sort_order", { ascending: true })
      .returns<StoredNavigationRow[]>(),
  ]);

  return { settingsResult, navigationResult };
}

export async function getAdminNavigationData(): Promise<AdminNavigationData> {
  // Keep the service-role boundary inside the DAL as well as the route layout.
  // Layout authorization alone is not a durable guard for every future caller.
  await requireAdmin();

  if (!hasAdminServiceEnv()) {
    return fallbackResult({
      isConfigured: false,
      loadError:
        "Supabase admin access is not configured. Navbar management is read-only.",
    });
  }

  const supabase = createAdminServiceClient();
  if (!supabase) {
    return fallbackResult({
      isConfigured: false,
      loadError:
        "Supabase admin access is not configured. Navbar management is read-only.",
    });
  }

  const [snapshotResult, cncResult, resumeResult, creditsResult] =
    await Promise.all([
      supabase.rpc("get_site_navigation_v2_snapshot", { p_site_id: "main" }),
      supabase
        .from("cnc_programs")
        .select("id", { count: "exact", head: true })
        .eq("is_published", true),
      supabase
        .from("actor_resume")
        .select("id", { count: "exact", head: true })
        .eq("id", "main"),
      supabase
        .from("actor_credits")
        .select("id", { count: "exact", head: true })
        .eq("is_published", true),
    ]);

  const availability: NavigationAvailabilityContext = {
    hasPublishedCncPrograms: (cncResult.count ?? 0) > 0,
    hasResumeContent:
      (resumeResult.count ?? 0) > 0 || (creditsResult.count ?? 0) > 0,
  };

  let migrationRequired = false;
  let snapshot = mapSnapshot(snapshotResult.data);
  let loadError: string | undefined;

  if (snapshotResult.error) {
    if (isMissingNavigationManagerSchemaError(snapshotResult.error)) {
      migrationRequired = true;
    } else {
      console.error("Admin V2 navigation snapshot failed.", {
        code: snapshotResult.error.code,
        message: snapshotResult.error.message,
      });
      loadError = "Unable to load the saved navbar from Supabase.";
    }

    const { settingsResult, navigationResult } = await loadLegacySnapshot(
      supabase
    );
    if (!settingsResult.error && !navigationResult.error) {
      snapshot = mapDirectSettings(
        settingsResult.data,
        navigationResult.data ?? []
      );
    } else {
      migrationRequired =
        migrationRequired ||
        isMissingNavigationSchemaError(navigationResult.error) ||
        /navigation_config_version/i.test(
          getErrorText(settingsResult.error as SupabaseErrorLike | null)
        );
      loadError ||= "Unable to load the saved navbar from Supabase.";
    }
  } else if (!snapshot) {
    loadError = "The navbar snapshot returned an invalid response.";
  }

  if (!snapshot) {
    return {
      ...fallbackResult({
        isConfigured: true,
        migrationRequired,
        loadError,
      }),
      availability,
    };
  }

  const navigation = resolveNavigationConfig({
    version: snapshot.configVersion,
    rows: snapshot.rows,
    portfolioType: snapshot.portfolioType,
    hiddenPageSlugs: snapshot.hiddenPageSlugs,
    audience: "admin",
  });

  return {
    artistName: snapshot.artistName,
    navigation,
    configVersion: snapshot.configVersion,
    availability,
    isConfigured: true,
    migrationRequired: migrationRequired || navigation.migrationRequired,
    ...(loadError ? { loadError } : {}),
  };
}
