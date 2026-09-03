import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/admin/auth";
import {
  createAdminServiceClient,
  hasAdminServiceEnv,
} from "@/lib/admin/service";
import {
  createFallbackContactEditorSnapshot,
  parseContactEditorSnapshot,
  type ContactEditorSnapshot,
} from "@/lib/admin/contact-editor";
import { FALLBACK_CONTENT } from "@/lib/content/fallback";

type DatabaseErrorLike = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

export function isMissingContactEditorSchemaError(
  error?: DatabaseErrorLike | null
) {
  if (!error) return false;
  const message = [error.message, error.details, error.hint]
    .filter(Boolean)
    .join(" ");

  return (
    error.code === "PGRST202" ||
    error.code === "PGRST205" ||
    (error.code === "42883" &&
      /contact_page_v2|contact_(?:hero|details)_v2/i.test(message)) ||
    /schema cache.*(?:get_contact_page_v2_snapshot|save_contact_(?:hero|details)_v2)/i.test(
      message
    )
  );
}

export function isContactEditorWriteConflict(
  error?: DatabaseErrorLike | null
) {
  return Boolean(
    error &&
      (error.code === "40001" ||
        /contact_(?:hero|details)_changed/i.test(error.message || ""))
  );
}

export type ContactDeliveryStatus = {
  inboxConfigured: boolean;
  emailConfigured: boolean;
  webhookConfigured: boolean;
};

function hasValue(value?: string) {
  return Boolean(value?.trim());
}

export function getContactDeliveryStatus(
  inboxConfigured = hasAdminServiceEnv()
): ContactDeliveryStatus {
  return {
    inboxConfigured,
    emailConfigured:
      hasValue(process.env.RESEND_API_KEY) &&
      hasValue(process.env.BOOKING_TO_EMAIL) &&
      hasValue(process.env.BOOKING_FROM_EMAIL),
    webhookConfigured: hasValue(process.env.RESEND_WEBHOOK_SECRET),
  };
}

type LegacySettingsRow = {
  location: string;
  contact_blurb: string;
  updated_at: string;
};

type LegacyHeroRow = {
  title: string;
  subtitle: string;
  cta_label: string;
  cta_href: string;
  background_src: string;
  poster_src: string;
  media_type: "image" | "video";
  updated_at: string;
};

async function loadLegacyContactSnapshot(
  supabase: SupabaseClient
): Promise<{ snapshot: ContactEditorSnapshot; loadError?: string }> {
  const fallback = createFallbackContactEditorSnapshot();
  const epoch = new Date(0).toISOString();
  const [settings, hero] = await Promise.all([
    supabase
      .from("site_settings")
      .select("location, contact_blurb, updated_at")
      .eq("id", "main")
      .limit(1)
      .maybeSingle<LegacySettingsRow>(),
    supabase
      .from("page_heroes")
      .select(
        "title, subtitle, cta_label, cta_href, background_src, poster_src, media_type, updated_at"
      )
      .eq("page_slug", "booking")
      .limit(1)
      .maybeSingle<LegacyHeroRow>(),
  ]);

  if (settings.error || hero.error) {
    return {
      snapshot: fallback,
      loadError:
        "Contact content could not be loaded. The editor is read-only until the database is reachable.",
    };
  }

  const settingsRow = settings.data;
  const heroRow = hero.data;
  return {
    snapshot: {
      draft: {
        hero: heroRow
          ? {
              title: heroRow.title,
              subtitle: heroRow.subtitle,
              ctaLabel: heroRow.cta_label,
              ctaHref: heroRow.cta_href,
              backgroundSrc: heroRow.background_src,
              posterSrc: heroRow.poster_src,
              mediaType: heroRow.media_type,
            }
          : FALLBACK_CONTENT.heroes.booking,
        details: {
          location:
            settingsRow?.location ?? FALLBACK_CONTENT.settings.location,
          contactBlurb:
            settingsRow?.contact_blurb ??
            FALLBACK_CONTENT.settings.contactBlurb,
        },
      },
      versions: {
        hero: { updatedAt: heroRow?.updated_at || epoch },
        details: { updatedAt: settingsRow?.updated_at || epoch },
      },
    },
    ...(!settingsRow || !heroRow
      ? {
          loadError:
            "Required Contact records are incomplete. Apply migration 0033 before editing.",
        }
      : {}),
  };
}

export type AdminContactEditorData = {
  snapshot: ContactEditorSnapshot;
  isConfigured: boolean;
  migrationRequired: boolean;
  delivery: ContactDeliveryStatus;
  loadError?: string;
};

export async function getAdminContactEditorData(): Promise<AdminContactEditorData> {
  await requireAdmin();

  const serviceConfigured = hasAdminServiceEnv();
  const delivery = getContactDeliveryStatus(serviceConfigured);
  if (!serviceConfigured) {
    return {
      snapshot: createFallbackContactEditorSnapshot(),
      isConfigured: false,
      migrationRequired: false,
      delivery,
    };
  }

  const supabase = createAdminServiceClient();
  if (!supabase) {
    return {
      snapshot: createFallbackContactEditorSnapshot(),
      isConfigured: false,
      migrationRequired: false,
      delivery: getContactDeliveryStatus(false),
    };
  }

  const { data, error } = await supabase.rpc("get_contact_page_v2_snapshot", {
    p_site_id: "main",
  });

  if (error && isMissingContactEditorSchemaError(error)) {
    const legacy = await loadLegacyContactSnapshot(supabase);
    return {
      snapshot: legacy.snapshot,
      isConfigured: true,
      migrationRequired: true,
      delivery,
      loadError: legacy.loadError,
    };
  }

  if (error) {
    console.error("Admin V2 Contact snapshot failed.", {
      code: error.code,
      message: error.message,
    });
    return {
      snapshot: createFallbackContactEditorSnapshot(),
      isConfigured: true,
      migrationRequired: false,
      delivery,
      loadError:
        "Contact content could not be loaded. Nothing can be saved from this view.",
    };
  }

  const snapshot = parseContactEditorSnapshot(data);
  if (!snapshot) {
    console.error("Admin V2 Contact snapshot returned an invalid shape.");
    return {
      snapshot: createFallbackContactEditorSnapshot(),
      isConfigured: true,
      migrationRequired: false,
      delivery,
      loadError:
        "Contact content returned an unexpected shape. The editor is read-only.",
    };
  }

  return {
    snapshot,
    isConfigured: true,
    migrationRequired: false,
    delivery,
  };
}
