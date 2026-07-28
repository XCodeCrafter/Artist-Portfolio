import { NextResponse, type NextRequest } from "next/server";
import { isAllowedAdmin } from "@/lib/admin/auth";
import { keyedDigest } from "@/lib/admin/security-secret";
import {
  clearAdminRecoveryChallenge,
  issueAdminRecoveryChallenge,
} from "@/lib/admin/recovery";
import { getSiteUrl } from "@/lib/site-url";
import { getClientIp } from "@/lib/security/request";
import { consumeDatabaseRateLimit } from "@/lib/security/rate-limit";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const rawCode = request.nextUrl.searchParams.get("code");
  const code = rawCode && rawCode.length <= 2048 ? rawCode : null;

  if (code) {
    const callbackLimit = await consumeDatabaseRateLimit({
      bucket: "admin-auth:recovery-callback:ip",
      identifierHash: keyedDigest(
        "auth-rate-ip",
        getClientIp(request.headers)
      ),
      limit: 12,
      windowSeconds: 15 * 60,
    });

    if (!callbackLimit.allowed) {
      return NextResponse.redirect(
        new URL("/admin/forgot-password?error=invalid-link", getSiteUrl())
      );
    }

    const supabase = await createClient();
    const exchange = await supabase.auth.exchangeCodeForSession(code);
    const error = exchange.error;
    const data = exchange.data as typeof exchange.data & {
      redirectType: string | null;
    };

    if (
      !error &&
      data.redirectType === "recovery" &&
      data.session?.access_token &&
      data.user &&
      (await isAllowedAdmin(data.user)) &&
      (await issueAdminRecoveryChallenge(
        data.user.id,
        data.session.access_token
      ))
    ) {
      return NextResponse.redirect(
        new URL("/admin/reset-password", getSiteUrl())
      );
    }

    await clearAdminRecoveryChallenge();
    if (data.session) await supabase.auth.signOut();
  }

  return NextResponse.redirect(
    new URL("/admin/forgot-password?error=invalid-link", getSiteUrl())
  );
}
