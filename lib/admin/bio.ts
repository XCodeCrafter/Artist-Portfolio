import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/admin/auth";
import {
  createAdminServiceClient,
  hasAdminServiceEnv,
} from "@/lib/admin/service";
import {
  createFallbackBioEditorSnapshot,
  parseBioEditorSnapshot,
  type BioEditorSnapshot,
} from "@/lib/admin/bio-editor";
import { FALLBACK_CONTENT } from "@/lib/content/fallback";
import { normalizeFooterEffect } from "@/lib/content/types";

type DatabaseErrorLike = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

export function isMissingBioEditorSchemaError(error?: DatabaseErrorLike | null) {
  if (!error) return false;
  const message = [error.message, error.details, error.hint]
    .filter(Boolean)
    .join(" ");

  return (
    error.code === "PGRST202" ||
    error.code === "PGRST205" ||
    (error.code === "23503" && /bio_page_snapshot_missing/i.test(message)) ||
    (error.code === "42883" &&
      /bio_page_v2|bio_(?:hero|biography|resume|credits)_v2/i.test(message)) ||
    /schema cache.*(?:get_bio_page_v2_snapshot|save_bio_(?:hero|biography|resume|credits)_v2)/i.test(
      message
    )
  );
}

export function isBioEditorWriteConflict(error?: DatabaseErrorLike | null) {
  return Boolean(
    error &&
      (error.code === "40001" ||
        /bio_(?:hero|biography|resume|credits)_changed/i.test(
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

type LegacyBioProfileRow = {
  top_label: string;
  intro_text: string;
  caption: string;
  updated_at: string;
};

type LegacyBioGalleryRow = {
  id: string;
  src: string;
  alt: string;
  is_published: boolean;
  updated_at: string;
};

type LegacyBioParagraphRow = {
  id: string;
  body: string;
  reveal_delay: number;
  is_published: boolean;
  updated_at: string;
};

type LegacyResumeRow = {
  headline: string;
  summary: string;
  location: string;
  playing_age: string;
  height: string;
  eyes: string;
  hair: string;
  languages: string;
  skills: string;
  representation: string;
  resume_url: string;
  updated_at: string;
};

type LegacyCreditRow = {
  id: string;
  credit_type:
    | "film"
    | "television"
    | "theatre"
    | "commercial"
    | "voiceover"
    | "training"
    | "other";
  title: string;
  role: string;
  production: string;
  director: string;
  year: string;
  href: string;
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

async function loadLegacyBioSnapshot(
  supabase: SupabaseClient
): Promise<{ snapshot: BioEditorSnapshot; loadError?: string }> {
  const fallback = createFallbackBioEditorSnapshot();
  const epoch = new Date(0).toISOString();
  const [settings, hero, profile, gallery, paragraphs, resume, credits, socials] =
    await Promise.all([
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
        .eq("page_slug", "bio")
        .limit(1)
        .maybeSingle<LegacyHeroRow>(),
      supabase
        .from("bio_profile")
        .select("top_label, intro_text, caption, updated_at")
        .eq("id", "main")
        .limit(1)
        .maybeSingle<LegacyBioProfileRow>(),
      supabase
        .from("bio_gallery_images")
        .select("id, src, alt, is_published, updated_at")
        .order("sort_order", { ascending: true })
        .order("id", { ascending: true })
        .returns<LegacyBioGalleryRow[]>(),
      supabase
        .from("bio_paragraphs")
        .select("id, body, reveal_delay, is_published, updated_at")
        .order("sort_order", { ascending: true })
        .order("id", { ascending: true })
        .returns<LegacyBioParagraphRow[]>(),
      supabase
        .from("actor_resume")
        .select(
          "headline, summary, location, playing_age, height, eyes, hair, languages, skills, representation, resume_url, updated_at"
        )
        .eq("id", "main")
        .limit(1)
        .maybeSingle<LegacyResumeRow>(),
      supabase
        .from("actor_credits")
        .select(
          "id, credit_type, title, role, production, director, year, href, is_published, updated_at"
        )
        .order("sort_order", { ascending: true })
        .order("id", { ascending: true })
        .returns<LegacyCreditRow[]>(),
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
    profile.error ||
    gallery.error ||
    paragraphs.error ||
    resume.error ||
    credits.error ||
    socials.error
  ) {
    return {
      snapshot: fallback,
      loadError:
        "Bio content could not be loaded. The editor is read-only until the database is reachable.",
    };
  }

  const heroRow = hero.data;
  const profileRow = profile.data;
  const resumeRow = resume.data;
  const settingsRow = settings.data;
  const galleryRows = gallery.data || [];
  const paragraphRows = paragraphs.data || [];
  const creditRows = credits.data || [];

  // Missing singleton rows remain visibly blank/read-only. Most importantly,
  // empty database collections stay empty instead of borrowing demo fallback
  // ids that a later save could accidentally materialise.
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
          : FALLBACK_CONTENT.heroes.bio,
        biography: {
          topLabel: profileRow?.top_label || "",
          introText: profileRow?.intro_text || "",
          caption: profileRow?.caption || "",
          galleryImages: galleryRows.map((item) => ({
            id: item.id,
            src: item.src,
            alt: item.alt,
            isPublished: item.is_published,
          })),
          paragraphs: paragraphRows.map((item) => ({
            id: item.id,
            body: item.body,
            revealDelay: item.reveal_delay,
            isPublished: item.is_published,
          })),
        },
        resume: resumeRow
          ? {
              headline: resumeRow.headline,
              summary: resumeRow.summary,
              location: resumeRow.location,
              playingAge: resumeRow.playing_age,
              height: resumeRow.height,
              eyes: resumeRow.eyes,
              hair: resumeRow.hair,
              languages: resumeRow.languages,
              skills: resumeRow.skills,
              representation: resumeRow.representation,
              resumeUrl: resumeRow.resume_url,
            }
          : {
              headline: "",
              summary: "",
              location: "",
              playingAge: "",
              height: "",
              eyes: "",
              hair: "",
              languages: "",
              skills: "",
              representation: "",
              resumeUrl: "",
            },
        credits: {
          items: creditRows.map((item) => ({
            id: item.id,
            creditType: item.credit_type,
            title: item.title,
            role: item.role,
            production: item.production,
            director: item.director,
            year: item.year,
            href: item.href,
            isPublished: item.is_published,
          })),
        },
      },
      versions: {
        hero: { updatedAt: heroRow?.updated_at || epoch },
        biography: {
          profileUpdatedAt: profileRow?.updated_at || epoch,
          galleryItems: Object.fromEntries(
            galleryRows.map((item) => [item.id, item.updated_at])
          ),
          paragraphItems: Object.fromEntries(
            paragraphRows.map((item) => [item.id, item.updated_at])
          ),
        },
        resume: { updatedAt: resumeRow?.updated_at || epoch },
        credits: {
          items: Object.fromEntries(
            creditRows.map((item) => [item.id, item.updated_at])
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
      hasResumeDetails: Boolean(resumeRow),
    },
    ...(!heroRow || !profileRow || !resumeRow || !settingsRow
      ? {
          loadError:
            "Required Bio records are incomplete. Apply migration 0030 before editing.",
        }
      : {}),
  };
}

export type AdminBioEditorData = {
  snapshot: BioEditorSnapshot;
  isConfigured: boolean;
  migrationRequired: boolean;
  loadError?: string;
};

export async function getAdminBioEditorData(): Promise<AdminBioEditorData> {
  // The V2 layout also checks this; the data boundary must still stand alone.
  await requireAdmin();

  if (!hasAdminServiceEnv()) {
    return {
      snapshot: createFallbackBioEditorSnapshot(),
      isConfigured: false,
      migrationRequired: false,
    };
  }

  const supabase = createAdminServiceClient();
  if (!supabase) {
    return {
      snapshot: createFallbackBioEditorSnapshot(),
      isConfigured: false,
      migrationRequired: false,
    };
  }

  const { data, error } = await supabase.rpc("get_bio_page_v2_snapshot", {
    p_site_id: "main",
  });

  if (error && isMissingBioEditorSchemaError(error)) {
    const legacy = await loadLegacyBioSnapshot(supabase);
    return {
      snapshot: legacy.snapshot,
      isConfigured: true,
      migrationRequired: true,
      loadError: legacy.loadError,
    };
  }

  if (error) {
    console.error("Admin V2 Bio snapshot failed.", {
      code: error.code,
      message: error.message,
    });
    return {
      snapshot: createFallbackBioEditorSnapshot(),
      isConfigured: true,
      migrationRequired: false,
      loadError:
        "Bio content could not be loaded. Nothing can be saved from this view.",
    };
  }

  const snapshot = parseBioEditorSnapshot(data);
  if (!snapshot) {
    console.error("Admin V2 Bio snapshot returned an invalid shape.");
    return {
      snapshot: createFallbackBioEditorSnapshot(),
      isConfigured: true,
      migrationRequired: false,
      loadError:
        "Bio content returned an unexpected shape. The editor is read-only.",
    };
  }

  return {
    snapshot,
    isConfigured: true,
    migrationRequired: false,
  };
}
