import { NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/admin/audit";
import { createAdminServiceClient } from "@/lib/admin/service";
import { hasValidBearerToken } from "@/lib/security/bearer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!hasValidBearerToken(request.headers.get("authorization"), cronSecret)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const supabase = createAdminServiceClient();
  if (!supabase) {
    return NextResponse.json({ ok: false }, { status: 503 });
  }

  const result = await supabase.rpc("cleanup_security_retention", {
    p_audit_retention_days: 365,
    p_analytics_retention_days: 180,
    p_archived_inquiry_retention_days: 365,
    p_recovery_retention_days: 30,
    p_rate_limit_grace_hours: 24,
  });

  if (result.error) {
    console.error(result.error);
    await writeAuditLog({
      action: "maintenance_retention_failed",
      tableName: "operations",
      recordId: new Date().toISOString().slice(0, 10),
      metadata: { reason: "retention_rpc_failed" },
    });
    return NextResponse.json({ ok: false }, { status: 503 });
  }

  const counts = Array.isArray(result.data) ? result.data[0] || {} : result.data || {};
  await writeAuditLog({
    action: "maintenance_retention_completed",
    tableName: "operations",
    recordId: new Date().toISOString().slice(0, 10),
    metadata: counts,
  });

  return NextResponse.json({ ok: true, counts });
}
