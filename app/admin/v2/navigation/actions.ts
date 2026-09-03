"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { verifyAdminActionOrigin } from "@/lib/admin/action-security";
import { requireAdmin } from "@/lib/admin/auth";
import { writeAuditLog } from "@/lib/admin/audit";
import {
  isMissingNavigationManagerSchemaError,
  isNavigationWriteConflict,
} from "@/lib/admin/navigation";
import {
  parseNavigationExpectedVersions,
  parseNavigationSaveItems,
  type NavigationSaveState,
} from "@/lib/admin/navigation-editor";
import { createAdminServiceClient } from "@/lib/admin/service";
import { NAVIGATION_DESTINATION_KEYS } from "@/lib/content/navigation";

const navigationFormSchema = z.object({
  expectedConfigVersion: z.coerce.number().int().min(0).max(1),
  expectedVersions: z.string().max(64_000),
  items: z.string().max(128_000),
});

function result(
  status: NavigationSaveState["status"],
  message: string,
  extra: Partial<NavigationSaveState> = {}
): NavigationSaveState {
  return { status, message, eventId: randomUUID(), ...extra };
}

function parseRpcResult(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const expectedVersions = parseNavigationExpectedVersions(
    candidate.expectedVersions
  );
  if (candidate.configVersion !== 1 || !expectedVersions) return null;
  return { configVersion: 1 as const, expectedVersions };
}

export async function saveNavigationV2(
  _previousState: NavigationSaveState,
  formData: FormData
): Promise<NavigationSaveState> {
  const parsedForm = navigationFormSchema.safeParse({
    expectedConfigVersion: formData.get("expectedConfigVersion"),
    expectedVersions: formData.get("expectedVersions"),
    items: formData.get("items"),
  });
  if (!parsedForm.success) {
    return result(
      "invalid",
      "The navbar draft is incomplete. Reload the editor and try again."
    );
  }

  let rawExpectedVersions: unknown;
  let rawItems: unknown;
  try {
    rawExpectedVersions = JSON.parse(parsedForm.data.expectedVersions);
    rawItems = JSON.parse(parsedForm.data.items);
  } catch {
    return result("invalid", "The navbar draft could not be read.");
  }

  const expectedVersions = parseNavigationExpectedVersions(
    rawExpectedVersions
  );
  if (!expectedVersions) {
    return result(
      "invalid",
      "The saved navbar versions are invalid. Reload before saving."
    );
  }

  const items = parseNavigationSaveItems(rawItems, expectedVersions);
  if (!items) {
    return result(
      "invalid",
      "Keep at least one valid destination visible and do not remove rows from the draft."
    );
  }

  const admin = await requireAdmin();
  if (
    !(await verifyAdminActionOrigin(admin.id, "navigation-v2:main"))
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
      "Supabase admin access is not configured, so the navbar was not saved."
    );
  }

  const { data, error } = await supabase.rpc("save_site_navigation_v2", {
    p_site_id: "main",
    p_expected_config_version: parsedForm.data.expectedConfigVersion,
    p_expected_versions: expectedVersions,
    p_items: items,
  });

  if (error) {
    if (isNavigationWriteConflict(error)) {
      return result(
        "conflict",
        "The saved navbar changed in another admin session. Your draft was not overwritten."
      );
    }
    if (isMissingNavigationManagerSchemaError(error)) {
      return result(
        "migration-required",
        "Admin V2 navigation needs database migration 0027 before it can save."
      );
    }
    if (
      error.code === "22023" ||
      error.code === "23514" ||
      /invalid_site_navigation_payload|site_navigation_empty/i.test(
        error.message || ""
      )
    ) {
      return result(
        "invalid",
        "The navbar draft is invalid. Keep at least one known destination visible."
      );
    }

    console.error("Admin V2 navigation save failed.", {
      code: error.code,
      message: error.message,
    });
    return result(
      "error",
      "The navbar could not be saved. Nothing was overwritten."
    );
  }

  const savedSnapshot = parseRpcResult(data);
  if (!savedSnapshot) {
    console.error("Admin V2 navigation save returned an invalid snapshot.");
    return result(
      "error",
      "The save response could not be confirmed. Reload to verify the saved navbar."
    );
  }

  const knownKeySet = new Set<string>(NAVIGATION_DESTINATION_KEYS);
  await writeAuditLog({
    actorId: admin.id,
    action: "navigation_v2_save",
    tableName: "site_navigation_items",
    recordId: "main",
    metadata: {
      orderedKeys: items.map((item) => item.destinationKey),
      visibleKnownKeys: items
        .filter(
          (item) => item.isVisible && knownKeySet.has(item.destinationKey)
        )
        .map((item) => item.destinationKey),
    },
  });

  revalidatePath("/", "layout");
  revalidatePath("/admin/v2");
  revalidatePath("/admin/v2/navigation");

  return result("saved", "Navbar saved and published.", savedSnapshot);
}
