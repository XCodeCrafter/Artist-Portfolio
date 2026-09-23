import { EventEmitter } from "node:events";
import type { request as nativeRequest } from "node:http";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ACCEPTANCE_BUCKET_OPTIONS, buildAcceptanceRequest, provisionAcceptanceWorkspace, requestAcceptanceApi } from "../scripts/acceptance/provision.mjs";
import { ACCEPTANCE_ADMIN_EMAIL, ACCEPTANCE_API_ORIGIN, ACCEPTANCE_MEDIA_BUCKET, ACCEPTANCE_PROJECT_ID, ACCEPTANCE_TARGET } from "../scripts/acceptance/isolation.mjs";

const workspaceId = "13a00000-0000-4000-8000-000000000001";
const ownerId = "13a00000-0000-4000-8000-000000000002";
const workspace = path.resolve("test-workspace", workspaceId);
const cliPath = path.resolve("test-tools", "supabase.exe");
const password = "Acceptance_Only_Fixture_Password_1234567890";
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
const jwt = (role: string) => `${encode({ alg: "HS256" })}.${encode({ iss: "supabase-demo", role })}.synthetic_signature`;
const anonKey = jwt("anon");
const serviceRoleKey = jwt("service_role");
const headers = { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` };
const owner = { id: ownerId, email: ACCEPTANCE_ADMIN_EMAIL, email_confirmed_at: "2026-09-22T12:00:00Z" };
const profile = { user_id: ownerId, email: ACCEPTANCE_ADMIN_EMAIL, role: "owner", is_active: true };
const manifest = { id: workspaceId, target: ACCEPTANCE_TARGET };
const status = { API_URL: ACCEPTANCE_API_ORIGIN, ANON_KEY: anonKey, SERVICE_ROLE_KEY: serviceRoleKey, DB_URL: "must-not-persist" };
const regularFile = { isFile: () => true, isSymbolicLink: () => false };

function setup(overrides: Record<number, unknown> = {}) {
  const events: string[] = [];
  const responses = [
    [{ id: workspaceId, project_id: ACCEPTANCE_PROJECT_ID }],
    { disable_signup: true, external: { anonymous_users: false, email: true } },
    { users: [], total: 0 }, [], owner, [profile], owner, [profile], [], { name: ACCEPTANCE_MEDIA_BUCKET }, ACCEPTANCE_BUCKET_OPTIONS,
  ];
  for (const [index, value] of Object.entries(overrides)) responses[Number(index)] = value as never;
  let index = 0;
  const deps = {
    verifyWorkspace: vi.fn(async () => manifest),
    verifyBindings: vi.fn(async (_workspace: string) => { void _workspace; events.push("verify:bindings"); }),
    stat: vi.fn(async (filename: string) => {
      if (filename === cliPath) return regularFile;
      throw Object.assign(new Error("missing"), { code: "ENOENT" });
    }),
    realpath: vi.fn(async (filename: string) => filename),
    writeFile: vi.fn(async (filename: string, content: string, options: { flag: string; mode: number }) => {
      void content; void options;
      events.push(`write:${path.basename(filename)}`);
    }),
    execute: vi.fn(() => JSON.stringify(status)),
    password: vi.fn(() => password),
    request: vi.fn(async (url: string, options: { method?: string; body?: string }) => {
      const response = responses[index++];
      events.push(`${options.method ?? "GET"}:${new URL(url).pathname}`);
      if (response instanceof Error) throw response;
      if (response instanceof Response) return response;
      return Response.json(response);
    }),
  };
  return { deps, events };
}

describe("local acceptance provisioning", () => {
  it("verifies identity before storing stripped status, then privately saves the password before creating a genuine local account", async () => {
    const { deps, events } = setup();
    const result = await provisionAcceptanceWorkspace(workspace, cliPath, deps);
    expect(result).toEqual({ ownerId, email: ACCEPTANCE_ADMIN_EMAIL, bucket: ACCEPTANCE_MEDIA_BUCKET });
    expect(JSON.stringify(result)).not.toContain(password);
    expect(deps.verifyWorkspace).toHaveBeenCalledOnce();
    expect(deps.verifyBindings).toHaveBeenCalledExactlyOnceWith(workspace);
    expect(deps.execute).toHaveBeenCalledWith(cliPath, ["--workdir", workspace, "status", "-o", "json"], expect.objectContaining({
      cwd: workspace, stdio: "pipe", encoding: "utf8", timeout: 15000, maxBuffer: 131072, windowsHide: true,
    }));
    const writes = deps.writeFile.mock.calls;
    expect(writes).toHaveLength(2);
    expect(writes[0]).toEqual([path.join(workspace, "local-status.json"), JSON.stringify({
      API_URL: ACCEPTANCE_API_ORIGIN, ANON_KEY: anonKey, SERVICE_ROLE_KEY: serviceRoleKey,
    }, null, 2) + "\n", { flag: "wx", mode: 0o600 }]);
    expect(JSON.parse(writes[1][1] as unknown as string)).toEqual({
      version: 1, workspaceId, apiOrigin: ACCEPTANCE_API_ORIGIN, email: ACCEPTANCE_ADMIN_EMAIL, password,
    });
    expect(events.indexOf("write:local-status.json")).toBeGreaterThan(events.indexOf("GET:/auth/v1/settings"));
    expect(events[0]).toBe("verify:bindings");
    expect(events.indexOf("write:local-owner.json")).toBeLessThan(events.indexOf("POST:/auth/v1/admin/users"));
    const create = deps.request.mock.calls.find(([, options]) => options.method === "POST" && options.body?.includes("email_confirm"));
    expect(create?.[0]).toBe(`${ACCEPTANCE_API_ORIGIN}/auth/v1/admin/users`);
    expect(JSON.parse(create![1].body!)).toEqual({ email: ACCEPTANCE_ADMIN_EMAIL, password, email_confirm: true });
    expect(events.filter((item) => item.startsWith("POST:"))).toEqual([
      "POST:/auth/v1/admin/users", "POST:/rest/v1/admin_profiles", "POST:/storage/v1/bucket",
    ]);
  });

  it("never inherits provider keys, proxy configuration, or Node injection into the CLI", async () => {
    vi.stubEnv("SUPABASE_ACCESS_TOKEN", "private-token");
    vi.stubEnv("HTTPS_PROXY", "https://private-proxy.test");
    vi.stubEnv("NODE_OPTIONS", "--inspect");
    try {
      const { deps } = setup();
      await provisionAcceptanceWorkspace(workspace, cliPath, deps);
      const call = deps.execute.mock.calls[0] as unknown as [string, string[], { env: Record<string, string> }];
      expect(call[2].env).not.toHaveProperty("SUPABASE_ACCESS_TOKEN");
      expect(call[2].env).not.toHaveProperty("HTTPS_PROXY");
      expect(call[2].env).not.toHaveProperty("NODE_OPTIONS");
    } finally { vi.unstubAllEnvs(); }
  });

  it("fails closed before CLI or writes if workspace verification fails", async () => {
    const { deps } = setup();
    deps.verifyWorkspace.mockRejectedValueOnce(new Error("wrong workspace"));
    await expect(provisionAcceptanceWorkspace(workspace, cliPath, deps)).rejects.toThrow("wrong workspace");
    expect(deps.execute).not.toHaveBeenCalled();
    expect(deps.writeFile).not.toHaveBeenCalled();
    expect(deps.verifyBindings).not.toHaveBeenCalled();
  });

  it("refuses unsafe runtime port bindings before reading CLI credentials or making any request/write", async () => {
    const { deps } = setup();
    deps.verifyBindings.mockRejectedValueOnce(new Error("Acceptance ports are not confined to loopback"));
    await expect(provisionAcceptanceWorkspace(workspace, cliPath, deps)).rejects.toThrow("not confined to loopback");
    expect(deps.execute).not.toHaveBeenCalled();
    expect(deps.stat).not.toHaveBeenCalled();
    expect(deps.request).not.toHaveBeenCalled();
    expect(deps.writeFile).not.toHaveBeenCalled();
    expect(deps.password).not.toHaveBeenCalled();
  });

  it.each(["local-status.json", "local-owner.json"])("refuses existing %s without overwrite or account changes", async (filename) => {
    const { deps } = setup();
    deps.stat.mockImplementation(async (candidate: string) => {
      if (candidate === cliPath || candidate === path.join(workspace, filename)) return regularFile;
      throw Object.assign(new Error("missing"), { code: "ENOENT" });
    });
    await expect(provisionAcceptanceWorkspace(workspace, cliPath, deps)).rejects.toThrow("already exist");
    expect(deps.execute).not.toHaveBeenCalled();
    expect(deps.request).not.toHaveBeenCalled();
  });

  it.each(["supabase.exe", path.resolve("test-tools", "npm.cmd"), path.resolve("test-tools", "supabase.exe.bat")])("refuses an unapproved binary path %s", async (binary) => {
    const { deps } = setup();
    await expect(provisionAcceptanceWorkspace(workspace, binary, deps)).rejects.toThrow();
    expect(deps.execute).not.toHaveBeenCalled();
  });

  it("refuses linked CLI executables", async () => {
    const { deps } = setup();
    deps.stat.mockResolvedValue({ isFile: () => true, isSymbolicLink: () => true });
    await expect(provisionAcceptanceWorkspace(workspace, cliPath, deps)).rejects.toThrow("verified regular");
    expect(deps.execute).not.toHaveBeenCalled();
  });

  it("does not store hosted CLI status or call its API", async () => {
    const { deps } = setup();
    deps.execute.mockReturnValue(JSON.stringify({ ...status, API_URL: "https://hosted.supabase.co" }));
    await expect(provisionAcceptanceWorkspace(workspace, cliPath, deps)).rejects.toThrow("loopback");
    expect(deps.writeFile).not.toHaveBeenCalled();
    expect(deps.request).not.toHaveBeenCalled();
  });

  it("sanitizes CLI failures", async () => {
    const { deps } = setup();
    deps.execute.mockImplementation(() => { throw new Error("private-service-key"); });
    await expect(provisionAcceptanceWorkspace(workspace, cliPath, deps)).rejects.toThrow("output hidden");
    await expect(provisionAcceptanceWorkspace(workspace, cliPath, deps)).rejects.not.toThrow("private-service-key");
    expect(deps.writeFile).not.toHaveBeenCalled();
  });

  it.each([
    { 0: [{ id: ownerId, project_id: ACCEPTANCE_PROJECT_ID }] },
    { 1: { disable_signup: false, external: { anonymous_users: false, email: true } } },
    { 1: { disable_signup: true, external: { anonymous_users: true, email: true } } },
    { 1: { disable_signup: true, external: { anonymous_users: false, email: false } } },
    { 1: { disable_signup: true, external: { anonymous_users: false } } },
  ])("requires matching marker, closed signup and enabled email sign-in before private files or mutations", async (overrides) => {
    const { deps } = setup(overrides);
    await expect(provisionAcceptanceWorkspace(workspace, cliPath, deps)).rejects.toThrow();
    expect(deps.writeFile).not.toHaveBeenCalled();
    expect(deps.request.mock.calls.every(([, options]) => !options.method || options.method === "GET")).toBe(true);
  });

  it.each([
    { 2: { users: [owner], total: 1 } }, { 2: { users: [], total: 1 } },
    { 2: {} }, { 3: [profile] }, { 3: {} },
  ])("requires empty and well-formed user/profile lists", async (overrides) => {
    const { deps } = setup(overrides);
    await expect(provisionAcceptanceWorkspace(workspace, cliPath, deps)).rejects.toThrow("requires empty");
    expect(deps.writeFile).toHaveBeenCalledTimes(1);
    expect(deps.password).not.toHaveBeenCalled();
    expect(deps.request.mock.calls.every(([, options]) => !options.method || options.method === "GET")).toBe(true);
  });

  it("stops before user creation if exclusive password-file creation fails", async () => {
    const { deps } = setup();
    deps.writeFile.mockResolvedValueOnce(undefined).mockRejectedValueOnce(Object.assign(new Error("private filesystem data"), { code: "EEXIST" }));
    await expect(provisionAcceptanceWorkspace(workspace, cliPath, deps)).rejects.toThrow("exclusively save");
    expect(deps.request.mock.calls.every(([, options]) => !options.method || options.method === "GET")).toBe(true);
  });

  it("preserves local credentials and stops after a failed create without retry/delete", async () => {
    const { deps, events } = setup({ 4: new Error("sensitive-service-response") });
    await expect(provisionAcceptanceWorkspace(workspace, cliPath, deps)).rejects.toThrow("response and credentials hidden");
    expect(deps.writeFile).toHaveBeenCalledTimes(2);
    expect(events.filter((item) => item.startsWith("POST:"))).toEqual(["POST:/auth/v1/admin/users"]);
  });

  it.each([
    { ...owner, id: "../different-user" }, { ...owner, id: `${ownerId}\n` }, { ...owner, id: 12 },
    { ...owner, email: "someone@example.test" },
    { ...owner, email_confirmed_at: null },
  ])("does not create a profile when the Auth response fails verification", async (account) => {
    const { deps, events } = setup({ 4: account });
    await expect(provisionAcceptanceWorkspace(workspace, cliPath, deps)).rejects.toThrow("account could not be verified");
    expect(events.filter((item) => item.startsWith("POST:"))).toEqual(["POST:/auth/v1/admin/users"]);
  });

  it("does not proceed to bucket creation after a partial profile failure", async () => {
    const { deps, events } = setup({ 5: Response.json({ error: "private-response" }, { status: 400 }) });
    await expect(provisionAcceptanceWorkspace(workspace, cliPath, deps)).rejects.toThrow("credentials hidden");
    expect(events.some((event) => event.includes("/storage/"))).toBe(false);
    expect(deps.writeFile).toHaveBeenCalledTimes(2);
  });

  it("does not mutate an existing dedicated bucket with a mismatched configuration", async () => {
    const { deps, events } = setup({ 8: [ACCEPTANCE_BUCKET_OPTIONS], 9: { ...ACCEPTANCE_BUCKET_OPTIONS, public: false } });
    await expect(provisionAcceptanceWorkspace(workspace, cliPath, deps)).rejects.toThrow("configuration differs");
    expect(events.filter((event) => event.startsWith("POST:/storage/"))).toEqual([]);
  });

  it.each([null, {}, [null], [{ id: ACCEPTANCE_MEDIA_BUCKET }], [ACCEPTANCE_BUCKET_OPTIONS, ACCEPTANCE_BUCKET_OPTIONS]])(
    "refuses malformed or duplicate bucket inventories without any storage mutation", async (inventory) => {
      const { deps, events } = setup({ 8: inventory });
      await expect(provisionAcceptanceWorkspace(workspace, cliPath, deps)).rejects.toThrow("credentials hidden");
      expect(events.filter((event) => event.startsWith("POST:/storage/"))).toEqual([]);
    },
  );
});

describe("provisioning HTTP boundary", () => {
  it.each([
    "http://localhost:55431/auth/v1/admin/users", "http://127.0.0.1:54321/auth/v1/admin/users",
    "https://hosted.supabase.co/auth/v1/admin/users", "http://user@127.0.0.1:55431/auth/v1/admin/users",
    `${ACCEPTANCE_API_ORIGIN}/auth/v1/../admin/users`, `${ACCEPTANCE_API_ORIGIN}/auth/v1/admin/users#x`,
    `${ACCEPTANCE_API_ORIGIN}.example.test/auth/v1/admin/users`,
  ])("rejects wrong, aliased, normalized or credentialed target %s", (url) => {
    const transport = vi.fn();
    expect(() => requestAcceptanceApi(url, { headers }, transport)).toThrow();
    expect(transport).not.toHaveBeenCalled();
  });

  it.each([
    { ...headers, Host: "hosted.supabase.co" }, { ...headers, "Proxy-Authorization": "private" },
    { ...headers, Authorization: "Bearer wrong" }, { ...headers, apikey: "secret\r\nX-Test: private" },
    { ...headers, authorization: headers.Authorization }, {},
  ])("rejects injected, duplicate or missing credentials/headers", (requestHeaders) => {
    expect(() => buildAcceptanceRequest(`${ACCEPTANCE_API_ORIGIN}/auth/v1/admin/users`, { headers: requestHeaders })).toThrow();
  });

  it("uses direct native transport with a bounded signal and no environment proxy", () => {
    const input = buildAcceptanceRequest(`${ACCEPTANCE_API_ORIGIN}/auth/v1/admin/users`, {
      method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: "{}",
    });
    expect(input.target.origin).toBe(ACCEPTANCE_API_ORIGIN);
    expect(input.options.agent).toBe(false);
    expect(input.options.signal).toBeInstanceOf(AbortSignal);
    expect(input.options.headers.authorization).toBe(headers.Authorization);
  });

  it.each(["DELETE", "PUT", "PATCH"])("never supports destructive method %s", (method) => {
    expect(() => buildAcceptanceRequest(`${ACCEPTANCE_API_ORIGIN}/rest/v1/admin_profiles`, { method, headers })).toThrow("only supports");
  });

  it("rejects oversized or GET bodies", () => {
    expect(() => buildAcceptanceRequest(`${ACCEPTANCE_API_ORIGIN}/`, { headers, body: "{}" })).toThrow("request body");
    expect(() => buildAcceptanceRequest(`${ACCEPTANCE_API_ORIGIN}/`, { headers, method: "POST", body: "x".repeat(16385) })).toThrow("request body");
  });

  function transportFixture(statusCode: number, body: string) {
    const request = Object.assign(new EventEmitter(), { write: vi.fn(), end: vi.fn(), destroy: vi.fn() });
    const transport = vi.fn((_url: unknown, _options: unknown, callback: (response: EventEmitter & { statusCode: number }) => void) => {
      request.end.mockImplementation(() => {
        const response = Object.assign(new EventEmitter(), { statusCode });
        callback(response);
        response.emit("data", Buffer.from(body));
        response.emit("end");
      });
      return request;
    });
    return { transport, request };
  }

  it("returns redirect failure without following its target", async () => {
    const { transport } = transportFixture(302, "{}");
    const result = await requestAcceptanceApi(`${ACCEPTANCE_API_ORIGIN}/auth/v1/settings`, { headers }, transport as unknown as typeof nativeRequest) as { ok: boolean };
    expect(result.ok).toBe(false);
    expect(transport).toHaveBeenCalledOnce();
  });

  it("bounds response bytes and never includes response contents in errors", async () => {
    const { transport, request } = transportFixture(200, "private".repeat(20000));
    await expect(requestAcceptanceApi(`${ACCEPTANCE_API_ORIGIN}/auth/v1/settings`, { headers }, transport as unknown as typeof nativeRequest)).rejects.toThrow("credentials hidden");
    expect(request.destroy).toHaveBeenCalledOnce();
  });

  it("sanitizes non-JSON service responses", async () => {
    const { transport } = transportFixture(200, "private-response-token");
    const result = await requestAcceptanceApi(`${ACCEPTANCE_API_ORIGIN}/auth/v1/settings`, { headers }, transport as unknown as typeof nativeRequest) as { json: () => Promise<unknown> };
    await expect(result.json()).rejects.toThrow("credentials hidden");
    await expect(result.json()).rejects.not.toThrow("private-response-token");
  });
});
