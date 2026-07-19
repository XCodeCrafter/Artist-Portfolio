import { NextResponse, type NextRequest } from "next/server";
import { isAllowedAdmin } from "@/lib/admin/auth";
import { writeAuditLog } from "@/lib/admin/audit";
import {
  clearAdminRecoveryChallenge,
  issueAdminRecoveryChallenge,
} from "@/lib/admin/recovery";
import { getSiteUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");

  if (code) {
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
    await supabase.auth.signOut();

    await writeAuditLog({
      action: "admin_password_reset_link_failed",
      tableName: "auth",
      recordId: "password-recovery",
      metadata: {
        reason: error?.name || "invalid-recovery-context",
        redirectType: data.redirectType || "unknown",
      },
    });
  }

  return NextResponse.redirect(
    new URL("/admin/forgot-password?error=invalid-link", getSiteUrl())
  );
}
