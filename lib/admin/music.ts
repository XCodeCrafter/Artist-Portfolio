import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/admin/auth";
import {
  createAdminServiceClient,
  hasAdminServiceEnv,
} from "@/lib/admin/service";
import {
  createFallbackMusicEditorSnapshot,
  parseMusicEditorSnapshot,
  type MusicEditorSnapshot,
} from "@/lib/admin/music-editor";
import { normalizeFooterEffect } from "@/lib/content/types";

type DatabaseErrorLike = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

export function isMissingMusicEditorSchemaError(error?: DatabaseErrorLike | null) {
  if (!error) return false;
  const message = [error.message, error.details, error.hint]
    .filter(Boolean)
    .join(" ");

  return (
    error.code === "PGRST202" ||
    error.code === "PGRST205" ||
    (error.code === "42P01" && /music_presentation/i.test(message)) ||
    (error.code === "23503" && /music_page_snapshot_missing/i.test(message)) ||
    (error.code === "42883" && /music_page_v2|music_(?:hero|spotify|platforms|soundcloud)_v2/i.test(message)) ||
    /schema cache.*(?:get_music_page_v2_snapshot|save_music_(?:hero|spotify|platforms|soundcloud)_v2)/i.test(
      message
    )
  );
}

export function isMusicEditorWriteConflict(error?: DatabaseErrorLike | null) {
  return Boolean(
    error &&
      (error.code === "40001" ||
        /music_(?:hero|spotify|platforms|soundcloud)_changed/i.test(
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
  spotify_artist_url: string;
  spotify_embed_url: string;
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

type LegacyPlatformRow = {
  id: string;
  title: string;
  label: string;
  href: string;
  icon_key: string;
  image_src: string;
  is_published: boolean;
  updated_at: string;
};

type LegacyTrackRow = {
  id: string;
  title: string;
  embed_url: string;
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

async function loadLegacyMusicSnapshot(
  supabase: SupabaseClient
): Promise<{ snapshot: MusicEditorSnapshot; loadError?: string }> {
  const fallback = createFallbackMusicEditorSnapshot();
  const [settings, hero, platforms, tracks, socials] = await Promise.all([
    supabase
      .from("site_settings")
      .select(
        "artist_name, tagline, location, contact_blurb, footer_effect, spotify_artist_url, spotify_embed_url, updated_at"
      )
      .eq("id", "main")
      .limit(1)
      .maybeSingle<LegacySettingsRow>(),
    supabase
      .from("page_heroes")
      .select(
        "title, subtitle, cta_label, cta_href, background_src, poster_src, media_type, updated_at"
      )
      .eq("page_slug", "music")
      .limit(1)
      .maybeSingle<LegacyHeroRow>(),
    supabase
      .from("music_platform_links")
      .select(
        "id, title, label, href, icon_key, image_src, is_published, updated_at"
      )
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true })
      .returns<LegacyPlatformRow[]>(),
    supabase
      .from("soundcloud_tracks")
      .select("id, title, embed_url, is_published, updated_at")
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true })
      .returns<LegacyTrackRow[]>(),
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
    platforms.error ||
    tracks.error ||
    socials.error ||
    !settings.data ||
    !hero.data
  ) {
    return {
      snapshot: fallback,
      loadError:
        "Music content could not be loaded. The editor is read-only until the database is reachable.",
    };
  }

  return {
    snapshot: {
      draft: {
        hero: {
          title: hero.data.title,
          subtitle: hero.data.subtitle,
          ctaLabel: hero.data.cta_label,
          ctaHref: hero.data.cta_href,
          backgroundSrc: hero.data.background_src,
          posterSrc: hero.data.poster_src,
          mediaType: hero.data.media_type,
        },
        spotify: {
          releasesHeading: fallback.draft.spotify.releasesHeading,
          artistUrl: settings.data.spotify_artist_url,
          embedUrl: settings.data.spotify_embed_url,
        },
        platforms: {
          items: (platforms.data || []).map((item) => ({
            id: item.id,
            title: item.title,
            label: item.label,
            href: item.href,
            imageSrc: item.image_src,
            iconKey: item.icon_key,
            isPublished: item.is_published,
          })),
        },
        soundcloud: {
          mixesHeading: fallback.draft.soundcloud.mixesHeading,
          items: (tracks.data || []).map((item) => ({
            id: item.id,
            title: item.title,
            embedUrl: item.embed_url,
            isPublished: item.is_published,
          })),
        },
      },
      versions: {
        hero: { updatedAt: hero.data.updated_at },
        spotify: {
          settingsUpdatedAt: settings.data.updated_at,
          presentationUpdatedAt:
            fallback.versions.spotify.presentationUpdatedAt,
        },
        platforms: {
          items: Object.fromEntries(
            (platforms.data || []).map((item) => [item.id, item.updated_at])
          ),
        },
        soundcloud: {
          presentationUpdatedAt:
            fallback.versions.soundcloud.presentationUpdatedAt,
          items: Object.fromEntries(
            (tracks.data || []).map((item) => [item.id, item.updated_at])
          ),
        },
      },
      footer: {
        artistName: settings.data.artist_name,
        contactBlurb: settings.data.contact_blurb,
        footerEffect: normalizeFooterEffect(settings.data.footer_effect),
        location: settings.data.location,
        tagline: settings.data.tagline,
        socialLinks: (socials.data || []).map((item) => ({
          id: item.id,
          label: item.label,
          platform: item.platform,
          href: item.href,
          iconKey: item.icon_key,
        })),
      },
    },
  };
}

export type AdminMusicEditorData = {
  snapshot: MusicEditorSnapshot;
  isConfigured: boolean;
  migrationRequired: boolean;
  loadError?: string;
};

export async function getAdminMusicEditorData(): Promise<AdminMusicEditorData> {
  // The V2 layout also checks this, but the data boundary must stand on its own.
  await requireAdmin();

  if (!hasAdminServiceEnv()) {
    return {
      snapshot: createFallbackMusicEditorSnapshot(),
      isConfigured: false,
      migrationRequired: false,
    };
  }

  const supabase = createAdminServiceClient();
  if (!supabase) {
    return {
      snapshot: createFallbackMusicEditorSnapshot(),
      isConfigured: false,
      migrationRequired: false,
    };
  }

  const { data, error } = await supabase.rpc("get_music_page_v2_snapshot", {
    p_site_id: "main",
  });

  if (error && isMissingMusicEditorSchemaError(error)) {
    const legacy = await loadLegacyMusicSnapshot(supabase);
    return {
      snapshot: legacy.snapshot,
      isConfigured: true,
      migrationRequired: true,
      loadError: legacy.loadError,
    };
  }

  if (error) {
    console.error("Admin V2 Music snapshot failed.", {
      code: error.code,
      message: error.message,
    });
    return {
      snapshot: createFallbackMusicEditorSnapshot(),
      isConfigured: true,
      migrationRequired: false,
      loadError:
        "Music content could not be loaded. Nothing can be saved from this view.",
    };
  }

  const snapshot = parseMusicEditorSnapshot(data);
  if (!snapshot) {
    console.error("Admin V2 Music snapshot returned an invalid shape.");
    return {
      snapshot: createFallbackMusicEditorSnapshot(),
      isConfigured: true,
      migrationRequired: false,
      loadError:
        "Music content returned an unexpected shape. The editor is read-only.",
    };
  }

  return {
    snapshot,
    isConfigured: true,
    migrationRequired: false,
  };
}
