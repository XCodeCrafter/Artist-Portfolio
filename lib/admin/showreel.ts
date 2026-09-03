import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/admin/auth";
import {
  createAdminServiceClient,
  hasAdminServiceEnv,
} from "@/lib/admin/service";
import {
  createFallbackShowreelEditorSnapshot,
  parseShowreelEditorSnapshot,
  type ShowreelEditorSnapshot,
} from "@/lib/admin/showreel-editor";
import { FALLBACK_CONTENT } from "@/lib/content/fallback";
import {
  VIDEO_TYPES,
  normalizeFooterEffect,
  type VideoType,
} from "@/lib/content/types";

type DatabaseErrorLike = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

export function isMissingShowreelEditorSchemaError(
  error?: DatabaseErrorLike | null
) {
  if (!error) return false;
  const message = [error.message, error.details, error.hint]
    .filter(Boolean)
    .join(" ");
  return (
    error.code === "PGRST202" ||
    (error.code === "23503" && /showreel_page_snapshot_missing/i.test(message)) ||
    (error.code === "42883" &&
      /showreel_page_v2|showreel_(?:hero|introduction|works)_v2/i.test(
        message
      )) ||
    /schema cache.*(?:get_showreel_page_v2_snapshot|save_showreel_(?:hero|introduction|works)_v2)/i.test(
      message
    )
  );
}

export function isShowreelEditorWriteConflict(
  error?: DatabaseErrorLike | null
) {
  return Boolean(
    error &&
      (error.code === "40001" ||
        /showreel_(?:hero|introduction|works)_changed/i.test(
          error.message || ""
        ))
  );
}

type SettingsRow = {
  artist_name: string;
  tagline: string;
  location: string;
  contact_blurb: string;
  footer_effect?: string | null;
};

type HeroRow = {
  title: string;
  subtitle: string;
  cta_label: string;
  cta_href: string;
  background_src: string;
  poster_src: string;
  media_type: "image" | "video";
  updated_at: string;
};

type PresentationRow = {
  metadata: Record<string, unknown>;
  updated_at: string;
};

type VideoRow = {
  id: string;
  title: string;
  description: string;
  embed_url: string;
  platform: string;
  thumbnail_src: string;
  video_type: string;
  is_featured: boolean;
  is_published: boolean;
  updated_at: string;
};

type SocialRow = {
  id: string;
  label: string;
  platform: string;
  href: string;
  icon_key: string;
};

function normalizeVideoType(value: string): VideoType {
  return VIDEO_TYPES.includes(value as VideoType)
    ? (value as VideoType)
    : "music_video";
}

function presentationText(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string"
    ? value
    : FALLBACK_CONTENT.videoPresentation[
        key as keyof typeof FALLBACK_CONTENT.videoPresentation
      ];
}

