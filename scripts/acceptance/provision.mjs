import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { lstat, realpath, writeFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseLocalStatus, verifyLocalApi } from "../acceptance.mjs";
import { verifyAcceptanceWorkspace } from "./workspace.mjs";
import { verifyLoopbackRuntime } from "./rebind.mjs";
import { ACCEPTANCE_ADMIN_EMAIL, ACCEPTANCE_API_ORIGIN, ACCEPTANCE_MEDIA_BUCKET,
  validateAcceptanceTarget } from "./isolation.mjs";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const ACCEPTANCE_BUCKET_OPTIONS = Object.freeze({
  id: ACCEPTANCE_MEDIA_BUCKET, name: ACCEPTANCE_MEDIA_BUCKET, public: true,
  file_size_limit: 104857600,
  allowed_mime_types: Object.freeze([
    "image/avif", "image/gif", "image/jpeg", "image/png", "image/webp",
    "video/mp4", "video/quicktime", "video/webm",
  ]),
});
const safeError = () => new Error("Local acceptance request failed (response and credentials hidden). Stop and inspect the dedicated stack; no automatic retry or cleanup was performed.");

/** Native HTTP only, with no redirect or environment-proxy support. */
export function buildAcceptanceRequest(url, options = {}) {
  let target;
  try { target = new URL(url); } catch { throw new Error("Only the exact acceptance loopback API is allowed."); }
  if (typeof url !== "string" || target.origin !== ACCEPTANCE_API_ORIGIN || target.username || target.password || target.hash ||
      url !== `${ACCEPTANCE_API_ORIGIN}${target.pathname}${target.search}`) {
    throw new Error("Only the exact acceptance loopback API is allowed.");
  }
  const method = options.method ?? "GET";
  if (!["GET", "POST"].includes(method)) throw new Error("Acceptance provisioning only supports GET and POST.");
  /** @type {Record<string, string>} */
  const headers = {};
  const allowed = new Set(["apikey", "authorization", "content-type", "prefer"]);
  for (const [name, value] of Object.entries(options.headers ?? {})) {
    const lower = name.toLowerCase();
    if (!allowed.has(lower) || Object.hasOwn(headers, lower) || typeof value !== "string" || /[\r\n\0]/.test(value)) {
      throw new Error("Invalid acceptance request headers.");
    }
    headers[lower] = value;
  }
  if (!headers.apikey || headers.authorization !== `Bearer ${headers.apikey}`) {
    throw new Error("Explicit matching acceptance API credentials are required.");
  }
  if (options.body !== undefined && (method !== "POST" || typeof options.body !== "string" || Buffer.byteLength(options.body) > 16384)) {
    throw new Error("Invalid acceptance request body.");
  }
  return { target, options: { method, headers, agent: false, signal: options.signal
    ? AbortSignal.any([options.signal, AbortSignal.timeout(5000)]) : AbortSignal.timeout(5000) }, body: options.body };
}

export function requestAcceptanceApi(url, options = {}, transport = http.request) {
  const input = buildAcceptanceRequest(url, options);
  return new Promise((resolve, reject) => {
    const fail = () => reject(safeError());
    const request = transport(input.target, input.options, (response) => {
      const chunks = [];
      let bytes = 0;
      response.on("data", (chunk) => {
        bytes += chunk.length;
        if (bytes > 128 * 1024) { request.destroy(); fail(); }
        else chunks.push(chunk);
      });
      response.on("error", fail);
      response.on("aborted", fail);
      response.on("end", () => resolve({
        status: response.statusCode,
        ok: response.statusCode >= 200 && response.statusCode < 300,
        json: async () => {
          try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw safeError(); }
        },
      }));
    });
    request.on("error", fail);
    if (input.body !== undefined) request.write(input.body);
    request.end();
  });
}

function privateCliEnv() {
  const allowed = new Set(["PATH", "SYSTEMROOT", "WINDIR", "COMSPEC", "PATHEXT", "TEMP", "TMP", "USERPROFILE", "APPDATA", "LOCALAPPDATA"]);
  return Object.fromEntries(Object.entries(process.env).filter(([key]) => allowed.has(key.toUpperCase())));
}

