import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  hasValidAdminRecoveryChallenge,
  issueAdminRecoveryChallenge,
} from "@/lib/admin/recovery";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn<() => Promise<unknown>>(),
  createAdminServiceClient: vi.fn<() => unknown>(),
  cookieGet: vi.fn(),
  cookieSet: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/lib/admin/service", () => ({
  createAdminServiceClient: mocks.createAdminServiceClient,
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: mocks.cookieGet,
    set: mocks.cookieSet,
  })),
}));

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
const SESSION_ID = "33333333-3333-4333-8333-333333333333";

function claimsClient(
  claims: { sub?: string; session_id?: string } | null,
  error: unknown = null
) {
  const getClaims = vi.fn(async () => ({
    data: claims ? { claims } : null,
    error,
  }));
  return { auth: { getClaims }, getClaims };
}

function issueService(options: { invalidationError?: unknown } = {}) {
  const cleanup = vi.fn(async () => ({ error: null }));
  const invalidate = vi.fn(async () => ({
    error: options.invalidationError || null,
  }));
  let insertedPayload: unknown;
  const insert = vi.fn(async (value: unknown) => {
    insertedPayload = value;
    return { error: null };
  });
  let deleteCall = 0;
  const from = vi.fn(() => ({
    delete: vi.fn(() => {
      deleteCall += 1;
      return deleteCall === 1
        ? { lt: cleanup }
        : { eq: invalidate };
    }),
    insert,
  }));

  return {
    cleanup,
    from,
    getInsertedPayload: () => insertedPayload,
    insert,
    invalidate,
  };
}

function lookupService() {
  const query: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ["select", "eq", "is", "gt", "limit"]) {
    query[method] = vi.fn(() => query);
  }
  query.maybeSingle = vi.fn(async () => ({
    data: { id: "44444444-4444-4444-8444-444444444444" },
    error: null,
  }));
  const from = vi.fn(() => query);
  return { from, query };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("AUTH_SECURITY_SECRET", "s".repeat(48));
  mocks.cookieGet.mockReturnValue({ value: "recovery-cookie-token" });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("admin recovery session binding", () => {
  it("rejects a recovery token whose verified subject is a different admin", async () => {
    const auth = claimsClient({
      sub: OTHER_USER_ID,
      session_id: SESSION_ID,
    });
    const service = issueService();
    mocks.createClient.mockResolvedValue(auth);
    mocks.createAdminServiceClient.mockReturnValue(service);

    await expect(
      issueAdminRecoveryChallenge(USER_ID, "signed-access-token")
    ).resolves.toBe(false);

    expect(auth.getClaims).toHaveBeenCalledWith("signed-access-token");
    expect(service.from).not.toHaveBeenCalled();
    expect(mocks.cookieSet).not.toHaveBeenCalled();
  });

  it("fails closed when verified claims cannot be loaded", async () => {
    const getClaims = vi.fn().mockRejectedValue(new Error("auth unavailable"));
    const service = issueService();
    mocks.createClient.mockResolvedValue({ auth: { getClaims } });
    mocks.createAdminServiceClient.mockReturnValue(service);

    await expect(
      issueAdminRecoveryChallenge(USER_ID, "signed-access-token")
    ).resolves.toBe(false);

    expect(service.from).not.toHaveBeenCalled();
    expect(mocks.cookieSet).not.toHaveBeenCalled();
  });

  it("invalidates older challenges before storing a session-bound replacement", async () => {
    const auth = claimsClient({ sub: USER_ID, session_id: SESSION_ID });
    const service = issueService();
    mocks.createClient.mockResolvedValue(auth);
    mocks.createAdminServiceClient.mockReturnValue(service);

    await expect(
      issueAdminRecoveryChallenge(USER_ID, "signed-access-token")
    ).resolves.toBe(true);

    expect(service.cleanup).toHaveBeenCalledWith(
      "expires_at",
      expect.any(String)
    );
    expect(service.invalidate).toHaveBeenCalledWith("user_id", USER_ID);
    expect(service.insert).toHaveBeenCalledWith({
      user_id: USER_ID,
      token_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      session_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      expires_at: expect.any(String),
    });
    expect(JSON.stringify(service.getInsertedPayload())).not.toContain(
      SESSION_ID
    );
    expect(mocks.cookieSet).toHaveBeenCalledWith(
      "admin-recovery",
      expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      expect.objectContaining({ httpOnly: true, maxAge: 600, sameSite: "lax" })
    );
  });

  it("fails closed when older challenges cannot be invalidated", async () => {
    const auth = claimsClient({ sub: USER_ID, session_id: SESSION_ID });
    const service = issueService({ invalidationError: new Error("offline") });
    mocks.createClient.mockResolvedValue(auth);
    mocks.createAdminServiceClient.mockReturnValue(service);

    await expect(
      issueAdminRecoveryChallenge(USER_ID, "signed-access-token")
    ).resolves.toBe(false);

    expect(service.insert).not.toHaveBeenCalled();
    expect(mocks.cookieSet).not.toHaveBeenCalled();
  });

  it("looks up a challenge only with verified claims from the current session", async () => {
    const auth = claimsClient({ sub: USER_ID, session_id: SESSION_ID });
    const service = lookupService();
    mocks.createClient.mockResolvedValue(auth);
    mocks.createAdminServiceClient.mockReturnValue(service);

    await expect(hasValidAdminRecoveryChallenge(USER_ID)).resolves.toBe(true);

    expect(auth.getClaims).toHaveBeenCalledWith(undefined);
    expect(service.query.eq).toHaveBeenCalledWith("user_id", USER_ID);
    expect(service.query.eq).toHaveBeenCalledWith(
      "session_hash",
      expect.stringMatching(/^[0-9a-f]{64}$/)
    );
  });
});
