"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { verifyAdminActionOrigin } from "@/lib/admin/action-security";
import { requireAdmin } from "@/lib/admin/auth";
import { writeAuditLog } from "@/lib/admin/audit";
import {
  isMissingMusicEditorSchemaError,
  isMusicEditorWriteConflict,
} from "@/lib/admin/music";
import {
  parseMusicSectionSubmission,
  type MusicEditorSection,
  type MusicEditorVersions,
  type MusicSaveState,
} from "@/lib/admin/music-editor";
import { createAdminServiceClient } from "@/lib/admin/service";

const formSchema = z.object({
  section: z.string().max(32),
  payload: z.string().max(256_000),
  versions: z.string().max(128_000),
});

function result(
  status: MusicSaveState["status"],
  message: string,
  extra: Partial<MusicSaveState> = {}
): MusicSaveState {
  return { status, message, eventId: randomUUID(), ...extra };
}

function rpcName(section: MusicEditorSection) {
  return `save_music_${section}_v2`;
}

function auditTarget(section: MusicEditorSection) {
  if (section === "hero") {
    return { tableName: "page_heroes", recordId: "music" };
  }
  if (section === "spotify") {
    return { tableName: "site_settings", recordId: "main" };
  }
  if (section === "platforms") {
    return { tableName: "music_platform_links", recordId: "all" };
  }
  return { tableName: "soundcloud_tracks", recordId: "all" };
}

function rpcArguments(
  section: MusicEditorSection,
  payload: unknown,
  versions: unknown
) {
  if (section === "hero") {
    const expected = versions as MusicEditorVersions["hero"];
    return {
      p_site_id: "main",
      p_expected_updated_at: expected.updatedAt,
      p_payload: payload,
    };
  }
  if (section === "spotify") {
    const expected = versions as MusicEditorVersions["spotify"];
    return {
      p_site_id: "main",
      p_expected_settings_updated_at: expected.settingsUpdatedAt,
      p_expected_presentation_updated_at: expected.presentationUpdatedAt,
      p_payload: payload,
    };
  }
  if (section === "platforms") {
    const expected = versions as MusicEditorVersions["platforms"];
    return {
      p_site_id: "main",
      p_expected_versions: expected.items,
      p_payload: payload,
    };
  }

  const expected = versions as MusicEditorVersions["soundcloud"];
  return {
    p_site_id: "main",
    p_expected_presentation_updated_at: expected.presentationUpdatedAt,
    p_expected_versions: expected.items,
    p_payload: payload,
  };
}

function savedVersions(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  return candidate.versions;
}

export async function saveMusicSectionV2(
  _previousState: MusicSaveState,
  formData: FormData
): Promise<MusicSaveState> {
  const parsedForm = formSchema.safeParse({
    section: formData.get("section"),
    payload: formData.get("payload"),
    versions: formData.get("versions"),
  });
  if (!parsedForm.success) {
    return result(
      "invalid",
      "This Music draft is incomplete. Check the active inspector and try again."
    );
  }

  let rawPayload: unknown;
  let rawVersions: unknown;
  try {
    rawPayload = JSON.parse(parsedForm.data.payload);
    rawVersions = JSON.parse(parsedForm.data.versions);
  } catch {
    return result("invalid", "The Music draft could not be read.");
  }

  const parsed = parseMusicSectionSubmission(
    parsedForm.data.section,
    rawPayload,
    rawVersions
  );
  if (!parsed.success) {
    return result("invalid", "Fix the highlighted fields before saving.", {
      section: parsedForm.data.section as MusicEditorSection,
      fieldErrors: parsed.fieldErrors,
    });
  }

  const { section, payload, versions } = parsed.data;
  const admin = await requireAdmin();
  if (!(await verifyAdminActionOrigin(admin.id, `music-v2:${section}`))) {
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
    if (isMusicEditorWriteConflict(error)) {
      return result(
        "conflict",
        "This section changed in another admin session. Your draft was kept and nothing was overwritten.",
        { section }
      );
    }
    if (isMissingMusicEditorSchemaError(error)) {
      return result(
        "migration-required",
        "The Music editor needs database migrations through 0029 before it can save.",
        { section }
      );
    }
    if (
      error.code === "22023" ||
      error.code === "23514" ||
      /invalid_music_(?:hero|spotify|platforms|soundcloud)_payload/i.test(
        error.message || ""
      )
    ) {
      return result(
        "invalid",
        "The section contains invalid or outdated content. Review the fields and try again.",
        { section }
      );
    }

    console.error("Admin V2 Music save failed.", {
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
  const confirmed = parseMusicSectionSubmission(
    section,
    payload,
    returnedVersions,
    { requireExactCollectionVersions: true }
  );
  if (!confirmed.success) {
    console.error("Admin V2 Music save returned invalid versions.", { section });
    return result(
      "error",
      "The save response could not be confirmed. Reload before editing this section again.",
      { section }
    );
  }

  const target = auditTarget(section);
  const itemCount =
    payload &&
    typeof payload === "object" &&
    "items" in payload &&
    Array.isArray((payload as { items?: unknown }).items)
      ? (payload as { items: unknown[] }).items.length
      : undefined;
  await writeAuditLog({
    actorId: admin.id,
    action: `music_v2_${section}_save`,
    tableName: target.tableName,
    recordId: target.recordId,
    metadata: {
      section,
      ...(typeof itemCount === "number" ? { itemCount } : {}),
    },
  });

  revalidatePath("/music");
  revalidatePath("/admin/v2/pages/music");

  return result("saved", "Section saved and published.", {
    section,
    canonicalSection: payload,
    versions: confirmed.data.versions,
    savedAt: new Date().toISOString(),
  });
}
