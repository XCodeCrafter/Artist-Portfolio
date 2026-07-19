import { NextResponse } from "next/server";
import { createAdminServiceClient } from "@/lib/admin/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const supabase = createAdminServiceClient();
  let database = false;

  if (supabase) {
    try {
      const result = await supabase.from("site_settings").select("id").limit(1);
      database = !result.error;
    } catch {
      database = false;
    }
  }

  const healthy = Boolean(supabase && database);

  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      database,
      timestamp: new Date().toISOString(),
    },
    {
      status: healthy ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    }
  );
}
