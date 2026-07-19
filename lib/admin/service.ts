import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function getAdminServiceKey() {
  return process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
}

export function hasAdminServiceEnv() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && getAdminServiceKey());
}

export function createAdminServiceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = getAdminServiceKey();

  if (!url || !serviceKey) {
    return null;
  }

  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
