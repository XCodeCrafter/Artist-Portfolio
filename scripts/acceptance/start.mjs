// One fresh acceptance startup, through a private named pipe. The upstream
// daemon is never reconfigured, and no old container or volume is writable.
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { open, lstat, realpath } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ACCEPTANCE_PROJECT_ID, validateAcceptanceTarget } from "./isolation.mjs";
import { verifyAcceptanceWorkspace } from "./workspace.mjs";
import { verifyLoopbackRuntime } from "./rebind.mjs";

export const START_NETWORK = "portfolio-acceptance-v3-loopback";
export const ENGINE_PIPE = "\\\\.\\pipe\\dockerDesktopLinuxEngine";
const PROJECT_LABEL = "com.supabase.cli.project";
const WORKDIR_LABEL = "com.supabase.cli.workdir";
const COMPOSE_LABEL = "com.docker.compose.project";
const BODY_LIMIT = 16 * 1024 * 1024;
const JSON_LIMIT = 4 * 1024 * 1024;
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const ports = { db: ["5432/tcp", "45432"], kong: ["8000/tcp", "45431"], studio: ["3000/tcp", "45433"], inbucket: ["8025/tcp", "45434"] };
const imagesForRole = { db: ["postgres"], kong: ["kong"], studio: ["studio"], inbucket: ["mailpit", "inbucket"], auth: ["gotrue"], realtime: ["realtime"], rest: ["postgrest"], storage: ["storage-api"], imgproxy: ["imgproxy"], pg_meta: ["postgres-meta"] };
export const BOOTSTRAP_COMMANDS = Object.freeze({
  realtime: ["/app/bin/realtime", "eval", '{:ok, _} = Application.ensure_all_started(:realtime)\n{:ok, _} = Realtime.Tenants.health_check("realtime-dev")'],
  "storage-api": ["node", "dist/scripts/migrate-call.js"],
  gotrue: ["gotrue", "migrate"],
});
const bootstrapTags = new Set([
  "public.ecr.aws/supabase/realtime:v2.130.0", "public.ecr.aws/supabase/realtime:v2.129.3",
  "public.ecr.aws/supabase/storage-api:v1.72.1", "public.ecr.aws/supabase/storage-api:v1.71.0",
  "public.ecr.aws/supabase/gotrue:v2.196.0",
]);
const nameFor = role => `supabase_${role}_${ACCEPTANCE_PROJECT_ID}`;
const ownName = value => typeof value === "string" && Object.keys(imagesForRole).some(role => value === nameFor(role));
const ownVolume = value => value === nameFor("db") || value === nameFor("storage");
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const nonempty = value => value !== undefined && value !== null && Object.keys(value).length > 0;
function denied(code) { return Object.assign(new Error(`Acceptance startup refused (${code}). Private request details are hidden.`), { code }); }
function requireSafe(condition, code) { if (!condition) throw denied(code); }
function parseJson(bytes) { try { return JSON.parse(bytes.toString("utf8")); } catch { throw denied("invalid-json"); } }
function imageFamily(ref) {
  if (typeof ref !== "string") return undefined;
  const match = /^(?:(?:public\.ecr\.aws|ghcr\.io|docker\.io)\/)?supabase\/([a-z0-9-]+)(?::[A-Za-z0-9_.-]+|@sha256:[a-f0-9]{64})?$/.exec(ref);
  return match?.[1];
}

/** Never inherit provider credentials, shell hooks, proxy URLs or Docker contexts.
 * @returns {Record<string, string>}
 */
export function buildStartEnv(parent, pipe) {
  requireSafe(/^\\\\\.\\pipe\\portfolio-acceptance-start-[a-f0-9-]{36}$/.test(pipe), "proxy-pipe");
  const allowed = new Set(["PATH", "SYSTEMROOT", "WINDIR", "COMSPEC", "PATHEXT", "TEMP", "TMP", "USERPROFILE", "APPDATA", "LOCALAPPDATA"]);
  const env = Object.fromEntries(Object.entries(parent).filter(([key, value]) => allowed.has(key.toUpperCase()) && typeof value === "string" && !value.includes("\0")).map(([key, value]) => [key.toUpperCase(), value]));
  return { ...env, DOCKER_HOST: `npipe:////./pipe/${pipe.split("\\").at(-1)}`, SUPABASE_TELEMETRY_DISABLED: "true" };
}

