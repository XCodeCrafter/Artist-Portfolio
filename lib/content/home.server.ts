import "server-only";

import { cache } from "react";
import { createHomeDraftFromContent, parseHomeEditorDraft, type HomeEditorDraft } from "@/lib/admin/home-editor";
import type { PortfolioContent } from "@/lib/content/types";
import { createPublicContentClient } from "@/lib/content/supabase";
import { normalizeHeroFraming } from "@/lib/content/hero-framing";

function isMissingHomeSchema(error: { code?: string; message?: string }) {
  return (error.code === "42P01" || error.code === "PGRST205") &&
    Boolean(error.message?.includes("home_page_config"));
}

/** Read only on HOME, keeping this page's editable content out of every other page payload. */
export const getPublishedHomeDraft = cache(async (content: PortfolioContent): Promise<HomeEditorDraft> => {
  const supabase = createPublicContentClient();
  if (!supabase) return createHomeDraftFromContent(content);

  const result = await supabase.from("home_page_config")
    .select("*")
    .eq("id", "main")
    .limit(1)
    .returns<Array<{ draft: unknown; hero_media_framing?: unknown }>>();

  if (result.error) {
    if (isMissingHomeSchema(result.error)) return createHomeDraftFromContent(content);
    // Do not revive sections an owner has hidden when a database read fails.
    console.error("Unable to load HOME configuration.", result.error.code);
    throw new Error("Unable to load HOME configuration.");
  }

  // The migration creates the singleton. An absent row can also mean a broken
  // SELECT policy, so it must not silently re-enable legacy content.
  if (!result.data?.length) throw new Error("Missing HOME configuration.");
  const draft = parseHomeEditorDraft(result.data[0].draft);
  if (!draft) throw new Error("Invalid HOME configuration.");
  if (result.data[0].hero_media_framing !== undefined) {
    draft.hero.framing = normalizeHeroFraming(result.data[0].hero_media_framing);
  }
  return draft;
});
