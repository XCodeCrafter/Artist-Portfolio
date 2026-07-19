import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import {
  getSupabasePublishableKey,
  getSupabaseUrl,
  hasSupabaseBrowserEnv,
} from "./env";

function isTransientSupabaseNetworkError(error: unknown) {
  if (!(error instanceof Error) || error.message !== "fetch failed") {
    return false;
  }

  const code = (error.cause as { code?: unknown } | undefined)?.code;
  return typeof code === "string" && code.startsWith("UND_ERR_");
}

export async function updateSession(
  request: NextRequest,
  requestHeaders = new Headers(request.headers)
) {
  if (!hasSupabaseBrowserEnv()) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  let response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  const cookieOptions = {
    httpOnly: true,
    path: "/",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    priority: "high" as const,
  };

  const supabase = createServerClient(
    getSupabaseUrl(),
    getSupabasePublishableKey(),
    {
      cookieOptions,
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );

          response = NextResponse.next({
            request: { headers: requestHeaders },
          });

          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, { ...options, ...cookieOptions })
          );
        },
      },
    }
  );

  try {
    await supabase.auth.getUser();
  } catch (error) {
    if (!isTransientSupabaseNetworkError(error)) throw error;

    // Keep the request usable when the auth refresh endpoint is temporarily unavailable.
  }

  return response;
}