/** Metadata only. Existing images may be reused, existing namespace data may not. */
export function verifyStartInventory(containers, volumes, network, cachedImages) {
  requireSafe(Array.isArray(containers) && Array.isArray(volumes?.Volumes) && Array.isArray(cachedImages), "inventory-shape");
  const matchesName = name => typeof name === "string" && (name === START_NETWORK || name.endsWith(`_${ACCEPTANCE_PROJECT_ID}`) || name.includes(`_${ACCEPTANCE_PROJECT_ID}-`));
  requireSafe(!containers.some(c => c.Labels?.[PROJECT_LABEL] === ACCEPTANCE_PROJECT_ID || c.Labels?.[COMPOSE_LABEL] === ACCEPTANCE_PROJECT_ID || c.Names?.some(matchesName)), "existing-containers");
  requireSafe(!volumes.Volumes.some(v => matchesName(v.Name) || v.Labels?.[PROJECT_LABEL] === ACCEPTANCE_PROJECT_ID || v.Labels?.[COMPOSE_LABEL] === ACCEPTANCE_PROJECT_ID), "existing-volumes");
  requireSafe(network?.Name === START_NETWORK && network.Driver === "bridge" && network.Scope === "local" &&
    network.Options?.["com.docker.network.bridge.host_binding_ipv4"] === "127.0.0.1" &&
    !nonempty(network.Containers) && !network.EnableIPv6 &&
    [undefined, "nat"].includes(network.Options?.["com.docker.network.bridge.gateway_mode_ipv4"]) &&
    !network.Options?.["com.docker.network.bridge.trusted_host_interfaces"], "dedicated-network");
  return cachedImages.flatMap(image => (image.RepoTags ?? []).filter(tag => imageFamily(tag)).map(tag => ({ tag, id: image.Id, family: imageFamily(tag) })));
}

function assertMounts(body, role, workspace, volumes, containers) {
  const host = body.HostConfig;
  requireSafe(!nonempty(host.Mounts) && !nonempty(host.Tmpfs) && !nonempty(body.Volumes), "unexpected-mount");
  for (const bind of host.Binds ?? []) {
    requireSafe(typeof bind === "string", "invalid-bind");
    const match = /^(.*):(\/[^:]*)(?::(rw|ro))?$/.exec(bind);
    requireSafe(match, "invalid-bind");
    const [, source, destination] = match;
    const db = role === "db" && source === nameFor("db") && destination === "/var/lib/postgresql/data";
    const storage = role === "storage" && source === nameFor("storage") && destination === "/mnt";
    const snippets = path.join(workspace, "supabase", "snippets");
    const studio = role === "studio" && path.resolve(source) === snippets &&
      destination === snippets.replace(/^[A-Za-z]:/, "").replaceAll("\\", "/");
    requireSafe((db || storage) ? volumes.has(source) : studio, "foreign-bind");
  }
  for (const source of host.VolumesFrom ?? []) {
    requireSafe(role === "imgproxy" && typeof source === "string" &&
      [nameFor("storage"), `${nameFor("storage")}:ro`, `${nameFor("storage")}:rw`].includes(source) && containers.has(nameFor("storage")), "foreign-volumes-from");
  }
}

