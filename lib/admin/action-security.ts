import { headers } from "next/headers";
import { writeAuditLog } from "@/lib/admin/audit";
import { hasAllowedRequestOrigin } from "@/lib/security/origin";
import { getReferrerWithoutQuery } from "@/lib/security/request";

function sanitizeHeaderValue(value?: string | null) {
  return (value || "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[\u0000-\u001f\u007f]+/g, "")
    .trim()
    .slice(0, 220);
}

export async function verifyAdminActionOrigin(
  actorId: string | undefined,
  recordId: string,
  logFailure = true
) {
  const headerStore = await headers();

  if (hasAllowedRequestOrigin(headerStore)) return true;

  if (logFailure) {
    await writeAuditLog({
      actorId,
      action: "security_admin_bad_origin",
      tableName: "security_events",
      recordId,
      metadata: {
        origin: sanitizeHeaderValue(headerStore.get("origin")),
        referer: sanitizeHeaderValue(getReferrerWithoutQuery(headerStore)),
        host: sanitizeHeaderValue(headerStore.get("host")),
      },
    });
  }

  return false;
}

export async function verifyPublicAuthActionOrigin(recordId: string) {
  // Public auth actions have no trusted client identity yet. Avoid turning a
  // forged Origin header into an unbounded audit-log write primitive.
  return verifyAdminActionOrigin(undefined, `auth:${recordId}`, false);
}
