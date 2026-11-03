import { randomUUID } from "node:crypto";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ACCEPTANCE_PROJECT_ID } from "../scripts/acceptance/isolation.mjs";
import { BOOTSTRAP_COMMANDS, START_NETWORK, buildStartEnv, createStartPolicy, createStartProxy, guardContainerCreate, verifyStartInventory } from "../scripts/acceptance/start.mjs";

const workspace = path.resolve("test-fixtures", "acceptance-start");
const project = "com.supabase.cli.project";
const compose = "com.docker.compose.project";
const workdir = "com.supabase.cli.workdir";
const labels = { [project]: ACCEPTANCE_PROJECT_ID, [compose]: ACCEPTANCE_PROJECT_ID, [workdir]: workspace };
const name = (role: string) => `supabase_${role}_${ACCEPTANCE_PROJECT_ID}`;
const containerId = "a".repeat(64);
const execId = "b".repeat(64);
const json = (value: unknown) => Buffer.from(JSON.stringify(value));
const portSpecs = {
  db: ["postgres", "5432/tcp", "45432"], kong: ["kong", "8000/tcp", "45431"],
  studio: ["studio", "3000/tcp", "45433"], inbucket: ["mailpit", "8025/tcp", "45434"],
} as const;
type Role = keyof typeof portSpecs;
function fixture(role: Role = "db") {
  const [family, port, hostPort] = portSpecs[role];
  return {
    Image: `public.ecr.aws/supabase/${family}:fixture`, Labels: { ...labels },
    Env: ["FAKE_SECRET=never-render-this"], Cmd: ["serve"],
    HostConfig: { NetworkMode: START_NETWORK, PortBindings: { [port]: [{ HostIp: "0.0.0.0", HostPort: hostPort }] }, Binds: [] as string[] },
  };
}
const imagePins = [
  { tag: "public.ecr.aws/supabase/realtime:v2.130.0", id: `sha256:${"1".repeat(64)}`, family: "realtime" },
  { tag: "public.ecr.aws/supabase/storage-api:v1.72.1", id: `sha256:${"2".repeat(64)}`, family: "storage-api" },
  { tag: "public.ecr.aws/supabase/gotrue:v2.196.0", id: `sha256:${"3".repeat(64)}`, family: "gotrue" },
];
function bootstrap(family: keyof typeof BOOTSTRAP_COMMANDS = "realtime") {
  return { Image: imagePins.find(pin => pin.family === family)!.tag,
    Labels: { [project]: ACCEPTANCE_PROJECT_ID, [compose]: ACCEPTANCE_PROJECT_ID },
    Cmd: [...BOOTSTRAP_COMMANDS[family]], Env: ["FAKE_SECRET=never-render-this"],
    HostConfig: { NetworkMode: START_NETWORK, AutoRemove: true },
  };
}
const networkFixture = () => ({ Name: START_NETWORK, Scope: "local", Driver: "bridge", EnableIPv6: false, Containers: {}, Options: { "com.docker.network.bridge.host_binding_ipv4": "127.0.0.1" } });
const policy = () => createStartPolicy(workspace, imagePins);
function createTracked(role: Role = "db") {
  const value = policy();
  const plan = value.authorize("POST", `/v1.51/containers/create?name=${name(role)}`, json(fixture(role)));
  value.completed(plan, 201, json({ Id: containerId }));
  return value;
}