function isConfirmedOwner(user) {
  return user && typeof user.id === "string" && user.id.length === 36 && UUID.test(user.id) && user.email === ACCEPTANCE_ADMIN_EMAIL &&
    typeof user.email_confirmed_at === "string" && Number.isFinite(Date.parse(user.email_confirmed_at));
}

function isOwnerProfile(rows, id) {
  return Array.isArray(rows) && rows.length === 1 && rows[0].user_id === id &&
    rows[0].email === ACCEPTANCE_ADMIN_EMAIL && rows[0].role === "owner" && rows[0].is_active === true;
}

function isExpectedBucket(bucket) {
  return bucket && bucket.id === ACCEPTANCE_MEDIA_BUCKET && bucket.name === ACCEPTANCE_MEDIA_BUCKET && bucket.public === true &&
    Number(bucket.file_size_limit) === ACCEPTANCE_BUCKET_OPTIONS.file_size_limit && Array.isArray(bucket.allowed_mime_types) &&
    bucket.allowed_mime_types.length === ACCEPTANCE_BUCKET_OPTIONS.allowed_mime_types.length &&
    ACCEPTANCE_BUCKET_OPTIONS.allowed_mime_types.every((mime) => bucket.allowed_mime_types.includes(mime));
}

/** Create a disposable LOCAL owner once; partial failures are never retried or deleted. */
export async function provisionAcceptanceWorkspace(workspace, cliPath, dependencies = {}) {
  const deps = { verifyWorkspace: verifyAcceptanceWorkspace, verifyBindings: verifyLoopbackRuntime, stat: lstat, realpath, writeFile,
    execute: execFileSync, request: requestAcceptanceApi, password: () => randomBytes(32).toString("base64url"), ...dependencies };
  const manifest = await deps.verifyWorkspace(workspace, repoRoot);
  validateAcceptanceTarget(manifest.target);
  await deps.verifyBindings(workspace);
  if (!path.isAbsolute(cliPath) || !/^supabase(?:\.exe)?$/i.test(path.basename(cliPath)) ||
      !(await deps.stat(cliPath)).isFile() || (await deps.stat(cliPath)).isSymbolicLink() ||
      await deps.realpath(cliPath) !== path.resolve(cliPath)) {
    throw new Error("Supply the verified regular Supabase CLI executable by absolute path.");
  }
  const statusPath = path.join(workspace, "local-status.json");
  const ownerPath = path.join(workspace, "local-owner.json");
  for (const filename of [statusPath, ownerPath]) {
    try { await deps.stat(filename); } catch (error) {
      if (error.code === "ENOENT") continue;
      throw new Error("Cannot safely check private acceptance files.");
    }
    throw new Error("Private acceptance files already exist. Stop and inspect the prior run; provisioning never overwrites or retries it.");
  }
  let stdout;
  try {
    stdout = deps.execute(cliPath, ["--workdir", workspace, "status", "-o", "json"], {
      cwd: workspace, env: privateCliEnv(), stdio: "pipe", encoding: "utf8",
      timeout: 15000, maxBuffer: 128 * 1024, windowsHide: true,
    });
  } catch { throw new Error("Could not read dedicated local CLI status (output hidden)."); }
  const credentials = parseLocalStatus(stdout);
  await verifyLocalApi(manifest, credentials, deps.request);
  const savePrivate = async (filename, value) => {
    try { await deps.writeFile(filename, JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o600 }); }
    catch { throw new Error("Could not exclusively save private acceptance state. Stop; existing files and partial state are preserved."); }
  };
  await savePrivate(statusPath, { API_URL: ACCEPTANCE_API_ORIGIN, ANON_KEY: credentials.anonKey, SERVICE_ROLE_KEY: credentials.serviceRoleKey });
  const call = async (route, method = "GET", body) => {
    try {
      const response = await deps.request(ACCEPTANCE_API_ORIGIN + route, {
        method, headers: { apikey: credentials.serviceRoleKey, Authorization: `Bearer ${credentials.serviceRoleKey}`,
          ...(body !== undefined ? { "Content-Type": "application/json", Prefer: "return=representation" } : {}) },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      return response;
    } catch { throw safeError(); }
  };
  const json = async (response) => {
    if (!response.ok) throw safeError();
    try { return await response.json(); } catch { throw safeError(); }
  };
  const users = await json(await call("/auth/v1/admin/users?page=1&per_page=1"));
  const profiles = await json(await call("/rest/v1/admin_profiles?select=user_id&limit=1"));
  if (!Array.isArray(users?.users) || users.users.length !== 0 || (users.total !== undefined && users.total !== 0) ||
      !Array.isArray(profiles) || profiles.length !== 0) {
    throw new Error("Local owner provisioning requires empty Auth users and admin profiles. Nothing was created; inspect the existing fixture.");
  }
  const password = deps.password();
  if (typeof password !== "string" || !/^[A-Za-z0-9_-]{40,128}$/.test(password)) throw new Error("Invalid generated acceptance password.");
  await savePrivate(ownerPath, { version: 1, workspaceId: manifest.id, apiOrigin: ACCEPTANCE_API_ORIGIN, email: ACCEPTANCE_ADMIN_EMAIL, password });
  const owner = await json(await call("/auth/v1/admin/users", "POST", { email: ACCEPTANCE_ADMIN_EMAIL, password, email_confirm: true }));
  if (!isConfirmedOwner(owner)) throw new Error("Created local Auth account could not be verified. Stop; private credentials and partial state are preserved.");
  const profile = { user_id: owner.id, email: ACCEPTANCE_ADMIN_EMAIL, role: "owner", is_active: true };
  if (!isOwnerProfile(await json(await call("/rest/v1/admin_profiles", "POST", profile)), owner.id)) {
    throw new Error("Local owner profile could not be verified. Stop; private credentials and partial state are preserved.");
  }
  const confirmed = await json(await call(`/auth/v1/admin/users/${owner.id}`));
  const savedProfile = await json(await call(`/rest/v1/admin_profiles?user_id=eq.${owner.id}&select=user_id,email,role,is_active`));
  if (!isConfirmedOwner(confirmed) || confirmed.id !== owner.id || !isOwnerProfile(savedProfile, owner.id)) {
    throw new Error("Local owner read-back failed. Stop; private credentials and partial state are preserved.");
  }
  const buckets = await json(await call("/storage/v1/bucket"));
  if (!Array.isArray(buckets) || buckets.some((entry) => !entry || typeof entry.id !== "string" || !entry.id ||
      typeof entry.name !== "string" || !entry.name)) throw safeError();
  const existingBuckets = buckets.filter((entry) => entry.id === ACCEPTANCE_MEDIA_BUCKET);
  if (existingBuckets.length > 1) throw safeError();
  if (existingBuckets.length === 0) {
    const created = await call("/storage/v1/bucket", "POST", ACCEPTANCE_BUCKET_OPTIONS);
    if (!created.ok) throw safeError();
  }
  const bucket = await call(`/storage/v1/bucket/${ACCEPTANCE_MEDIA_BUCKET}`);
  if (!isExpectedBucket(await json(bucket))) throw new Error("Local media bucket configuration differs from the acceptance contract. No existing bucket was changed.");
  return { ownerId: owner.id, email: ACCEPTANCE_ADMIN_EMAIL, bucket: ACCEPTANCE_MEDIA_BUCKET };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [workspace, cliPath, ...extra] = process.argv.slice(2);
  if (!workspace || !cliPath || extra.length) {
    console.error("Usage: node scripts/acceptance/provision.mjs <generated-workspace> <verified-supabase-cli-exe>");
    process.exitCode = 1;
  } else {
    provisionAcceptanceWorkspace(workspace, cliPath).then(() => {
      console.log("Verified local owner and acceptance media bucket. Private credentials remain only in the generated workspace. Genuine password login and TOTP enrollment are still required.");
    }).catch(() => {
      // Never print arbitrary CLI, filesystem, network, or service response errors.
      console.error("Local acceptance provisioning stopped. No automatic cleanup, overwrite or retry was performed. Inspect private state in the dedicated workspace before continuing.");
      process.exitCode = 1;
    });
  }
}
