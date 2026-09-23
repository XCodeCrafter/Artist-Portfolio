import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { buildLoopbackClone, verifyLoopbackRuntime } from "../scripts/acceptance/rebind.mjs";
import { ACCEPTANCE_PROJECT_ID } from "../scripts/acceptance/isolation.mjs";

const workspace = path.resolve("test-fixtures", "isolated-acceptance");
const network = "portfolio-acceptance-loopback";
const ports = {
  db: ["5432/tcp", "55432"],
  kong: ["8000/tcp", "55431"],
  studio: ["3000/tcp", "55433"],
  inbucket: ["8025/tcp", "55434"],
} as const;
type Role = keyof typeof ports;

function fixture(role: Role = "db") {
  const name = `supabase_${role}_${ACCEPTANCE_PROJECT_ID}`;
  const [port, hostPort] = ports[role];
  return {
    Id: `container-id-${role}`,
    Name: `/${name}`,
    State: { Running: false },
    Config: {
      Image: "local-fixture-image:original",
      Labels: {
        "com.supabase.cli.project": ACCEPTANCE_PROJECT_ID,
        "com.supabase.cli.workdir": workspace,
        "fixture-label": "preserved",
      },
      Env: ["FAKE_FIXTURE_SECRET=never-render-this"],
      Entrypoint: ["/fixture-entrypoint"],
      Cmd: ["serve"],
      Healthcheck: { Test: ["CMD", "fixture-health"] },
      User: "fixture",
      WorkingDir: "/fixture",
      Volumes: role === "db" ? { "/var/lib/postgresql/data": {} } : {},
    },
    HostConfig: {
      NetworkMode: network,
      RestartPolicy: { Name: "unless-stopped", MaximumRetryCount: 5 },
      PortBindings: { [port]: [{ HostIp: "0.0.0.0", HostPort: String(hostPort) }] },
      Binds: role === "db" ? [`supabase_db_${ACCEPTANCE_PROJECT_ID}:/var/lib/postgresql/data:rw`] : [],
      ShmSize: 64 * 1024 * 1024,
      LogConfig: { Type: "json-file", Config: {} },
    },
    NetworkSettings: { Networks: { [network]: { Aliases: [name, `old-container-id-${role}`] } } as Record<string, { Aliases: string[] }> },
    Mounts: role === "db" ? [{
      Type: "volume",
      Name: `supabase_db_${ACCEPTANCE_PROJECT_ID}`,
      Source: "/var/lib/docker/volumes/fixture/_data",
      Destination: "/var/lib/postgresql/data",
      RW: true,
    }] : role === "studio" ? [{
      Type: "bind",
      Name: "",
      Source: path.join(workspace, "supabase", "snippets"),
      Destination: `${workspace.replace(/^[A-Za-z]:/, "").replaceAll("\\", "/")}/supabase/snippets`,
      RW: true,
    }] : [],
  };
}

