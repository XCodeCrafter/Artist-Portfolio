import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { operationsSnapshot, outcomeCodes, overviewCases, setupCodes } from "./fixtures/imagekit-operations-scenarios";
import { refreshImageKitOperations, requestImageKitObservation } from "./fixtures/imagekit-operations-actions";
import { parseImageKitOperationsSnapshot } from "@/lib/admin/imagekit-operations-display";

describe("synthetic interactive ImageKit operations scenarios", () => {
  it("covers every setup state and every manual outcome without backend identifiers", () => {
    expect(setupCodes).toEqual(["available", "access-required", "configuration-required", "checks-disabled", "security-required",
      "database-unavailable", "migration-required", "database-not-ready", "approval-required", "unavailable"]);
    expect(outcomeCodes).toEqual(["idle", "absent", "retry", "needs-review", "blocked", "not-ready", "unconfirmed"]);
    expect(overviewCases.map(fixture => fixture.id)).toContain("mixed");
    for (const code of setupCodes) {
      const snapshot = operationsSnapshot(code, "mixed");
      expect(snapshot.setup).toEqual({ code, checkedAt: "2026-09-24T12:00:00.000Z" });
      expect(JSON.stringify(snapshot)).not.toMatch(/fileId|objectKey|leaseId|workerId|checksum|storageContainer|privateKey|credentialBinding|https?:\/\//);
    }
  });

  it("returns fresh immutable-source snapshots and deterministic refresh times", () => {
    const first = operationsSnapshot("available", "mixed");
    const second = operationsSnapshot("available", "mixed", 1);
    expect(second.setup.checkedAt).toBe("2026-09-24T12:00:01.000Z");
    expect(first.overview).not.toBe(second.overview);
    if (first.overview.status !== "available" || second.overview.status !== "available") throw new Error("Invalid fixture");
    expect(second.overview.overview.generatedAt).toBe(second.setup.checkedAt);
    first.overview.overview.items[0].label = "Changed local snapshot";
    expect(second.overview.overview.items[0].label).not.toBe("Changed local snapshot");
    expect(operationsSnapshot("available", "mixed").overview).toEqual(operationsSnapshot("available", "mixed").overview);
  });

  it.each([-1, 0.1, NaN, Infinity, 10_000])("rejects invalid local refresh sequence %s", value => {
    expect(() => operationsSnapshot("available", "mixed", value)).toThrow("synthetic operations scenario");
  });

  it("covers unavailable overviews separately from the empty state", () => {
    expect(operationsSnapshot("available", "empty").overview.status).toBe("available");
    expect(operationsSnapshot("available", "unavailable").overview).toEqual({ status: "unavailable", reason: "unavailable" });
  });

  it("keeps every overview valid under the real display parser when refreshing its synthetic clock", () => {
    for (const overview of overviewCases) {
      for (const sequence of [0, 1, 9999]) {
        const snapshot = operationsSnapshot("available", overview.id, sequence);
        expect(parseImageKitOperationsSnapshot(snapshot)).toEqual(snapshot);
      }
    }
  });

  it("safe action aliases fail closed if callback injection is forgotten", async () => {
    await expect(refreshImageKitOperations()).rejects.toThrow("Synthetic operations fixture requires injected");
    await expect(requestImageKitObservation()).rejects.toThrow("Synthetic operations fixture requires injected");
  });

  it("uses only explicit scenario remounts and injected local operations", () => {
    const source = readFileSync(new URL("./fixtures/imagekit-operations-browser.tsx", import.meta.url), "utf8");
    expect(source).toContain("key={panelVersion}");
    expect(source).toContain("initial={initial} operations={operations}");
    expect(source).toContain("Unsaved media caption");
    expect(source).toContain("Synthetic operation call counters");
    expect(source).toContain("Apply scenario");
    expect(source).not.toMatch(/useEffect|setInterval|\bfetch\s*\(|XMLHttpRequest|localStorage|process\.env|router\.(?:refresh|push)|location\.reload/);
    expect(source.match(/setPanelVersion\(value => value \+ 1\)/g)).toHaveLength(1);
    const stub = readFileSync(new URL("./fixtures/imagekit-operations-actions.ts", import.meta.url), "utf8");
    expect(stub.match(/^import /gm)).toHaveLength(1);
    expect(stub).toMatch(/^import type /);
    expect(stub).not.toMatch(/['"]use server['"]|\bfetch\s*\(|createAdminServiceClient|createImageKitObservationEntry/);
  });
});
