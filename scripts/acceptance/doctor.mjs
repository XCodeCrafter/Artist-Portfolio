import { execFileSync } from "node:child_process";

const PREREQUISITES = Object.freeze({
  docker: {
    args: ["version", "--format", "{{.Server.Version}}"],
    success: "Docker engine: available",
    unavailable: "Docker engine: not reachable; check Docker Desktop and Docker command availability",
    denied: "Docker engine: check blocked by OS or sandbox permissions; engine status is unknown",
  },
  supabase: {
    args: ["--version"],
    success: "Supabase CLI on PATH: available",
    unavailable: "Supabase CLI on PATH: not found or not runnable (no automatic installation attempted)",
    denied: "Supabase CLI: version check blocked by OS or sandbox permissions; availability is unknown",
  },
});

function prerequisite(tool) {
  if (!Object.hasOwn(PREREQUISITES, tool)) throw new Error("Unknown acceptance prerequisite.");
  return PREREQUISITES[tool];
}

function isPermissionDenied(error) {
  if (!error || typeof error !== "object") return false;
  if (error.code === "EACCES" || error.code === "EPERM") return true;
  // Docker can exit with code 1 while the nested Windows pipe request is denied.
  // Inspect a bounded error fragment, but never expose it in diagnostics: CLI
  // errors can contain paths, URLs, environment values, or other private data.
  const fragments = [error.stderr, error.message].map((value) => {
    if (Buffer.isBuffer(value)) return value.subarray(0, 16384).toString("utf8");
    return typeof value === "string" ? value.slice(0, 16384) : "";
  });
  return fragments.some((value) => /access\s+(?:is\s+)?denied|permission\s+denied|operation\s+not\s+permitted|requires?\s+(?:elevated|administrator)\s+privileges/i.test(value));
}

/** Classify a probe without returning raw command output or error contents. */
export function classifyAcceptanceProbeResult(tool, result) {
  const info = prerequisite(tool);
  if (result?.ok === true) return { status: "success", message: info.success };
  if (isPermissionDenied(result?.error)) {
    return { status: "permission-denied", message: info.denied };
  }
  return { status: "unavailable", message: info.unavailable };
}

/** Read-only fixed commands only; never installs, starts, or repairs services. */
export function diagnoseAcceptancePrerequisite(tool, execute = execFileSync) {
  const info = prerequisite(tool);
  try {
    execute(tool, [...info.args], {
      stdio: "pipe", timeout: 10000, maxBuffer: 64 * 1024, windowsHide: true,
    });
    return classifyAcceptanceProbeResult(tool, { ok: true });
  } catch (error) {
    return classifyAcceptanceProbeResult(tool, { ok: false, error });
  }
}