describe("fresh acceptance startup inventory and environment", () => {
  it.each(["artist-portfolio-acceptance", "artist-portfolio-acceptance-v2"])("allows preserved %s but refuses this namespace's prior state", oldProject => {
    const old = { Names: [`/supabase_db_${oldProject}`], Labels: { [project]: oldProject } };
    expect(verifyStartInventory([old], { Volumes: [{ Name: `supabase_db_${oldProject}` }] }, networkFixture(), [])).toEqual([]);
    expect(() => verifyStartInventory([{ Names: [`/${name("db")}`] }], { Volumes: [] }, networkFixture(), [])).toThrow("existing-containers");
    expect(() => verifyStartInventory([], { Volumes: [{ Name: name("storage") }] }, networkFixture(), [])).toThrow("existing-volumes");
    expect(() => verifyStartInventory([{ Names: ["/unknown"], Labels: { [project]: ACCEPTANCE_PROJECT_ID } }], { Volumes: [] }, networkFixture(), [])).toThrow("existing-containers");
  });
  it.each([
    { Name: "bridge" }, { Driver: "host" }, { Scope: "swarm" }, { EnableIPv6: true },
    { Containers: { previous: {} } }, { Options: {} },
    { Options: { "com.docker.network.bridge.host_binding_ipv4": "127.0.0.1", "com.docker.network.bridge.gateway_mode_ipv4": "routed" } },
  ])("rejects unsuitable dedicated network %j", change => {
    expect(() => verifyStartInventory([], { Volumes: [] }, { ...networkFixture(), ...change }, [])).toThrow("dedicated-network");
  });
  it("passes only OS essentials and the private pipe to the child", () => {
    const pipe = `\\\\.\\pipe\\portfolio-acceptance-start-${randomUUID()}`;
    const env = buildStartEnv({ Path: "local-bin", SystemRoot: "C:\\Windows", DOCKER_HOST: "tcp://unrelated:2375", DOCKER_CONTEXT: "production", SUPABASE_ACCESS_TOKEN: "secret", IMAGEKIT_PRIVATE_KEY: "secret", NODE_OPTIONS: "--require=malicious" }, pipe);
    expect(env.PATH).toBe("local-bin");
    expect(env.DOCKER_HOST).toBe(`npipe:////./pipe/${pipe.split("\\").at(-1)}`);
    for (const key of ["DOCKER_CONTEXT", "SUPABASE_ACCESS_TOKEN", "IMAGEKIT_PRIVATE_KEY", "NODE_OPTIONS"]) expect(env).not.toHaveProperty(key);
    expect(() => buildStartEnv({}, "tcp://127.0.0.1:12345")).toThrow("proxy-pipe");
  });
});

describe("pre-creation container guard", () => {
  it.each(Object.keys(portSpecs) as Role[])("rewrites the only permitted %s port before creation", role => {
    const input = fixture(role); const copy = structuredClone(input);
    const approved = guardContainerCreate(input, name(role), workspace, policy().state);
    const [, port, hostPort] = portSpecs[role];
    expect(approved.body.HostConfig.PortBindings).toEqual({ [port]: [{ HostIp: "127.0.0.1", HostPort: hostPort }] });
    expect(approved.body.HostConfig.RestartPolicy).toEqual({ Name: "no", MaximumRetryCount: 0 });
    expect(approved.body.Env).toEqual(input.Env);
    expect(input).toEqual(copy);
  });
  it.each([
    { PublishAllPorts: true }, { Privileged: true }, { NetworkMode: "host" },
    { NetworkMode: "portfolio-acceptance-v2-loopback" },
    { Binds: ["/var/run/docker.sock:/var/run/docker.sock"] },
    { Mounts: [{ Type: "bind", Source: "/", Target: "/host" }] },
    { VolumesFrom: ["unrelated-container"] }, { Devices: [{ PathOnHost: "/dev/sda" }] },
    { CapAdd: ["SYS_ADMIN"] }, { AutoRemove: true },
    { PortBindings: { "5432/tcp": [{ HostIp: "0.0.0.0", HostPort: "5432" }] } },
    { PortBindings: { "5432/tcp": [{ HostIp: "127.0.0.1", HostPort: "55432" }] } },
    { PortBindings: { "5432/tcp": [{ HostIp: "::", HostPort: "45432" }, { HostIp: "0.0.0.0", HostPort: "45432" }] } },
    { PortBindings: { "5432/tcp": [{ HostIp: "0.0.0.0", HostPort: "45432" }], "9999/tcp": [{ HostPort: "59999" }] } },
  ])("rejects unsafe host options %j", change => {
    const input = fixture();
    expect(() => guardContainerCreate({ ...input, HostConfig: { ...input.HostConfig, ...change } }, name("db"), workspace, policy().state)).toThrow();
  });
  it.each([
    { Labels: { ...labels, [project]: "artist-portfolio-acceptance" } },
    { Labels: { ...labels, [project]: "artist-portfolio-acceptance-v2" } },
    { Labels: { ...labels, [compose]: "unrelated" } },
    { Labels: { ...labels, [workdir]: path.resolve(workspace, "other") } },
    { Image: "attacker/postgres:latest" }, { Image: "public.ecr.aws/supabase/kong:fixture" },
    { NetworkingConfig: { EndpointsConfig: { unrelated: {} } } }, { Volumes: { "/foreign": {} } },
  ])("rejects wrong identity/image or implicit mount %j", change => {
    expect(() => guardContainerCreate({ ...fixture(), ...change }, name("db"), workspace, policy().state)).toThrow();
  });
  it("will only mount a newly tracked named volume at its approved destination", () => {
    const input = fixture(); input.HostConfig.Binds = [`${name("db")}:/var/lib/postgresql/data`];
    const value = policy();
    expect(() => guardContainerCreate(input, name("db"), workspace, value.state)).toThrow("foreign-bind");
    const volume = { Name: name("db"), Labels: { [project]: ACCEPTANCE_PROJECT_ID, [compose]: ACCEPTANCE_PROJECT_ID } };
    const plan = value.authorize("POST", "/volumes/create", json(volume)); value.completed(plan, 201, json(volume));
    expect(guardContainerCreate(input, name("db"), workspace, value.state).role).toBe("db");
    input.HostConfig.Binds = [`${name("db")}:/foreign`];
    expect(() => guardContainerCreate(input, name("db"), workspace, value.state)).toThrow("foreign-bind");
  });
});

