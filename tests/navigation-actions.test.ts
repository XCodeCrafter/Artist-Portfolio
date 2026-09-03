import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveNavigationV2 } from "@/app/admin/v2/navigation/actions";
import { INITIAL_NAVIGATION_SAVE_STATE } from "@/lib/admin/navigation-editor";
import { getAdminNavigationData } from "@/lib/admin/navigation";
import { NAVIGATION_DESTINATION_KEYS } from "@/lib/content/navigation";

const actionMocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(async () => ({ id: "admin-id", email: "admin@example.com" })),
  verifyOrigin: vi.fn(async () => true),
  writeAuditLog: vi.fn(async () => ({ ok: true as const })),
  createAdminServiceClient: vi.fn<() => unknown>(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/admin/auth", () => ({
  requireAdmin: actionMocks.requireAdmin,
}));

vi.mock("@/lib/admin/action-security", () => ({
  verifyAdminActionOrigin: actionMocks.verifyOrigin,
}));

vi.mock("@/lib/admin/audit", () => ({
  writeAuditLog: actionMocks.writeAuditLog,
}));

vi.mock("@/lib/admin/service", () => ({
  createAdminServiceClient: actionMocks.createAdminServiceClient,
  hasAdminServiceEnv: vi.fn(() => true),
}));

vi.mock("next/cache", () => ({
  revalidatePath: actionMocks.revalidatePath,
}));

const versions = Object.fromEntries(
  NAVIGATION_DESTINATION_KEYS.map((key, index) => [
    key,
    `2026-09-02T10:00:${String(index).padStart(2, "0")}.000Z`,
  ])
);
const items = NAVIGATION_DESTINATION_KEYS.map((destinationKey) => ({
  destinationKey,
  isVisible: destinationKey === "home" || destinationKey === "music",
}));

function validForm(overrides: Record<string, string> = {}) {
  const formData = new FormData();
  formData.set("expectedConfigVersion", overrides.expectedConfigVersion ?? "1");
  formData.set(
    "expectedVersions",
    overrides.expectedVersions ?? JSON.stringify(versions)
  );
  formData.set("items", overrides.items ?? JSON.stringify(items));
  return formData;
}

beforeEach(() => {
  vi.clearAllMocks();
  actionMocks.verifyOrigin.mockResolvedValue(true);
  actionMocks.requireAdmin.mockResolvedValue({
    id: "admin-id",
    email: "admin@example.com",
  });
});

describe("Admin V2 navigation action", () => {
  it("checks admin access before creating a service-role read client", async () => {
    actionMocks.requireAdmin.mockRejectedValueOnce(new Error("unauthorized"));
    actionMocks.createAdminServiceClient.mockReturnValue({
      rpc: vi.fn(),
    });

    await expect(getAdminNavigationData()).rejects.toThrow("unauthorized");
    expect(actionMocks.createAdminServiceClient).not.toHaveBeenCalled();
  });

  it("saves the complete payload, audits it, and returns fresh row versions", async () => {
    const rpc = vi.fn(async () => ({
      data: { configVersion: 1, expectedVersions: versions },
      error: null,
    }));
    actionMocks.createAdminServiceClient.mockReturnValue({ rpc });

    const state = await saveNavigationV2(
      INITIAL_NAVIGATION_SAVE_STATE,
      validForm()
    );

    expect(state).toMatchObject({
      status: "saved",
      configVersion: 1,
      expectedVersions: versions,
    });
    expect(rpc).toHaveBeenCalledWith("save_site_navigation_v2", {
      p_site_id: "main",
      p_expected_config_version: 1,
      p_expected_versions: versions,
      p_items: items,
    });
    expect(actionMocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "admin-id",
        action: "navigation_v2_save",
        tableName: "site_navigation_items",
        recordId: "main",
      })
    );
    expect(actionMocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
    expect(actionMocks.revalidatePath).toHaveBeenCalledWith(
      "/admin/v2/navigation"
    );
  });

  it("keeps a stale draft on conflict", async () => {
    actionMocks.createAdminServiceClient.mockReturnValue({
      rpc: vi.fn(async () => ({
        data: null,
        error: { code: "40001", message: "site_navigation_changed" },
      })),
    });

    const state = await saveNavigationV2(
      INITIAL_NAVIGATION_SAVE_STATE,
      validForm()
    );

    expect(state.status).toBe("conflict");
    expect(state.message).toContain("not overwritten");
    expect(actionMocks.writeAuditLog).not.toHaveBeenCalled();
    expect(actionMocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("reports a missing RPC as a migration requirement", async () => {
    actionMocks.createAdminServiceClient.mockReturnValue({
      rpc: vi.fn(async () => ({
        data: null,
        error: {
          code: "PGRST202",
          message: "Could not find public.save_site_navigation_v2 in the schema cache",
        },
      })),
    });

    const state = await saveNavigationV2(
      INITIAL_NAVIGATION_SAVE_STATE,
      validForm()
    );
    expect(state.status).toBe("migration-required");
  });

  it("does not disguise an internal undefined SQL function as a missing migration", async () => {
    actionMocks.createAdminServiceClient.mockReturnValue({
      rpc: vi.fn(async () => ({
        data: null,
        error: {
          code: "42883",
          message:
            "function pg_catalog.some_missing_internal_function(jsonb) does not exist",
        },
      })),
    });

    const state = await saveNavigationV2(
      INITIAL_NAVIGATION_SAVE_STATE,
      validForm()
    );
    expect(state.status).toBe("error");
  });

  it("rejects an empty menu before authentication or database access", async () => {
    const hidden = items.map((item) => ({ ...item, isVisible: false }));
    const state = await saveNavigationV2(
      INITIAL_NAVIGATION_SAVE_STATE,
      validForm({ items: JSON.stringify(hidden) })
    );

    expect(state.status).toBe("invalid");
    expect(actionMocks.requireAdmin).not.toHaveBeenCalled();
    expect(actionMocks.createAdminServiceClient).not.toHaveBeenCalled();
  });

  it("rejects a menu containing only content-conditional destinations", async () => {
    const conditionalOnly = items.map((item) => ({
      ...item,
      isVisible:
        item.destinationKey === "home.cnc" ||
        item.destinationKey === "bio.resume",
    }));
    const state = await saveNavigationV2(
      INITIAL_NAVIGATION_SAVE_STATE,
      validForm({ items: JSON.stringify(conditionalOnly) })
    );

    expect(state.status).toBe("invalid");
    expect(actionMocks.requireAdmin).not.toHaveBeenCalled();
    expect(actionMocks.createAdminServiceClient).not.toHaveBeenCalled();
  });

  it("blocks a bad origin and never creates a write client", async () => {
    actionMocks.verifyOrigin.mockResolvedValue(false);
    const state = await saveNavigationV2(
      INITIAL_NAVIGATION_SAVE_STATE,
      validForm()
    );

    expect(state.status).toBe("security-error");
    expect(actionMocks.createAdminServiceClient).not.toHaveBeenCalled();
  });
});
