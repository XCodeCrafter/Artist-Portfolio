import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSecurityCenterData } from "@/lib/admin/security";

const mocks = vi.hoisted(() => ({
  serviceConfigured: vi.fn(),
  createClient: vi.fn(),
  allowedEmails: vi.fn(),
  readiness: vi.fn(),
  profiles: vi.fn(),
  audit: vi.fn(),
  events: vi.fn(),
  listUsers: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/admin/auth", () => ({ getAllowedAdminEmails: mocks.allowedEmails }));
vi.mock("@/lib/admin/service", () => ({
  hasAdminServiceEnv: mocks.serviceConfigured,
  createAdminServiceClient: mocks.createClient,
}));
vi.mock("@/lib/admin/readiness", () => ({ getProductionReadiness: mocks.readiness }));

const owner = {
  id: "owner-id", email: "owner@example.test", role: "owner" as const, hasActiveProfile: true,
};
const profile = {
  user_id: owner.id, email: owner.email, role: "owner", is_active: true,
  created_at: "2026-09-21T00:00:00Z", updated_at: "2026-09-21T00:00:00Z",
};
const sharedChecks = [
  ["site-url", "Production URL"],
  ["supabase-auth", "Supabase Auth"],
  ["service-key", "Server credential"],
  ["database-schema", "Database migrations"],
  ["media-storage", "Media storage"],
  ["admin-access", "Admin access"],
  ["auth-security-secret", "Auth security secret"],
  ["public-signup", "Public signup disabled"],
  ["email", "Contact delivery"],
  ["delivery-webhook", "Delivery monitoring"],
  ["retention-scheduler", "Retention scheduler"],
  ["deep-health-monitor", "Dependency health monitor"],
  ["session-boundary", "Immediate Session Revocation"],
  ["rate-limit", "Rate-limit configuration"],
].map(([id, label]) => ({
  id, label, ok: true, status: "pass" as "pass" | "fail" | "unknown", critical: true,
  detail: `Safe ${id} detail.`, href: "/admin/v2/security#configuration",
}));

function createReadClient() {
  return {
    rpc: mocks.rpc,
    auth: { admin: { listUsers: mocks.listUsers } },
    from: vi.fn((table: string) => {
      let events = false;
      const builder = {
        select: vi.fn(() => builder),
        order: vi.fn(() => builder),
        limit: vi.fn(() => builder),
        in: vi.fn(() => { events = true; return builder; }),
        gte: vi.fn(() => builder),
        returns: vi.fn(() => table === "admin_profiles"
          ? mocks.profiles()
          : events ? mocks.events() : mocks.audit()),
      };
      return builder;
    }),
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.serviceConfigured.mockReturnValue(true);
  mocks.allowedEmails.mockReturnValue([]);
  mocks.readiness.mockResolvedValue({ checks: sharedChecks });
  mocks.profiles.mockResolvedValue({ data: [profile], error: null });
  mocks.audit.mockResolvedValue({ data: [], error: null });
  mocks.events.mockResolvedValue({ data: [], error: null });
  mocks.listUsers.mockResolvedValue({ data: { users: [{
    id: owner.id, created_at: profile.created_at, last_sign_in_at: profile.updated_at,
    factors: [{ status: "verified" }],
  }] }, error: null });
  mocks.createClient.mockReturnValue(createReadClient());
});

afterEach(() => vi.unstubAllEnvs());

describe("Shared production checks in Security", () => {
  it("loads readiness once, preserves its safe statuses, and avoids duplicate checks", async () => {
    const result = await getSecurityCenterData(owner);
    expect(mocks.readiness).toHaveBeenCalledOnce();
    for (const check of sharedChecks) {
      expect(result.checks.filter(item => item.id === check.id)).toEqual([
        { ...check, verification: "runtime" },
      ]);
    }
    expect(new Set(result.checks.map(check => check.label)).size).toBe(result.checks.length);
    expect(result.checks.some(check => check.label === "Database Rate Limit")).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("keeps unknown distinct from failed without inventing remediation", async () => {
    mocks.readiness.mockResolvedValue({ checks: [
      { ...sharedChecks[7], ok: false, status: "unknown", detail: "Signup settings could not be checked." },
      { ...sharedChecks[0], ok: false, status: "fail", detail: "Configure a canonical HTTPS URL." },
    ] });
    const { checks } = await getSecurityCenterData(owner);
    expect(checks.find(check => check.id === "public-signup")).toMatchObject({
      status: "unknown", ok: false, detail: "Signup settings could not be checked.",
    });
    expect(checks.find(check => check.id === "site-url")).toMatchObject({ status: "fail" });
  });

  it("preserves access permissions, profile metadata, and implemented guard distinctions", async () => {
    const result = await getSecurityCenterData(owner);
    expect(result.canManageAdmins).toBe(true);
    expect(result.profiles[0]).toMatchObject({
      userId: owner.id, authUserFound: true, mfaEnrolled: true,
      lastSignInAt: profile.updated_at,
    });
    expect(result.checks.find(check => check.id === "public-api-guards"))
      .toMatchObject({ verification: "implemented", ok: true });
    expect(result.loadError).toBeUndefined();
    expect((await getSecurityCenterData({ ...owner, role: "admin" })).canManageAdmins).toBe(false);
  });

  it("classifies failed profile, audit, and directory reads as unknown and hides raw errors", async () => {
    const error = { message: "private-token-should-never-be-rendered" };
    mocks.profiles.mockResolvedValue({ data: null, error });
    mocks.audit.mockResolvedValue({ data: null, error });
    mocks.listUsers.mockResolvedValue({ data: null, error });
    const result = await getSecurityCenterData(owner);
    for (const id of ["admin-authorization-source", "audit-read-path", "admin-auth-directory"]) {
      expect(result.checks.find(check => check.id === id)).toMatchObject({ status: "unknown", ok: false });
    }
    expect(result.loadError).toBe("Unable to load security data from Supabase.");
    expect(JSON.stringify(result)).not.toContain(error.message);
    expect(JSON.stringify(result)).not.toContain("No active admin profiles were found");
  });

  it("survives rejected reads and still returns shared production diagnostics", async () => {
    for (const read of [mocks.profiles, mocks.audit, mocks.events, mocks.listUsers]) {
      read.mockRejectedValue(new Error("Network is down"));
    }
    const result = await getSecurityCenterData(owner);
    expect(result.checks.find(check => check.id === "site-url")).toMatchObject({ status: "pass" });
    expect(result.checks.find(check => check.id === "audit-read-path")).toMatchObject({ status: "unknown" });
    expect(result.loadError).toBeDefined();
    expect(JSON.stringify(result)).not.toContain("Network is down");
  });

  it.each([
    { label: "non-array responses", profiles: {}, audit: {}, users: {} },
    { label: "partial rows", profiles: [{ user_id: owner.id }], audit: [{ id: "log" }], users: [{ id: owner.id }] },
    { label: "null rows", profiles: [null], audit: [null], users: [null] },
  ])("treats $label as unknown without crashing or returning malformed rows", async (malformed) => {
    mocks.profiles.mockResolvedValue({ data: malformed.profiles, error: null });
    mocks.audit.mockResolvedValue({ data: malformed.audit, error: null });
    mocks.events.mockResolvedValue({ data: malformed.audit, error: null });
    mocks.listUsers.mockResolvedValue({ data: { users: malformed.users }, error: null });
    const result = await getSecurityCenterData(owner);
    expect(result.profiles).toEqual([]);
    expect(result.auditLogs).toEqual([]);
    expect(result.securitySummary.total7d).toBe(0);
    expect(result.loadError).toBeDefined();
    for (const id of ["admin-authorization-source", "audit-read-path", "admin-auth-directory"]) {
      expect(result.checks.find(check => check.id === id)).toMatchObject({ status: "unknown" });
    }
  });

  it("keeps Security usable with an explicit unknown check when readiness unexpectedly fails", async () => {
    mocks.readiness.mockRejectedValue(new Error("secret-endpoint-must-not-leak"));
    const result = await getSecurityCenterData(owner);
    expect(result.checks.find(check => check.id === "production-readiness"))
      .toMatchObject({ status: "unknown", critical: true, ok: false });
    expect(result.profiles[0]?.userId).toBe(owner.id);
    expect(result.canManageAdmins).toBe(true);
    expect(JSON.stringify(result)).not.toContain("secret-endpoint-must-not-leak");
  });

  it("only calls an empty authorization source a failure after a successful read", async () => {
    mocks.profiles.mockResolvedValue({ data: [], error: null });
    const { checks } = await getSecurityCenterData(owner);
    expect(checks.find(check => check.id === "admin-authorization-source"))
      .toMatchObject({ status: "fail", detail: expect.stringContaining("No active admin profiles") });
  });

  it.each(["missing-env", "missing-client"])("returns shared readiness safely with %s", async (reason) => {
    vi.stubEnv("NODE_ENV", "production");
    if (reason === "missing-env") mocks.serviceConfigured.mockReturnValue(false);
    else mocks.createClient.mockReturnValue(null);
    const result = await getSecurityCenterData(owner);
    expect(mocks.readiness).toHaveBeenCalledOnce();
    expect(result.isConfigured).toBe(false);
    expect(result.canManageAdmins).toBe(false);
    expect(result.allowedEmails).toEqual([]);
    expect(result.checks.find(check => check.id === "site-url")).toMatchObject({ status: "pass" });
    expect(result.checks.find(check => check.id === "admin-auth-directory")).toMatchObject({ status: "unknown" });
    expect(mocks.profiles).not.toHaveBeenCalled();
    expect(mocks.listUsers).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("contains no independent write or session probes after consolidating readiness", () => {
    const source = readFileSync(new URL("../lib/admin/security.ts", import.meta.url), "utf8");
    expect(source).not.toContain("probeDatabaseRateLimit");
    expect(source).not.toContain("probeAdminSessionBoundary");
    expect(source).not.toContain("consume_security_rate_limit");
    expect(source).not.toContain("save_contact_");
  });
});
