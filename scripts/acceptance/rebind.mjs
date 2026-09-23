// Windows Docker Desktop fallback: preserve stopped fixture containers and their
// writable layers/volumes, but explicitly publish the replacements on loopback.
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifyAcceptanceWorkspace } from "./workspace.mjs";
import { ACCEPTANCE_PROJECT_ID } from "./isolation.mjs";

const network = "portfolio-acceptance-loopback";
const roles = { db: ["5432/tcp", "55432"], kong: ["8000/tcp", "55431"], studio: ["3000/tcp", "55433"], inbucket: ["8025/tcp", "55434"] };
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const nameFor = (role) => `supabase_${role}_${ACCEPTANCE_PROJECT_ID}`;

export function buildLoopbackClone(container, workspace, role) {
  if (!Object.hasOwn(roles, role)) throw new Error("Unexpected acceptance container role.");
  const labels = container.Config?.Labels;
  if (container.Name !== `/${nameFor(role)}` || container.State?.Running !== false ||
      labels?.["com.supabase.cli.project"] !== ACCEPTANCE_PROJECT_ID ||
      path.resolve(labels?.["com.supabase.cli.workdir"] ?? ".") !== path.resolve(workspace) ||
      container.HostConfig?.NetworkMode !== network ||
      container.HostConfig.PublishAllPorts === true || container.HostConfig.AutoRemove === true ||
      Object.keys(container.NetworkSettings?.Networks ?? {}).join() !== network) {
    throw new Error("Only the exact stopped acceptance containers may be rebound.");
  }
  const [port, hostPort] = roles[role];
  const bindings = container.HostConfig.PortBindings;
  if (Object.keys(bindings ?? {}).join() !== port || bindings[port]?.length !== 1 || bindings[port][0].HostPort !== hostPort) {
    throw new Error("Unexpected acceptance port mapping.");
  }
  const expectedMounts = role === "db" || role === "studio" ? 1 : 0;
  if (!Array.isArray(container.Mounts) || container.Mounts.length !== expectedMounts) throw new Error("Unexpected acceptance mount count.");
  for (const mount of container.Mounts) {
    const validDb = role === "db" && mount.Type === "volume" && mount.Name === nameFor("db") && mount.Destination === "/var/lib/postgresql/data";
    const studioDestination = `${path.resolve(workspace).replace(/^[A-Za-z]:/, "").replaceAll("\\", "/")}/supabase/snippets`;
    const validStudio = role === "studio" && mount.Type === "bind" && path.resolve(mount.Source) === path.join(path.resolve(workspace), "supabase", "snippets") && mount.Destination === studioDestination;
    if (!validDb && !validStudio) throw new Error("Unexpected acceptance mount; refusing to change it.");
  }
  if (role === "db" && container.Mounts?.length !== 1) throw new Error("The existing database volume must be retained.");
  return {
    ...container.Config,
    HostConfig: { ...container.HostConfig, RestartPolicy: { Name: "no", MaximumRetryCount: 0 },
      PortBindings: { [port]: [{ HostIp: "127.0.0.1", HostPort: hostPort }] } },
    NetworkingConfig: { EndpointsConfig: { [network]: { Aliases: container.NetworkSettings.Networks[network].Aliases ?? [] } } },
  };
}

function docker(method, route, body) {
  return new Promise((resolve, reject) => {
    const fail = () => reject(new Error("Acceptance Docker operation failed; existing containers/data are preserved. Inspect state before any retry."));
    const request = http.request({ socketPath: "\\\\.\\pipe\\dockerDesktopLinuxEngine", path: `/v1.51${route}`, method,
      headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(30000) }, (response) => {
      const chunks = [];
      let size = 0;
      response.on("data", (chunk) => {
        size += chunk.length;
        if (size > 2 * 1024 * 1024) { request.destroy(); fail(); }
        else chunks.push(chunk);
      });
      response.on("error", fail);
      response.on("end", () => {
        if (response.statusCode < 200 || response.statusCode >= 300) return fail();
        try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : null); } catch { fail(); }
      });
    });
    request.on("error", fail);
    request.end(body === undefined ? undefined : JSON.stringify(body));
  });
}

