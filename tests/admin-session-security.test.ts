import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isAdminSessionActive, probeAdminSessionBoundary } from "@/lib/admin/session-security";

const mocks = vi.hoisted(() => ({
  createAdminServiceClient: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("@/lib/admin/service", () => ({ createAdminServiceClient: mocks.createAdminServiceClient }));

const USER = "11111111-1111-4111-8111-111111111111";
const SESSION = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NODE_ENV", "production");
  mocks.createAdminServiceClient.mockReturnValue({ rpc: mocks.rpc });
  mocks.rpc.mockResolvedValue({ data: true, error: null });
});
afterEach(() => vi.unstubAllEnvs());

describe("server-side admin session liveness", () => {
  it("checks both user and session using the protected RPC", async () => {
    await expect(isAdminSessionActive(USER, SESSION)).resolves.toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith("is_admin_session_active", {
      p_user_id: USER, p_session_id: SESSION,
    });
  });

  it("denies a deleted or expired session even if the JWT was valid", async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    await expect(isAdminSessionActive(USER, SESSION)).resolves.toBe(false);
    await expect(probeAdminSessionBoundary()).resolves.toBe(true);
  });

  it.each(["PGRST202", "42883"])("retains pre-migration access only for missing RPC %s", async (code) => {
    mocks.rpc.mockResolvedValue({ data: null, error: {
      code, message: "function public.is_admin_session_active(uuid, uuid) does not exist",
    } });
    await expect(isAdminSessionActive(USER, SESSION)).resolves.toBe(true);
    await expect(probeAdminSessionBoundary()).resolves.toBe(false);
  });

  it.each(["42501", "42P01", "XX000", "PGRST301", "42883"])("denies real backend failure %s", async (code) => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code } });
    await expect(isAdminSessionActive(USER, SESSION)).resolves.toBe(false);
    await expect(probeAdminSessionBoundary()).resolves.toBe(false);
  });

  it("denies a network failure", async () => {
    mocks.rpc.mockRejectedValue(new Error("offline"));
    await expect(isAdminSessionActive(USER, SESSION)).resolves.toBe(false);
    await expect(probeAdminSessionBoundary()).resolves.toBe(false);
  });

  it.each([null, "true", [], {}])("denies malformed RPC payload %j", async (data) => {
    mocks.rpc.mockResolvedValue({ data, error: null });
    await expect(isAdminSessionActive(USER, SESSION)).resolves.toBe(false);
  });

  it("denies missing server credentials in production", async () => {
    mocks.createAdminServiceClient.mockReturnValue(null);
    await expect(isAdminSessionActive(USER, SESSION)).resolves.toBe(false);
  });

  it("rejects malformed identities without sending them to the database", async () => {
    await expect(isAdminSessionActive(USER, "not-a-uuid")).resolves.toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
