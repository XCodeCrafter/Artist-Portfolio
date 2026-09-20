import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  createClient: vi.fn<() => Promise<unknown>>(),
  createAdminServiceClient: vi.fn<() => unknown>(),
  hasAdminServiceEnv: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: authMocks.createClient,
}));

vi.mock("@/lib/supabase/env", () => ({
  hasSupabaseBrowserEnv: vi.fn(() => true),
}));

vi.mock("@/lib/admin/service", () => ({
  createAdminServiceClient: authMocks.createAdminServiceClient,
  hasAdminServiceEnv: authMocks.hasAdminServiceEnv,
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((destination: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { destination });
  }),
}));

const USER_ID = "11111111-1111-4111-8111-111111111111";

function authClient(options: {
  aal?: "aal1" | "aal2";
  claimsError?: unknown;
  subject?: string;
  sessionId?: string | null;
}) {
  const getUser = vi.fn(async () => ({
    data: {
      user: {
        id: USER_ID,
        email: "owner@example.com",
      },
    },
    error: null,
  }));
  const getClaims = vi.fn(async () => ({
    data: options.claimsError
      ? null
      : {
          claims: {
            aal: options.aal || "aal2",
            sub: options.subject || USER_ID,
            session_id: options.sessionId === undefined
              ? "33333333-3333-4333-8333-333333333333"
              : options.sessionId,
          },
        },
    error: options.claimsError || null,
  }));

  return { auth: { getClaims, getUser }, getClaims, getUser };
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("ADMIN_EMAILS", "owner@example.com");
  authMocks.createAdminServiceClient.mockReturnValue(null);
  authMocks.hasAdminServiceEnv.mockReturnValue(false);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("verified admin assurance claims", () => {
  it("accepts an approved admin only when verified claims match at AAL2", async () => {
    const client = authClient({ aal: "aal2" });
    authMocks.createClient.mockResolvedValue(client);
    const { getCurrentAdmin } = await import("@/lib/admin/auth");

    await expect(getCurrentAdmin()).resolves.toMatchObject({
      id: USER_ID,
      email: "owner@example.com",
    });
    expect(client.getUser).toHaveBeenCalledOnce();
    expect(client.getClaims).toHaveBeenCalledOnce();
  });

  it("rejects a password-only AAL1 session", async () => {
    const client = authClient({ aal: "aal1" });
    authMocks.createClient.mockResolvedValue(client);
    const { getCurrentAdmin } = await import("@/lib/admin/auth");

    await expect(getCurrentAdmin()).resolves.toBeNull();
  });

  it("rejects claims issued for a different subject", async () => {
    const client = authClient({
      subject: "22222222-2222-4222-8222-222222222222",
    });
    authMocks.createClient.mockResolvedValue(client);
    const { getCurrentAdmin } = await import("@/lib/admin/auth");

    await expect(getCurrentAdmin()).resolves.toBeNull();
  });

  it("fails closed when claims cannot be verified", async () => {
    const client = authClient({ claimsError: new Error("auth unavailable") });
    authMocks.createClient.mockResolvedValue(client);
    const { getCurrentAdmin } = await import("@/lib/admin/auth");

    await expect(getCurrentAdmin()).resolves.toBeNull();
  });

  it("rejects even an MFA candidate without a verifiable session identity", async () => {
    const client = authClient({ sessionId: null });
    authMocks.createClient.mockResolvedValue(client);
    const { getCurrentAdminCandidate } = await import("@/lib/admin/auth");
    await expect(getCurrentAdminCandidate()).resolves.toBeNull();
  });

  it("denies admin and MFA candidate access after the session was revoked", async () => {
    authMocks.createClient.mockResolvedValue(authClient({ aal: "aal2" }));
    authMocks.hasAdminServiceEnv.mockReturnValue(true);
    const rpc = vi.fn(async () => ({ data: false, error: null }));
    const from = vi.fn();
    authMocks.createAdminServiceClient.mockReturnValue({ rpc, from });
    const { getCurrentAdmin, getCurrentAdminCandidate } = await import("@/lib/admin/auth");
    await expect(getCurrentAdmin()).resolves.toBeNull();
    await expect(getCurrentAdminCandidate()).resolves.toBeNull();
    expect(rpc).toHaveBeenCalledWith("is_admin_session_active", {
      p_user_id: USER_ID, p_session_id: "33333333-3333-4333-8333-333333333333",
    });
    expect(from).not.toHaveBeenCalled();
  });
});
