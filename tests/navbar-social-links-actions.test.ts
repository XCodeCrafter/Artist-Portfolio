import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveNavbarSocialLinksV2 } from "@/app/admin/v2/navigation/social-actions";
import { INITIAL_NAVBAR_SOCIAL_LINKS_SAVE_STATE } from "@/lib/admin/navbar-social-links-editor";

const actionMocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(async () => ({
    id: "admin-id",
    email: "admin@example.com",
  })),
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

const UPDATED_AT = "2026-09-03T10:00:00.000Z";
const item = {
  id: "spotify",
  label: "Spotify",
  platform: "spotify",
  href: "https://open.spotify.com/artist/1234567890",
  iconKey: "spotify",
  isPublished: true,
};

function validForm() {
  const form = new FormData();
  form.set("items", JSON.stringify([item]));
  form.set("expectedVersions", JSON.stringify({ spotify: UPDATED_AT }));
  return form;
}

beforeEach(() => {
  vi.clearAllMocks();
  actionMocks.requireAdmin.mockResolvedValue({
    id: "admin-id",
    email: "admin@example.com",
  });
  actionMocks.verifyOrigin.mockResolvedValue(true);
});

describe("Admin V2 navbar platform shortcut action", () => {
  it("authenticates before creating a service-role client", async () => {
    actionMocks.requireAdmin.mockRejectedValueOnce(new Error("unauthorized"));
    actionMocks.createAdminServiceClient.mockReturnValue({ rpc: vi.fn() });

    await expect(
      saveNavbarSocialLinksV2(
        INITIAL_NAVBAR_SOCIAL_LINKS_SAVE_STATE,
        validForm()
      )
    ).rejects.toThrow("unauthorized");
    expect(actionMocks.createAdminServiceClient).not.toHaveBeenCalled();
  });

  it("saves, audits, and revalidates the shared public navbar", async () => {
    const rpc = vi.fn(async () => ({
      data: {
        items: [{ ...item, updatedAt: UPDATED_AT }],
        expectedVersions: { spotify: UPDATED_AT },
      },
      error: null,
    }));
    actionMocks.createAdminServiceClient.mockReturnValue({ rpc });

    const state = await saveNavbarSocialLinksV2(
      INITIAL_NAVBAR_SOCIAL_LINKS_SAVE_STATE,
      validForm()
    );

    expect(state).toMatchObject({
      status: "saved",
      items: [item],
      expectedVersions: { spotify: UPDATED_AT },
    });
    expect(rpc).toHaveBeenCalledWith("save_navbar_social_links_v2", {
      p_site_id: "main",
      p_expected_versions: { spotify: UPDATED_AT },
      p_items: [item],
    });
    expect(actionMocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "navbar_social_links_v2_save",
        tableName: "social_links",
      })
    );
    expect(actionMocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
    expect(actionMocks.revalidatePath).toHaveBeenCalledWith(
      "/admin/v2/navigation"
    );
  });

  it("keeps the draft when optimistic versions conflict", async () => {
    actionMocks.createAdminServiceClient.mockReturnValue({
      rpc: vi.fn(async () => ({
        data: null,
        error: { code: "40001", message: "navbar_social_links_changed" },
      })),
    });

    await expect(
      saveNavbarSocialLinksV2(
        INITIAL_NAVBAR_SOCIAL_LINKS_SAVE_STATE,
        validForm()
      )
    ).resolves.toMatchObject({ status: "conflict" });
  });

  it("reports the forward migration when the save RPC is absent", async () => {
    actionMocks.createAdminServiceClient.mockReturnValue({
      rpc: vi.fn(async () => ({
        data: null,
        error: {
          code: "PGRST202",
          message:
            "Could not find the function public.save_navbar_social_links_v2 in the schema cache",
        },
      })),
    });

    await expect(
      saveNavbarSocialLinksV2(
        INITIAL_NAVBAR_SOCIAL_LINKS_SAVE_STATE,
        validForm()
      )
    ).resolves.toMatchObject({ status: "migration-required" });
  });
});
