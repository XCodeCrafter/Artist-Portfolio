import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createImageKitObservationAdmission, getImageKitObservationCredentialBinding } from "@/lib/admin/imagekit-observation-admission";
import { createImageKitObservationBudget } from "@/lib/admin/imagekit-observation-contracts";
import { keyedDigest } from "@/lib/admin/security-secret";
import { createImageKitObservationEntry } from "@/lib/admin/imagekit-observation-entry";

const mocks = vi.hoisted(() => ({ admin: vi.fn(), headers: vi.fn(), origin: vi.fn(), credentials: vi.fn(), service: vi.fn(), limit: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/admin/auth", () => ({ getFreshCurrentAdmin: mocks.admin }));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("@/lib/admin/action-security", () => ({ verifyAdminActionOrigin: mocks.origin }));
vi.mock("@/lib/admin/media-upload-config", () => ({ getImageKitObservationCredentials: mocks.credentials }));
vi.mock("@/lib/admin/service", () => ({ createAdminServiceClient: mocks.service }));
vi.mock("@/lib/security/rate-limit", () => ({ consumeDatabaseRateLimit: mocks.limit }));

const actorId = "00000000-0000-4000-8000-000000000001";
const admin = { id: actorId, email: "owner@example.test", role: "owner", hasActiveProfile: true };
const credentials = { imageKitId: "fictional_artist", urlEndpoint: "https://ik.imagekit.io/fictional_artist", publicKey: "public_fictional_test_key", privateKey: "private_fictional_test_key" };
const clock = Date.parse("2026-09-23T12:00:00.000Z");
const revision = "00000000-0000-4000-8000-000000000002";
const budgets: ReturnType<typeof createImageKitObservationBudget>[] = [];
const budget = () => { const item = createImageKitObservationBudget({ now: () => clock, monotonicNow: () => 0 }); budgets.push(item); return item; };
const approval = () => ({ version: 1, storageContainer: credentials.imageKitId, urlEndpoint: credentials.urlEndpoint,
  credentialBinding: getImageKitObservationCredentialBinding(credentials), revision, expiresAt: "2026-09-23T13:00:00.000Z" });
const run = () => createImageKitObservationAdmission()(budget());
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("AUTH_SECURITY_SECRET", "fictional-test-security-secret-longer-than-32");
  vi.stubEnv("SUPABASE_SECRET_KEY", ""); vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
  mocks.admin.mockResolvedValue(admin); mocks.headers.mockResolvedValue(new Headers({ origin: "http://localhost:3102" }));
  mocks.origin.mockResolvedValue(true); mocks.credentials.mockReturnValue(credentials); mocks.service.mockReturnValue({ rpc: mocks.rpc });
  mocks.limit.mockResolvedValue({ allowed: true, configured: true }); mocks.rpc.mockImplementation(async () => ({ data: approval(), error: null }));
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("No provider network allowed"); }));
});
afterEach(() => {
  budgets.splice(0).forEach(item => item.close()); expect(fetch).not.toHaveBeenCalled();
  expect(mocks.rpc.mock.calls.every(([name]) => ["get_imagekit_observation_approval_v1", "get_imagekit_upload_readiness_v1", "claim_imagekit_observation_v1"].includes(name))).toBe(true);
  vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers();
});

