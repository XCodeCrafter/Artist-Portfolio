import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getImageKitOperationsSnapshot } from "@/lib/admin/imagekit-operations";
import type { AdminUser } from "@/lib/admin/auth";
import { refreshImageKitOperations, requestImageKitObservation } from "@/lib/admin/imagekit-operations-actions";
import { getImageKitObservationCredentialBinding } from "@/lib/admin/imagekit-observation-admission";
import { createImageKitObservationBudget } from "@/lib/admin/imagekit-observation-contracts";
import * as mediaConfig from "@/lib/admin/media-upload-config";

const mocks = vi.hoisted(() => ({
  admin: vi.fn(), headers: vi.fn(), origin: vi.fn(), service: vi.fn(), rpc: vi.fn(),
  overview: vi.fn(), limit: vi.fn(), entry: vi.fn(), run: vi.fn(),
}));
vi.mock("@/lib/admin/auth", () => ({ getFreshCurrentAdmin: mocks.admin }));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("@/lib/admin/action-security", () => ({ verifyAdminActionOrigin: mocks.origin }));
vi.mock("@/lib/admin/service", () => ({ createAdminServiceClient: mocks.service }));
vi.mock("@/lib/admin/imagekit-reconciliation-overview", () => ({
  getImageKitReconciliationOverview: mocks.overview, getImageKitReconciliationOverviewForAdmin: mocks.overview,
}));
vi.mock("@/lib/security/rate-limit", () => ({ consumeDatabaseRateLimit: mocks.limit }));
vi.mock("@/lib/admin/imagekit-observation-entry", () => ({ createImageKitObservationEntry: mocks.entry }));

const actorId = "00000000-0000-4000-8000-000000000001";
const admin: AdminUser = { id: actorId, email: "owner@example.test", role: "owner", hasActiveProfile: true };
const clock = Date.parse("2026-09-24T12:00:00.000Z");
const credentials = {
  imageKitId: "fictional_artist", urlEndpoint: "https://ik.imagekit.io/fictional_artist",
  publicKey: "public_fictional_test_key", privateKey: "private_fictional_test_key",
};
const approval = () => ({
  version: 1, storageContainer: credentials.imageKitId, urlEndpoint: credentials.urlEndpoint,
  credentialBinding: getImageKitObservationCredentialBinding(credentials),
  revision: "00000000-0000-4000-8000-000000000002", expiresAt: "2026-09-24T13:00:00.000Z",
});
const emptyOverview = () => ({ status: "available", overview: {
  version: 1, generatedAt: "2026-09-24T12:00:00.000Z", total: 0,
  counts: { uploading: 0, waiting: 0, due: 0, checking: 0, attention: 0 }, items: [], hasMore: false,
} });
const ready = { version: 1, ready: true };
const resultFor = (name: string) => ({ data: name === "get_imagekit_upload_readiness_v1" ? ready : approval(), error: null });
function response<T>(value: T) {
  const promise = Promise.resolve(value);
  return Object.assign(promise, { abortSignal: vi.fn<(signal?: AbortSignal) => Promise<T>>(() => promise) });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise: Object.assign(promise, { abortSignal: vi.fn<(signal?: AbortSignal) => Promise<T>>(() => promise) }), resolve };
}
const code = async () => (await getImageKitOperationsSnapshot()).setup.code;

beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(clock);
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("AUTH_SECURITY_SECRET", "fictional-test-security-secret-longer-than-32");
  vi.stubEnv("SUPABASE_SECRET_KEY", ""); vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
  vi.stubEnv("MEDIA_UPLOAD_PROVIDER", "supabase"); vi.stubEnv("IMAGEKIT_PILOT_UPLOAD_ENABLED", "false");
  vi.stubEnv("IMAGEKIT_OBSERVATION_ENABLED", "true");
  vi.stubEnv("IMAGEKIT_PUBLIC_KEY", credentials.publicKey); vi.stubEnv("IMAGEKIT_PRIVATE_KEY", credentials.privateKey);
  vi.stubEnv("NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT", credentials.urlEndpoint);
  mocks.admin.mockResolvedValue(admin); mocks.headers.mockResolvedValue(new Headers({ origin: "http://localhost:3102" }));
  mocks.origin.mockResolvedValue(true); mocks.service.mockReturnValue({ rpc: mocks.rpc });
  mocks.rpc.mockImplementation(name => response(resultFor(name)));
  mocks.overview.mockResolvedValue(emptyOverview());
  mocks.limit.mockResolvedValue({ allowed: true, configured: true, retryAfterSeconds: 60 });
  mocks.entry.mockReturnValue({ runOnce: mocks.run }); mocks.run.mockResolvedValue({ ok: true, state: "idle" });
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("No provider calls allowed"); }));
});
afterEach(() => {
  expect(fetch).not.toHaveBeenCalled();
  expect(mocks.rpc.mock.calls.every(([name]) => ["get_imagekit_upload_readiness_v1", "get_imagekit_observation_approval_v1",
    "get_imagekit_reconciliation_overview_v1"].includes(name))).toBe(true);
  vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals();
});

