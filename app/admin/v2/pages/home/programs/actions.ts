"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { verifyAdminActionOrigin } from "@/lib/admin/action-security";
import { writeAuditLog } from "@/lib/admin/audit";
import { getEditableCncPrograms } from "@/lib/admin/cnc-programs";
import { createAdminServiceClient } from "@/lib/admin/service";
import {
  CNC_PROGRAMS_PAYLOAD_MAX_BYTES, classifyCncProgramsError, createCncProgramRows,
  createCncProgramsSnapshot, parseCncProgramsSubmission, type CncProgramsSaveState,
} from "@/lib/admin/cnc-program-editor";
import { getCncSourceByteLength } from "@/lib/cnc-program-input";

function response(status: CncProgramsSaveState["status"], message: string, extra: Partial<CncProgramsSaveState> = {}): CncProgramsSaveState {
  return { status, message, eventId: randomUUID(), ...extra };
}

export async function saveCncProgramsV2(_previous: CncProgramsSaveState, formData: FormData): Promise<CncProgramsSaveState> {
  const admin = await requireAdmin();
  if (!(await verifyAdminActionOrigin(admin.id, "cnc-programs-v2"))) {
    return response("security-error", "The request origin was blocked. Refresh Admin V2 and try again.");
  }
  const serialized = formData.get("payload");
  if (typeof serialized !== "string" || getCncSourceByteLength(serialized) > CNC_PROGRAMS_PAYLOAD_MAX_BYTES) {
    return response("invalid", "The program draft is missing or too large.");
  }
  let input: unknown;
  try { input = JSON.parse(serialized); }
  catch { return response("invalid", "The program draft could not be read."); }
  const parsed = parseCncProgramsSubmission(input);
  if (!parsed.success) return response("invalid", "Fix the highlighted program fields before saving.", { fieldErrors: parsed.fieldErrors });
  const supabase = createAdminServiceClient();
  if (!supabase) return response("missing-service", "Supabase admin access is not configured. Nothing was saved.");
  const { error } = await supabase.rpc("replace_cnc_programs", {
    p_expected_versions: parsed.data.expectedVersions,
    p_programs: createCncProgramRows(parsed.data.programs),
  });
  if (error) {
    const status = classifyCncProgramsError(error);
    const messages = {
      conflict: "Programs changed in another session. Your draft was kept. Reload before saving again.",
      "migration-required": "Program editing requires database migration 0024. Other Home sections remain available.",
      invalid: "The database rejected this program draft. Check its fields and source limits.",
      error: "Programs could not be saved. Your local changes are still here.",
    };
    return response(status, messages[status as keyof typeof messages] || messages.error);
  }
  await writeAuditLog({
    actorId: admin.id, action: "cnc_programs_v2_replace", tableName: "cnc_programs", recordId: "all",
    metadata: { count: parsed.data.programs.length, published: parsed.data.programs.filter((item) => item.isPublished).length },
  });
  for (const path of ["/", "/admin/v2/pages/home", "/admin/v2/pages/home/programs", "/admin/v2-preview/home", "/admin/content", "/admin/v2"]) revalidatePath(path);
  // The established RPC returns void. Read fresh timestamps, and do not silently
  // adopt another session's intervening write as the current user's own save.
  const latest = await getEditableCncPrograms();
  const snapshot = createCncProgramsSnapshot(latest.programs);
  const confirmed = parseCncProgramsSubmission(snapshot);
  if (!latest.isConfigured || latest.migrationRequired || latest.loadError || !confirmed.success ||
      JSON.stringify(snapshot.programs) !== JSON.stringify(parsed.data.programs)) {
    return response("error", "The save completed, but its latest version could not be confirmed. Your draft is kept; reload before further edits.", { requiresReload: true });
  }
  return response("saved", "Programs saved. Only visible programs appear on Home.", { snapshot: confirmed.data });
}
