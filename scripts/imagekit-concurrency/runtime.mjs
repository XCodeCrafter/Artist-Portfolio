// Real PostgreSQL, but never an existing database: only a new, labelled,
// network-less, tmpfs-backed container from an already cached local image.
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

export const IMAGE = "public.ecr.aws/supabase/postgres:17.6.1.167";
export const LABEL = "portfolio.imagekit-concurrency-run";
export const DOCKER_HOST = process.platform === "win32"
  ? "npipe:////./pipe/dockerDesktopLinuxEngine" : "unix:///var/run/docker.sock";

export function assertOwnedContainer(info, identity) {
  if (!/^[a-f0-9]{64}$/.test(identity.id) || info.Id !== identity.id ||
      info.Name !== `/${identity.name}` || info.Image !== identity.image ||
      info.Config?.Labels?.[LABEL] !== identity.runId) {
    throw new Error("Refusing operation on a container not owned by this test run.");
  }
}

export function assertIsolatedContainer(info, identity) {
  assertOwnedContainer(info, identity);
  const host = info.HostConfig;
  const mounts = info.Mounts ?? [];
  if (host?.NetworkMode !== "none" || host.ReadonlyRootfs !== true ||
      host.Privileged !== false || host.PublishAllPorts !== false ||
      info.Config?.User !== "postgres" || info.Config.Volumes != null ||
      Object.keys(host.PortBindings ?? {}).length !== 0 ||
      Object.keys(info.NetworkSettings?.Ports ?? {}).length !== 0 ||
      (host.Binds?.length ?? 0) !== 0 || (host.VolumesFrom?.length ?? 0) !== 0 ||
      (host.Mounts?.length ?? 0) !== 0 ||
      (host.Links?.length ?? 0) !== 0 || (host.Devices?.length ?? 0) !== 0 ||
      (host.DeviceRequests?.length ?? 0) !== 0 ||
      !["", undefined].includes(host.PidMode) || !["", undefined].includes(host.UTSMode) ||
      !["private", "", undefined].includes(host.IpcMode) ||
      (host.CapAdd?.length ?? 0) !== 0 ||
      !host.CapDrop?.includes("ALL") || !host.SecurityOpt?.includes("no-new-privileges") ||
      !Array.isArray(mounts) || mounts.some(mount =>
        mount.Type !== "tmpfs" || !["/pgtest", "/tmp"].includes(mount.Destination)) ||
      Object.keys(host.Tmpfs ?? {}).sort().join(",") !== "/pgtest,/tmp" ||
      Object.keys(info.NetworkSettings?.Networks ?? {}).some(name => name !== "none")) {
    throw new Error("Refusing SQL: temporary PostgreSQL container is not isolated.");
  }
}

// Do not pass inherited application/PG secrets or Docker transport overrides.
// The explicit local socket is the only supported Docker transport.
const childEnv = () => Object.fromEntries(Object.entries(process.env).filter(([name]) =>
  /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|TEMP|TMP|HOME|USERPROFILE|COMSPEC)$/i.test(name)));
function docker(args, options = {}) {
  const { input, timeout = 30000 } = options;
  return new Promise((resolve, reject) => {
    const child = spawn("docker", ["--host", DOCKER_HOST, ...args], {
      env: childEnv(), windowsHide: true, stdio: ["pipe", "pipe", "pipe"], shell: false,
    });
    let out = "", err = "";
    const timer = setTimeout(() => { child.kill(); reject(new Error(`Docker command timed out: ${args[0]}`)); }, timeout);
    child.stdout.on("data", chunk => {
      out += chunk;
      if (out.length > 4_000_000) { child.kill(); reject(new Error("Docker output exceeded test limit.")); }
    });
    child.stderr.on("data", chunk => { err = (err + chunk).slice(-16000); });
    child.on("error", error => { clearTimeout(timer); reject(error); });
    child.on("close", code => {
      clearTimeout(timer);
      if (code === 0) resolve(out.trim());
      else reject(new Error(`Docker ${args[0]} failed (${code}): ${err || out}`));
    });
    child.stdin.on("error", () => {});
    child.stdin.end(input);
  });
}

const psqlArgs = id => ["exec", "-i", id, "psql", "-X", "-q", "-A", "-t",
  "-h", "/pgtest", "-U", "postgres", "-d", "postgres", "-v", "VERBOSITY=verbose"];

