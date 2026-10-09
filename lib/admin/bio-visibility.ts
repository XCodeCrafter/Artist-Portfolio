import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  parseBioSectionSubmission,
  type BioEditorDraft,
  type BioEditorVersions,
} from "@/lib/admin/bio-editor";

type DatabaseError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};
export const BIO_VISIBILITY_COLUMNS = "bio_resume_credits_enabled,updated_at";
export const BIO_VISIBILITY_MIGRATION_MESSAGE =
  "Apply migration 0059_bio_resume_visibility.sql and its verification check before saving Resume & Credits visibility.";

export function isMissingBioVisibilitySchemaError(error?: DatabaseError | null) {
  return Boolean(
    error &&
      ["42703", "PGRST204"].includes(error.code || "") &&
      /bio_resume_credits_enabled/i.test(
        [error.message, error.details, error.hint].filter(Boolean).join(" ")
      )
  );
}

/** A separate read keeps an unavailable additive setting from disabling Bio editing. */
export async function loadBioVisibility(client: SupabaseClient): Promise<{
  draft: BioEditorDraft["visibility"];
  versions: BioEditorVersions["visibility"];
} | null> {
  try {
    const { data, error } = await client
      .from("site_settings")
      .select(BIO_VISIBILITY_COLUMNS)
      .eq("id", "main")
      .maybeSingle<Record<string, unknown>>();
    if (error || !data) return null;
    const parsed = parseBioSectionSubmission(
      "visibility",
      { resumeCreditsEnabled: data.bio_resume_credits_enabled },
      { updatedAt: data.updated_at }
    );
    if (!parsed.success) return null;
    return {
      draft: parsed.data.payload as BioEditorDraft["visibility"],
      versions: parsed.data.versions as BioEditorVersions["visibility"],
    };
  } catch {
    return null;
  }
}
