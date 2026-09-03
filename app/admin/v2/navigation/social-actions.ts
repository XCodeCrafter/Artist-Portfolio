"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { verifyAdminActionOrigin } from "@/lib/admin/action-security";
import { requireAdmin } from "@/lib/admin/auth";
import { writeAuditLog } from "@/lib/admin/audit";
import {
  isMissingNavbarSocialLinksSchemaError,
  isNavbarSocialLinksWriteConflict,
} from "@/lib/admin/navbar-social-links";
import {
  parseNavbarSocialLinksSaveResult,
  parseNavbarSocialLinksSubmission,
  type NavbarSocialLinksSaveState,
} from "@/lib/admin/navbar-social-links-editor";
import { createAdminServiceClient } from "@/lib/admin/service";

const formSchema = z.object({
  items: z.string().max(128_000),
  expectedVersions: z.string().max(64_000),
});

function result(
  status: NavbarSocialLinksSaveState["status"],
  message: string,
  extra: Partial<NavbarSocialLinksSaveState> = {}
): NavbarSocialLinksSaveState {
  return { status, message, eventId: randomUUID(), ...extra };
}

export async function saveNavbarSocialLinksV2(
  _previousState: NavbarSocialLinksSaveState,
  formData: FormData
): Promise<NavbarSocialLinksSaveState> {
  const parsedForm = formSchema.safeParse({
    items: formData.get("items"),
    expectedVersions: formData.get("expectedVersions"),
  });
  if (!parsedForm.success) {
    return result("invalid", "The shortcut draft could not be read.");
  }

  let rawItems: unknown;
  let rawVersions: unknown;
  try {
    rawItems = JSON.parse(parsedForm.data.items);
    rawVersions = JSON.parse(parsedForm.data.expectedVersions);
  } catch {
    return result("invalid", "The shortcut draft contains invalid data.");
  }

  const parsed = parseNavbarSocialLinksSubmission(rawItems, rawVersions);
  if (!parsed.success) {
    return result(
      "invalid",
      "Fix the highlighted shortcut fields before saving.",
      { fieldErrors: parsed.fieldErrors }
    );
  }

  const admin = await requireAdmin();
  if (
    !(await verifyAdminActionOrigin(admin.id, "navbar-social-links-v2:main"))
  ) {
    return result(
      "security-error",
      "The request origin was blocked. Refresh Admin V2 and try again."
    );
  }

  const supabase = createAdminServiceClient();
  if (!supabase) {
    return result(
      "missing-service",
      "Supabase admin access is not configured, so nothing was saved."
    );
  }

  const { data, error } = await supabase.rpc(
    "save_navbar_social_links_v2",
    {
      p_site_id: "main",
      p_expected_versions: parsed.data.expectedVersions,
      p_items: parsed.data.items,
    }
  );

  if (error) {
    if (isNavbarSocialLinksWriteConflict(error)) {
      return result(
        "conflict",
        "Platform shortcuts changed in another admin session. Your draft was kept and nothing was overwritten."
      );
    }
    if (isMissingNavbarSocialLinksSchemaError(error)) {
      return result(
        "migration-required",
        "Platform shortcut saving needs database migration 0029."
      );
    }
    if (
      error.code === "22023" ||
      error.code === "23514" ||
      /invalid_navbar_social_links_payload/i.test(error.message || "")
    ) {
      return result(
        "invalid",
        "One or more shortcuts contain an invalid URL or label."
      );
    }

    console.error("Admin V2 platform shortcut save failed.", {
      code: error.code,
      message: error.message,
    });
    return result(
      "error",
      "Platform shortcuts could not be saved. Nothing was intentionally overwritten."
    );
  }

  const saved = parseNavbarSocialLinksSaveResult(data);
  if (!saved) {
    console.error("Admin V2 platform shortcut save returned invalid data.");
    return result(
      "error",
      "The save response could not be confirmed. Reload before editing again."
    );
  }

  await writeAuditLog({
    actorId: admin.id,
    action: "navbar_social_links_v2_save",
    tableName: "social_links",
    recordId: "all",
    metadata: {
      orderedIds: saved.items.map((item) => item.id),
      visibleIds: saved.items
        .filter((item) => item.isPublished)
        .map((item) => item.id),
    },
  });

  revalidatePath("/", "layout");
  revalidatePath("/admin/v2/navigation");

  return result("saved", "Platform shortcuts saved and published.", {
    ...saved,
    savedAt: new Date().toISOString(),
  });
}
