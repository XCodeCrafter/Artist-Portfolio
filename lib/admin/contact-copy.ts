import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireAdmin } from "./auth";
import { createAdminServiceClient } from "./service";

export type ContactCopyCapability = {
  available: boolean;
  migrationRequired: boolean;
  message?: string;
};
const capabilitySchema = z.object({ optionalDetails: z.literal(true) }).strict();
const unavailable: ContactCopyCapability = {
  available: false,
  migrationRequired: false,
  message: "Optional Contact fields could not be verified. Filled details and Hero editing remain available; reload to retry.",
};

// The caller authenticates first. This is a read-only capability check, never a
// trial save or a rate-limit-consuming write probe.
export async function readContactCopyCapability(client: SupabaseClient): Promise<ContactCopyCapability> {
  try {
    const { data, error } = await client.rpc("get_contact_copy_capabilities_v2")
      .abortSignal(AbortSignal.timeout(5000));
    if (error) return ["PGRST202", "42883"].includes(error.code)
      ? { available: false, migrationRequired: true, message: "Apply migration 0045 to save empty Contact details. Filled details and Hero editing still work." }
      : unavailable;
    return capabilitySchema.safeParse(data).success ? { available: true, migrationRequired: false } : unavailable;
  } catch {
    return unavailable;
  }
}

export async function getContactCopyCapability(): Promise<ContactCopyCapability> {
  await requireAdmin();
  try {
    const client = createAdminServiceClient();
    return client ? await readContactCopyCapability(client) : unavailable;
  } catch {
    return unavailable;
  }
}
