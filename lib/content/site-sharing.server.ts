import "server-only";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createPublicContentClient } from "@/lib/content/supabase";
import { DEFAULT_SHARING_METADATA, parsePublicSharingMetadata, type SharingMetadata } from "@/lib/content/site-sharing";

/** Additive rollout: only a missing 0056 RPC is an absent optional feature. */
export async function loadPublicSiteSharing(client: SupabaseClient): Promise<SharingMetadata | null> {
  const { data, error } = await client.rpc("get_public_site_sharing_v2").abortSignal(AbortSignal.timeout(5_000));
  if (error) {
    if (["PGRST202", "42883"].includes(error.code || "") &&
      /get_public_site_sharing_v2/.test([error.message, error.details, error.hint].filter(Boolean).join(" "))) return null;
    throw new Error("Sharing settings could not be loaded.");
  }
  const parsed = parsePublicSharingMetadata(data);
  if (!parsed) throw new Error("Invalid public sharing snapshot.");
  return parsed;
}

/** Only the anonymous, exact public projection. Never read a service snapshot here. */
export const getPublicSiteSharing = cache(async (): Promise<SharingMetadata> => {
  const fallback = { ...DEFAULT_SHARING_METADATA };
  const client = createPublicContentClient();
  if (!client) return fallback;
  try {
    return await loadPublicSiteSharing(client) ?? fallback;
  } catch { return fallback; }
});