describe("narrow CLI schema-job exception", () => {
  it.each(Object.keys(BOOTSTRAP_COMMANDS) as Array<keyof typeof BOOTSTRAP_COMMANDS>)("accepts only one exact cached %s bootstrap job", family => {
    const value = policy(); const input = bootstrap(family);
    const plan = value.authorize("POST", "/containers/create", json(input));
    expect(JSON.parse(plan.body.toString()).Labels[workdir]).toBe(workspace);
    expect(input.Labels).not.toHaveProperty(workdir);
    expect(() => value.authorize("POST", "/containers/create", json(input))).toThrow("bootstrap-job");
    value.completed(plan, 201, json({ Id: containerId }));
    expect(value.authorize("DELETE", `/containers/${containerId}`).kind).toBe("job-remove");
  });
  it.each([
    { Cmd: ["sh", "-c", "unexpected"] }, { Entrypoint: ["sh"] }, { ExposedPorts: { "4000/tcp": {} } },
    { Image: "public.ecr.aws/supabase/realtime:unapproved" },
    { Labels: { [project]: ACCEPTANCE_PROJECT_ID, [compose]: ACCEPTANCE_PROJECT_ID, extra: "value" } },
    { Labels: { ...labels, [workdir]: "foreign" } },
    { Volumes: { "/data": {} } },
  ])("rejects altered bootstrap request %j", change => {
    expect(() => policy().authorize("POST", "/containers/create", json({ ...bootstrap(), ...change }))).toThrow();
  });
  it.each([
    { Binds: ["existing:/data"] }, { Mounts: [{ Type: "bind", Source: "/", Target: "/host" }] },
    { PortBindings: { "4000/tcp": [{ HostPort: "54000" }] } }, { AutoRemove: false },
    { VolumesFrom: [name("db")] }, { PublishAllPorts: true }, { NetworkMode: "host" },
  ])("rejects bootstrap mount, port or host deviation %j", change => {
    const input = bootstrap();
    expect(() => policy().authorize("POST", "/containers/create", json({ ...input, HostConfig: { ...input.HostConfig, ...change } }))).toThrow();
  });
});