async function loadLegacyShowreelSnapshot(
  supabase: SupabaseClient
): Promise<{ snapshot: ShowreelEditorSnapshot; loadError?: string }> {
  const fallback = createFallbackShowreelEditorSnapshot();
  const epoch = new Date(0).toISOString();
  const [settings, hero, presentation, videos, socials] = await Promise.all([
    supabase
      .from("site_settings")
      .select("artist_name, tagline, location, contact_blurb, footer_effect")
      .eq("id", "main")
      .limit(1)
      .maybeSingle<SettingsRow>(),
    supabase
      .from("page_heroes")
      .select(
        "title, subtitle, cta_label, cta_href, background_src, poster_src, media_type, updated_at"
      )
      .eq("page_slug", "video")
      .limit(1)
      .maybeSingle<HeroRow>(),
    supabase
      .from("media_assets")
      .select("metadata, updated_at")
      .eq("id", "showreel-studio-settings")
      .limit(1)
      .maybeSingle<PresentationRow>(),
    supabase
      .from("videos")
      .select(
        "id, title, description, embed_url, platform, thumbnail_src, video_type, is_featured, is_published, updated_at"
      )
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true })
      .returns<VideoRow[]>(),
    supabase
      .from("social_links")
      .select("id, label, platform, href, icon_key")
      .eq("is_published", true)
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true })
      .returns<SocialRow[]>(),
  ]);

  if (
    settings.error ||
    hero.error ||
    presentation.error ||
    videos.error ||
    socials.error
  ) {
    return {
      snapshot: fallback,
      loadError:
        "Showreel content could not be loaded. The editor is read-only until the database is reachable.",
    };
  }

  const metadata = presentation.data?.metadata || {};
  const heroRow = hero.data;
  const videoRows = videos.data || [];
  const settingsRow = settings.data;

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
          : FALLBACK_CONTENT.heroes.video,
        introduction: {
          sectionEyebrow: presentationText(metadata, "sectionEyebrow"),
          sectionTitle: presentationText(metadata, "sectionTitle"),
          sectionBody: presentationText(metadata, "sectionBody"),
          emptyText: presentationText(metadata, "emptyText"),
        },
        works: {
          items: videoRows.map((item) => ({
            id: item.id,
            title: item.title,
            description: item.description || "",
            embedUrl: item.embed_url,
            platform: item.platform,
            thumbnailSrc: item.thumbnail_src,
            videoType: normalizeVideoType(item.video_type),
            isFeatured: item.is_featured,
            isPublished: item.is_published,
          })),
        },
      },
      versions: {
        hero: { updatedAt: heroRow?.updated_at || epoch },
        introduction: { updatedAt: presentation.data?.updated_at || epoch },
        works: {
          items: Object.fromEntries(
            videoRows.map((item) => [item.id, item.updated_at])
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
    ...(!settingsRow || !heroRow || !presentation.data
      ? {
          loadError:
            "Required Showreel records are incomplete. Apply migration 0032 before editing.",
        }
      : {}),
  };
}

export type AdminShowreelEditorData = {
  snapshot: ShowreelEditorSnapshot;
  isConfigured: boolean;
  migrationRequired: boolean;
  loadError?: string;
};

export async function getAdminShowreelEditorData(): Promise<AdminShowreelEditorData> {
  await requireAdmin();

  if (!hasAdminServiceEnv()) {
    return {
      snapshot: createFallbackShowreelEditorSnapshot(),
      isConfigured: false,
      migrationRequired: false,
    };
  }

  const supabase = createAdminServiceClient();
  if (!supabase) {
    return {
      snapshot: createFallbackShowreelEditorSnapshot(),
      isConfigured: false,
      migrationRequired: false,
    };
  }

  const { data, error } = await supabase.rpc("get_showreel_page_v2_snapshot", {
    p_site_id: "main",
  });

  if (error && isMissingShowreelEditorSchemaError(error)) {
    const legacy = await loadLegacyShowreelSnapshot(supabase);
    return {
      snapshot: legacy.snapshot,
      isConfigured: true,
      migrationRequired: true,
      loadError: legacy.loadError,
    };
  }

  if (error) {
    console.error("Admin V2 Showreel snapshot failed.", {
      code: error.code,
      message: error.message,
    });
    return {
      snapshot: createFallbackShowreelEditorSnapshot(),
      isConfigured: true,
      migrationRequired: false,
      loadError:
        "Showreel content could not be loaded. Nothing can be saved from this view.",
    };
  }

  const snapshot = parseShowreelEditorSnapshot(data);
  if (!snapshot) {
    console.error("Admin V2 Showreel snapshot returned an invalid shape.");
    return {
      snapshot: createFallbackShowreelEditorSnapshot(),
      isConfigured: true,
      migrationRequired: false,
      loadError:
        "Showreel content returned an unexpected shape. The editor is read-only.",
    };
  }

  return {
    snapshot,
    isConfigured: true,
    migrationRequired: false,
  };
}
