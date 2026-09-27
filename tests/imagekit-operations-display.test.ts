import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseImageKitOperationsSnapshot } from "@/lib/admin/imagekit-operations-display";
import type { ImageKitObservationSetupCode } from "@/lib/admin/imagekit-operations-types";

const generatedAt = "2026-09-24T12:00:00.000Z";
const counts = () => ({ uploading: 0, waiting: 0, due: 0, checking: 0, attention: 0 });
const snapshot = () => ({
  setup: { code: "available", checkedAt: generatedAt },
  overview: { status: "available", overview: {
    version: 1, generatedAt, total: 0, counts: counts(), items: [] as unknown[], hasMore: false,
  } },
});
const item = () => ({
  intentId: "00000000-0000-4000-8000-000000000001", label: "Fictional upload", mediaType: "image",
  sizeBytes: 1024, stage: "attention", attempts: 1, lastObservation: "unsafe", nextCheckAt: null, updatedAt: generatedAt,
});

describe("pure ImageKit operations display validation", () => {
  it.each<ImageKitObservationSetupCode>(["available", "access-required", "configuration-required", "checks-disabled", "security-required",
    "database-unavailable", "migration-required", "database-not-ready", "approval-required", "unavailable"])("accepts only the explicit setup state %s", code => {
    const input = snapshot(); input.setup.code = code;
    expect(parseImageKitOperationsSnapshot(input)).toEqual(input);
  });
  it.each([null, "2026-09-24T12:00:00Z", "2026-09-24T14:00:00+02:00"])("accepts an explicit nullable/ISO setup timestamp %j", checkedAt => {
    const input = { ...snapshot(), setup: { code: "unavailable", checkedAt } };
    expect(parseImageKitOperationsSnapshot(input)).toEqual(input);
  });
  it.each(["not-configured", "migration-required", "not-ready", "unavailable"])("preserves unknown counts with reason %s", reason => {
    const input = { ...snapshot(), overview: { status: "unavailable", reason } };
    expect(parseImageKitOperationsSnapshot(input)).toEqual(input);
    expect(parseImageKitOperationsSnapshot(input)?.overview).not.toHaveProperty("overview");
  });
  it("returns separately validated objects, not references to an untrusted payload", () => {
    const input = snapshot();
    const value = parseImageKitOperationsSnapshot(input);
    expect(value).toEqual(input); expect(value).not.toBe(input);
    expect(value?.setup).not.toBe(input.setup); expect(value?.overview).not.toBe(input.overview);
    input.setup.code = "corrupted after validation";
    expect(value?.setup.code).toBe("available");
  });
  it.each([null, undefined, false, true, 0, "snapshot", [], {}, { setup: null },
    { setup: snapshot().setup }, { overview: snapshot().overview }, { ...snapshot(), privateKey: "secret" },
    { ...snapshot(), setup: { ...snapshot().setup, credentials: "secret" } },
    { ...snapshot(), setup: { ...snapshot().setup, code: "connected-and-verified" } },
    { ...snapshot(), setup: { code: "available" } },
    { ...snapshot(), setup: { ...snapshot().setup, checkedAt: "today" } },
    { ...snapshot(), setup: { ...snapshot().setup, checkedAt: "2026-09-24" } },
    { ...snapshot(), setup: { ...snapshot().setup, checkedAt: 0 } },
    { ...snapshot(), overview: null }, { ...snapshot(), overview: {} },
    { ...snapshot(), overview: { status: "available" } },
    { ...snapshot(), overview: { ...snapshot().overview, privateKey: "secret" } },
    { ...snapshot(), overview: { status: "unavailable", reason: "private-provider-error" } },
    { ...snapshot(), overview: { status: "unavailable", reason: "unavailable", error: "secret" } },
  ])("rejects malformed or over-shared setup/envelope %j", input => {
    expect(parseImageKitOperationsSnapshot(input)).toBeNull();
  });
  it.each([
    { version: 2 }, { total: 1 }, { hasMore: true }, { counts: { ...counts(), attention: 1 } },
    { generatedAt: "invalid" }, { extra: "secret" }, { counts: { ...counts(), privateKey: "secret" } },
    { total: -1 }, { total: "0" }, { items: [{}] },
  ])("reuses full overview consistency validation for %j", changes => {
    const input = snapshot(); Object.assign(input.overview.overview, changes);
    expect(parseImageKitOperationsSnapshot(input)).toBeNull();
  });
  it("preserves a complete valid item without expanding its public display fields", () => {
    const input = snapshot(); input.overview.overview.total = 1;
    input.overview.overview.counts.attention = 1; input.overview.overview.items = [item()];
    expect(parseImageKitOperationsSnapshot(input)).toEqual(input);
  });
  it.each([
    { fileId: "private-file-id" }, { leaseId: "private-lease" }, { objectKey: "private/path" },
    { storageContainer: "private-account" }, { checksum: "a".repeat(64) }, { sizeBytes: 10 * 1024 * 1024 + 1 },
    { stage: "deleted" }, { attempts: 6 }, { nextCheckAt: generatedAt }, { label: "" },
  ])("rejects unsafe or malformed nested item %j", changes => {
    const input = snapshot(); input.overview.overview.total = 1;
    input.overview.overview.counts.attention = 1; input.overview.overview.items = [{ ...item(), ...changes }];
    expect(parseImageKitOperationsSnapshot(input)).toBeNull();
  });
  it("does not let a throwing object accessor escape into the panel handler", () => {
    const input = { get setup() { throw new Error("invalid external object"); } };
    expect(parseImageKitOperationsSnapshot(input)).toBeNull();
  });
  it("keeps both validation modules client-safe and the old server parser API intact", () => {
    for (const file of ["lib/admin/imagekit-operations-display.ts", "lib/admin/imagekit-reconciliation-overview-contracts.ts"]) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(/import\s+["']server-only["']|["']use server["']|from\s+["']node:|process\.env|\bfetch\s*\(/);
      expect(source).not.toMatch(/from ["'][^"']*(?:\/auth|\/service|observation-admission|observation-entry|operations-actions)["']/);
    }
    expect(readFileSync("lib/admin/imagekit-reconciliation-overview.ts", "utf8")).toContain(
      'export { parseImageKitReconciliationOverview } from "@/lib/admin/imagekit-reconciliation-overview-contracts";');
  });
});