async function rebind(workspace) {
  if (process.platform !== "win32") throw new Error("This fallback is restricted to the verified Windows Docker Desktop socket.");
  const manifest = await verifyAcceptanceWorkspace(workspace, repoRoot);
  const containers = await docker("GET", "/containers/json?all=true");
  const planned = [];
  for (const role of Object.keys(roles)) {
    const name = nameFor(role);
    const backup = `${name}-unbound-backup`;
    if (containers.some((entry) => entry.Names?.includes(`/${backup}`))) throw new Error("An unbound backup already exists. Stop and inspect; do not rerun this one-time repair.");
    const inspected = await docker("GET", `/containers/${name}/json`);
    planned.push({ role, name, backup, id: inspected.Id, config: buildLoopbackClone(inspected, workspace, role) });
  }
  // All targets checked before any mutation. No container/image/volume deletion.
  for (const item of planned) {
    const fresh = await docker("GET", `/containers/${item.id}/json`);
    item.config = buildLoopbackClone(fresh, workspace, item.role);
    const imageName = `portfolio-acceptance-rebind/${item.role}`;
    // Kong/Postgres generated config lives in the writable layer, not a mount.
    const snapshot = await docker("POST", `/commit?container=${item.id}&repo=${imageName}&tag=${manifest.id}&pause=false`);
    if (typeof snapshot?.Id !== "string" || !snapshot.Id.startsWith("sha256:")) throw new Error("Local snapshot could not be verified.");
    buildLoopbackClone(await docker("GET", `/containers/${item.id}/json`), workspace, item.role);
    await docker("POST", `/containers/${item.id}/update`, { RestartPolicy: { Name: "no", MaximumRetryCount: 0 } });
    await docker("POST", `/containers/${item.id}/rename?name=${item.backup}`);
    const created = await docker("POST", `/containers/create?name=${item.name}`, { ...item.config, Image: snapshot.Id });
    if (typeof created?.Id !== "string") throw new Error("Replacement creation could not be verified.");
    // Verify config before start. The database reuses its original named volume.
    const checked = await docker("GET", `/containers/${created.Id}/json`);
    buildLoopbackClone(checked, workspace, item.role);
    const mappings = Object.values(checked.HostConfig?.PortBindings ?? {}).flat();
    if (mappings.length !== 1 || mappings[0].HostIp !== "127.0.0.1") throw new Error("Refusing to start a non-loopback replacement.");
    await docker("POST", `/containers/${created.Id}/start`);
    const started = await docker("GET", `/containers/${created.Id}/json`);
    const published = Object.values(started.NetworkSettings?.Ports ?? {}).filter(Boolean).flat();
    if (published.length !== 1 || published[0].HostIp !== "127.0.0.1" || published[0].HostPort !== roles[item.role][1]) {
      await docker("POST", `/containers/${created.Id}/stop`);
      throw new Error("Replacement port isolation failed; replacement stopped.");
    }
    console.log(`Rebound acceptance ${item.role} to 127.0.0.1; stopped original preserved.`);
  }
}

/** Read-only gate: network driver options alone were insufficient on Desktop. */
export async function verifyLoopbackRuntime(workspace, request = docker) {
  if (request === docker && process.platform !== "win32") throw new Error("Verify actual local Docker port bindings on this platform before acceptance.");
  const inventory = await request("GET", "/containers/json?all=true");
  if (!Array.isArray(inventory)) throw new Error("Cannot verify acceptance container inventory.");
  for (const entry of inventory) {
    if (entry.Labels?.["com.supabase.cli.project"] !== ACCEPTANCE_PROJECT_ID || entry.State !== "running") continue;
    if (!Array.isArray(entry.Ports) || entry.Ports.some((port) => port.PublicPort !== undefined && port.IP !== "127.0.0.1")) {
      throw new Error("An acceptance port is published outside loopback; stop the affected fixture service before continuing.");
    }
  }
  for (const [role, [containerPort, hostPort]] of Object.entries(roles)) {
    const name = nameFor(role);
    const entry = await request("GET", `/containers/${name}/json`);
    const labels = entry.Config?.Labels;
    const ports = entry.NetworkSettings?.Ports?.[containerPort];
    const allPublished = Object.values(entry.NetworkSettings?.Ports ?? {}).filter(Boolean).flat();
    if (entry.Name !== `/${name}` || entry.State?.Running !== true ||
        labels?.["com.supabase.cli.project"] !== ACCEPTANCE_PROJECT_ID ||
        path.resolve(labels?.["com.supabase.cli.workdir"] ?? ".") !== path.resolve(workspace) ||
        allPublished.length !== 1 || ports?.length !== 1 || ports[0].HostIp !== "127.0.0.1" || ports[0].HostPort !== hostPort) {
      throw new Error("The dedicated acceptance runtime is not running with verified loopback ports.");
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [workspace, ...extra] = process.argv.slice(2);
  if (!workspace || extra.length) { console.error("Usage: node scripts/acceptance/rebind.mjs <generated-workspace>"); process.exitCode = 1; }
  else rebind(workspace).catch(() => { console.error("Acceptance rebind stopped. No containers, images or volumes were deleted. Inspect partial state before retrying."); process.exitCode = 1; });
}
