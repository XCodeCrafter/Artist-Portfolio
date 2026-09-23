import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  acceptanceBase, assertWorkspaceLocation, buildIdentitySql, buildMigrationPlan,
} from "../scripts/acceptance/workspace.mjs";
import { parseLocalStatus, verifyLocalApi } from "../scripts/acceptance.mjs";
import { ACCEPTANCE_API_ORIGIN, ACCEPTANCE_PROJECT_ID } from "../scripts/acceptance/isolation.mjs";

const workspaceId = "13a00000-0000-4000-8000-000000000001";
const manifest = { id: workspaceId };
const repoRoot = path.resolve(".");
function jwt(role: string, extra: Record<string, unknown> = {}) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ iss: "supabase-demo", role, ...extra })}.synthetic_signature`;
}
const credentials = { anonKey: jwt("anon"), serviceRoleKey: jwt("service_role") };
const status = { API_URL: ACCEPTANCE_API_ORIGIN, ANON_KEY: credentials.anonKey, SERVICE_ROLE_KEY: credentials.serviceRoleKey };
const identity = [{ id: workspaceId, project_id: ACCEPTANCE_PROJECT_ID }];
const settings = { disable_signup: true, external: { anonymous_users: false, email: true } };

describe("acceptance migration plan", () => {
  it("copies every current migration byte-for-byte by source name with a bootstrap immediately after 0001", () => {
    const source = readdirSync(path.join(repoRoot, "supabase/migrations")).filter((name) => name.endsWith(".sql")).reverse();
    const original = [...source];
    const plan = buildMigrationPlan(source);
    expect(source).toEqual(original);
    expect(plan).toHaveLength(source.length + 1);
    expect(plan[0].source).toBe("0001_initial_schema.sql");
    expect(plan[1].source).toBeNull();
    expect(plan[1].generated).toBe("20200101000001_acceptance_bootstrap.sql");
    expect(plan.filter((item) => item.source !== null).map((item) => item.source)).toEqual([...source].sort());
    expect(new Set(plan.map((item) => item.generated.slice(0, 14))).size).toBe(plan.length);
    expect(plan.map((item) => item.generated)).toEqual(plan.map((item) => item.generated).sort());
    for (const item of plan) expect(item.generated).toMatch(/^\d{14}_[a-z0-9_]+\.sql$/);
  });

  it.each([
    [], ["0002_second.sql"], ["0001_first.sql", "0001_first.sql"],
    ["0001_first.sql", "0001_duplicate_prefix.sql"], ["0001_../escape.sql"],
    ["0001_first.sql", "../../0002_external.sql"], ["0001_first.sql", "0002_UPPER.sql"],
    ["0001_first.sql", "0002_second.sql\n"], ["0001_first.sql", "0002_second.sql:stream"],
  ].map((files) => ({ files })))("rejects missing, ambiguous, malformed or path-like migration names: $files", ({ files }) => {
    expect(() => buildMigrationPlan(files)).toThrow();
  });
});

describe("acceptance database identity", () => {
  it("creates a private RLS marker readable only through the service role", () => {
    const sql = buildIdentitySql(workspaceId);
    expect(sql).toContain("alter table public.acceptance_environment enable row level security");
    expect(sql).toContain("revoke all on table public.acceptance_environment from public, anon, authenticated");
    expect(sql).toContain("grant select on table public.acceptance_environment to service_role");
    expect(sql).toContain(`('${workspaceId}', '${ACCEPTANCE_PROJECT_ID}')`);
    expect(sql).not.toMatch(/grant .* to (?:anon|authenticated)|delete|truncate|update auth/i);
  });

  it.each(["", "not-a-uuid", workspaceId + "\n", workspaceId + "\r", workspaceId + " ", ` ${workspaceId}`, "00000000-0000-0000-0000-000000000000", "13a00000-0000-4000-7000-000000000001", "'; drop table public.site_settings; --"])(
    "rejects malformed/injectable identity %j", (id) => {
      expect(() => buildIdentitySql(id)).toThrow("Invalid acceptance workspace identity");
    },
  );
});

describe("acceptance workspace location", () => {
  it("accepts only a generated v4 UUID directly below the repository-specific temp base", () => {
    const workspace = path.join(acceptanceBase(repoRoot), workspaceId);
    expect(assertWorkspaceLocation(workspace, repoRoot)).toBe(workspace);
    expect(acceptanceBase(path.join(repoRoot, "other-project"))).not.toBe(acceptanceBase(repoRoot));
  });

  it.each([
    repoRoot, path.join(repoRoot, workspaceId), acceptanceBase(repoRoot),
    path.join(acceptanceBase(repoRoot), "arbitrary"),
    path.join(acceptanceBase(repoRoot), workspaceId, "nested"),
    path.join(acceptanceBase(repoRoot), "..", workspaceId),
    path.join(acceptanceBase(repoRoot), workspaceId + "\n"),
    path.join(acceptanceBase(repoRoot), workspaceId + ":stream"),
    path.join(acceptanceBase(path.join(repoRoot, "other-project")), workspaceId),
  ])("rejects arbitrary, nested, escaped and malformed workspace path %j", (workspace) => {
    expect(() => assertWorkspaceLocation(workspace, repoRoot)).toThrow();
  });
});

describe("local status parsing", () => {
  it("accepts local CLI JSON with or without BOM and discards unrelated fields", () => {
    expect(parseLocalStatus(JSON.stringify(status))).toEqual(credentials);
    expect(parseLocalStatus("\uFEFF" + JSON.stringify({ ...status, STUDIO_URL: "unused", DB_URL: "not forwarded" }))).toEqual(credentials);
  });

  it.each([
    "not JSON", "null", "[]", "{}", JSON.stringify({ ...status, API_URL: "https://hosted.supabase.co" }),
    JSON.stringify({ ...status, API_URL: "http://127.0.0.1:54321" }),
    JSON.stringify({ ...status, API_URL: ACCEPTANCE_API_ORIGIN + "/" }),
    JSON.stringify({ ...status, API_URL: "http://localhost:55431" }),
    JSON.stringify({ ...status, API_URL: ACCEPTANCE_API_ORIGIN + "@hosted.test" }),
    JSON.stringify({ ...status, ANON_KEY: jwt("anon", { iss: "supabase", ref: "hosted" }) }),
    JSON.stringify({ ...status, SERVICE_ROLE_KEY: credentials.anonKey }),
    JSON.stringify({ ...status, SERVICE_ROLE_KEY: "sb_secret_hosted" }),
    JSON.stringify({ API_URL: ACCEPTANCE_API_ORIGIN }),
  ])("refuses malformed/hosted status without echoing credential values: %#", (input) => {
    expect(() => parseLocalStatus(input)).toThrow();
    try { parseLocalStatus(input); } catch (error) {
      expect(String(error)).not.toContain(credentials.anonKey);
      expect(String(error)).not.toContain(credentials.serviceRoleKey);
      expect(String(error)).not.toContain("sb_secret_hosted");
    }
  });
});

describe("running local API verification", () => {
  it("checks exact workspace identity, closed signup and enabled email sign-in; blocks redirects on both credentialed calls", async () => {
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(identity))
      .mockResolvedValueOnce(Response.json(settings));
    await expect(verifyLocalApi(manifest, credentials, request)).resolves.toBeUndefined();
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[0][0]).toBe(ACCEPTANCE_API_ORIGIN + "/rest/v1/acceptance_environment?select=id,project_id");
    expect(request.mock.calls[1][0]).toBe(ACCEPTANCE_API_ORIGIN + "/auth/v1/settings");
    for (const [index, [, options]] of request.mock.calls.entries()) {
      const key = index === 0 ? credentials.serviceRoleKey : credentials.anonKey;
      expect(options).toMatchObject({ redirect: "error", headers: { apikey: key, Authorization: `Bearer ${key}` } });
      expect(options?.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it.each([
    [], null, {}, [{ id: "different-run", project_id: ACCEPTANCE_PROJECT_ID }],
    [{ id: workspaceId, project_id: "artist-portfolio" }], [...identity, ...identity],
  ])("rejects missing, foreign and ambiguous database markers before querying Auth: %j", async (badIdentity) => {
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json(badIdentity));
    await expect(verifyLocalApi(manifest, credentials, request)).rejects.toThrow();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it.each([
    { disable_signup: false, external: { anonymous_users: false, email: true } },
    { disable_signup: "true", external: { anonymous_users: false, email: true } },
    { disable_signup: true, external: { anonymous_users: true, email: true } },
    { disable_signup: true, external: { anonymous_users: "false", email: true } },
    { disable_signup: true, external: { anonymous_users: false, email: false } },
    { disable_signup: true, external: { anonymous_users: false, email: "true" } },
    { disable_signup: true, external: { anonymous_users: false } },
    { disable_signup: true }, { external: { anonymous_users: false, email: true } }, {}, null,
  ])("rejects public signup, anonymous access, disabled email sign-in or malformed Auth settings: %j", async (badSettings) => {
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(identity))
      .mockResolvedValueOnce(Response.json(badSettings));
    await expect(verifyLocalApi(manifest, credentials, request)).rejects.toThrow();
  });

  it.each([302, 401, 403, 500])("refuses non-success HTTP response %s without leaking the body", async (statusCode) => {
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response("fixture-secret-body", { status: statusCode }));
    await expect(verifyLocalApi(manifest, credentials, request)).rejects.toThrow("Local acceptance API check failed");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("does not retry a redirect rejection or substitute another endpoint", async () => {
    const request = vi.fn<typeof fetch>().mockRejectedValueOnce(new TypeError("redirect rejected"));
    await expect(verifyLocalApi(manifest, credentials, request)).rejects.toThrow("Local acceptance API check failed");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("hides invalid JSON response contents as well as network errors", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response("secret fixture response", { status: 200 }));
    await expect(verifyLocalApi(manifest, credentials, request)).rejects.toThrow("Local acceptance API check failed");
    expect(request).toHaveBeenCalledTimes(1);
  });
});
