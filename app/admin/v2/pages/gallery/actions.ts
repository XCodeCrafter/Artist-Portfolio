"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { verifyAdminActionOrigin } from "@/lib/admin/action-security";
import { requireAdmin } from "@/lib/admin/auth";
import { writeAuditLog } from "@/lib/admin/audit";
import {
  isGalleryEditorWriteConflict,
  isMissingGalleryEditorSchemaError,
} from "@/lib/admin/gallery";
import {
  parseGallerySectionSubmission,
  type GalleryEditorSection,
  type GalleryEditorVersions,
  type GallerySaveState,
} from "@/lib/admin/gallery-editor";
import { createAdminServiceClient } from "@/lib/admin/service";

const formSchema = z
  .object({
    section: z.string().max(32),
    payload: z.string().max(768_000),
    versions: z.string().max(256_000),
  })
  .strict();

function result(
  status: GallerySaveState["status"],
  message: string,
  extra: Partial<GallerySaveState> = {}
): GallerySaveState {
  return { status, message, eventId: randomUUID(), ...extra };
}

function rpcName(section: GalleryEditorSection) {
  return `save_gallery_${section}_v2`;
}

function auditTarget(section: GalleryEditorSection) {
  if (section === "hero") {
    return { tableName: "page_heroes", recordId: "gallery" };
  }
  if (section === "introduction") {
    return { tableName: "gallery_presentation", recordId: "main" };
  }
  return { tableName: "gallery_images", recordId: "all" };
}

function rpcArguments(
  section: GalleryEditorSection,
  payload: unknown,
  versions: unknown
) {
  if (section === "hero" || section === "introduction") {
    const expected = versions as
      | GalleryEditorVersions["hero"]
      | GalleryEditorVersions["introduction"];
    return {
      p_site_id: "main",
      p_expected_updated_at: expected.updatedAt,
      p_payload: payload,
    };
  }

  const expected = versions as GalleryEditorVersions["frames"];
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

export async function saveGallerySectionV2(
  _previousState: GallerySaveState,
  formData: FormData
): Promise<GallerySaveState> {
  // Authenticate before parsing so malformed requests cannot use the private
  // editor as an unauthenticated validation oracle.
  const admin = await requireAdmin();

  const parsedForm = formSchema.safeParse({
    section: formData.get("section"),
    payload: formData.get("payload"),
    versions: formData.get("versions"),
  });
  if (!parsedForm.success) {
    return result(
      "invalid",
      "This Gallery draft is incomplete. Check the active inspector and try again."
    );
  }

  let rawPayload: unknown;
  let rawVersions: unknown;
  try {
    rawPayload = JSON.parse(parsedForm.data.payload);
    rawVersions = JSON.parse(parsedForm.data.versions);
  } catch {
    return result("invalid", "The Gallery draft could not be read.");
  }

  const parsed = parseGallerySectionSubmission(
    parsedForm.data.section,
    rawPayload,
    rawVersions
  );
  if (!parsed.success) {
    return result("invalid", "Fix the highlighted fields before saving.", {
      section: parsedForm.data.section as GalleryEditorSection,
      fieldErrors: parsed.fieldErrors,
    });
  }

  const { section, payload, versions } = parsed.data;
  if (!(await verifyAdminActionOrigin(admin.id, `gallery-v2:${section}`))) {
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
    if (isGalleryEditorWriteConflict(error)) {
      return result(
        "conflict",
        "This section changed in another admin session. Your draft was kept and nothing was overwritten.",
        { section }
      );
    }
    if (isMissingGalleryEditorSchemaError(error)) {
      return result(
        "migration-required",
        "The Gallery editor needs database migration 0031 before it can save.",
        { section }
      );
    }
    if (
      error.code === "22023" ||
      error.code === "23514" ||
      /invalid_gallery_(?:hero|introduction|frames)_payload/i.test(
        error.message || ""
      )
    ) {
      return result(
        "invalid",
        "The section contains invalid or outdated content. Review the fields and try again.",
        { section }
      );
    }

    console.error("Admin V2 Gallery save failed.", {
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
  const confirmed = parseGallerySectionSubmission(
    section,
    payload,
    returnedVersions,
    { requireExactCollectionVersions: true }
  );
  if (!confirmed.success) {
    console.error("Admin V2 Gallery save returned invalid versions.", {
      section,
    });
    return result(
      "error",
      "The save response could not be confirmed. Reload before editing this section again.",
      { section }
    );
  }

  const target = auditTarget(section);
  const metadata: Record<string, unknown> = { section };
  if (section === "frames") {
    metadata.itemCount = (payload as { items: unknown[] }).items.length;
  }

  await writeAuditLog({
    actorId: admin.id,
    action: `gallery_v2_${section}_save`,
    tableName: target.tableName,
    recordId: target.recordId,
    metadata,
  });

  revalidatePath("/gallery");
  revalidatePath("/admin/v2/pages/gallery");
  revalidatePath("/admin/v2-preview/gallery");

  return result("saved", "Section saved and published.", {
    section,
    canonicalSection: payload,
    versions: confirmed.data.versions,
    savedAt: new Date().toISOString(),
  });
}