describe("namespace-scoped Docker requests", () => {
  it.each([
    ["DELETE", "/containers/old-container"], ["POST", "/containers/old-container/start"],
    ["PUT", "/containers/old-container/archive?path=/"], ["POST", "/containers/prune"],
    ["HEAD", "/containers/old-container/archive?path=/"],
    ["HEAD", `/containers/${name("db")}/archive?path=/`],
    ["POST", "/volumes/prune"], ["DELETE", `/volumes/${name("db")}`],
    ["POST", "/networks/create"], ["POST", `/networks/${START_NETWORK}/connect`],
    ["POST", "/build"], ["POST", "/commit"], ["POST", "/exec/foreign/start"],
  ])("denies %s %s", (method, route) => expect(() => policy().authorize(method, route)).toThrow());
  it("tracks only successful returned IDs and refuses persistent deletion", () => {
    const value = createTracked();
    expect(value.authorize("POST", `/containers/${containerId}/start`).kind).toBe("start");
    expect(value.authorize("PUT", `/containers/${name("db")}/archive?path=/`).kind).toBe("archive");
    expect(value.authorize("HEAD", `/containers/${containerId}/archive?path=/`).kind).toBe("read");
    expect(() => value.authorize("DELETE", `/containers/${containerId}`)).toThrow();
    const exec = value.authorize("POST", `/containers/${containerId}/exec`, json({ Cmd: ["psql"], Privileged: false }));
    value.completed(exec, 201, json({ Id: execId }));
    expect(value.authorize("POST", `/exec/${execId}/start`, json({ Detach: false })).kind).toBe("exec-stream");
    expect(() => value.authorize("POST", `/containers/${containerId}/exec`, json({ Privileged: true }))).toThrow("exec-shape");
    expect(() => value.authorize("POST", `/containers/create?name=${name("db")}`, json(fixture()))).toThrow("container-name");
  });
  it("scopes discovery and only allows trusted public image pulls", () => {
    const result = policy().authorize("GET", '/containers/json?all=1&filters={"label":["foreign"]}');
    const filter = JSON.parse(new URL(result.path, "http://docker").searchParams.get("filters")!);
    expect(filter.label).toEqual([`${project}=${ACCEPTANCE_PROJECT_ID}`]);
    expect(policy().authorize("POST", "/images/create?fromImage=public.ecr.aws%2Fsupabase%2Fpostgres&tag=fixture").kind).toBe("image-pull");
    expect(() => policy().authorize("POST", "/images/create?fromImage=attacker%2Fpostgres")).toThrow("image-pull");
    expect(() => policy().authorize("POST", "/images/create?fromSrc=http://untrusted")).toThrow("image-pull");
  });
});

function ipcPath() {
  return process.platform === "win32" ? `\\\\.\\pipe\\acceptance-test-${randomUUID()}` : path.join(os.tmpdir(), `acceptance-test-${randomUUID()}.sock`);
}
function listen(server: http.Server, socketPath: string) {
  return new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(socketPath, resolve); });
}
function request(socketPath: string, method: string, route: string, body = Buffer.alloc(0)) {
  return new Promise<{ status: number; body: Buffer }>((resolve, reject) => {
    const req = http.request({ socketPath, method, path: route, agent: false, headers: { "content-length": body.length } }, res => {
      const chunks: Buffer[] = [];
      res.on("data", chunk => chunks.push(chunk));
      res.on("error", reject);
      res.on("end", () => resolve({ status: res.statusCode!, body: Buffer.concat(chunks) }));
    });
    req.on("error", reject); req.end(body);
  });
}