/** The only port rewrite: before forwarding Docker's create request. */
export function guardContainerCreate(body, name, workspace, state) {
  requireSafe(object(body) && object(body.HostConfig) && object(body.Labels), "create-shape");
  const host = body.HostConfig;
  requireSafe(body.Labels[PROJECT_LABEL] === ACCEPTANCE_PROJECT_ID && body.Labels[COMPOSE_LABEL] === ACCEPTANCE_PROJECT_ID, "project-label");
  requireSafe(host.NetworkMode === START_NETWORK &&
    Object.keys(body.NetworkingConfig?.EndpointsConfig ?? {}).every(key => key === START_NETWORK), "container-network");
  requireSafe(!host.PublishAllPorts && !host.Privileged && !nonempty(host.CapAdd) && !nonempty(host.Devices) &&
    !nonempty(host.DeviceRequests) && !nonempty(host.SecurityOpt) && !nonempty(host.ExtraHosts) && !nonempty(host.Sysctls) &&
    [undefined, "", "private"].includes(host.PidMode) && [undefined, "", "private"].includes(host.IpcMode) &&
    [undefined, "", "private"].includes(host.CgroupnsMode) && [undefined, ""].includes(host.UsernsMode), "host-privileges");
  const family = imageFamily(body.Image) ?? state.images.find(image => image.id === body.Image)?.family;
  requireSafe(family, "untrusted-image");
  const clone = structuredClone(body);
  let role = Object.keys(imagesForRole).find(value => name === nameFor(value));
  let job;
  if (!name && body.Labels[WORKDIR_LABEL] === undefined) {
    // CLI 2.117.0's three schema jobs omit the workdir label. Only these exact
    // cached-image commands, without any mounted data or published port, qualify.
    job = family;
    requireSafe(Object.hasOwn(BOOTSTRAP_COMMANDS, job) && !state.jobs.has(job) &&
      state.images.some(image => bootstrapTags.has(image.tag) && image.family === job && (image.tag === body.Image || image.id === body.Image)) &&
      JSON.stringify(body.Cmd) === JSON.stringify(BOOTSTRAP_COMMANDS[job]) &&
      !nonempty(body.Entrypoint) && !nonempty(body.ExposedPorts) && !nonempty(host.PortBindings) &&
      !nonempty(host.Binds) && !nonempty(host.Mounts) && !nonempty(host.VolumesFrom) && !nonempty(host.Tmpfs) && !nonempty(body.Volumes) &&
      Object.keys(body.Labels).length === 2 && host.AutoRemove === true, "bootstrap-job");
    clone.Labels[WORKDIR_LABEL] = workspace;
    role = `bootstrap-${job}`;
  } else {
    requireSafe(role && imagesForRole[role].includes(family) && !state.containers.has(name) && !state.pendingNames.has(name), "container-name");
    requireSafe(typeof body.Labels[WORKDIR_LABEL] === "string" && path.resolve(body.Labels[WORKDIR_LABEL]) === workspace, "workdir-label");
    requireSafe(!host.AutoRemove, "persistent-auto-remove");
    assertMounts(body, role, workspace, state.volumes, state.containers);
  }
  const binding = ports[role];
  const actual = host.PortBindings ?? {};
  requireSafe(object(actual), "port-shape");
  if (binding) {
    const [containerPort, hostPort] = binding;
    requireSafe(Object.keys(actual).length === 1 && actual[containerPort]?.length === 1 &&
      actual[containerPort][0].HostPort === hostPort &&
      [undefined, "", "0.0.0.0", "::", "127.0.0.1"].includes(actual[containerPort][0].HostIp), "unexpected-port");
    clone.HostConfig.PortBindings = { [containerPort]: [{ HostIp: "127.0.0.1", HostPort: hostPort }] };
  } else requireSafe(Object.keys(actual).length === 0, "unexpected-published-port");
  // A failed/interrupted run must not restart itself when Desktop restarts.
  clone.HostConfig.RestartPolicy = { Name: "no", MaximumRetryCount: 0 };
  return { body: clone, role, job, name };
}

