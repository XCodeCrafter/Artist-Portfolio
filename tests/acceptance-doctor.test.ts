import { describe, expect, it, vi } from "vitest";
import { classifyAcceptanceProbeResult, diagnoseAcceptancePrerequisite } from "../scripts/acceptance/doctor.mjs";

describe("acceptance prerequisite diagnostics", () => {
  it.each(["docker", "supabase"])("reports a successful %s probe", (tool) => {
    const diagnostic = classifyAcceptanceProbeResult(tool, { ok: true });
    expect(diagnostic.status).toBe("success");
    expect(diagnostic.message).toContain("available");
  });

  it.each(["EACCES", "EPERM"])("distinguishes %s from a stopped Docker engine", (code) => {
    const result = classifyAcceptanceProbeResult("docker", { ok: false, error: { code } });
    expect(result.status).toBe("permission-denied");
    expect(result.message).toContain("engine status is unknown");
    expect(result.message).not.toMatch(/not reachable|not running|stopped/);
  });

  it.each([
    "error during connect: open //./pipe/dockerDesktopLinuxEngine: Access is denied.",
    "permission denied while trying to connect to the Docker daemon socket",
    "connect: operation not permitted",
    "This operation requires elevated privileges.",
    "This operation requires administrator privileges.",
  ])("recognizes nested command permission failures without echoing them", (stderr) => {
    const result = classifyAcceptanceProbeResult("docker", { ok: false, error: { status: 1, stderr } });
    expect(result.status).toBe("permission-denied");
    expect(result.message).not.toContain(stderr);
  });

  it("handles Buffer stderr and errors whose message carries the denial", () => {
    expect(classifyAcceptanceProbeResult("docker", {
      ok: false, error: { stderr: Buffer.from("Access is denied.") },
    }).status).toBe("permission-denied");
    expect(classifyAcceptanceProbeResult("docker", {
      ok: false, error: new Error("Operation not permitted"),
    }).status).toBe("permission-denied");
  });

  it.each([
    { code: "ENOENT" },
    { code: "ETIMEDOUT" },
    { stderr: "The system cannot find the file specified." },
    { stderr: "Cannot connect to the Docker daemon. Is the docker daemon running?" },
    null,
    "failure",
  ])("reports unavailable without inventing a permission diagnosis: %j", (error) => {
    const result = classifyAcceptanceProbeResult("docker", { ok: false, error });
    expect(result.status).toBe("unavailable");
    expect(result.message).toContain("check Docker Desktop");
  });

  it("keeps CLI permission failures separate from missing installation", () => {
    const result = classifyAcceptanceProbeResult("supabase", { ok: false, error: { code: "EACCES" } });
    expect(result.status).toBe("permission-denied");
    expect(result.message).toContain("availability is unknown");
    expect(result.message).not.toContain("not found");
  });

  it("does not reflect sensitive command errors or environment values", () => {
    const secret = "private-placeholder-that-must-not-appear";
    for (const tool of ["docker", "supabase"]) {
      const result = classifyAcceptanceProbeResult(tool, {
        ok: false, error: { stderr: `${secret}: Access is denied.`, message: secret, stdout: secret },
      });
      expect(JSON.stringify(result)).not.toContain(secret);
      expect(Object.keys(result).sort()).toEqual(["message", "status"]);
    }
  });

  it("runs only the bounded read-only Docker server probe", () => {
    const execute = vi.fn(() => Buffer.from("27.0.0"));
    expect(diagnoseAcceptancePrerequisite("docker", execute as unknown as typeof execFileSync).status).toBe("success");
    expect(execute).toHaveBeenCalledExactlyOnceWith("docker", ["version", "--format", "{{.Server.Version}}"], {
      stdio: "pipe", timeout: 10000, maxBuffer: 64 * 1024, windowsHide: true,
    });
  });

  it("checks the CLI on PATH without invoking package installation", () => {
    const execute = vi.fn(() => { throw Object.assign(new Error("missing"), { code: "ENOENT" }); });
    const result = diagnoseAcceptancePrerequisite("supabase", execute);
    expect(result.status).toBe("unavailable");
    expect(result.message).toContain("no automatic installation attempted");
    expect(execute).toHaveBeenCalledExactlyOnceWith("supabase", ["--version"], expect.any(Object));
  });

  it("classifies permission failures thrown by the command runner", () => {
    const execute = vi.fn(() => { throw Object.assign(new Error("pipe failure"), { stderr: "Access is denied." }); });
    expect(diagnoseAcceptancePrerequisite("docker", execute).status).toBe("permission-denied");
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it.each(["npm", "constructor", "__proto__", "docker start"])("rejects unapproved command %s", (tool) => {
    const execute = vi.fn();
    expect(() => diagnoseAcceptancePrerequisite(tool, execute)).toThrow("Unknown acceptance prerequisite");
    expect(execute).not.toHaveBeenCalled();
  });
});
import type { execFileSync } from "node:child_process";
