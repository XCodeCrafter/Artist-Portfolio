import { createAdminServiceClient } from "@/lib/admin/service";

export type AuditWriteResult =
  | { ok: true }
  | {
      ok: false;
      reason: "not-configured" | "insert-failed";
      errorCode?: string;
    };

export async function writeAuditLog(input: {
  actorId?: string | null;
  action: string;
  tableName?: string;
  recordId?: string;
  metadata?: Record<string, unknown>;
}): Promise<AuditWriteResult> {
  const supabase = createAdminServiceClient();
  if (!supabase) {
    console.error("[audit] Audit write skipped: service client is unavailable.", {
      action: input.action,
      tableName: input.tableName || "",
    });
    return { ok: false, reason: "not-configured" };
  }

  const { error } = await supabase.from("audit_logs").insert({
    actor_id: input.actorId || null,
    action: input.action,
    table_name: input.tableName || "",
    record_id: input.recordId || "",
    metadata: input.metadata || {},
  });

  if (error) {
    console.error("[audit] Failed to persist audit event.", {
      action: input.action,
      tableName: input.tableName || "",
      recordId: input.recordId || "",
      code: error.code,
      message: error.message,
    });
    return {
      ok: false,
      reason: "insert-failed",
      errorCode: error.code || undefined,
    };
  }

  return { ok: true };
}
