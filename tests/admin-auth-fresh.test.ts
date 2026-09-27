import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createImageKitObservationBudget } from "@/lib/admin/imagekit-observation-contracts";

const mocks = vi.hoisted(() => ({ client: vi.fn(), service: vi.fn(), session: vi.fn(), browserEnv: vi.fn(), profile: vi.fn(), getUser: vi.fn(), getClaims: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("@/lib/supabase/env", () => ({ hasSupabaseBrowserEnv: mocks.browserEnv }));
vi.mock("@/lib/admin/service", () => ({ createAdminServiceClient: mocks.service, hasAdminServiceEnv: () => true }));
vi.mock("@/lib/admin/session-security", () => ({ isAdminSessionActive: mocks.session }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
// Simulate request-local React memoization even in Vitest's non-RSC runtime.
// A second fresh read must bypass BOTH cached getCurrentAdmin and its context.
vi.mock("react", () => ({ cache: (fn: (...args: unknown[]) => unknown) => {
  let called = false; let value: unknown;
  return (...args: unknown[]) => { if (!called) { called = true; value = fn(...args); } return value; };
} }));

const id = "00000000-0000-4000-8000-000000000001";
const sessionId = "00000000-0000-4000-8000-000000000002";
const user = { id, email: "owner@example.test" };
const claims = { sub: id, session_id: sessionId, aal: "aal2" };
beforeEach(() => {
  vi.resetModules(); vi.resetAllMocks(); vi.stubEnv("NODE_ENV", "production"); mocks.browserEnv.mockReturnValue(true);
  mocks.client.mockResolvedValue({ auth: { getUser: mocks.getUser, getClaims: mocks.getClaims } });
  mocks.getUser.mockResolvedValue({ data: { user }, error: null }); mocks.getClaims.mockResolvedValue({ data: { claims }, error: null });
  mocks.session.mockResolvedValue(true); mocks.profile.mockResolvedValue({ data: { user_id: id, email: user.email, role: "owner", is_active: true }, error: null });
  const query = { select: vi.fn(), eq: vi.fn(), limit: vi.fn(), maybeSingle: mocks.profile };
  query.select.mockReturnValue(query); query.eq.mockReturnValue(query); query.limit.mockReturnValue(query);
  mocks.service.mockReturnValue({ from: vi.fn(() => query) });
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("fresh admin authorization bypasses page-level cache", () => {
  it("reads session, verified claims and profile each time while page auth remains cached", async () => {
    const { getCurrentAdmin, getFreshCurrentAdmin } = await import("@/lib/admin/auth");
    expect(await getCurrentAdmin()).toMatchObject({ id, hasActiveProfile: true });
    await getCurrentAdmin(); expect(mocks.getUser).toHaveBeenCalledTimes(1);
    expect(await getFreshCurrentAdmin()).toMatchObject({ id, hasActiveProfile: true });
    expect(await getFreshCurrentAdmin()).toMatchObject({ id, hasActiveProfile: true });
    for (const fn of [mocks.client, mocks.getUser, mocks.getClaims, mocks.session, mocks.profile]) expect(fn).toHaveBeenCalledTimes(3);
  });
  it("detects revocation after a successful cached page read and skips the profile read", async () => {
    const { getCurrentAdmin, getFreshCurrentAdmin } = await import("@/lib/admin/auth");
    expect(await getCurrentAdmin()).not.toBeNull(); mocks.session.mockResolvedValue(false);
    expect(await getCurrentAdmin()).not.toBeNull(); expect(await getFreshCurrentAdmin()).toBeNull(); expect(mocks.profile).toHaveBeenCalledTimes(1);
  });
  it("detects profile removal after admission", async () => {
    const { getFreshCurrentAdmin } = await import("@/lib/admin/auth");
    expect(await getFreshCurrentAdmin()).not.toBeNull(); mocks.profile.mockResolvedValue({ data: null, error: null });
    expect(await getFreshCurrentAdmin()).toBeNull();
  });
  it.each([{ ...claims, aal: "aal1" }, { ...claims, aal: undefined }, { ...claims, sub: "other-user" },
    { ...claims, session_id: null }])("denies insufficient or changed verified claims %j", async current => {
    const { getFreshCurrentAdmin } = await import("@/lib/admin/auth");
    expect(await getFreshCurrentAdmin()).not.toBeNull(); mocks.getClaims.mockResolvedValue({ data: { claims: current }, error: null });
    expect(await getFreshCurrentAdmin()).toBeNull();
  });
  it("fails closed on unavailable or invalid authentication", async () => {
    const { getFreshCurrentAdmin } = await import("@/lib/admin/auth"); mocks.getUser.mockResolvedValue({ data: { user: null }, error: new Error("fixture") });
    expect(await getFreshCurrentAdmin()).toBeNull(); expect(mocks.getClaims).not.toHaveBeenCalled();
  });
  it("never accepts an unverified claim payload", async () => {
    const { getFreshCurrentAdmin } = await import("@/lib/admin/auth"); mocks.getClaims.mockResolvedValue({ data: { claims }, error: new Error("invalid signature") });
    expect(await getFreshCurrentAdmin()).toBeNull(); expect(mocks.session).not.toHaveBeenCalled();
  });
  it("does not query authentication when browser env is unavailable", async () => {
    const { getFreshCurrentAdmin } = await import("@/lib/admin/auth"); mocks.browserEnv.mockReturnValue(false);
    expect(await getFreshCurrentAdmin()).toBeNull(); expect(mocks.client).not.toHaveBeenCalled();
  });
  it("requires the real session boundary even while classic page auth retains its legacy migration fallback", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/session-security")>("@/lib/admin/session-security");
    mocks.session.mockImplementation(actual.isAdminSessionActive);
    const currentService = mocks.service(); currentService.rpc = vi.fn(async () => ({ data: null, error: { code: "PGRST202" } }));
    const { getCurrentAdmin, getFreshCurrentAdmin } = await import("@/lib/admin/auth");
    expect(await getCurrentAdmin()).not.toBeNull(); expect(await getFreshCurrentAdmin()).toBeNull();
    expect(mocks.session).toHaveBeenLastCalledWith(id, sessionId, { requireBoundary: true, checkpoint: expect.any(Function) });
    expect(mocks.profile).toHaveBeenCalledTimes(1);
  });
  it("does not start claims, session or profile reads when getUser resolves after the run budget expires", async () => {
    vi.useFakeTimers(); let resolve!: (value: unknown) => void;
    mocks.getUser.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const { getFreshCurrentAdmin } = await import("@/lib/admin/auth");
    const budget = createImageKitObservationBudget({ now: () => 100_000, monotonicNow: () => 0 });
    try {
      const assertion = expect(budget.within(() => getFreshCurrentAdmin(budget.checkpoint))).rejects.toThrow("observation-budget-ended");
      await vi.advanceTimersByTimeAsync(30_000); await assertion;
      resolve({ data: { user }, error: null }); await vi.advanceTimersByTimeAsync(1);
      expect(mocks.getClaims).not.toHaveBeenCalled(); expect(mocks.session).not.toHaveBeenCalled(); expect(mocks.profile).not.toHaveBeenCalled();
    } finally { budget.close(); }
  });
});