describe("dormant authenticated observation admission", () => {
  it("admits only a live admin, exact origin, configured credentials, shared quotas and DB approval", async () => {
    const value = await run(); expect(value.ok).toBe(true); if (!value.ok) throw new Error("Expected fixture admission");
    expect(value).toMatchObject({ actorId, credentials, approval: approval() });
    expect(value.workerId).toMatch(/^observe:[0-9a-f-]{36}$/); expect(Object.isFrozen(value.credentials)).toBe(true);
    expect(mocks.origin).toHaveBeenCalledWith(actorId, "imagekit:observation", false);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("get_imagekit_observation_approval_v1", {
      p_actor_id: actorId, p_storage_container: credentials.imageKitId, p_url_endpoint: credentials.urlEndpoint,
      p_credential_binding: getImageKitObservationCredentialBinding(credentials),
    });
  });
  it.each([null, { ...admin, hasActiveProfile: false }, { ...admin, role: "viewer" }])("denies missing or inactive admin %j before reading config", async value => {
    mocks.admin.mockResolvedValue(value); expect(await run()).toEqual({ ok: false });
    expect(mocks.headers).not.toHaveBeenCalled(); expect(mocks.credentials).not.toHaveBeenCalled(); expect(mocks.limit).not.toHaveBeenCalled();
  });
  it("accepts an active non-owner admin only with an already existing owner approval", async () => {
    mocks.admin.mockResolvedValue({ ...admin, role: "admin" }); expect((await run()).ok).toBe(true);
    expect(mocks.rpc.mock.calls.map(([name]) => name)).toEqual(["get_imagekit_observation_approval_v1"]);
  });
  it.each([null, "null", "https://site.test/", "https://site.test/path", "https://site.test?x=1", "https://user:password@site.test",
    "https://site.test:443", "HTTPS://SITE.TEST", "file://site.test", "ftp://site.test"])("denies missing or noncanonical Origin %j", async origin => {
    const headers = new Headers({ referer: "http://localhost:3102/admin/v2" }); if (origin !== null) headers.set("origin", origin);
    mocks.headers.mockResolvedValue(headers); expect(await run()).toEqual({ ok: false });
    expect(mocks.origin).not.toHaveBeenCalled(); expect(mocks.credentials).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("denies the wrong configured Origin without producing unmetered audit writes", async () => {
    mocks.origin.mockResolvedValue(false); expect(await run()).toEqual({ ok: false });
    expect(mocks.origin).toHaveBeenCalledWith(actorId, "imagekit:observation", false);
    expect(mocks.credentials).not.toHaveBeenCalled(); expect(mocks.limit).not.toHaveBeenCalled();
  });
  it("denies unavailable observation config without quotas or database access", async () => {
    mocks.credentials.mockReturnValue(null); expect(await run()).toEqual({ ok: false });
    expect(mocks.service).not.toHaveBeenCalled(); expect(mocks.limit).not.toHaveBeenCalled();
  });
  it.each(["", "too-short"])("requires a real-length security secret (%j)", async secret => {
    vi.stubEnv("AUTH_SECURITY_SECRET", secret); expect(await run()).toEqual({ ok: false });
    expect(mocks.service).not.toHaveBeenCalled(); expect(mocks.limit).not.toHaveBeenCalled();
  });
  it("denies a missing service client before quota use", async () => {
    mocks.service.mockReturnValue(null); expect(await run()).toEqual({ ok: false }); expect(mocks.limit).not.toHaveBeenCalled();
  });
  it.each([0, 1, 2])("fails closed at quota %i and never reaches approval", async index => {
    for (let i = 0; i < index; i++) mocks.limit.mockResolvedValueOnce({ allowed: true, configured: true });
    mocks.limit.mockResolvedValueOnce({ allowed: false, configured: true }); expect(await run()).toEqual({ ok: false });
    expect(mocks.limit).toHaveBeenCalledTimes(index + 1); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each([null, {}, { allowed: true, configured: false }, { allowed: "true", configured: true }])("denies unreliable quota replies %j", async value => {
    mocks.limit.mockResolvedValue(value); expect(await run()).toEqual({ ok: false }); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("uses all three server-selected shared, fail-closed quotas", async () => {
    await run(); expect(mocks.limit.mock.calls.map(([input]) => input)).toEqual([
      { bucket: "imagekit-observe:actor", identifierHash: keyedDigest("imagekit-observation-actor:v1", actorId), limit: 3, windowSeconds: 60, failClosed: true },
      { bucket: "imagekit-observe:account", identifierHash: keyedDigest("imagekit-observation-account:v1", credentials.imageKitId), limit: 6, windowSeconds: 60, failClosed: true },
      { bucket: "imagekit-observe:account-day", identifierHash: keyedDigest("imagekit-observation-account:v1", credentials.imageKitId), limit: 300, windowSeconds: 86_400, failClosed: true },
    ]);
  });
  it("keeps account quota keys stable across admins and credential-pair rotation", async () => {
    await run(); const original = mocks.limit.mock.calls.map(([input]) => input);
    mocks.admin.mockResolvedValue({ ...admin, id: "00000000-0000-4000-8000-000000000009" });
    mocks.credentials.mockReturnValue({ ...credentials, publicKey: "public_rotated_fictional_key", privateKey: "private_rotated_fictional_key" });
    await run(); const next = mocks.limit.mock.calls.slice(3).map(([input]) => input);
    expect(next[0].identifierHash).not.toBe(original[0].identifierHash); expect(next.slice(1)).toEqual(original.slice(1));
  });
  it.each([null, {}, [], { approved: true }])("rejects missing or unstructured approval %j", async data => {
    mocks.rpc.mockResolvedValue({ data, error: null }); expect(await run()).toEqual({ ok: false });
  });
  it.each([{ storageContainer: "another_account" }, { urlEndpoint: "https://ik.imagekit.io/another_account" },
    { credentialBinding: "b".repeat(64) }, { revision: "not-a-version" }, { expiresAt: "2026-09-23T12:00:35.000Z" }])("rejects foreign or expired approval %j", async changes => {
    mocks.rpc.mockResolvedValue({ data: { ...approval(), ...changes }, error: null }); expect(await run()).toEqual({ ok: false });
  });
  it("requires an error-free approval read even if a valid projection is returned", async () => {
    mocks.rpc.mockResolvedValue({ data: approval(), error: { message: credentials.privateKey } }); expect(await run()).toEqual({ ok: false });
  });
  it.each(["admin", "headers", "origin", "credentials", "service", "limit", "rpc"] as const)("redacts failures from %s", async stage => {
    mocks[stage].mockImplementation(() => { throw new Error(`${credentials.privateKey}:${credentials.publicKey}:private-table`); });
    expect(await run()).toEqual({ ok: false });
  });
  it.each(["admin", "limit", "rpc"] as const)("a late %s response after timeout starts no further operations", async stage => {
    vi.useFakeTimers(); let resolve!: (value: unknown) => void;
    mocks[stage].mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const pending = run(); await vi.advanceTimersByTimeAsync(30_000); expect(await pending).toEqual({ ok: false });
    const before = [mocks.headers, mocks.origin, mocks.credentials, mocks.service, mocks.limit, mocks.rpc].map(fn => fn.mock.calls.length);
    resolve(stage === "admin" ? admin : stage === "limit" ? { allowed: true, configured: true } : { data: approval(), error: null });
    await vi.advanceTimersByTimeAsync(1);
    expect([mocks.headers, mocks.origin, mocks.credentials, mocks.service, mocks.limit, mocks.rpc].map(fn => fn.mock.calls.length)).toEqual(before);
  });
});

describe("live session and approval revalidation", () => {
  async function admitted() { const value = await run(); if (!value.ok) throw new Error("Expected fixture admission"); return value; }
  it("rechecks auth, exact Origin, credentials and approval without spending quotas again", async () => {
    const value = await admitted(); expect(await value.revalidate(budget())).toBe(true);
    expect(mocks.admin).toHaveBeenCalledTimes(2); expect(mocks.origin).toHaveBeenCalledTimes(2);
    expect(mocks.rpc).toHaveBeenCalledTimes(2); expect(mocks.limit).toHaveBeenCalledTimes(3);
  });
  it.each([null, { ...admin, id: "00000000-0000-4000-8000-000000000003" }, { ...admin, hasActiveProfile: false }, { ...admin, role: "viewer" }])("denies changed or revoked identity %j", async current => {
    const value = await admitted(); mocks.admin.mockResolvedValue(current); expect(await value.revalidate(budget())).toBe(false);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it("denies a revoked Origin allowlist", async () => {
    const value = await admitted(); mocks.origin.mockResolvedValue(false); expect(await value.revalidate(budget())).toBe(false); expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it.each([null, { ...credentials, privateKey: "private_rotated_fictional_key" }, { ...credentials, publicKey: "public_rotated_fictional_key" },
    { ...credentials, imageKitId: "other_account", urlEndpoint: "https://ik.imagekit.io/other_account" }])("denies disabled or changed config %j", async current => {
    const value = await admitted(); mocks.credentials.mockReturnValue(current); expect(await value.revalidate(budget())).toBe(false); expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it.each(["", "another-fictional-security-secret-more-than-32"])("denies removal or rotation of the binding secret (%j)", async secret => {
    const value = await admitted(); vi.stubEnv("AUTH_SECURITY_SECRET", secret); expect(await value.revalidate(budget())).toBe(false); expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it.each([null, { revision: "00000000-0000-4000-8000-000000000003" }, { expiresAt: "2026-09-23T13:01:00.000Z" },
    { expiresAt: "2026-09-23T12:00:05.000Z" }, { credentialBinding: "b".repeat(64) }])("denies revoked/reissued/changed approval %j", async changes => {
    const value = await admitted(); mocks.rpc.mockResolvedValue({ data: changes === null ? null : { ...approval(), ...changes }, error: null });
    expect(await value.revalidate(budget())).toBe(false);
  });
  it("denies revalidation after the shared budget closes without another auth call", async () => {
    const value = await admitted(); const item = budget(); item.close(); expect(await value.revalidate(item)).toBe(false); expect(mocks.admin).toHaveBeenCalledTimes(1);
  });
  it("denies rather than leaking a live-auth backend failure", async () => {
    const value = await admitted(); mocks.admin.mockRejectedValue(new Error(credentials.privateKey)); expect(await value.revalidate(budget())).toBe(false);
  });
});

describe("server-only manual entry boundary", () => {
  it("composes the default entry with real admission, revalidation and one scoped idle claim", async () => {
    vi.useFakeTimers(); vi.setSystemTime(clock);
    mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "get_imagekit_observation_approval_v1" ? approval()
      : name === "get_imagekit_upload_readiness_v1" ? { version: 1, ready: true }
      : name === "claim_imagekit_observation_v1" ? [] : null, error: null }));
    expect(await createImageKitObservationEntry().runOnce()).toEqual({ ok: true, state: "idle" });
    expect(mocks.rpc.mock.calls.map(([name]) => name)).toEqual([
      "get_imagekit_observation_approval_v1", "get_imagekit_upload_readiness_v1",
      "get_imagekit_observation_approval_v1", "claim_imagekit_observation_v1",
    ]);
    expect(mocks.rpc).toHaveBeenLastCalledWith("claim_imagekit_observation_v1", {
      p_actor_id: actorId, p_storage_container: credentials.imageKitId, p_url_endpoint: credentials.urlEndpoint,
      p_credential_binding: getImageKitObservationCredentialBinding(credentials), p_approval_revision: revision,
      p_worker_id: expect.stringMatching(/^observe:[0-9a-f-]{36}$/),
    });
    expect(mocks.admin).toHaveBeenCalledTimes(2); expect(mocks.limit).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("allows only the reviewed manual server action to call the entry and never creates an approval", () => {
    const walk = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap(item => {
      const path = join(directory, item.name); return item.isDirectory() ? walk(path) : /\.[cm]?[jt]sx?$/.test(item.name) ? [path] : [];
    });
    for (const path of [...walk("app"), ...walk("components")]) {
      expect(readFileSync(path, "utf8"), path).not.toMatch(/imagekit-observation-(entry|admission)|createImageKitObservationEntry/);
    }
    const entryCallers = walk("lib").filter(path => !path.endsWith("imagekit-observation-entry.ts") &&
      /imagekit-observation-entry|createImageKitObservationEntry/.test(readFileSync(path, "utf8")));
    expect(entryCallers).toEqual([join("lib", "admin", "imagekit-operations-actions.ts")]);
    const caller = readFileSync(entryCallers[0], "utf8");
    expect(caller).toMatch(/^["']use server["']/);
    expect(caller).not.toMatch(/approve_imagekit|revoke_imagekit|setInterval|\bfetch\s*\(|method:\s*["'](?:DELETE|PUT|PATCH)["']/);
    const source = readFileSync("lib/admin/imagekit-observation-entry.ts", "utf8");
    expect(source).toContain('import "server-only"'); expect(source).not.toContain('"use server"');
    expect(source).not.toMatch(/\bfetch\s*\(|approve_imagekit|revoke_imagekit|cron|POST\s*\(/);
    const admissionSource = readFileSync("lib/admin/imagekit-observation-admission.ts", "utf8");
    expect(admissionSource).not.toMatch(/approve_imagekit|revoke_imagekit|\bfetch\s*\(/);
  });
});
