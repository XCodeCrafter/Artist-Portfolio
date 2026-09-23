import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parsePublicPhotoFramings } from "./photo-framing";

/** Additive rollout: absent 0051 keeps old crops; other errors are not an empty map. */
export async function loadPublicPhotoFramings(client: SupabaseClient) {
  const { data, error } = await client.rpc("get_public_photo_framings_v1")
    .abortSignal(AbortSignal.timeout(5000));
  if (error) {
    if (["PGRST202", "42883"].includes(error.code || "") &&
      /get_public_photo_framings_v1/.test([error.message, error.details, error.hint].filter(Boolean).join(" "))) return null;
    throw new Error("Photo positioning could not be loaded.");
  }
  const map = parsePublicPhotoFramings(data);
  if (!map) throw new Error("Invalid photo positioning snapshot.");
  return map;
}
