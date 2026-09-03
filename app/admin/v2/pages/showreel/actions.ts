"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { verifyAdminActionOrigin } from "@/lib/admin/action-security";
import { requireAdmin } from "@/lib/admin/auth";
import { writeAuditLog } from "@/lib/admin/audit";
import {
  isMissingShowreelEditorSchemaError,
  isShowreelEditorWriteConflict,
} from "@/lib/admin/showreel";
import {
  parseShowreelSectionSubmission,
  type ShowreelEditorSection,
  type ShowreelEditorVersions,
  type ShowreelSaveState,
} from "@/lib/admin/showreel-editor";
import { createAdminServiceClient } from "@/lib/admin/service";

const formSchema = z
  .object({
    section: z.string().max(32),
    payload: z.string().max(1_024_000),
    versions: z.string().max(256_000),
  })
  .strict();

function result(
  status: ShowreelSaveState["status"],
  message: string,
  extra: Partial<ShowreelSaveState> = {}
): ShowreelSaveState {
  return { status, message, eventId: randomUUID(), ...extra };
}

function rpcName(section: ShowreelEditorSection) {
  return `save_showreel_${section}_v2`;
}

function rpcArguments(
  section: ShowreelEditorSection,
  payload: unknown,
  versions: unknown
) {
  if (section === "hero" || section === "introduction") {
    const expected = versions as
      | ShowreelEditorVersions["hero"]
      | ShowreelEditorVersions["introduction"];
    return {
      p_site_id: "main",
      p_expected_updated_at: expected.updatedAt,
      p_payload: payload,
    };
  }

  return {
    p_site_id: "main",
    p_expected_versions: (versions as ShowreelEditorVersions["works"]).items,
    p_payload: payload,
  };
}

function savedVersions(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return (value as Record<string, unknown>).versions;
}

export async function saveShowreelSectionV2(
  _previousState: ShowreelSaveState,
  formData: FormData
): Promise<ShowreelSaveState> {
  const admin = await requireAdmin();

  const parsedForm = formSchema.safeParse({
    section: formData.get("section"),
    payload: formData.get("payload"),
    versions: formData.get("versions"),
  });
  if (!parsedForm.success) {
    return result(
      "invalid",
      "This Showreel draft is incomplete. Check the active inspector and try again."
    );
  }

  let rawPayload: unknown;
  let rawVersions: unknown;
  try {
    rawPayload = JSON.parse(parsedForm.data.payload);
    rawVersions = JSON.parse(parsedForm.data.versions);
  } catch {
    return result("invalid", "The Showreel draft could not be read.");
  }

  const parsed = parseShowreelSectionSubmission(
    parsedForm.data.section,
    rawPayload,
    rawVersions
  );
  if (!parsed.success) {
    return result("invalid", "Fix the highlighted fields before saving.", {
      section: parsedForm.data.section as ShowreelEditorSection,
      fieldErrors: parsed.fieldErrors,
    });
  }

  const { section, payload, versions } = parsed.data;
  if (!(await verifyAdminActionOrigin(admin.id, `showreel-v2:${section}`))) {
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
    if (isShowreelEditorWriteConflict(error)) {
      return result(
        "conflict",
        "This section changed in another admin session. Your draft was kept and nothing was overwritten.",
        { section }
      );
    }
    if (isMissingShowreelEditorSchemaError(error)) {
      return result(
        "migration-required",
        "The Showreel editor needs database migration 0032 before it can save.",
        { section }
      );
    }
    if (
      error.code === "22023" ||
      error.code === "23514" ||
      /invalid_showreel_(?:hero|introduction|works)_payload/i.test(
        error.message || ""
      )
    ) {
      return result(
        "invalid",
        "The section contains invalid or outdated content. Review the fields and try again.",
        { section }
      );
    }

    console.error("Admin V2 Showreel save failed.", {
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
  const confirmed = parseShowreelSectionSubmission(
    section,
    payload,
    returnedVersions,
    { requireExactCollectionVersions: true }
  );
  if (!confirmed.success) {
    console.error("Admin V2 Showreel save returned invalid versions.", {
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
    action: `showreel_v2_${section}_save`,
    tableName:
      section === "hero"
        ? "page_heroes"
        : section === "introduction"
          ? "media_assets"
          : "videos",
    recordId:
      section === "hero"
        ? "video"
        : section === "introduction"
          ? "showreel-studio-settings"
          : "all",
    metadata: {
      section,
      ...(section === "works"
        ? { itemCount: (payload as { items: unknown[] }).items.length }
        : {}),
    },
  });

  revalidatePath("/video");
  revalidatePath("/admin/v2/pages/showreel");
  revalidatePath("/admin/v2-preview/showreel");

  return result("saved", "Section saved and published.", {
    section,
    canonicalSection: payload,
    versions: confirmed.data.versions,
    savedAt: new Date().toISOString(),
  });
}
