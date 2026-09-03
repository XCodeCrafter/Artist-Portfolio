"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { verifyAdminActionOrigin } from "@/lib/admin/action-security";
import { requireAdmin } from "@/lib/admin/auth";
import { writeAuditLog } from "@/lib/admin/audit";
import {
  isContactEditorWriteConflict,
  isMissingContactEditorSchemaError,
} from "@/lib/admin/contact";
import {
  parseContactSectionSubmission,
  type ContactEditorSection,
  type ContactEditorVersions,
  type ContactSaveState,
} from "@/lib/admin/contact-editor";
import { createAdminServiceClient } from "@/lib/admin/service";

const formSchema = z
  .object({
    section: z.string().max(32),
    payload: z.string().max(32_000),
    versions: z.string().max(8_000),
  })
  .strict();

function result(
  status: ContactSaveState["status"],
  message: string,
  extra: Partial<ContactSaveState> = {}
): ContactSaveState {
  return { status, message, eventId: randomUUID(), ...extra };
}

function rpcName(section: ContactEditorSection) {
  return `save_contact_${section}_v2`;
}

function rpcArguments(
  section: ContactEditorSection,
  payload: unknown,
  versions: unknown
) {
  const expected = versions as
    | ContactEditorVersions["hero"]
    | ContactEditorVersions["details"];
  return {
    p_site_id: "main",
    p_expected_updated_at: expected.updatedAt,
    p_payload: payload,
  };
}

function savedVersions(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return (value as Record<string, unknown>).versions;
}

export async function saveContactSectionV2(
  _previousState: ContactSaveState,
  formData: FormData
): Promise<ContactSaveState> {
  // Authenticate first so malformed requests do not expose private validation.
  const admin = await requireAdmin();

  const parsedForm = formSchema.safeParse({
    section: formData.get("section"),
    payload: formData.get("payload"),
    versions: formData.get("versions"),
  });
  if (!parsedForm.success) {
    return result(
      "invalid",
      "This Contact draft is incomplete. Check the active inspector and try again."
    );
  }

  let rawPayload: unknown;
  let rawVersions: unknown;
  try {
    rawPayload = JSON.parse(parsedForm.data.payload);
    rawVersions = JSON.parse(parsedForm.data.versions);
  } catch {
    return result("invalid", "The Contact draft could not be read.");
  }

  const parsed = parseContactSectionSubmission(
    parsedForm.data.section,
    rawPayload,
    rawVersions
  );
  if (!parsed.success) {
    return result("invalid", "Fix the highlighted fields before saving.", {
      section: parsedForm.data.section as ContactEditorSection,
      fieldErrors: parsed.fieldErrors,
    });
  }

  const { section, payload, versions } = parsed.data;
  if (!(await verifyAdminActionOrigin(admin.id, `contact-v2:${section}`))) {
    return result(
      "security-error",
      "The request origin was blocked. Refresh Admin V2 and try again.",
      { section }
    );
  }

  const supabase = createAdminServiceClient();
  if (!supabase) {
    return result(
      "missing-service",
      "Supabase admin access is not configured, so nothing was saved.",
      { section }
    );
  }

  const { data, error } = await supabase.rpc(
    rpcName(section),
    rpcArguments(section, payload, versions)
  );

  if (error) {
    if (isContactEditorWriteConflict(error)) {
      return result(
        "conflict",
        "This section changed in another admin session. Your draft was kept and nothing was overwritten.",
        { section }
      );
    }
    if (isMissingContactEditorSchemaError(error)) {
      return result(
        "migration-required",
        "The Contact editor needs database migration 0033 before it can save.",
        { section }
      );
    }
    if (
      error.code === "22023" ||
      error.code === "23514" ||
      /invalid_contact_(?:hero|details)_payload/i.test(error.message || "")
    ) {
      return result(
        "invalid",
        "The section contains invalid or outdated content. Review the fields and try again.",
        { section }
      );
    }

    console.error("Admin V2 Contact save failed.", {
      section,
      code: error.code,
      message: error.message,
    });
    return result(
      "error",
      "The section could not be saved. Nothing was intentionally overwritten.",
      { section }
    );
  }

  const returnedVersions = savedVersions(data);
  const confirmed = parseContactSectionSubmission(
    section,
    payload,
    returnedVersions
  );
  if (!confirmed.success) {
    console.error("Admin V2 Contact save returned invalid versions.", {
      section,
    });
    return result(
      "error",
      "The save response could not be confirmed. Reload before editing this section again.",
      { section }
    );
  }

  await writeAuditLog({
    actorId: admin.id,
    action: `contact_v2_${section}_save`,
    tableName: section === "hero" ? "page_heroes" : "site_settings",
    recordId: section === "hero" ? "booking" : "main",
    metadata: { section },
  });

  revalidatePath("/booking");
  revalidatePath("/admin/v2/pages/contact");
  revalidatePath("/admin/v2-preview/contact");

  return result("saved", "Section saved and published.", {
    section,
    canonicalSection: payload,
    versions: confirmed.data.versions,
    savedAt: new Date().toISOString(),
  });
}
