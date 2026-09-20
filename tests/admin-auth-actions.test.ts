import { beforeEach, describe, expect, it, vi } from "vitest";
import { logoutAdmin } from "@/app/admin/actions";
import { startMfaEnrollment } from "@/app/admin/mfa/actions";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getCurrentAdminCandidate: vi.fn(),
  isAllowedAdmin: vi.fn(),
  verifyAdminActionOrigin: vi.fn(),
  verifyPublicAuthActionOrigin: vi.fn(),
  enforceAuthRateLimit: vi.fn(),
  writeAuditLog: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/admin/auth", () => ({
  getCurrentAdminCandidate: mocks.getCurrentAdminCandidate,
  isAllowedAdmin: mocks.isAllowedAdmin,
  isAdminEmailApproved: vi.fn(),
}));
vi.mock("@/lib/admin/action-security", () => ({
  verifyAdminActionOrigin: mocks.verifyAdminActionOrigin,
  verifyPublicAuthActionOrigin: mocks.verifyPublicAuthActionOrigin,
}));
vi.mock("@/lib/admin/auth-rate-limit", () => ({
  enforceAuthRateLimit: mocks.enforceAuthRateLimit,
}));
vi.mock("@/lib/admin/audit", () => ({ writeAuditLog: mocks.writeAuditLog }));
vi.mock("@/lib/admin/recovery", () => ({ consumeAdminRecoveryChallenge: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (destination: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { destination });
  },
}));

const ADMIN = { id: "11111111-1111-4111-8111-111111111111", email: "owner@example.com" };
const FACTOR_ID = "22222222-2222-4222-8222-222222222222";

function makeClient(user: typeof ADMIN | null = ADMIN) {
  return {
    auth: {
      getUser: vi.fn(async () => ({ data: { user }, error: null })),
      signOut: vi.fn(async () => ({ error: null })),
      mfa: {
        listFactors: vi.fn().mockResolvedValue({
          data: { totp: [], all: [] }, error: null,
        }),
        unenroll: vi.fn().mockResolvedValue({ error: null }),
        enroll: vi.fn().mockResolvedValue({
          data: {
            id: FACTOR_ID,
            type: "totp",
            totp: { qr_code: "data:image/svg+xml;utf8,<svg></svg>", secret: "SETUP_SECRET" },
          },
          error: null,
        }),
      },
    },
  };
}

function startEnrollment() {
  return startMfaEnrollment({ ok: false, message: "" }, new FormData());
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentAdminCandidate.mockResolvedValue(ADMIN);
  mocks.isAllowedAdmin.mockResolvedValue(true);
  mocks.verifyAdminActionOrigin.mockResolvedValue(true);
  mocks.verifyPublicAuthActionOrigin.mockResolvedValue(true);
  mocks.enforceAuthRateLimit.mockResolvedValue({ allowed: true, configured: true });
  mocks.writeAuditLog.mockResolvedValue({ ok: true });
});

describe("logout abuse protection", () => {
  it("rejects a foreign origin before contacting Auth or writing an audit row", async () => {
    mocks.verifyPublicAuthActionOrigin.mockResolvedValue(false);
    await expect(logoutAdmin()).rejects.toMatchObject({ destination: "/admin" });
    expect(mocks.verifyPublicAuthActionOrigin).toHaveBeenCalledWith("logout");
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.writeAuditLog).not.toHaveBeenCalled();
  });

  it("does not let an anonymous request append an admin audit row", async () => {
    const client = makeClient(null);
    mocks.createClient.mockResolvedValue(client);
    await expect(logoutAdmin()).rejects.toMatchObject({ destination: "/admin/login" });
    expect(client.auth.signOut).toHaveBeenCalledOnce();
    expect(mocks.isAllowedAdmin).not.toHaveBeenCalled();
    expect(mocks.writeAuditLog).not.toHaveBeenCalled();
  });

  it("does not audit a non-admin Auth user as an administrator", async () => {
    const client = makeClient();
    mocks.createClient.mockResolvedValue(client);
    mocks.isAllowedAdmin.mockResolvedValue(false);
    await expect(logoutAdmin()).rejects.toMatchObject({ destination: "/admin/login" });
    expect(client.auth.signOut).toHaveBeenCalledOnce();
    expect(mocks.writeAuditLog).not.toHaveBeenCalled();
  });

  it("preserves the logout event for a verified approved administrator", async () => {
    const client = makeClient();
    mocks.createClient.mockResolvedValue(client);
    await expect(logoutAdmin()).rejects.toMatchObject({ destination: "/admin/login" });
    expect(mocks.isAllowedAdmin).toHaveBeenCalledWith(ADMIN);
    expect(mocks.writeAuditLog).toHaveBeenCalledWith({
      actorId: ADMIN.id, action: "admin_logout", metadata: { email: ADMIN.email },
    });
  });
});