describe("acceptance Docker loopback replacement plan", () => {
  it.each(Object.keys(ports) as Role[])("pins %s to its sole dedicated IPv4 loopback port", (role) => {
    const container = fixture(role);
    const original = structuredClone(container);
    const [port, hostPort] = ports[role];
    const result = buildLoopbackClone(container, workspace, role);
    expect(result.HostConfig.PortBindings).toEqual({ [port]: [{ HostIp: "127.0.0.1", HostPort: hostPort }] });
    expect(result.HostConfig.RestartPolicy).toEqual({ Name: "no", MaximumRetryCount: 0 });
    expect(container).toEqual(original);
  });

  it("retains the database mount, runtime config, labels and network aliases", () => {
    const container = fixture();
    const result = buildLoopbackClone(container, workspace, "db");
    for (const [key, value] of Object.entries(container.Config)) expect(result[key]).toEqual(value);
    expect(result.HostConfig.Binds).toEqual(container.HostConfig.Binds);
    expect(result.HostConfig.ShmSize).toBe(container.HostConfig.ShmSize);
    expect(result.HostConfig.LogConfig).toEqual(container.HostConfig.LogConfig);
    expect(result.NetworkingConfig.EndpointsConfig).toEqual({
      [network]: { Aliases: container.NetworkSettings.Networks[network].Aliases },
    });
  });

  it("rejects an unsupported role before constructing any clone", () => {
    expect(() => buildLoopbackClone(fixture(), workspace, "auth")).toThrow("Unexpected acceptance container role");
  });

  it.each(["PublishAllPorts", "AutoRemove"] as const)("rejects unsafe Docker option %s", (option) => {
    const container = fixture();
    const unsafe = { ...container, HostConfig: { ...container.HostConfig, [option]: true } };
    expect(() => buildLoopbackClone(unsafe, workspace, "db")).toThrow();
  });

  const unsafeIdentityCases: Array<[string, (container: ReturnType<typeof fixture>) => void]> = [
    ["running container", (container) => { container.State.Running = true; }],
    ["unexpected container name", (container) => { container.Name = "/supabase_db_some-other-project"; }],
    ["different project label", (container) => { container.Config.Labels["com.supabase.cli.project"] = "live-project"; }],
    ["different work directory", (container) => { container.Config.Labels["com.supabase.cli.workdir"] = path.resolve(workspace, "another"); }],
    ["host network", (container) => { container.HostConfig.NetworkMode = "host"; }],
    ["wrong network endpoint", (container) => { container.NetworkSettings.Networks = { other: { Aliases: [] } }; }],
    ["multiple network endpoints", (container) => { container.NetworkSettings.Networks.other = { Aliases: [] }; }],
    ["no network endpoint", (container) => { container.NetworkSettings.Networks = {}; }],
  ];

  it.each(unsafeIdentityCases)("rejects %s", (_label, mutate) => {
    const container = fixture();
    mutate(container);
    expect(() => buildLoopbackClone(container, workspace, "db")).toThrow("exact stopped acceptance containers");
  });

  const unsafePortCases: Array<[string, (container: ReturnType<typeof fixture>) => void]> = [
    ["missing port binding", (container) => { container.HostConfig.PortBindings = {}; }],
    ["other host port", (container) => { container.HostConfig.PortBindings["5432/tcp"][0].HostPort = "5432"; }],
    ["additional published port", (container) => { container.HostConfig.PortBindings["9999/tcp"] = [{ HostIp: "127.0.0.1", HostPort: "9999" }]; }],
    ["additional IPv6 binding", (container) => { container.HostConfig.PortBindings["5432/tcp"].push({ HostIp: "::", HostPort: "55432" }); }],
    ["wrong container port", (container) => { container.HostConfig.PortBindings = { "5433/tcp": [{ HostIp: "0.0.0.0", HostPort: "55432" }] }; }],
  ];

  it.each(unsafePortCases)("rejects %s", (_label, mutate) => {
    const container = fixture();
    mutate(container);
    expect(() => buildLoopbackClone(container, workspace, "db")).toThrow("Unexpected acceptance port mapping");
  });

  it("refuses a missing database volume instead of silently creating a blank one", () => {
    const container = fixture();
    container.Mounts = [];
    expect(() => buildLoopbackClone(container, workspace, "db")).toThrow("Unexpected acceptance mount count");
  });

  it.each(["Name", "Type", "Destination"] as const)("rejects a changed database mount %s", (key) => {
    const container = fixture();
    container.Mounts[0][key] = "unexpected";
    expect(() => buildLoopbackClone(container, workspace, "db")).toThrow("Unexpected acceptance mount");
  });

  it("rejects duplicate database mounts", () => {
    const container = fixture();
    container.Mounts.push(structuredClone(container.Mounts[0]));
    expect(() => buildLoopbackClone(container, workspace, "db")).toThrow("Unexpected acceptance mount count");
  });

  it.each(["kong", "inbucket"] as Role[])("rejects an unapproved %s filesystem mount", (role) => {
    const container = fixture(role);
    container.Mounts = fixture().Mounts;
    expect(() => buildLoopbackClone(container, workspace, role)).toThrow("Unexpected acceptance mount");
  });

  it.each(["Source", "Destination", "Type"] as const)("rejects a changed Studio mount %s", (key) => {
    const container = fixture("studio");
    container.Mounts[0][key] = "unexpected";
    expect(() => buildLoopbackClone(container, workspace, "studio")).toThrow("Unexpected acceptance mount");
  });

  it("refuses Studio without its existing snippets bind", () => {
    const container = fixture("studio");
    container.Mounts = [];
    expect(() => buildLoopbackClone(container, workspace, "studio")).toThrow("Unexpected acceptance mount count");
  });
});

