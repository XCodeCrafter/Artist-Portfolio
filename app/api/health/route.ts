import { NextResponse } from "next/server";
import { createAdminServiceClient } from "@/lib/admin/service";
import { probeDatabaseRateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const supabase = createAdminServiceClient();
  let database = false;
  let rateLimiting = false;

  if (supabase) {
    try {
      const [databaseResult, rateLimitResult] = await Promise.all([
        supabase.from("site_settings").select("id").limit(1),
        probeDatabaseRateLimit(supabase),
      ]);
      database = !databaseResult.error;
      rateLimiting = rateLimitResult;
    } catch {
      database = false;
      rateLimiting = false;
    }
  }

  const healthy = Boolean(supabase && database && rateLimiting);

  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      database,
      rateLimiting,
      timestamp: new Date().toISOString(),
    },
    {
      status: healthy ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    }
  );
}
