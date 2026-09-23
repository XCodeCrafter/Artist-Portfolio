import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { lstat, readFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ACCEPTANCE_API_ORIGIN, ACCEPTANCE_APP_ORIGIN, ACCEPTANCE_PROJECT_ID, ACCEPTANCE_TARGET,
  buildAcceptanceChildEnv, validateLocalAcceptanceCredentials } from "./acceptance/isolation.mjs";
import { prepareAcceptanceWorkspace, verifyAcceptanceWorkspace } from "./acceptance/workspace.mjs";
import { diagnoseAcceptancePrerequisite } from "./acceptance/doctor.mjs";
import { verifyLoopbackRuntime } from "./acceptance/rebind.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

export function parseLocalStatus(text) {
  let status;
  try { status = JSON.parse(text.replace(/^\uFEFF/, "")); } catch { throw new Error("Invalid local status JSON (contents hidden)."); }
  if (!status || status.API_URL !== ACCEPTANCE_API_ORIGIN) throw new Error("Status API_URL must match the dedicated loopback API.");
  return validateLocalAcceptanceCredentials({ anonKey: status.ANON_KEY, serviceRoleKey: status.SERVICE_ROLE_KEY });
}

// Native HTTP with agent:false does not inherit environment-configured fetch
// proxies. Local keys must not be forwarded to an HTTP_PROXY endpoint either.
function requestLoopback(url, options) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, { headers: options.headers, signal: options.signal, agent: false }, (response) => {
      const chunks = [];
      let bytes = 0;
      response.on("data", (chunk) => {
        bytes += chunk.length;
        if (bytes > 128 * 1024) request.destroy(new Error("Local response exceeded limit."));
        else chunks.push(chunk);
      });
      response.on("error", reject);
      response.on("end", () => resolve({
        ok: response.statusCode >= 200 && response.statusCode < 300,
        json: () => JSON.parse(Buffer.concat(chunks).toString("utf8")),
      }));
    });
    request.on("error", reject);
  });
}

export async function verifyLocalApi(manifest, credentials, request = requestLoopback) {
  validateLocalAcceptanceCredentials(credentials);
  const readJson = async (route, key) => {
    // Never follow redirects or include endpoint responses/tokens in errors.
    try {
      const response = await request(ACCEPTANCE_API_ORIGIN + route, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        redirect: "error", signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error();
      return await response.json();
    } catch {
      throw new Error("Local acceptance API check failed; check the dedicated stack (response hidden).");
    }
  };
  const identity = await readJson("/rest/v1/acceptance_environment?select=id,project_id", credentials.serviceRoleKey);
  if (!Array.isArray(identity) || identity.length !== 1 || identity[0].id !== manifest.id || identity[0].project_id !== ACCEPTANCE_PROJECT_ID) {
    throw new Error("The running database does not match this acceptance workspace.");
  }
  const settings = await readJson("/auth/v1/settings", credentials.anonKey);
  if (settings?.disable_signup !== true || settings.external?.anonymous_users !== false || settings.external?.email !== true) {
    throw new Error("Local Auth must have email sign-in enabled, with public signup and anonymous sign-ins disabled.");
  }
}

async function main(args) {
  const [command, workspace, ...extra] = args;
  if (extra.length || !["prepare", "doctor", "start-app"].includes(command) || (command !== "start-app" && workspace)) {
    throw new Error("Usage: node scripts/acceptance.mjs prepare | doctor | start-app <generated-workspace>");
  }
  if (command === "prepare") {
    const result = await prepareAcceptanceWorkspace(repoRoot);
    console.log(`Prepared ${result.sourceMigrations} copied migrations + local bootstrap and ${result.sourceFiles} application inputs.`);
    console.log(`Workspace: ${result.workspace}`);
    console.log("No database started, SQL executed, accounts created, credentials loaded or hosted data changed.");
    console.log("Read docs/local-acceptance.md before starting Docker/Supabase.");
    return;
  }
  if (command === "doctor") {
    const docker = diagnoseAcceptancePrerequisite("docker");
    const cli = diagnoseAcceptancePrerequisite("supabase");
    console.log(docker.message);
    console.log(cli.message);
    console.log(`Dedicated app: ${ACCEPTANCE_APP_ORIGIN}; API: ${ACCEPTANCE_API_ORIGIN}. Ports 3000/3001 are not used.`);
    console.log("HTTP mode is preparation/functional testing only. Storage placement and production Secure-cookie tests require isolated trusted HTTPS.");
    if (docker.status !== "success" || cli.status !== "success") process.exitCode = 1;
    return;
  }
  if (!workspace) throw new Error("Supply the generated workspace path.");
  const manifest = await verifyAcceptanceWorkspace(workspace, repoRoot);
  await verifyLoopbackRuntime(workspace);
  const statusPath = path.join(workspace, "local-status.json");
  if ((await lstat(statusPath)).isSymbolicLink()) throw new Error("Local status must be a regular private file.");
  const credentials = parseLocalStatus(await readFile(statusPath, "utf8"));
  await verifyLocalApi(manifest, credentials);
  const env = buildAcceptanceChildEnv({ parentEnv: process.env, target: ACCEPTANCE_TARGET, credentials,
    authSecuritySecret: randomBytes(32).toString("base64url") });
  console.log(`Verified isolated database. Starting fictional portfolio at ${ACCEPTANCE_APP_ORIGIN}/admin/login`);
  console.log("Real MFA is required; no account is created by this launcher. See the acceptance runbook.");
  // Webpack avoids Turbopack resolving the shared dependency junction outside its root.
  const child = spawn(process.execPath, [path.join(workspace, "app/node_modules/next/dist/bin/next"), "dev", "--webpack",
    "--hostname", "127.0.0.1", "--port", "3101"], { cwd: path.join(workspace, "app"), env, stdio: "inherit", windowsHide: true });
  child.on("error", () => { console.error("Could not start the isolated Next server."); process.exitCode = 1; });
  child.on("exit", (code) => { process.exitCode = code ?? 1; });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    // API/credential contents and environment values must never be printed.
    console.error(error instanceof Error ? error.message : "Acceptance preparation failed.");
    process.exitCode = 1;
  });
}
