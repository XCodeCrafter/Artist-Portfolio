import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { heroFramingSchema } from "@/lib/content/hero-framing";
import type { PageSlug } from "@/lib/content/types";

type RpcError = { code?: string | null; message?: string | null; details?: string | null; hint?: string | null };
export const HERO_FRAMING_MIGRATION_MESSAGE = "Apply database migration 0046 to save Hero framing. Your draft has been kept.";

export function isMissingHeroFramingSchemaError(error?: RpcError | null) {
  return Boolean(error && ["PGRST202", "42883"].includes(error.code || "") &&
    /(?:get_hero_editor_with_framing_v2|save_hero_with_framing_v2)/i.test(
      [error.message, error.details, error.hint].filter(Boolean).join(" ")
    ));
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

/** Called only after requireAdmin. Fall back only when the additive RPC is absent. */
export async function loadHeroEditorSnapshot(client: SupabaseClient, page: PageSlug, legacyRpc: string) {
  try {
    const response = await client.rpc("get_hero_editor_with_framing_v2", { p_page: page, p_site_id: "main" })
      .abortSignal(AbortSignal.timeout(5000));
    if (response.error) {
      if (isMissingHeroFramingSchemaError(response.error)) {
        return await client.rpc(legacyRpc, { p_site_id: "main" })
          .abortSignal(AbortSignal.timeout(5000));
      }
      // Parent-migration errors retain their codes; authorization/timeouts never
      // turn into a legacy snapshot which could silently omit an existing crop.
      return response;
    }
    const snapshot = record(response.data);
    const hero = record(page === "home" ? record(snapshot?.draft)?.hero : snapshot?.hero);
    if (!hero || !Object.hasOwn(hero, "framing") || !heroFramingSchema.nullable().safeParse(hero.framing).success) {
      return { data: null, error: { code: "INVALID_HERO_FRAMING_SNAPSHOT", message: "Hero framing snapshot could not be verified." } };
    }
    return response;
  } catch {
    return { data: null, error: { code: "HERO_FRAMING_SNAPSHOT_UNAVAILABLE", message: "Hero framing snapshot could not be loaded." } };
  }
}

/** No write fallback: retrying the old RPC could discard framing or duplicate a save. */
export function getHeroSaveCall(page: PageSlug, section: string, legacyRpc: string, args: Record<string, unknown>) {
  const payload = record(args.p_payload);
  if (section !== "hero" || payload?.framing === undefined) return { name: legacyRpc, args };
  return {
    name: "save_hero_with_framing_v2",
    args: {
      p_page: page,
      p_site_id: args.p_site_id,
      p_expected_updated_at: args.p_expected_updated_at,
      p_payload: payload,
    },
  };
}
