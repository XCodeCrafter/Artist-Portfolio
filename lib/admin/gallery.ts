import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/admin/auth";
import {
  createAdminServiceClient,
  hasAdminServiceEnv,
} from "@/lib/admin/service";
import {
  createFallbackGalleryEditorSnapshot,
  parseGalleryEditorSnapshot,
  type GalleryEditorSnapshot,
} from "@/lib/admin/gallery-editor";
import { FALLBACK_CONTENT } from "@/lib/content/fallback";
import { normalizeFooterEffect } from "@/lib/content/types";

type DatabaseErrorLike = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

export function isMissingGalleryEditorSchemaError(
  error?: DatabaseErrorLike | null
) {
  if (!error) return false;
  const message = [error.message, error.details, error.hint]
    .filter(Boolean)
    .join(" ");

  return (
    error.code === "PGRST202" ||
    error.code === "PGRST205" ||
    (error.code === "23503" && /gallery_page_snapshot_missing/i.test(message)) ||
    (error.code === "42883" &&
      /gallery_page_v2|gallery_(?:hero|introduction|frames)_v2/i.test(message)) ||
    /schema cache.*(?:get_gallery_page_v2_snapshot|save_gallery_(?:hero|introduction|frames)_v2)/i.test(
      message
    )
  );
}

export function isGalleryEditorWriteConflict(
  error?: DatabaseErrorLike | null
) {
  return Boolean(
    error &&
      (error.code === "40001" ||
        /gallery_(?:hero|introduction|frames)_changed/i.test(
          error.message || ""
        ))
  );
}

type LegacySettingsRow = {
  artist_name: string;
  tagline: string;
  location: string;
  contact_blurb: string;
  footer_effect?: string | null;
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

type LegacyIntroductionRow = {
  intro_eyebrow: string;
  intro_title: string;
  updated_at: string;
};

type LegacyFrameRow = {
  id: string;
  title: string;
  src: string;
  alt: string;
  caption: string;
  category: string;
  is_mosaic: boolean;
  is_published: boolean;
  updated_at: string;
};

type LegacySocialRow = {
  id: string;
  label: string;
  platform: string;
  href: string;
  icon_key: string;
};

async function loadLegacyGallerySnapshot(
  supabase: SupabaseClient
): Promise<{ snapshot: GalleryEditorSnapshot; loadError?: string }> {
  const fallback = createFallbackGalleryEditorSnapshot();
  const epoch = new Date(0).toISOString();
  const [settings, hero, introduction, frames, socials] = await Promise.all([
    supabase
      .from("site_settings")
      .select("artist_name, tagline, location, contact_blurb, footer_effect")
      .eq("id", "main")
      .limit(1)
      .maybeSingle<LegacySettingsRow>(),
    supabase
      .from("page_heroes")
      .select(
        "title, subtitle, cta_label, cta_href, background_src, poster_src, media_type, updated_at"
      )
      .eq("page_slug", "gallery")
      .limit(1)
      .maybeSingle<LegacyHeroRow>(),
    supabase
      .from("gallery_presentation")
      .select("intro_eyebrow, intro_title, updated_at")
      .eq("id", "main")
      .limit(1)
      .maybeSingle<LegacyIntroductionRow>(),
    supabase
      .from("gallery_images")
      .select(
        "id, title, src, alt, caption, category, is_mosaic, is_published, updated_at"
      )
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true })
      .returns<LegacyFrameRow[]>(),
    supabase
      .from("social_links")
      .select("id, label, platform, href, icon_key")
      .eq("is_published", true)
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true })
      .returns<LegacySocialRow[]>(),
  ]);

  if (
    settings.error ||
    hero.error ||
    introduction.error ||
    frames.error ||
    socials.error
  ) {
    return {
      snapshot: fallback,
      loadError:
        "Gallery content could not be loaded. The editor is read-only until the database is reachable.",
    };
  }

  const settingsRow = settings.data;
  const heroRow = hero.data;
  const introductionRow = introduction.data;
  const frameRows = frames.data || [];

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
          : FALLBACK_CONTENT.heroes.gallery,
        introduction: {
          introEyebrow: introductionRow?.intro_eyebrow || "",
          introTitle: introductionRow?.intro_title || "",
        },
        frames: {
          // Before 0031 this deliberately mirrors the current public Gallery,
          // including dual-use HOME rows. The view stays read-only until the
          // migration creates independent Gallery-only clones.
          items: frameRows.map((item) => ({
            id: item.id,
            title: item.title,
            src: item.src,
            alt: item.alt,
            caption: item.caption,
            category: item.category,
            isMosaic: item.is_mosaic,
            isPublished: item.is_published,
          })),
        },
      },
      versions: {
        hero: { updatedAt: heroRow?.updated_at || epoch },
        introduction: { updatedAt: introductionRow?.updated_at || epoch },
        frames: {
          items: Object.fromEntries(
            frameRows.map((item) => [item.id, item.updated_at])
          ),
        },
      },
      footer: {
        artistName: settingsRow?.artist_name || fallback.footer.artistName,
        contactBlurb: settingsRow?.contact_blurb || "",
        footerEffect: normalizeFooterEffect(settingsRow?.footer_effect),
        location: settingsRow?.location || "",
        socialLinks: (socials.data || []).map((item) => ({
          id: item.id,
          label: item.label,
          platform: item.platform,
          href: item.href,
          iconKey: item.icon_key,
        })),
        tagline: settingsRow?.tagline || "",
      },
    },
    ...(!settingsRow || !heroRow || !introductionRow
      ? {
          loadError:
            "Required Gallery records are incomplete. Apply migration 0031 before editing.",
        }
      : {}),
  };
}

export type AdminGalleryEditorData = {
  snapshot: GalleryEditorSnapshot;
  isConfigured: boolean;
  migrationRequired: boolean;
  loadError?: string;
};

export async function getAdminGalleryEditorData(): Promise<AdminGalleryEditorData> {
  await requireAdmin();

  if (!hasAdminServiceEnv()) {
    return {
      snapshot: createFallbackGalleryEditorSnapshot(),
      isConfigured: false,
      migrationRequired: false,
    };
  }

  const supabase = createAdminServiceClient();
  if (!supabase) {
    return {
      snapshot: createFallbackGalleryEditorSnapshot(),
      isConfigured: false,
      migrationRequired: false,
    };
  }

  const { data, error } = await supabase.rpc("get_gallery_page_v2_snapshot", {
    p_site_id: "main",
  });

  if (error && isMissingGalleryEditorSchemaError(error)) {
    const legacy = await loadLegacyGallerySnapshot(supabase);
    return {
      snapshot: legacy.snapshot,
      isConfigured: true,
      migrationRequired: true,
      loadError: legacy.loadError,
    };
  }

  if (error) {
    console.error("Admin V2 Gallery snapshot failed.", {
      code: error.code,
      message: error.message,
    });
    return {
      snapshot: createFallbackGalleryEditorSnapshot(),
      isConfigured: true,
      migrationRequired: false,
      loadError:
        "Gallery content could not be loaded. Nothing can be saved from this view.",
    };
  }

  const snapshot = parseGalleryEditorSnapshot(data);
  if (!snapshot) {
    console.error("Admin V2 Gallery snapshot returned an invalid shape.");
    return {
      snapshot: createFallbackGalleryEditorSnapshot(),
      isConfigured: true,
      migrationRequired: false,
      loadError:
        "Gallery content returned an unexpected shape. The editor is read-only.",
    };
  }

  return {
    snapshot,
    isConfigured: true,
    migrationRequired: false,
  };
}
