import { describe, expect, it } from "vitest";
import {
  LABEL, assertIsolatedContainer, assertOwnedContainer,
} from "../scripts/imagekit-concurrency/runtime.mjs";

const identity = {
  id: "a".repeat(64),
  image: `sha256:${"b".repeat(64)}`,
  runId: "00000000-0000-4000-8000-000000000001",
  name: "portfolio-imagekit-race-00000000-0000-4000-8000-000000000001",
};

type Inspection = {
  Id: string;
  Name: string;
  Image: string;
  Config: { User: string; Labels: Record<string, string>; Volumes: unknown };
  HostConfig: Record<string, unknown>;
  Mounts: unknown;
  NetworkSettings: { Ports: Record<string, unknown>; Networks: Record<string, unknown> };
};

function inspection(): Inspection {
  return {
    Id: identity.id,
    Name: `/${identity.name}`,
    Image: identity.image,
    Config: { User: "postgres", Labels: { [LABEL]: identity.runId }, Volumes: null },
    HostConfig: {
      NetworkMode: "none", ReadonlyRootfs: true, Privileged: false, PublishAllPorts: false,
      PortBindings: {}, Binds: null, VolumesFrom: null, Mounts: [], Links: null,
      Devices: [], CapAdd: null, CapDrop: ["ALL"], SecurityOpt: ["no-new-privileges"],
      PidMode: "", IpcMode: "private", UTSMode: "", UsernsMode: "",
      Tmpfs: {
        "/pgtest": "rw,nosuid,nodev,size=384m,mode=1777",
        "/tmp": "rw,nosuid,nodev,size=64m,mode=1777",
      },
    },
    Mounts: [],
    NetworkSettings: { Ports: {}, Networks: { none: {} } },
  };
}

describe("disposable PostgreSQL container ownership", () => {
  it("accepts only the exact container created by this run", () => {
    expect(() => assertOwnedContainer(inspection(), identity)).not.toThrow();
  });

  it.each([
    ["another full container ID", { Id: "c".repeat(64) }],
    ["a partial matching container ID", { Id: identity.id.slice(0, 12) }],
    ["another temporary run's name", { Name: "/portfolio-imagekit-race-other" }],
    ["the existing acceptance database", { Name: "/supabase_db_artist-portfolio-acceptance" }],
    ["a different immutable image ID", { Image: `sha256:${"c".repeat(64)}` }],
    ["an image tag instead of its ID", { Image: "public.ecr.aws/supabase/postgres:17.6.1.167" }],
    ["a missing full ID", { Id: undefined }],
    ["a missing name", { Name: undefined }],
    ["a missing image", { Image: undefined }],
  ])("refuses cleanup ownership for %s", (_description, override) => {
    expect(() => assertOwnedContainer({ ...inspection(), ...override }, identity)).toThrow("not owned");
  });

  const unrelatedLabels: Record<string, string>[] = [
    {}, { [LABEL]: "another-run" }, { "unrelated.label": identity.runId },
  ];
  it.each(unrelatedLabels)(
    "requires this run's exact ownership label: %j", (labels) => {
      const info = inspection();
      info.Config.Labels = labels;
      expect(() => assertOwnedContainer(info, identity)).toThrow("not owned");
    },
  );

  it.each(["", "a".repeat(12), "a".repeat(63), "a".repeat(65), "A".repeat(64), "g".repeat(64)])(
    "refuses malformed recorded IDs even when inspect agrees: %j", (id) => {
      expect(() => assertOwnedContainer({ ...inspection(), Id: id }, { ...identity, id })).toThrow("not owned");
    },
  );

  it("allows cleanup of its own container even if isolation verification failed", () => {
    const info = inspection();
    info.HostConfig.NetworkMode = "bridge";
    expect(() => assertOwnedContainer(info, identity)).not.toThrow();
    expect(() => assertIsolatedContainer(info, identity)).toThrow("not isolated");
  });
});

