import "server-only";

import { requireAdmin } from "@/lib/admin/auth";
import {
  createAdminServiceClient,
  hasAdminServiceEnv,
} from "@/lib/admin/service";
import {
  parseNavbarSocialLinksSnapshot,
  type NavbarSocialLinksSnapshot,
} from "@/lib/admin/navbar-social-links-editor";

type DatabaseErrorLike = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

type SocialLinkRow = {
  id: string;
  label: string;
  platform: string;
  href: string;
  icon_key: string;
  is_published: boolean;
  updated_at: string;
};

const EMPTY_SNAPSHOT: NavbarSocialLinksSnapshot = {
  items: [],
  expectedVersions: {},
};

function errorText(error?: DatabaseErrorLike | null) {
  return [error?.message, error?.details, error?.hint]
    .filter((value): value is string => Boolean(value))
    .join(" ");
}

export function isMissingNavbarSocialLinksSchemaError(
  error?: DatabaseErrorLike | null
) {
  if (!error) return false;
  const message = errorText(error);
  return (
    error.code === "PGRST202" ||
    ((error.code === "42883" || /schema cache|could not find|does not exist/i.test(message)) &&
      /(?:get|save)_navbar_social_links_v2/i.test(message))
  );
}

export function isNavbarSocialLinksWriteConflict(
  error?: DatabaseErrorLike | null
) {
  return Boolean(
    error &&
      (error.code === "40001" ||
        /navbar_social_links_changed/i.test(errorText(error)))
  );
}

function mapLegacyRows(rows: SocialLinkRow[]) {
  return parseNavbarSocialLinksSnapshot({
    items: rows.map((row) => ({
      id: row.id,
      label: row.label,
      platform: row.platform,
      href: row.href,
      iconKey: row.icon_key,
      isPublished: row.is_published,
      updatedAt: row.updated_at,
    })),
  });
}

export type AdminNavbarSocialLinksData = {
  snapshot: NavbarSocialLinksSnapshot;
  isConfigured: boolean;
  migrationRequired: boolean;
  loadError?: string;
};

export async function getAdminNavbarSocialLinksData(): Promise<AdminNavbarSocialLinksData> {
  await requireAdmin();

  if (!hasAdminServiceEnv()) {
    return {
      snapshot: EMPTY_SNAPSHOT,
      isConfigured: false,
      migrationRequired: false,
      loadError:
        "Supabase admin access is not configured. Platform shortcuts are read-only.",
    };
  }

  const supabase = createAdminServiceClient();
  if (!supabase) {
    return {
      snapshot: EMPTY_SNAPSHOT,
      isConfigured: false,
      migrationRequired: false,
      loadError:
        "Supabase admin access is not configured. Platform shortcuts are read-only.",
    };
  }

  const snapshotResult = await supabase.rpc(
    "get_navbar_social_links_v2_snapshot",
    { p_site_id: "main" }
  );

  if (snapshotResult.error) {
    if (isMissingNavbarSocialLinksSchemaError(snapshotResult.error)) {
      const legacy = await supabase
        .from("social_links")
        .select(
          "id,label,platform,href,icon_key,is_published,updated_at,sort_order"
        )
        .order("sort_order", { ascending: true })
        .order("id", { ascending: true })
        .returns<SocialLinkRow[]>();
      const snapshot = legacy.error
        ? null
        : mapLegacyRows(legacy.data || []);
      return {
        snapshot: snapshot || EMPTY_SNAPSHOT,
        isConfigured: true,
        migrationRequired: true,
        ...(!snapshot
          ? {
              loadError:
                "Saved platform shortcuts could not be loaded safely.",
            }
          : {}),
      };
    }

    console.error("Admin V2 platform shortcut snapshot failed.", {
      code: snapshotResult.error.code,
      message: snapshotResult.error.message,
    });
    return {
      snapshot: EMPTY_SNAPSHOT,
      isConfigured: true,
      migrationRequired: false,
      loadError: "Platform shortcuts could not be loaded. Nothing can be saved.",
    };
  }

  const snapshot = parseNavbarSocialLinksSnapshot(snapshotResult.data);
  if (!snapshot) {
    console.error("Admin V2 platform shortcut snapshot has an invalid shape.");
    return {
      snapshot: EMPTY_SNAPSHOT,
      isConfigured: true,
      migrationRequired: false,
      loadError: "Platform shortcuts returned an unexpected response.",
    };
  }

  return {
    snapshot,
    isConfigured: true,
    migrationRequired: false,
  };
}