function runtimeFixture(role: Role) {
  const container = fixture(role);
  const [port, hostPort] = ports[role];
  return {
    ...container,
    State: { Running: true },
    NetworkSettings: {
      ...container.NetworkSettings,
      Ports: { [port]: [{ HostIp: "127.0.0.1", HostPort: String(hostPort) }] } as Record<string, Array<{ HostIp: string; HostPort: string }> | null>,
    },
  };
}

type InventoryEntry = {
  Names: string[];
  State: string;
  Labels: Record<string, string>;
  Ports: Array<{ IP?: string; PrivatePort: number; PublicPort?: number }>;
};

function mockRuntime() {
  const entries = Object.fromEntries((Object.keys(ports) as Role[]).map((role) => [role, runtimeFixture(role)]));
  const inventory: InventoryEntry[] = (Object.keys(ports) as Role[]).map((role) => ({
    Names: [entries[role].Name],
    State: "running",
    Labels: { ...entries[role].Config.Labels },
    Ports: [{ IP: "127.0.0.1", PrivatePort: Number(ports[role][0].split("/")[0]), PublicPort: Number(ports[role][1]) }],
  }));
  const request = vi.fn(async (method: string, route: string) => {
    if (method !== "GET") throw new Error("Runtime verification must be read-only");
    if (route === "/containers/json?all=true") return inventory;
    const found = Object.values(entries).find((entry) => route === `/containers/${entry.Name.slice(1)}/json`);
    if (!found) throw new Error("Unexpected Docker read target");
    return found;
  });
  return { entries, inventory, request };
}