/** Stateful request policy. Only IDs returned by this invocation become writable. */
export function createStartPolicy(workspace, images = []) {
  workspace = path.resolve(workspace);
  const state = { images, containers: new Set(), pendingNames: new Set(), jobs: new Set(), ephemeral: new Set(), execs: new Set(), volumes: new Set() };
  const knownContainer = ref => state.containers.has(ref);
  function authorize(method, rawPath, bytes = Buffer.alloc(0)) {
    requireSafe(typeof rawPath === "string" && rawPath.startsWith("/") && !rawPath.startsWith("//") && !/[\r\n\0\\]/.test(rawPath), "request-path");
    const url = new URL(rawPath, "http://docker");
    const route = url.pathname.replace(/^\/v\d+\.\d+(?=\/)/, "");
    const result = { path: url.pathname + url.search, body: bytes, kind: "read" };
    if ((method === "HEAD" || method === "GET") && ["/_ping", "/version", "/info"].includes(route)) return result;
    if (method === "GET" && route === "/containers/json") {
      // Inventory returned to the child is confined to its own project.
      let filters;
      try { filters = JSON.parse(url.searchParams.get("filters") ?? "{}"); } catch { throw denied("filters"); }
      requireSafe(object(filters), "filters");
      filters.label = [`${PROJECT_LABEL}=${ACCEPTANCE_PROJECT_ID}`];
      url.searchParams.set("filters", JSON.stringify(filters));
      return { ...result, path: url.pathname + url.search };
    }
    if (method === "GET" && (route === "/images/json" || /^\/images\/.+\/json$/.test(route))) return result;
    if (method === "GET" && route === `/networks/${START_NETWORK}`) return result;
    const volume = /^\/volumes\/([^/]+)$/.exec(route);
    if (method === "GET" && volume && ownVolume(decodeURIComponent(volume[1]))) return result;
    const container = /^\/containers\/([^/]+)\/(json|logs|archive|attach|start|stop|wait|exec|resize)$/.exec(route);
    if (container) {
      const ref = decodeURIComponent(container[1]);
      const action = container[2];
      if (method === "GET" && ["json", "logs", "archive"].includes(action) && (knownContainer(ref) || (action === "json" && ownName(ref)))) return result;
      requireSafe(knownContainer(ref), "foreign-container");
      // `docker cp - ID:/` stats its destination before PUT /archive.
      if (method === "HEAD" && action === "archive") return result;
      if (method === "POST" && ["start", "stop", "wait", "attach", "resize"].includes(action)) return { ...result, kind: action };
      if (method === "PUT" && action === "archive") return { ...result, kind: "archive" };
      if (method === "POST" && action === "exec") {
        const body = parseJson(bytes);
        requireSafe(object(body) && body.Privileged !== true, "exec-shape");
        return { ...result, kind: "exec-create" };
      }
    }
    const exec = /^\/exec\/([^/]+)\/(json|start|resize)$/.exec(route);
    if (exec) {
      requireSafe(state.execs.has(exec[1]), "foreign-exec");
      if ((method === "GET" && exec[2] === "json") || (method === "POST" && ["start", "resize"].includes(exec[2]))) return { ...result, kind: "exec-stream" };
    }
    if (method === "POST" && route === "/containers/create") {
      const name = url.searchParams.get("name") ?? "";
      const approved = guardContainerCreate(parseJson(bytes), name, workspace, state);
      if (approved.job) state.jobs.add(approved.job);
      if (name) state.pendingNames.add(name);
      return { ...result, ...approved, body: Buffer.from(JSON.stringify(approved.body)), kind: "container-create" };
    }
    if (method === "POST" && route === "/volumes/create") {
      const body = parseJson(bytes);
      requireSafe(object(body) && ownVolume(body.Name) && body.Labels?.[PROJECT_LABEL] === ACCEPTANCE_PROJECT_ID &&
        body.Labels?.[COMPOSE_LABEL] === ACCEPTANCE_PROJECT_ID &&
        (body.Labels?.[WORKDIR_LABEL] === undefined || path.resolve(body.Labels[WORKDIR_LABEL]) === workspace) &&
        [undefined, "", "local"].includes(body.Driver) && !nonempty(body.DriverOpts), "volume-create");
      return { ...result, kind: "volume-create", name: body.Name };
    }
    if (method === "POST" && route === "/images/create") {
      requireSafe(imageFamily(url.searchParams.get("fromImage")) && !url.searchParams.has("fromSrc") &&
        [...url.searchParams.keys()].every(key => ["fromImage", "tag", "platform"].includes(key)), "image-pull");
      return { ...result, kind: "image-pull" };
    }
    const remove = /^\/containers\/([^/]+)$/.exec(route);
    if (method === "DELETE" && remove && state.ephemeral.has(remove[1])) return { ...result, kind: "job-remove" };
    // In particular: no prune, persistent deletion, commits, daemon changes,
    // network changes, image writes other than public Supabase pulls, or rename.
    throw denied("unsupported-operation");
  }
  function completed(plan, status, bytes) {
    if (status < 200 || status >= 300) return;
    if (plan.kind === "container-create" || plan.kind === "exec-create") {
      const value = parseJson(bytes);
      requireSafe(typeof value.Id === "string" && /^[a-f0-9]{64}$/.test(value.Id), "created-id");
      if (plan.kind === "exec-create") state.execs.add(value.Id);
      else {
        state.containers.add(value.Id);
        state.containers.add(value.Id.slice(0, 12));
        if (plan.name) state.containers.add(plan.name);
        if (plan.job) { state.ephemeral.add(value.Id); state.ephemeral.add(value.Id.slice(0, 12)); }
      }
    } else if (plan.kind === "volume-create") {
      const value = parseJson(bytes);
      requireSafe(value.Name === plan.name && value.Labels?.[PROJECT_LABEL] === ACCEPTANCE_PROJECT_ID, "created-volume");
      state.volumes.add(value.Name);
    }
  }
  return { state, authorize, completed };
}

