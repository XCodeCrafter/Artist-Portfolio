"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { verifyAdminActionOrigin } from "@/lib/admin/action-security";
import { requireAdmin } from "@/lib/admin/auth";
import { writeAuditLog } from "@/lib/admin/audit";
import {
  isBioEditorWriteConflict,
  isMissingBioEditorSchemaError,
} from "@/lib/admin/bio";
import {
  parseBioSectionSubmission,
  type BioEditorSection,
  type BioEditorVersions,
  type BioSaveState,
} from "@/lib/admin/bio-editor";
import { createAdminServiceClient } from "@/lib/admin/service";

const formSchema = z
  .object({
    section: z.string().max(32),
    payload: z.string().max(512_000),
    versions: z.string().max(256_000),
  })
  .strict();

function result(
  status: BioSaveState["status"],
  message: string,
  extra: Partial<BioSaveState> = {}
): BioSaveState {
  return { status, message, eventId: randomUUID(), ...extra };
}

function rpcName(section: BioEditorSection) {
  return `save_bio_${section}_v2`;
}

function auditTarget(section: BioEditorSection) {
  if (section === "hero") {
    return { tableName: "page_heroes", recordId: "bio" };
  }
  if (section === "biography") {
    return { tableName: "bio_profile", recordId: "main" };
  }
  if (section === "resume") {
    return { tableName: "actor_resume", recordId: "main" };
  }
  return { tableName: "actor_credits", recordId: "all" };
}

function rpcArguments(
  section: BioEditorSection,
  payload: unknown,
  versions: unknown
) {
  if (section === "hero") {
    const expected = versions as BioEditorVersions["hero"];
    return {
      p_site_id: "main",
      p_expected_updated_at: expected.updatedAt,
      p_payload: payload,
    };
  }
  if (section === "biography") {
    const expected = versions as BioEditorVersions["biography"];
    return {
      p_site_id: "main",
      p_expected_profile_updated_at: expected.profileUpdatedAt,
      p_expected_gallery_versions: expected.galleryItems,
      p_expected_paragraph_versions: expected.paragraphItems,
      p_payload: payload,
    };
  }
  if (section === "resume") {
    const expected = versions as BioEditorVersions["resume"];
    return {
      p_site_id: "main",
      p_expected_updated_at: expected.updatedAt,
      p_payload: payload,
    };
  }

  const expected = versions as BioEditorVersions["credits"];
  return {
    p_site_id: "main",
    p_expected_versions: expected.items,
    p_payload: payload,
  };
}

function savedVersions(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return (value as Record<string, unknown>).versions;
}

export async function saveBioSectionV2(
  _previousState: BioSaveState,
  formData: FormData
): Promise<BioSaveState> {
  // Authentication intentionally precedes parsing: even malformed requests do
  // not get an unauthenticated validation oracle for the private editor.
  const admin = await requireAdmin();

  const parsedForm = formSchema.safeParse({
    section: formData.get("section"),
    payload: formData.get("payload"),
    versions: formData.get("versions"),
  });
  if (!parsedForm.success) {
    return result(
      "invalid",
      "This Bio draft is incomplete. Check the active inspector and try again."
    );
  }

  let rawPayload: unknown;
  let rawVersions: unknown;
  try {
    rawPayload = JSON.parse(parsedForm.data.payload);
    rawVersions = JSON.parse(parsedForm.data.versions);
  } catch {
    return result("invalid", "The Bio draft could not be read.");
  }

  const parsed = parseBioSectionSubmission(
    parsedForm.data.section,
    rawPayload,
    rawVersions
  );
  if (!parsed.success) {
    return result("invalid", "Fix the highlighted fields before saving.", {
      section: parsedForm.data.section as BioEditorSection,
      fieldErrors: parsed.fieldErrors,
    });
  }

  const { section, payload, versions } = parsed.data;
  if (!(await verifyAdminActionOrigin(admin.id, `bio-v2:${section}`))) {
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
    if (isBioEditorWriteConflict(error)) {
      return result(
        "conflict",
        "This section changed in another admin session. Your draft was kept and nothing was overwritten.",
        { section }
      );
    }
    if (isMissingBioEditorSchemaError(error)) {
      return result(
        "migration-required",
        "The Bio editor needs database migration 0030 before it can save.",
        { section }
      );
    }
    if (
      error.code === "22023" ||
      error.code === "23514" ||
      /invalid_bio_(?:hero|biography|resume|credits)_payload/i.test(
        error.message || ""
      )
    ) {
      return result(
        "invalid",
        "The section contains invalid or outdated content. Review the fields and try again.",
        { section }
      );
    }

    console.error("Admin V2 Bio save failed.", {
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
  const confirmed = parseBioSectionSubmission(
    section,
    payload,
    returnedVersions,
    { requireExactCollectionVersions: true }
  );
  if (!confirmed.success) {
    console.error("Admin V2 Bio save returned invalid versions.", { section });
    return result(
      "error",
      "The save response could not be confirmed. Reload before editing this section again.",
      { section }
    );
  }

  const target = auditTarget(section);
  const metadata: Record<string, unknown> = { section };
  if (section === "biography") {
    const biography = payload as {
      galleryImages: unknown[];
      paragraphs: unknown[];
    };
    metadata.galleryImageCount = biography.galleryImages.length;
    metadata.paragraphCount = biography.paragraphs.length;
  } else if (section === "credits") {
    metadata.itemCount = (payload as { items: unknown[] }).items.length;
  }

  await writeAuditLog({
    actorId: admin.id,
    action: `bio_v2_${section}_save`,
    tableName: target.tableName,
    recordId: target.recordId,
    metadata,
  });

  revalidatePath("/bio");
  revalidatePath("/admin/v2/pages/bio");

  return result("saved", "Section saved and published.", {
    section,
    canonicalSection: payload,
    versions: confirmed.data.versions,
    savedAt: new Date().toISOString(),
  });
}
