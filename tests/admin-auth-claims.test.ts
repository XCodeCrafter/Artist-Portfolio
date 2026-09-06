import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  createClient: vi.fn<() => Promise<unknown>>(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: authMocks.createClient,
}));

vi.mock("@/lib/supabase/env", () => ({
  hasSupabaseBrowserEnv: vi.fn(() => true),
}));

vi.mock("@/lib/admin/service", () => ({
  createAdminServiceClient: vi.fn(() => null),
  hasAdminServiceEnv: vi.fn(() => false),
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
});
