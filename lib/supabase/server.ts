import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { getSupabasePublishableKey, getSupabaseUrl } from "./env";

export async function createClient() {
  const cookieStore = await cookies();
  const cookieOptions = {
    httpOnly: true,
    path: "/",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };

  return createServerClient(getSupabaseUrl(), getSupabasePublishableKey(), {
    cookieOptions,
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, { ...options, ...cookieOptions })
          );
        } catch {
          // Server Components cannot set cookies. The proxy refreshes them.
        }
      },
    },
  });
}