describe("disposable PostgreSQL container isolation", () => {
  it("accepts the stopped and running forms of a networkless tmpfs-only container", () => {
    const info = inspection();
    expect(() => assertIsolatedContainer(info, identity)).not.toThrow();
    info.Mounts = [
      { Type: "tmpfs", Destination: "/pgtest" },
      { Type: "tmpfs", Destination: "/tmp" },
    ];
    expect(() => assertIsolatedContainer(info, identity)).not.toThrow();
  });

  it("checks ownership before inspecting isolation or allowing SQL", () => {
    const unrelated = { ...inspection(), Id: "c".repeat(64), HostConfig: undefined };
    expect(() => assertIsolatedContainer(unrelated, identity)).toThrow("not owned");
  });

  it.each([
    ["bridge networking", { NetworkMode: "bridge" }],
    ["host networking", { NetworkMode: "host" }],
    ["another container's network", { NetworkMode: `container:${"c".repeat(64)}` }],
    ["omitted network mode", { NetworkMode: undefined }],
    ["writable root filesystem", { ReadonlyRootfs: false }],
    ["omitted read-only guard", { ReadonlyRootfs: undefined }],
    ["privileged execution", { Privileged: true }],
    ["omitted privilege guard", { Privileged: undefined }],
    ["automatic port publishing", { PublishAllPorts: true }],
    ["omitted port-publishing guard", { PublishAllPorts: undefined }],
    ["an explicit localhost port", { PortBindings: { "5432/tcp": [{ HostIp: "127.0.0.1", HostPort: "55432" }] } }],
    ["a host bind mount", { Binds: ["/host/data:/pgtest"] }],
    ["volumes borrowed from another container", { VolumesFrom: ["existing-acceptance"] }],
    ["a requested bind mount before Docker resolves it", { Mounts: [{ Type: "bind", Source: "/host/data", Target: "/pgtest" }] }],
    ["a requested named volume before Docker resolves it", { Mounts: [{ Type: "volume", Source: "existing-data", Target: "/pgtest" }] }],
    ["a container link", { Links: ["existing-acceptance:db"] }],
    ["a host device", { Devices: [{ PathOnHost: "/dev/sda", PathInContainer: "/dev/sda" }] }],
    ["a GPU device request", { DeviceRequests: [{ Driver: "nvidia", Count: -1, Capabilities: [["gpu"]] }] }],
    ["the host PID namespace", { PidMode: "host" }],
    ["another container's PID namespace", { PidMode: `container:${"c".repeat(64)}` }],
    ["the host IPC namespace", { IpcMode: "host" }],
    ["another container's IPC namespace", { IpcMode: `container:${"c".repeat(64)}` }],
    ["the host UTS namespace", { UTSMode: "host" }],
    ["an additional capability", { CapAdd: ["SYS_ADMIN"] }],
    ["capabilities without a blanket drop", { CapDrop: ["NET_RAW"] }],
    ["an omitted capability drop", { CapDrop: undefined }],
    ["omitted no-new-privileges", { SecurityOpt: [] }],
    ["a disabled no-new-privileges option", { SecurityOpt: ["no-new-privileges=false"] }],
    ["a missing PostgreSQL tmpfs", { Tmpfs: { "/tmp": "rw" } }],
    ["a missing temporary-directory tmpfs", { Tmpfs: { "/pgtest": "rw" } }],
    ["an unexpected tmpfs destination", { Tmpfs: { "/pgtest": "rw", "/tmp": "rw", "/extra": "rw" } }],
  ])("rejects %s", (_description, override) => {
    const info = inspection();
    Object.assign(info.HostConfig, override);
    expect(() => assertIsolatedContainer(info, identity)).toThrow("not isolated");
  });

  it.each(["root", "0", "", "postgres:root"])("rejects user %j", (user) => {
    const info = inspection();
    info.Config.User = user;
    expect(() => assertIsolatedContainer(info, identity)).toThrow("not isolated");
  });

  it.each([{}, { "/var/lib/postgresql/data": {} }])("rejects declared persistent volumes: %j", (volumes) => {
    const info = inspection();
    info.Config.Volumes = volumes;
    expect(() => assertIsolatedContainer(info, identity)).toThrow("not isolated");
  });

  it.each([
    ["a bind mount", [{ Type: "bind", Source: "/host/data", Destination: "/pgtest" }]],
    ["a named volume", [{ Type: "volume", Name: "existing-data", Destination: "/pgtest" }]],
    ["an unexpected tmpfs path", [{ Type: "tmpfs", Destination: "/var/lib/postgresql/data" }]],
    ["a traversing tmpfs path", [{ Type: "tmpfs", Destination: "/pgtest/../../host" }]],
    ["malformed mount metadata", {}],
  ])("rejects %s in resolved mounts", (_description, mounts) => {
    const info = inspection();
    info.Mounts = mounts;
    expect(() => assertIsolatedContainer(info, identity)).toThrow("not isolated");
  });

  it("rejects resolved published ports even if HostConfig has no bindings", () => {
    const info = inspection();
    info.NetworkSettings.Ports = { "5432/tcp": [{ HostIp: "127.0.0.1", HostPort: "55432" }] };
    expect(() => assertIsolatedContainer(info, identity)).toThrow("not isolated");
  });

  it("rejects an extra attached network even if NetworkMode still reports none", () => {
    const info = inspection();
    info.NetworkSettings.Networks.bridge = {};
    expect(() => assertIsolatedContainer(info, identity)).toThrow("not isolated");
  });
});
