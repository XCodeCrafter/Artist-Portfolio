"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/auth";
import { verifyAdminActionOrigin } from "@/lib/admin/action-security";
import { createAdminServiceClient } from "@/lib/admin/service";
import { writeAuditLog } from "@/lib/admin/audit";
import { isMissingSharingSchemaError, SHARING_MIGRATION_MESSAGE } from "@/lib/admin/site-sharing";
import { parseSharingSubmission, type SharingSaveState } from "@/lib/admin/site-sharing-editor";

function result(status: SharingSaveState["status"], message: string, extra: Partial<SharingSaveState> = {}): SharingSaveState {
  return { status, message, eventId: randomUUID(), ...extra };
}
const formSchema = z.object({ payload: z.string().max(12_000), versions: z.string().max(1_000) }).strict();
export async function saveSiteSharingV2(_previous: SharingSaveState, formData: FormData): Promise<SharingSaveState> {
  const admin = await requireAdmin();
  if (["payload", "versions"].some(key => formData.getAll(key).length !== 1)) return result("invalid", "The sharing draft could not be read.");
  const form = formSchema.safeParse({ payload: formData.get("payload"), versions: formData.get("versions") });
  if (!form.success) return result("invalid", "The sharing draft could not be read.");
  let payload: unknown; let versions: unknown;
  try { payload = JSON.parse(form.data.payload); versions = JSON.parse(form.data.versions); }
  catch { return result("invalid", "The sharing draft could not be read."); }
  const parsed = parseSharingSubmission(payload, versions);
  if (!parsed.success) return result("invalid", "Fix the highlighted fields before saving.", { fieldErrors: parsed.fieldErrors });
  if (!(await verifyAdminActionOrigin(admin.id, "site-sharing-v2:main"))) return result("security-error", "The request origin was blocked. Refresh Admin V2 and try again.");
  const client = createAdminServiceClient();
  if (!client) return result("missing-service", "Supabase admin access is not configured, so nothing was saved.");
  let response;
  try {
    response = await client.rpc("save_site_sharing_v2", { p_site_id: "main", p_expected_updated_at: parsed.data.versions.updatedAt, p_payload: parsed.data.payload }).abortSignal(AbortSignal.timeout(10_000));
  } catch { return result("error", "The save outcome could not be confirmed. Your draft was kept, but the server may have saved it. Reload the saved settings before trying again."); }
  if (!response || typeof response !== "object") return result("error", "The save response could not be confirmed. Reload before editing again.");
  const { data, error } = response;
  if (error) {
    if (isMissingSharingSchemaError(error)) return result("migration-required", SHARING_MIGRATION_MESSAGE);
    if (error.code === "40001") return result("conflict", "Sharing settings changed in another admin session. Your draft was kept. Reload before saving again.");
    if (["22023", "23514"].includes(error.code)) return result("invalid", "Review the fields and select a published JPG, PNG or WebP image from the Media Library.");
    console.error("Sharing settings save failed.", { code: error.code });
    return result("error", "The save outcome could not be confirmed. Reload the saved settings before trying again.");
  }
  const confirmed = parseSharingSubmission(data?.canonical, data?.versions);
  if (!confirmed.success || confirmed.data.versions.updatedAt === parsed.data.versions.updatedAt) return result("error", "The save response could not be confirmed. Reload before editing again.");
  const warnings: string[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const audit = await Promise.race([
      writeAuditLog({ actorId: admin.id, action: "site_sharing_v2_save", tableName: "site_sharing_config", recordId: "main", metadata: { customImage: Boolean(confirmed.data.payload.imageSrc) } }),
      new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), 2_000); }),
    ]);
    if (audit === null) warnings.push("Audit confirmation timed out; the audit entry may still be recorded.");
    else if (!audit.ok) warnings.push("The audit log could not be recorded.");
  } catch { warnings.push("The audit log could not be recorded."); }
  finally { if (timer !== undefined) clearTimeout(timer); }
  let cacheFailed = false;
  try { revalidatePath("/", "layout"); } catch { cacheFailed = true; }
  for (const path of ["/admin/v2/settings/sharing", "/admin/v2/settings", "/opengraph-image", "/twitter-image"]) {
    try { revalidatePath(path); } catch { cacheFailed = true; }
  }
  if (cacheFailed) warnings.push("The page cache could not be fully refreshed.");
  return result("saved", warnings.length ? `Sharing settings saved. ${warnings.join(" ")}` : "Sharing settings saved and published.", {
    canonical: confirmed.data.payload, versions: confirmed.data.versions, savedAt: new Date().toISOString(),
  });
}
