import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  resetAdminMfa,
  saveAdminProfile,
} from "@/app/admin/security/actions";

const actionMocks = vi.hoisted(() => ({
  requireAdmin: vi.fn<
    () => Promise<{
      id: string;
      email: string;
      role: "admin" | "owner";
    }>
  >(async () => ({
    id: "11111111-1111-4111-8111-111111111111",
    email: "owner@example.com",
    role: "owner",
  })),
  verifyOrigin: vi.fn(async () => true),
  writeAuditLog: vi.fn<
    (input: unknown) => Promise<{
      ok: boolean;
      reason?: string;
      errorCode?: string;
    }>
  >(async () => ({ ok: true })),
  createAdminServiceClient: vi.fn<() => unknown>(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
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
}));

vi.mock("next/cache", () => ({
  revalidatePath: actionMocks.revalidatePath,
}));

vi.mock("next/navigation", () => ({
  redirect: (destination: string) => {
    actionMocks.redirect(destination);
    throw Object.assign(new Error("NEXT_REDIRECT"), { destination });
  },
}));

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const TARGET_ID = "22222222-2222-4222-8222-222222222222";

function profileForm(
  overrides: Partial<{
    securitySurface: string;
    userId: string;
    email: string;
    role: string;
    isActive: boolean;
  }> = {}
) {
  const values = {
    securitySurface: "classic",
    userId: TARGET_ID,
    email: "admin@example.com",
    role: "admin",
    isActive: true,
    ...overrides,
  };
  const formData = new FormData();
  formData.set("securitySurface", values.securitySurface);
  formData.set("userId", values.userId);
  formData.set("email", values.email);
  formData.set("role", values.role);
  if (values.isActive) formData.set("isActive", "on");
  return formData;
}

function userForm(
  overrides: Partial<{ securitySurface: string; userId: string }> = {}
) {
  const values = {
    securitySurface: "classic",
    userId: TARGET_ID,
    ...overrides,
  };
  const formData = new FormData();
  formData.set("securitySurface", values.securitySurface);
  formData.set("userId", values.userId);
  return formData;
}

async function expectRedirect(
  action: Promise<unknown>,
  destination: string
) {
  await expect(action).rejects.toMatchObject({ destination });
  expect(actionMocks.redirect).toHaveBeenLastCalledWith(destination);
}

function createProfileSaveClient(authEmail = "admin@example.com") {
  const upsert = vi.fn(async () => ({ error: null }));
  const from = vi.fn(() => ({ upsert }));
  const getUserById = vi.fn(async () => ({
    data: { user: { email: authEmail } },
    error: null,
  }));

  return {
    client: {
      auth: { admin: { getUserById } },
      from,
    },
    from,
    getUserById,
    upsert,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  actionMocks.requireAdmin.mockResolvedValue({
    id: OWNER_ID,
    email: "owner@example.com",
    role: "owner",
  });
  actionMocks.verifyOrigin.mockResolvedValue(true);
  actionMocks.writeAuditLog.mockResolvedValue({ ok: true });
});

describe("Admin Security actions", () => {
  it("falls back to the classic route for a forged surface value", async () => {
    await expectRedirect(
      saveAdminProfile(
        profileForm({
          securitySurface: "https://evil.example/steal",
          userId: "not-a-uuid",
        })
      ),
      "/admin/security?status=invalid#access"
    );

    expect(actionMocks.requireAdmin).not.toHaveBeenCalled();
    expect(actionMocks.createAdminServiceClient).not.toHaveBeenCalled();
    expect(actionMocks.redirect).not.toHaveBeenCalledWith(
      expect.stringContaining("evil.example")
    );
  });

  it("keeps invalid V2 input inside the V2 Security page", async () => {
    await expectRedirect(
      saveAdminProfile(
        profileForm({ securitySurface: "v2", email: "not-an-email" })
      ),
      "/admin/v2/security?status=invalid#access"
    );

    expect(actionMocks.requireAdmin).not.toHaveBeenCalled();
    expect(actionMocks.createAdminServiceClient).not.toHaveBeenCalled();
  });

  it("blocks a bad request origin before creating a service-role client", async () => {
    actionMocks.verifyOrigin.mockResolvedValue(false);

    await expectRedirect(
      saveAdminProfile(profileForm({ securitySurface: "v2" })),
      "/admin/v2/security?status=security-error#access"
    );

    expect(actionMocks.verifyOrigin).toHaveBeenCalledWith(
      OWNER_ID,
      "security:admin-profiles"
    );
    expect(actionMocks.createAdminServiceClient).not.toHaveBeenCalled();
  });

  it("rejects a non-owner before creating a service-role client", async () => {
    actionMocks.requireAdmin.mockResolvedValue({
      id: OWNER_ID,
      email: "admin@example.com",
      role: "admin",
    });

    await expectRedirect(
      saveAdminProfile(profileForm()),
      "/admin/security?status=owner-required#access"
    );

    expect(actionMocks.verifyOrigin).toHaveBeenCalled();
    expect(actionMocks.createAdminServiceClient).not.toHaveBeenCalled();
  });

  it("prevents an owner from demoting their own active profile", async () => {
    const service = createProfileSaveClient("owner@example.com");
    actionMocks.createAdminServiceClient.mockReturnValue(service.client);

    await expectRedirect(
      saveAdminProfile(
        profileForm({
          securitySurface: "v2",
          userId: OWNER_ID,
          email: "owner@example.com",
          role: "admin",
        })
      ),
      "/admin/v2/security?status=self-protected#access"
    );

    expect(service.getUserById).toHaveBeenCalledWith(OWNER_ID);
    expect(service.from).not.toHaveBeenCalled();
  });

  it("rejects a profile email that does not match the Auth user", async () => {
    const service = createProfileSaveClient("different@example.com");
    actionMocks.createAdminServiceClient.mockReturnValue(service.client);

    await expectRedirect(
      saveAdminProfile(profileForm({ securitySurface: "v2" })),
      "/admin/v2/security?status=auth-user-mismatch#access"
    );

    expect(service.upsert).not.toHaveBeenCalled();
    expect(actionMocks.writeAuditLog).not.toHaveBeenCalled();
  });

  it("revalidates classic and V2 views after a successful V2 save", async () => {
    const service = createProfileSaveClient();
    actionMocks.createAdminServiceClient.mockReturnValue(service.client);

    await expectRedirect(
      saveAdminProfile(profileForm({ securitySurface: "v2" })),
      "/admin/v2/security?status=saved#access"
    );

    expect(service.upsert).toHaveBeenCalledWith({
      user_id: TARGET_ID,
      email: "admin@example.com",
      role: "admin",
      is_active: true,
    });
    expect(actionMocks.writeAuditLog).toHaveBeenCalledWith({
      actorId: OWNER_ID,
      action: "admin_profile_save",
      tableName: "admin_profiles",
      recordId: TARGET_ID,
      metadata: {
        email: "admin@example.com",
        role: "admin",
        isActive: true,
      },
    });
    for (const path of [
      "/admin/security",
      "/admin/v2/security",
      "/admin",
      "/admin/v2",
    ]) {
      expect(actionMocks.revalidatePath).toHaveBeenCalledWith(path);
    }
  });

  it("reports an MFA audit warning after the reset itself succeeds", async () => {
    const maybeSingle = vi.fn(async () => ({
      data: { user_id: TARGET_ID },
      error: null,
    }));
    const limit = vi.fn(() => ({ maybeSingle }));
    const eq = vi.fn(() => ({ limit }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    const listFactors = vi.fn(async () => ({
      data: { factors: [{ id: "factor-one" }, { id: "factor-two" }] },
      error: null,
    }));
    const deleteFactor = vi.fn(async () => ({ error: null }));
    const rpc = vi.fn(async () => ({ error: null }));
    actionMocks.createAdminServiceClient.mockReturnValue({
      from,
      rpc,
      auth: { admin: { mfa: { listFactors, deleteFactor } } },
    });
    actionMocks.writeAuditLog.mockResolvedValue({
      ok: false,
      reason: "insert-failed",
      errorCode: "XX000",
    });

    await expectRedirect(
      resetAdminMfa(userForm({ securitySurface: "v2" })),
      "/admin/v2/security?status=mfa-reset-audit-warning#access"
    );

    expect(rpc).toHaveBeenCalledWith("revoke_admin_user_sessions", {
      target_user_id: TARGET_ID,
    });
    expect(deleteFactor).toHaveBeenCalledTimes(2);
    expect(deleteFactor).toHaveBeenNthCalledWith(1, {
      id: "factor-one",
      userId: TARGET_ID,
    });
    expect(actionMocks.writeAuditLog).toHaveBeenLastCalledWith({
      actorId: OWNER_ID,
      action: "admin_mfa_reset",
      tableName: "auth",
      recordId: TARGET_ID,
      metadata: { factorCount: 2 },
    });
    expect(actionMocks.revalidatePath).toHaveBeenCalledWith(
      "/admin/v2/security"
    );
  });
});