export class SqlSession {
  constructor(id) {
    this.child = spawn("docker", ["--host", DOCKER_HOST, ...psqlArgs(id), "-v", "ON_ERROR_STOP=0"], {
      env: childEnv(), windowsHide: true, stdio: ["pipe", "pipe", "pipe"], shell: false,
    });
    this.buffer = "";
    this.errorOutput = "";
    this.pending = null;
    this.outstanding = Promise.resolve();
    this.dead = false;
    this.child.stdout.on("data", chunk => this.consume(chunk.toString()));
    this.child.stderr.on("data", chunk => { this.errorOutput = (this.errorOutput + chunk).slice(-16000); });
    this.child.stdin.on("error", error => this.fail(error));
    this.child.on("error", error => this.fail(error));
    this.closed = new Promise(resolve => this.child.on("close", code => {
      this.dead = true;
      this.fail(new Error(`psql session closed (${code}): ${this.errorOutput}`));
      resolve();
    }));
  }
  fail(error) {
    if (!this.pending) return;
    clearTimeout(this.pending.timer);
    this.pending.reject(error);
    this.pending = null;
  }
  consume(chunk) {
    this.buffer += chunk;
    if (this.buffer.length + (this.pending?.size ?? 0) > 2_000_000) {
      this.dead = true;
      this.fail(new Error("psql output exceeded test limit.")); this.child.kill(); return;
    }
    let newline;
    while ((newline = this.buffer.indexOf("\n")) !== -1) {
      const line = this.buffer.slice(0, newline).replace(/\r$/, "");
      this.buffer = this.buffer.slice(newline + 1);
      const task = this.pending;
      if (!task) continue;
      if (!line.startsWith(`${task.marker} `)) { task.lines.push(line); task.size += line.length + 1; continue; }
      clearTimeout(task.timer);
      this.pending = null;
      const code = line.slice(task.marker.length + 1);
      if (code === "00000") task.resolve(task.lines.join("\n").trim());
      else {
        const error = new Error(`SQL ${code}: ${this.errorOutput}`);
        error.code = code;
        task.reject(error);
      }
    }
  }
  // One SQL statement per call. Setup batches use execSql with ON_ERROR_STOP=1.
  query(sql) {
    if (this.dead) return Promise.reject(new Error("psql session is closed."));
    if (this.pending) return Promise.reject(new Error("Use a different session for concurrent SQL."));
    if (/^\s*\\/m.test(sql)) return Promise.reject(new Error("psql meta-commands are not accepted."));
    this.errorOutput = "";
    const result = new Promise((resolve, reject) => {
      const marker = `END_${randomUUID().replaceAll("-", "")}`;
      const timer = setTimeout(() => {
        this.dead = true;
        this.fail(new Error("SQL session deadline exceeded.")); this.child.kill();
      }, 25000);
      this.pending = { marker, timer, resolve, reject, lines: [], size: 0 };
      this.child.stdin.write(`${sql.trim().replace(/;$/, "")};\n\\echo ${marker} :SQLSTATE\n`);
    });
    this.outstanding = result.catch(() => {});
    return result;
  }
  async idle() { await this.outstanding; }
  async scalar(sql) { return JSON.parse(await this.query(sql)); }
  async close() {
    if (this.dead) return;
    this.child.stdin.end("\\q\n");
    const timer = setTimeout(() => this.child.kill(), 2000);
    await this.closed;
    clearTimeout(timer);
  }
}