describe("private IPC HTTP transport (fake engine only)", () => {
  it("flushes wait registration headers before the client starts the container", async () => {
    const calls: string[] = []; let waiting: http.ServerResponse | undefined;
    const upstream = http.createServer((req, res) => {
      if (req.url?.includes("/wait")) {
        calls.push("wait"); waiting = res;
        res.writeHead(200, { "content-type": "application/json" }); res.flushHeaders();
      } else {
        calls.push("start"); res.writeHead(204); res.end(); waiting!.end('{"StatusCode":0}');
      }
    });
    const upstreamPath = ipcPath(); const proxyPath = ipcPath();
    const proxy = createStartProxy(createTracked(), { enginePipe: upstreamPath });
    let client: http.ClientRequest | undefined; let timer: ReturnType<typeof setTimeout> | undefined;
    let finished!: (body: string) => void;
    const completion = new Promise<string>(resolve => { finished = resolve; });
    try {
      await listen(upstream, upstreamPath); await listen(proxy.server, proxyPath);
      const headers = new Promise<number>((resolve, reject) => {
        client = http.request({ socketPath: proxyPath, method: "POST", path: `/containers/${containerId}/wait?condition=removed`, agent: false }, res => {
          resolve(res.statusCode!); let body = "";
          res.on("data", chunk => { body += chunk.toString(); });
          res.on("end", () => finished(body)); res.on("error", () => finished("stream-failed"));
        });
        client.on("error", reject); client.end();
      });
      const deadline = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("Wait headers were buffered until body")), 1000);
      });
      expect(await Promise.race([headers, deadline])).toBe(200);
      clearTimeout(timer);
      expect(calls).toEqual(["wait"]);
      expect((await request(proxyPath, "POST", `/containers/${containerId}/start`)).status).toBe(204);
      expect(await completion).toBe('{"StatusCode":0}');
      expect(calls).toEqual(["wait", "start"]);
    } finally {
      clearTimeout(timer); client?.destroy(); await proxy.close(); waiting?.destroy();
      await new Promise<void>(resolve => upstream.close(() => resolve()));
    }
  });
  it("forwards the rewritten create, never forwards rejected requests, and tracks returned IDs", async () => {
    const seen: Array<{ route: string; body: string }> = [];
    const upstream = http.createServer(async (req, res) => {
      const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(chunk);
      seen.push({ route: req.url!, body: Buffer.concat(chunks).toString() });
      res.writeHead(201, { "content-type": "application/json" }); res.end(JSON.stringify({ Id: containerId }));
    });
    const upstreamPath = ipcPath(); const proxyPath = ipcPath();
    const value = policy(); const proxy = createStartProxy(value, { enginePipe: upstreamPath });
    try {
      await listen(upstream, upstreamPath); await listen(proxy.server, proxyPath);
      const reply = await request(proxyPath, "POST", `/v1.51/containers/create?name=${name("db")}`, json(fixture()));
      expect(reply.status).toBe(201);
      expect(JSON.parse(seen[0].body).HostConfig.PortBindings["5432/tcp"]).toEqual([{ HostIp: "127.0.0.1", HostPort: "45432" }]);
      expect(value.state.containers.has(containerId)).toBe(true);
      const refused = await request(proxyPath, "DELETE", "/v1.51/containers/old-production");
      expect(refused.status).toBe(403); expect(seen).toHaveLength(1);
      expect(refused.body.toString()).not.toContain("FAKE_SECRET");
    } finally { await proxy.close(); await new Promise<void>(resolve => upstream.close(() => resolve())); }
  });
  it("preserves fragmented exec upgrade body and both stream directions", async () => {
    const upstream = http.createServer(); const upstreamPath = ipcPath(); const proxyPath = ipcPath();
    const value = createTracked(); value.state.execs.add(execId);
    const proxy = createStartProxy(value, { enginePipe: upstreamPath });
    const upstreamSockets = new Set<net.Socket>();
    upstream.on("connection", socket => { upstreamSockets.add(socket); socket.on("close", () => upstreamSockets.delete(socket)); });
    let receivedBody = "";
    upstream.on("upgrade", (req, socket, head) => {
      const length = Number(req.headers["content-length"]); let pending = head;
      function receive(chunk?: Buffer) {
        if (chunk) pending = Buffer.concat([pending, chunk]);
        if (pending.length < length) return;
        socket.off("data", receive); receivedBody = pending.subarray(0, length).toString();
        socket.write("HTTP/1.1 101 UPGRADED\r\nConnection: Upgrade\r\nUpgrade: tcp\r\n\r\nFROM-ENGINE");
        if (pending.length > length) socket.write(pending.subarray(length));
        socket.on("data", data => socket.write(data));
      }
      receive(); if (pending.length < length) socket.on("data", receive);
    });
    let client: net.Socket | undefined;
    try {
      await listen(upstream, upstreamPath); await listen(proxy.server, proxyPath);
      const body = JSON.stringify({ Detach: false, Tty: false });
      const output = await new Promise<string>((resolve, reject) => {
        client = net.connect(proxyPath); let all = ""; let sent = false;
        client.setTimeout(3000, () => reject(new Error("IPC upgrade timed out")));
        client.on("error", reject);
        client.on("data", data => {
          all += data.toString();
          if (all.includes("FROM-ENGINE") && !sent) { sent = true; client!.write("LATER-CLIENT"); }
          if (all.includes("EARLY-CLIENT") && all.includes("LATER-CLIENT")) resolve(all);
        });
        client.on("connect", () => {
          client!.write(`POST /v1.51/exec/${execId}/start HTTP/1.1\r\nHost: docker\r\nConnection: Upgrade\r\nUpgrade: tcp\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body.slice(0, 5)}`);
          setImmediate(() => client!.write(`${body.slice(5)}EARLY-CLIENT`));
        });
      });
      expect(receivedBody).toBe(body); expect(output).toContain("101 UPGRADED"); expect(proxy.failures()).toBe(0);
    } finally { client?.destroy(); await proxy.close(); for (const socket of upstreamSockets) socket.destroy(); await new Promise<void>(resolve => upstream.close(() => resolve())); }
  });
  it("closes a stalled upstream request when the proxy closes", async () => {
    let received!: () => void; const started = new Promise<void>(resolve => { received = resolve; });
    const upstream = http.createServer(() => { received(); });
    const upstreamPath = ipcPath(); const proxyPath = ipcPath();
    const proxy = createStartProxy(policy(), { enginePipe: upstreamPath });
    let upstreamSocket: net.Socket | undefined;
    upstream.on("connection", socket => { upstreamSocket = socket; });
    try {
      await listen(upstream, upstreamPath); await listen(proxy.server, proxyPath);
      const pending = request(proxyPath, "GET", "/version").catch(() => undefined);
      await started; await proxy.close(); await pending;
      await new Promise<void>(resolve => { if (upstreamSocket!.destroyed) resolve(); else upstreamSocket!.once("close", () => resolve()); });
      expect(upstreamSocket!.destroyed).toBe(true);
    } finally { await proxy.close(); upstreamSocket?.destroy(); await new Promise<void>(resolve => upstream.close(() => resolve())); }
  });
  it("reframes a chunked engine error after a rejected upgrade", async () => {
    const upstream = http.createServer((_req, res) => {
      res.writeHead(500, { "content-type": "application/json" });
      res.write('{"message":'); res.end('"fixture failure"}');
    });
    const upstreamPath = ipcPath(); const proxyPath = ipcPath();
    const value = createTracked(); value.state.execs.add(execId);
    const proxy = createStartProxy(value, { enginePipe: upstreamPath });
    let client: net.Socket | undefined;
    try {
      await listen(upstream, upstreamPath); await listen(proxy.server, proxyPath);
      const output = await new Promise<string>((resolve, reject) => {
        client = net.connect(proxyPath); let all = "";
        client.setTimeout(3000, () => reject(new Error("IPC error response timed out")));
        client.on("error", reject); client.on("data", data => { all += data.toString(); });
        client.on("end", () => resolve(all));
        client.on("connect", () => client!.end(`POST /exec/${execId}/start HTTP/1.1\r\nHost: docker\r\nConnection: Upgrade\r\nUpgrade: tcp\r\nContent-Length: 2\r\n\r\n{}`));
      });
      expect(output).toContain("500 Internal Server Error");
      expect(output.toLowerCase()).not.toContain("transfer-encoding");
      const [headers, body] = output.split("\r\n\r\n");
      expect(headers).toContain(`Content-Length: ${Buffer.byteLength(body)}`);
      expect(JSON.parse(body)).toEqual({ message: "fixture failure" });
    } finally { client?.destroy(); await proxy.close(); await new Promise<void>(resolve => upstream.close(() => resolve())); }
  });
});
