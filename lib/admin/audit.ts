import { createAdminServiceClient } from "@/lib/admin/service";

export async function writeAuditLog(input: {
  actorId?: string | null;
  action: string;
  tableName?: string;
  recordId?: string;
  metadata?: Record<string, unknown>;
}) {
  const supabase = createAdminServiceClient();
  if (!supabase) return;

  await supabase.from("audit_logs").insert({
    actor_id: input.actorId || null,
    action: input.action,
    table_name: input.tableName || "",
    record_id: input.recordId || "",
    metadata: input.metadata || {},
  });
}