export async function createRuntime() {
  const runId = randomUUID();
  const name = `portfolio-imagekit-race-${runId}`;
  // Inspect by tag, then create by immutable image ID. Never pull an image.
  const image = JSON.parse(await docker(["image", "inspect", IMAGE]))[0];
  if (!/^sha256:[a-f0-9]{64}$/.test(image?.Id) || image.Config?.Volumes != null)
    throw new Error("Cached PostgreSQL image is missing or declares persistent volumes.");
  const identity = { runId, name, image: image.Id, id: "" };
  const sessions = [];
  let creation;
  let cleaning;
  const inspect = async () => JSON.parse(await docker(["inspect", identity.id]))[0];
  const signalHandlers = new Map();
  const cleanup = () => {
    cleaning ??= (async () => {
      try {
        await Promise.all(sessions.map(session => session.close()));
        if (creation) await creation.catch(() => {});
        // A lost create reply must not silently orphan data. Resolve only our
        // exact random name, then prove label/image/full ID before adopting it.
        if (!identity.id && creation) {
          let recovered;
          try { recovered = JSON.parse(await docker(["inspect", name]))[0]; }
          catch (error) {
            if (/No such (object|container):/i.test(error.message)) return;
            throw error;
          }
          const candidate = { ...identity, id: recovered.Id };
          assertOwnedContainer(recovered, candidate);
          identity.id = candidate.id;
        }
        if (!identity.id) return;
        assertOwnedContainer(await inspect(), identity);
        await docker(["rm", "--force", identity.id]);
        const remaining = await docker(["ps", "--all", "--quiet", "--no-trunc", "--filter", `id=${identity.id}`]);
        if (remaining) throw new Error(`Temporary test container still exists: ${identity.name}`);
        console.log("Temporary PostgreSQL container removed; tmpfs data discarded.");
        identity.id = "";
      } finally {
        for (const [signal, handler] of signalHandlers) process.removeListener(signal, handler);
      }
    })();
    return cleaning;
  };
  for (const [signal, code] of [["SIGINT", 130], ["SIGTERM", 143]]) {
    const handler = () => {
      console.error(`${signal}: cleaning up only ${name}.`);
      void cleanup().then(() => process.exit(code), error => {
        console.error(`Cleanup could not be confirmed for ${name}: ${error.message}`);
        process.exit(code);
      });
    };
    signalHandlers.set(signal, handler);
    process.once(signal, handler);
  }
  try {
    creation = docker(["create", "--pull=never", "--name", name,
      "--label", `${LABEL}=${runId}`, "--network", "none", "--read-only", "--user", "postgres",
      "--cap-drop=ALL", "--security-opt=no-new-privileges", "--pids-limit=128",
      "--memory=512m", "--cpus=2", "--tmpfs", "/pgtest:rw,nosuid,nodev,size=384m,mode=1777",
      "--tmpfs", "/tmp:rw,nosuid,nodev,size=64m,mode=1777", "--entrypoint", "/bin/sh", image.Id, "-ec",
      "export PATH=/usr/lib/postgresql/17/bin:/usr/local/bin:/usr/bin:/bin; " +
      "initdb -D /pgtest/data --auth=trust --no-locale --encoding=UTF8 > /pgtest/init.log; " +
      "exec postgres -D /pgtest/data -k /pgtest -c listen_addresses='' -c max_connections=12 -c shared_buffers=32MB",
    ]).then(id => { identity.id = id; return id; });
    await creation;
    assertIsolatedContainer(await inspect(), identity);
    await docker(["start", identity.id]);
    let ready = false;
    const deadline = Date.now() + 25000;
    while (Date.now() < deadline) {
      try { await docker(["exec", identity.id, "pg_isready", "-h", "/pgtest", "-U", "postgres"], { timeout: 3000 }); ready = true; break; }
      catch { await new Promise(resolve => setTimeout(resolve, 100)); }
    }
    if (!ready) throw new Error(`Temporary PostgreSQL did not start: ${await docker(["logs", "--tail", "30", identity.id])}`);
    assertIsolatedContainer(await inspect(), identity);
    console.log(`Isolated PostgreSQL ready: ${name} (no network, ports or persistent volumes).`);
    return {
      cleanup,
      async execSql(sql) {
        assertIsolatedContainer(await inspect(), identity);
        return docker([...psqlArgs(identity.id), "-v", "ON_ERROR_STOP=1"], { input: sql, timeout: 90000 });
      },
      async session({ serviceRole = false } = {}) {
        assertIsolatedContainer(await inspect(), identity);
        const session = new SqlSession(identity.id);
        sessions.push(session);
        session.pid = await session.scalar("select to_json(pg_backend_pid())");
        await session.query("set statement_timeout = '20s'");
        await session.query("set lock_timeout = '15s'");
        await session.query("set idle_in_transaction_session_timeout = '30s'");
        if (serviceRole) await session.query("set role service_role");
        return session;
      },
    };
  } catch (error) {
    try { await cleanup(); } catch (cleanupError) { throw new AggregateError([error, cleanupError], `Test failed; inspect only ${name} for cleanup.`); }
    throw error;
  }
}