async function collect(stream, limit) {
  const chunks = []; let size = 0;
  for await (const chunk of stream) { size += chunk.length; requireSafe(size <= limit, "body-limit"); chunks.push(chunk); }
  return Buffer.concat(chunks);
}
function upstreamJson(route, enginePipe = ENGINE_PIPE) {
  return new Promise((resolve, reject) => {
    const request = http.get({ socketPath: enginePipe, path: `/v1.51${route}`, agent: false, signal: AbortSignal.timeout(15000) }, async response => {
      try {
        requireSafe(response.statusCode === 200, "docker-preflight");
        resolve(parseJson(await collect(response, JSON_LIMIT)));
      } catch { reject(denied("docker-preflight")); }
    });
    request.on("error", () => reject(denied("docker-preflight")));
  });
}

function safeHeaders(headers, length, upgrade) {
  const result = { ...headers, host: "docker", "content-length": String(length) };
  delete result["transfer-encoding"];
  delete result["x-registry-auth"];
  delete result["x-registry-config"];
  if (!upgrade) { delete result.connection; delete result.upgrade; }
  return result;
}

/** Testable HTTP transport; production listens only on a random Windows pipe. */
export function createStartProxy(policy, { enginePipe = ENGINE_PIPE, onEvent = () => {} } = {}) {
  const sockets = new Set();
  const requests = new Set();
  let closing = false;
  let failures = 0;
  function refuse(target, error, upgrade) {
    if (closing || target.destroyed) return;
    failures++;
    onEvent({ phase: "guard-refused", reason: error?.code ?? "transport" });
    const body = JSON.stringify({ message: "Acceptance startup guard refused this operation. Inspect dedicated private startup state." });
    if (upgrade) target.end(`HTTP/1.1 403 Forbidden\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`);
    else if (!target.headersSent) { target.writeHead(403, { "content-type": "application/json" }); target.end(body); }
    else target.destroy();
  }
  async function forward(req, target, bytes, upgrade = false, earlyData = Buffer.alloc(0)) {
    if (closing || target.destroyed) return;
    let plan;
    try {
      plan = policy.authorize(req.method, req.url, bytes);
      const body = plan.body;
      requireSafe(!upgrade || ["attach", "exec-stream"].includes(plan.kind), "upgrade-route");
      const upstream = http.request({ socketPath: enginePipe, method: req.method, path: plan.path,
        headers: safeHeaders(req.headers, body.length, upgrade), agent: false });
      requests.add(upstream); upstream.once("close", () => requests.delete(upstream));
      target.once("close", () => upstream.destroy());
      upstream.on("error", () => refuse(target, denied("upstream-unavailable"), upgrade));
      upstream.on("response", async response => {
        response.on("error", () => { target.destroy(); upstream.destroy(); });
        try {
          if (["container-create", "exec-create", "volume-create"].includes(plan.kind)) {
            const reply = await collect(response, JSON_LIMIT);
            policy.completed(plan, response.statusCode, reply);
            if (plan.kind === "container-create" && response.statusCode === 201) onEvent({ phase: "container-created", role: plan.role });
            if (upgrade) throw denied("upgrade-response");
            target.writeHead(response.statusCode, response.headers); target.end(reply);
          } else if (upgrade) {
            // IncomingMessage has already decoded chunked bodies. A raw socket
            // cannot reuse that transfer-encoding header for the decoded bytes.
            const reply = await collect(response, JSON_LIMIT);
            target.end(`HTTP/1.1 ${response.statusCode} ${response.statusMessage}\r\nContent-Type: application/json\r\nContent-Length: ${reply.length}\r\nConnection: close\r\n\r\n${reply.toString("utf8")}`);
          } else {
            target.writeHead(response.statusCode, response.headers);
            // Docker /wait acknowledges registration before producing its body.
            // The CLI waits for those headers before sending container /start.
            target.flushHeaders();
            response.pipe(target);
          }
        } catch (error) { refuse(target, error, upgrade); }
      });
      upstream.on("upgrade", (response, upstreamSocket, head) => {
        if (!upgrade) { upstreamSocket.destroy(); return refuse(target, denied("unexpected-upgrade"), false); }
        sockets.add(upstreamSocket); upstreamSocket.once("close", () => sockets.delete(upstreamSocket));
        target.write(`HTTP/1.1 ${response.statusCode} ${response.statusMessage}\r\n${Object.entries(response.headers).map(([key, value]) => `${key}: ${value}\r\n`).join("")}\r\n`);
        if (head.length) target.write(head);
        if (earlyData.length) upstreamSocket.write(earlyData);
        target.on("error", () => upstreamSocket.destroy());
        upstreamSocket.on("error", () => target.destroy());
        target.pipe(upstreamSocket); upstreamSocket.pipe(target);
      });
      upstream.end(body);
    } catch (error) { refuse(target, error, upgrade); }
  }
  const server = http.createServer(async (req, res) => {
    try { await forward(req, res, await collect(req, BODY_LIMIT)); }
    catch (error) { refuse(res, error, false); }
  });
  server.on("connection", socket => { sockets.add(socket); socket.once("close", () => sockets.delete(socket)); });
  server.on("clientError", (_error, socket) => socket.destroy());
  server.on("upgrade", (req, socket, head) => {
    // Node gives upgraded requests' body bytes in head, not req's readable stream.
    const length = Number(req.headers["content-length"] ?? 0);
    if (!Number.isSafeInteger(length) || length < 0 || length > JSON_LIMIT || req.headers["transfer-encoding"]) return refuse(socket, denied("upgrade-body"), true);
    let buffered = head;
    const timer = setTimeout(() => { socket.off("data", receive); refuse(socket, denied("upgrade-timeout"), true); }, 15000);
    socket.once("close", () => { clearTimeout(timer); socket.off("data", receive); });
    function receive(chunk) {
      if (chunk) buffered = Buffer.concat([buffered, chunk]);
      if (buffered.length < length) return;
      clearTimeout(timer); socket.off("data", receive); socket.pause();
      void forward(req, socket, buffered.subarray(0, length), true, buffered.subarray(length));
    }
    if (buffered.length >= length) receive(); else socket.on("data", receive);
  });
  return { server, failures: () => failures, close: async () => {
    closing = true;
    for (const request of requests) request.destroy();
    for (const socket of sockets) socket.destroy();
    if (server.listening) await new Promise(resolve => server.close(resolve));
  } };
}