describe("MFA enrollment abuse protection", () => {
  it("rejects an unapproved candidate before consuming limits or touching factors", async () => {
    mocks.getCurrentAdminCandidate.mockResolvedValue(null);
    await expect(startEnrollment()).resolves.toMatchObject({ ok: false });
    expect(mocks.enforceAuthRateLimit).not.toHaveBeenCalled();
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("rejects an invalid origin before touching factors", async () => {
    mocks.verifyAdminActionOrigin.mockResolvedValue(false);
    await expect(startEnrollment()).resolves.toMatchObject({ ok: false });
    expect(mocks.enforceAuthRateLimit).not.toHaveBeenCalled();
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("limits enrollment separately and rejects before creating a factor", async () => {
    mocks.enforceAuthRateLimit.mockResolvedValue({
      allowed: false, configured: true, firstDenied: true,
      auditMetadata: { rateLimitKind: "mfa-enrollment" }, retryAfterSeconds: 600,
    });
    await expect(startEnrollment()).resolves.toMatchObject({ ok: false });
    expect(mocks.enforceAuthRateLimit).toHaveBeenCalledWith("mfa-enrollment", ADMIN.email);
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.writeAuditLog).toHaveBeenCalledOnce();
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "security_admin_mfa_rate_limited",
      metadata: { rateLimitKind: "mfa-enrollment", retryAfterSeconds: 600 },
    }));
  });

  it("does not append another audit row on every already-denied setup attempt", async () => {
    mocks.enforceAuthRateLimit.mockResolvedValue({
      allowed: false, configured: true, firstDenied: false,
    });
    await expect(startEnrollment()).resolves.toMatchObject({ ok: false });
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.writeAuditLog).not.toHaveBeenCalled();
  });

  it("keeps verified factors and refuses a second enrollment", async () => {
    const client = makeClient();
    client.auth.mfa.listFactors.mockResolvedValue({
      data: { totp: [{ id: FACTOR_ID }], all: [{ id: FACTOR_ID }] }, error: null,
    });
    mocks.createClient.mockResolvedValue(client);
    await expect(startEnrollment()).resolves.toMatchObject({ ok: false });
    expect(client.auth.mfa.unenroll).not.toHaveBeenCalled();
    expect(client.auth.mfa.enroll).not.toHaveBeenCalled();
  });

  it("does not create another factor when stale-factor cleanup fails", async () => {
    const client = makeClient();
    client.auth.mfa.listFactors.mockResolvedValue({
      data: { totp: [], all: [{ id: FACTOR_ID, factor_type: "totp", status: "unverified" }] },
      error: null,
    });
    client.auth.mfa.unenroll.mockResolvedValue({ error: new Error("Auth unavailable") });
    mocks.createClient.mockResolvedValue(client);
    await expect(startEnrollment()).resolves.toMatchObject({ ok: false });
    expect(client.auth.mfa.enroll).not.toHaveBeenCalled();
    expect(mocks.writeAuditLog).not.toHaveBeenCalled();
  });

  it("returns the QR setup only after admission and successful enrollment", async () => {
    const client = makeClient();
    mocks.createClient.mockResolvedValue(client);
    await expect(startEnrollment()).resolves.toMatchObject({
      ok: true, enrollment: { factorId: FACTOR_ID, secret: "SETUP_SECRET" },
    });
    expect(client.auth.mfa.enroll).toHaveBeenCalledOnce();
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "admin_mfa_enrollment_started",
    }));
  });
});
