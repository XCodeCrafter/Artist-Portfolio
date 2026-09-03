import { type NextRequest, NextResponse } from "next/server";
import { createContentSecurityPolicy } from "@/lib/security/csp";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const previewRoutes = new Set([
    "/admin/v2-preview/bio",
    "/admin/v2-preview/bio/",
    "/admin/v2-preview/gallery",
    "/admin/v2-preview/gallery/",
    "/admin/v2-preview/music",
    "/admin/v2-preview/music/",
  ]);
  const allowSameOriginFraming = previewRoutes.has(request.nextUrl.pathname);
  const csp = createContentSecurityPolicy(nonce, {
    allowSameOriginFraming,
  });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = request.nextUrl.pathname.startsWith("/admin")
    ? await updateSession(request, requestHeaders)
    : NextResponse.next({ request: { headers: requestHeaders } });

  response.headers.set("Content-Security-Policy", csp);
  response.headers.set(
    "X-Frame-Options",
    allowSameOriginFraming ? "SAMEORIGIN" : "DENY"
  );

  if (
    request.nextUrl.pathname.startsWith("/admin/forgot-password") ||
    request.nextUrl.pathname.startsWith("/admin/reset-password") ||
    request.nextUrl.pathname.startsWith("/admin/auth/callback")
  ) {
    response.headers.set("Referrer-Policy", "no-referrer");
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp4)$).*)",
  ],
};