describe("read-only operational setup snapshot", () => {
  it("returns only safe advisory setup and overview, never invokes a worker or consumes quotas", async () => {
    const value = await getImageKitOperationsSnapshot();
    expect(value.setup).toEqual({ code: "available", checkedAt: "2026-09-24T12:00:00.000Z" });
    expect(value.overview).toEqual(emptyOverview());
    expect(mocks.limit).not.toHaveBeenCalled(); expect(mocks.entry).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith("get_imagekit_observation_approval_v1", {
      p_actor_id: actorId, p_storage_container: credentials.imageKitId,
      p_url_endpoint: credentials.urlEndpoint, p_credential_binding: approval().credentialBinding,
    });
    const encoded = JSON.stringify(value);
    for (const secret of [credentials.imageKitId, credentials.urlEndpoint, credentials.publicKey,
      credentials.privateKey, approval().credentialBinding, approval().revision, admin.email]) expect(encoded).not.toContain(secret);
  });

  it.each([null, { ...admin, hasActiveProfile: false }, { ...admin, role: "viewer" }, { ...admin, id: "spoofed" }])("requires fresh active AAL2 access before privileged reads: %j", async value => {
    const configuration = vi.spyOn(mediaConfig, "getMediaUploadConfigSummary");
    mocks.admin.mockResolvedValue(value);
    expect(await code()).toBe("access-required");
    expect(configuration).not.toHaveBeenCalled();
    expect(mocks.service).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.overview).not.toHaveBeenCalled(); expect(mocks.limit).not.toHaveBeenCalled();
  });

  it("does not depend on an Origin header for a server-rendered read", async () => {
    mocks.headers.mockResolvedValue(new Headers()); expect(await code()).toBe("available");
    expect(mocks.origin).not.toHaveBeenCalled(); expect(mocks.headers).not.toHaveBeenCalled();
  });

  it.each(["IMAGEKIT_PUBLIC_KEY", "IMAGEKIT_PRIVATE_KEY", "NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT"])("stops setup before approval reads when %s is missing", async key => {
    vi.stubEnv(key, ""); expect(await code()).toBe("configuration-required");
    expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.entry).not.toHaveBeenCalled();
  });
  it.each(["false", "", "TRUE", "1"])("requires the exact independent observation gate, not %j", async value => {
    vi.stubEnv("IMAGEKIT_OBSERVATION_ENABLED", value); expect(await code()).toBe("checks-disabled");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("keeps upload pilot disabled even when manual observations are available", async () => {
    expect(await code()).toBe("available");
    expect(process.env.MEDIA_UPLOAD_PROVIDER).toBe("supabase");
    expect(process.env.IMAGEKIT_PILOT_UPLOAD_ENABLED).toBe("false");
  });
  it("requires the security secret before any approval binding read", async () => {
    vi.stubEnv("AUTH_SECURITY_SECRET", ""); expect(await code()).toBe("security-required");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("does not equate a missing service connection with an empty queue", async () => {
    mocks.service.mockReturnValue(null); expect(await code()).toBe("database-unavailable");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each(["PGRST202", "42883"])("maps missing readiness RPC %s to a migration requirement", async errorCode => {
    mocks.rpc.mockReturnValue(response({ data: null, error: { code: errorCode,
      message: "function public.get_imagekit_upload_readiness_v1() does not exist; secret internal details" } }));
    const value = await getImageKitOperationsSnapshot(); expect(value.setup.code).toBe("migration-required");
    expect(JSON.stringify(value)).not.toContain("secret internal details");
  });
  it.each([
    ["55000", "database-not-ready"], ["42501", "unavailable"], ["XX000", "unavailable"],
    ["42883", "unavailable"], [undefined, "unavailable"],
  ])("maps a %s failure without alleging a missing migration to %s", async (errorCode, expected) => {
    mocks.rpc.mockReturnValue(response({ data: null, error: { code: errorCode, message: "private unexpected function details" } }));
    const value = await getImageKitOperationsSnapshot(); expect(value.setup.code).toBe(expected);
    expect(JSON.stringify(value)).not.toContain("private unexpected function details");
  });
  it("detects a missing approval RPC independently of ready parent migrations", async () => {
    mocks.rpc.mockImplementation(name => response(name === "get_imagekit_upload_readiness_v1"
      ? { data: ready, error: null }
      : { data: null, error: { code: "PGRST202", message: "private schema cache details" } }));
    const value = await getImageKitOperationsSnapshot(); expect(value.setup.code).toBe("migration-required");
    expect(JSON.stringify(value)).not.toContain("private schema cache details");
  });
  it.each([null, [], {}, { version: 1, ready: false }, { version: 1, ready: true, secret: "unexpected" }])("rejects malformed/unready lifecycle readiness %j", async data => {
    mocks.rpc.mockReturnValue(response({ data, error: null })); expect(await code()).toBe("database-not-ready");
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it("requires explicit owner approval, not a successful null read", async () => {
    const data = null;
    mocks.rpc.mockImplementation(name => response({ data: name === "get_imagekit_upload_readiness_v1" ? ready : data, error: null }));
    expect(await code()).toBe("approval-required");
  });
  it.each([{}, { version: 1 }])("marks malformed approval %j as unavailable rather than presenting a known absent approval", async data => {
    mocks.rpc.mockImplementation(name => response({ data: name === "get_imagekit_upload_readiness_v1" ? ready : data, error: null }));
    expect(await code()).toBe("unavailable");
  });
  it.each([
    { storageContainer: "another-account" }, { credentialBinding: "f".repeat(64) }, { revision: "not-a-revision" },
    { expiresAt: "2026-09-24T11:00:00.000Z" }, { expiresAt: "2026-09-24T12:00:35.000Z" },
    { expiresAt: "2026-09-26T12:00:00.000Z" }, { extra: "secret" },
  ])("fails closed for a stale/mismatched/malformed approval %j", async changes => {
    mocks.rpc.mockImplementation(name => response({ data: name === "get_imagekit_upload_readiness_v1" ? ready : { ...approval(), ...changes }, error: null }));
    expect(await code()).toBe("unavailable");
  });
  it("preserves unavailable overview as unknown instead of substituting zero counts", async () => {
    mocks.overview.mockResolvedValue({ status: "unavailable", reason: "unavailable" });
    expect((await getImageKitOperationsSnapshot()).overview).toEqual({ status: "unavailable", reason: "unavailable" });
  });
  it("auth timeout cannot resume into privileged reads after its late response", async () => {
    const late = deferred<typeof admin>(); mocks.admin.mockReturnValue(late.promise);
    const pending = getImageKitOperationsSnapshot(); await vi.advanceTimersByTimeAsync(30_001);
    expect((await pending).setup.code).not.toBe("available");
    late.resolve(admin); await vi.advanceTimersByTimeAsync(1);
    expect(mocks.service).not.toHaveBeenCalled(); expect(mocks.overview).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("late readiness results cannot start approval reads after timeout", async () => {
    const late = deferred<{ data: typeof ready; error: null }>(); mocks.rpc.mockReturnValue(late.promise);
    const pending = getImageKitOperationsSnapshot(); await vi.advanceTimersByTimeAsync(30_001);
    expect((await pending).setup.code).not.toBe("available");
    late.resolve({ data: ready, error: null }); await vi.advanceTimersByTimeAsync(1);
    expect(mocks.rpc).toHaveBeenCalledTimes(1); expect(mocks.entry).not.toHaveBeenCalled();
  });
});

describe("manual read refresh admission", () => {
  it("uses separate fail-closed read quota and never executes observations", async () => {
    const value = await refreshImageKitOperations(); expect(value.ok).toBe(true);
    expect(mocks.limit).toHaveBeenCalledTimes(1);
    expect(mocks.limit).toHaveBeenCalledWith(expect.objectContaining({ limit: 30, windowSeconds: 60, failClosed: true }));
    expect(mocks.limit.mock.calls[0][0].bucket).not.toMatch(/^imagekit-observe:/);
    expect(mocks.entry).not.toHaveBeenCalled(); expect(mocks.run).not.toHaveBeenCalled();
  });
  it.each([null, "null", "https://site.test/", "https://site.test/path", "https://site.test?x=1",
    "https://user:pass@site.test", "HTTPS://SITE.TEST", "https://site.test:443", "file://site.test"])("rejects non-exact Origin %j without quota or setup access", async origin => {
    const headers = new Headers({ referer: "http://localhost:3102/admin/v2/media" });
    if (origin !== null) headers.set("origin", origin); mocks.headers.mockResolvedValue(headers);
    expect(await refreshImageKitOperations()).toEqual({ ok: false, code: "blocked" });
    expect(mocks.limit).not.toHaveBeenCalled(); expect(mocks.service).not.toHaveBeenCalled();
  });
  it("rejects unapproved exact origins without generating unlimited audit writes", async () => {
    mocks.origin.mockResolvedValue(false);
    expect(await refreshImageKitOperations()).toEqual({ ok: false, code: "blocked" });
    expect(mocks.origin.mock.calls[0][2]).toBe(false); expect(mocks.limit).not.toHaveBeenCalled();
  });
  it.each([null, { ...admin, hasActiveProfile: false }, { ...admin, role: "viewer" }])("rejects missing/inactive access %j before consuming read quotas", async value => {
    mocks.admin.mockResolvedValue(value); expect(await refreshImageKitOperations()).toEqual({ ok: false, code: "blocked" });
    expect(mocks.limit).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("does not read the panel when its read quota is denied", async () => {
    mocks.limit.mockResolvedValue({ allowed: false, configured: true, retryAfterSeconds: 60 });
    expect(await refreshImageKitOperations()).toEqual({ ok: false, code: "rate-limited" });
    expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.overview).not.toHaveBeenCalled();
  });
  it.each([null, {}, { allowed: true, configured: false }, { allowed: "true", configured: true }])("never fails open on unavailable/malformed rate limit %j", async value => {
    mocks.limit.mockResolvedValue(value);
    expect(await refreshImageKitOperations()).toEqual({ ok: false, code: "unavailable" });
    expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.overview).not.toHaveBeenCalled();
  });
  it("late quota responses cannot trigger a refresh after the request deadline", async () => {
    const late = deferred<{ allowed: boolean; configured: boolean }>(); mocks.limit.mockReturnValue(late.promise);
    const pending = refreshImageKitOperations(); await vi.advanceTimersByTimeAsync(30_001);
    expect((await pending).ok).toBe(false);
    late.resolve({ allowed: true, configured: true }); await vi.advanceTimersByTimeAsync(1);
    expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.overview).not.toHaveBeenCalled();
  });
});

describe("overview reuse preserves the enclosing request budget", () => {
  it("does not start an overview DB read after its enclosing request has ended", async () => {
    const { getImageKitReconciliationOverviewForAdmin } = await vi.importActual<typeof import("@/lib/admin/imagekit-reconciliation-overview")>("@/lib/admin/imagekit-reconciliation-overview");
    const budget = createImageKitObservationBudget(); budget.close();
    expect(await getImageKitReconciliationOverviewForAdmin(admin, budget)).toEqual({ status: "unavailable", reason: "unavailable" });
    expect(mocks.service).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it("aborts a running overview with the enclosing request and rejects its late response", async () => {
    const { getImageKitReconciliationOverviewForAdmin } = await vi.importActual<typeof import("@/lib/admin/imagekit-reconciliation-overview")>("@/lib/admin/imagekit-reconciliation-overview");
    const late = deferred<{ data: ReturnType<typeof emptyOverview>["overview"]; error: null }>();
    mocks.rpc.mockReturnValue(late.promise);
    const budget = createImageKitObservationBudget();
    const pending = getImageKitReconciliationOverviewForAdmin(admin, budget);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    const signal = late.promise.abortSignal.mock.calls[0]?.[0] as AbortSignal | undefined;
    expect(signal?.aborted).toBe(false); budget.close(); expect(signal?.aborted).toBe(true);
    late.resolve({ data: emptyOverview().overview, error: null });
    expect(await pending).toEqual({ status: "unavailable", reason: "unavailable" });
    expect(mocks.rpc).toHaveBeenCalledTimes(1); expect(mocks.admin).not.toHaveBeenCalled();
  });
});

describe("one explicit bounded observation action", () => {
  it.each([
    [{ ok: true, state: "idle" }, "idle"],
    [{ ok: true, state: "observed", observation: "absent", queueState: "pending" }, "absent"],
    [{ ok: true, state: "observed", observation: "retry", queueState: "pending" }, "retry"],
    [{ ok: true, state: "observed", observation: "unsafe", queueState: "attention" }, "needs-review"],
    [{ ok: true, state: "observed", observation: "absent", queueState: "attention" }, "needs-review"],
    [{ ok: true, state: "observed", observation: "retry", queueState: "attention" }, "needs-review"],
    [{ ok: false, code: "not-admitted" }, "blocked"], [{ ok: false, code: "not-ready" }, "not-ready"],
    [{ ok: false, code: "invalid-lease" }, "unconfirmed"], [{ ok: false, code: "lease-expired" }, "unconfirmed"],
    [{ ok: false, code: "unconfirmed" }, "unconfirmed"],
  ])("projects %j to the safe result %s", async (result, expected) => {
    mocks.run.mockResolvedValue(result); expect(await requestImageKitObservation()).toEqual({ code: expected });
    expect(mocks.entry).toHaveBeenCalledExactlyOnceWith(); expect(mocks.run).toHaveBeenCalledExactlyOnceWith();
    expect(mocks.overview).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each([null, undefined, [], {}, true, "idle", { ok: true, state: "complete" },
    { ok: "true", state: "idle" }, { ok: true, state: "idle", privateKey: "secret" },
    { ok: false, code: "not-admitted", message: "secret provider response" },
    { ok: true, state: "observed", observation: "unsafe", queueState: "pending" },
    { ok: true, state: "observed", observation: "deleted", queueState: "attention" },
  ])("rejects malformed or over-shared worker results %j", async value => {
    mocks.run.mockResolvedValue(value); expect(await requestImageKitObservation()).toEqual({ code: "unconfirmed" });
    expect(mocks.run).toHaveBeenCalledTimes(1);
  });
  it("does not automatically replay an unexpected failure or leak its details", async () => {
    mocks.run.mockRejectedValue(new Error("private key and provider payload"));
    expect(await requestImageKitObservation()).toEqual({ code: "unconfirmed" });
    expect(mocks.run).toHaveBeenCalledTimes(1);
  });
  it("accepts no client-selected account, file, approval or worker arguments", () => {
    expect(requestImageKitObservation.length).toBe(0);
    const source = readFileSync("lib/admin/imagekit-operations-actions.ts", "utf8");
    expect(source).not.toMatch(/approve_imagekit|revoke_imagekit|claim_imagekit|finish_imagekit|setInterval|\bfetch\s*\(/);
    expect(source).not.toMatch(/revalidatePath|revalidateTag|router\.refresh/);
  });
});