describe("acceptance actual Docker runtime port gate", () => {
  it("accepts the four exact running loopback services using read-only requests", async () => {
    const { request } = mockRuntime();
    await expect(verifyLoopbackRuntime(workspace, request)).resolves.toBeUndefined();
    expect(request).toHaveBeenCalledTimes(5);
    expect(request.mock.calls.every(([method]) => method === "GET")).toBe(true);
  });

  it("refuses malformed Docker inventory before inspecting service containers", async () => {
    const request = vi.fn(async () => ({ unexpected: true }));
    await expect(verifyLoopbackRuntime(workspace, request)).rejects.toThrow("Cannot verify acceptance container inventory");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it.each(["0.0.0.0", "::", "192.168.1.20", undefined])("rejects a running acceptance published port on %s", async (ip) => {
    const { inventory, request } = mockRuntime();
    inventory[0].Ports[0].IP = ip;
    await expect(verifyLoopbackRuntime(workspace, request)).rejects.toThrow("outside loopback");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("rejects a broadly published running backup container as well as the canonical names", async () => {
    const { inventory, request } = mockRuntime();
    inventory.push({
      ...structuredClone(inventory[0]),
      Names: [`/supabase_db_${ACCEPTANCE_PROJECT_ID}-unbound-backup`],
      Ports: [{ IP: "0.0.0.0", PrivatePort: 5432, PublicPort: 60000 }],
    });
    await expect(verifyLoopbackRuntime(workspace, request)).rejects.toThrow("outside loopback");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("permits preserved stopped originals, other projects and unexposed internal ports", async () => {
    const { inventory, request } = mockRuntime();
    inventory.push({
      ...structuredClone(inventory[0]),
      Names: [`/supabase_db_${ACCEPTANCE_PROJECT_ID}-unbound-backup`],
      State: "exited",
      Ports: [{ IP: "0.0.0.0", PrivatePort: 5432, PublicPort: 55432 }],
    });
    inventory.push({
      ...structuredClone(inventory[0]),
      Labels: { "com.supabase.cli.project": "unrelated-project" },
      Ports: [{ IP: "0.0.0.0", PrivatePort: 5432, PublicPort: 5432 }],
    });
    inventory[0].Ports.push({ PrivatePort: 9999 });
    await expect(verifyLoopbackRuntime(workspace, request)).resolves.toBeUndefined();
  });

  const invalidServiceCases: Array<[string, (entry: ReturnType<typeof runtimeFixture>) => void]> = [
    ["stopped service", (entry) => { entry.State.Running = false; }],
    ["wrong canonical name", (entry) => { entry.Name = "/other-container"; }],
    ["wrong project label", (entry) => { entry.Config.Labels["com.supabase.cli.project"] = "other-project"; }],
    ["wrong work directory", (entry) => { entry.Config.Labels["com.supabase.cli.workdir"] = path.resolve(workspace, "other"); }],
    ["absent actual port binding", (entry) => { entry.NetworkSettings.Ports = {}; }],
    ["null actual port binding", (entry) => { entry.NetworkSettings.Ports["5432/tcp"] = null; }],
    ["nonloopback actual binding", (entry) => { entry.NetworkSettings.Ports["5432/tcp"]![0].HostIp = "0.0.0.0"; }],
    ["wrong actual host port", (entry) => { entry.NetworkSettings.Ports["5432/tcp"]![0].HostPort = "5432"; }],
    ["wrong actual container port", (entry) => { entry.NetworkSettings.Ports = { "5433/tcp": [{ HostIp: "127.0.0.1", HostPort: "55432" }] }; }],
    ["second actual IPv6 binding", (entry) => { entry.NetworkSettings.Ports["5432/tcp"]!.push({ HostIp: "::", HostPort: "55432" }); }],
    ["additional actual loopback port", (entry) => { entry.NetworkSettings.Ports["9999/tcp"] = [{ HostIp: "127.0.0.1", HostPort: "59999" }]; }],
  ];

  it.each(invalidServiceCases)("rejects %s even when inventory appeared safe", async (_label, mutate) => {
    const { entries, request } = mockRuntime();
    mutate(entries.db);
    // Use fixed name-based routes: an inspect response with a changed Name still
    // reaches the validation path instead of being rejected by the test mock.
    const inspect = vi.fn(async (method: string, route: string) => {
      if (route === `/containers/supabase_db_${ACCEPTANCE_PROJECT_ID}/json`) return entries.db;
      return request(method, route);
    });
    await expect(verifyLoopbackRuntime(workspace, inspect)).rejects.toThrow("verified loopback ports");
    expect(inspect.mock.calls.every(([method]) => method === "GET")).toBe(true);
  });

  it.each(["kong", "studio", "inbucket"] as Role[])("inspects %s independently rather than only trusting the database", async (role) => {
    const { entries, request } = mockRuntime();
    entries[role].State.Running = false;
    await expect(verifyLoopbackRuntime(workspace, request)).rejects.toThrow("verified loopback ports");
  });

  it("permits unbound exposed ports without confusing them with host publication", async () => {
    const { entries, request } = mockRuntime();
    entries.kong.NetworkSettings.Ports["8001/tcp"] = null;
    await expect(verifyLoopbackRuntime(workspace, request)).resolves.toBeUndefined();
  });
});