/** This command is intentionally not a restart/resume/reset command. */
export async function startAcceptanceWorkspace(workspace, cliPath) {
  requireSafe(process.platform === "win32", "windows-only");
  const manifest = await verifyAcceptanceWorkspace(workspace, repoRoot);
  validateAcceptanceTarget(manifest.target);
  requireSafe(ACCEPTANCE_PROJECT_ID === "artist-portfolio-acceptance-v3", "project-version");
  workspace = path.resolve(workspace);
  const stat = await lstat(cliPath);
  requireSafe(path.isAbsolute(cliPath) && path.basename(cliPath).toLowerCase() === "supabase.exe" && stat.isFile() && !stat.isSymbolicLink() && await realpath(cliPath) === path.resolve(cliPath), "cli-executable");
  const [containers, volumes, network, images] = await Promise.all([
    upstreamJson("/containers/json?all=true"), upstreamJson("/volumes"), upstreamJson(`/networks/${START_NETWORK}`), upstreamJson("/images/json"),
  ]);
  const pinnedImages = verifyStartInventory(containers, volumes, network, images);
  for (const family of Object.keys(BOOTSTRAP_COMMANDS)) requireSafe(pinnedImages.some(image => bootstrapTags.has(image.tag) && image.family === family), "missing-cached-bootstrap-image");
  const stdout = await open(path.join(workspace, "startup-stdout.private.log"), "wx", 0o600);
  let stderr;
  let proxy;
  try {
    stderr = await open(path.join(workspace, "startup-stderr.private.log"), "wx", 0o600);
    proxy = createStartProxy(createStartPolicy(workspace, pinnedImages), { onEvent: event => {
      if (event.phase === "container-created") console.log(`Created isolated acceptance ${event.role}; published ports were pinned before creation.`);
      else console.log(`Acceptance startup guard stopped an operation (${event.reason}).`);
    } });
    const pipe = `\\\\.\\pipe\\portfolio-acceptance-start-${randomUUID()}`;
    await new Promise((resolve, reject) => { proxy.server.once("error", reject); proxy.server.listen(pipe, resolve); });
    console.log("Verified fresh acceptance namespace. Starting through the private loopback-enforcing pipe.");
    const exitCode = await new Promise((resolve, reject) => {
      const child = spawn(cliPath, ["--workdir", workspace, "start", "--network-id", START_NETWORK], {
        cwd: workspace, env: buildStartEnv(process.env, pipe), windowsHide: true, stdio: ["ignore", stdout.fd, stderr.fd],
      });
      const abort = code => {
        // Kill only our CLI, not containers. Closing the proxy cuts off any child
        // Docker processes, leaving partial state for explicit inspection.
        cleanup(); void proxy.close(); child.kill(); reject(denied(code));
      };
      const onInterrupt = () => abort("cli-interrupted");
      const timer = setTimeout(() => abort("cli-timeout"), 15 * 60 * 1000);
      function cleanup() {
        clearTimeout(timer); process.off("SIGINT", onInterrupt); process.off("SIGTERM", onInterrupt);
      }
      process.once("SIGINT", onInterrupt); process.once("SIGTERM", onInterrupt);
      child.once("error", () => { cleanup(); reject(denied("cli-spawn")); });
      child.once("exit", (code, signal) => { cleanup(); resolve(signal ? 1 : code ?? 1); });
    });
    console.log(`Acceptance CLI exited with code ${exitCode}.`);
    requireSafe(exitCode === 0 && proxy.failures() === 0, "startup-incomplete");
    await verifyLoopbackRuntime(workspace);
    console.log("Acceptance stack started with verified loopback ports. CLI output remains only in private workspace logs.");
    return { exitCode, workspaceId: manifest.id };
  } finally {
    await proxy?.close();
    await stdout.close();
    await stderr?.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [workspace, cliPath, ...extra] = process.argv.slice(2);
  if (!workspace || !cliPath || extra.length) { console.error("Usage: node scripts/acceptance/start.mjs <generated-workspace> <verified-supabase-cli-exe>"); process.exitCode = 1; }
  else startAcceptanceWorkspace(workspace, cliPath).catch(error => {
    console.error(`Acceptance startup stopped (${error?.code ?? "preflight"}). Existing resources were not deleted. Inspect dedicated private logs and partial state before any retry.`);
    process.exitCode = 1;
  });
}
