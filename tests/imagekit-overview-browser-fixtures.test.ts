import { readFileSync } from "node:fs";
import { afterAll, describe, expect, it, vi } from "vitest";
import { parseImageKitReconciliationOverview } from "@/lib/admin/imagekit-reconciliation-overview";
import type { ImageKitReconciliationStage } from "@/lib/admin/imagekit-reconciliation-overview-types";
import * as fixtures from "./fixtures/imagekit-overview-browser";

const mocks = vi.hoisted(() => ({ admin: vi.fn(), service: vi.fn() }));
vi.mock("@/lib/admin/auth", () => ({ requireAdmin: mocks.admin }));
vi.mock("@/lib/admin/service", () => ({ createAdminServiceClient: mocks.service }));

const cases = fixtures.imageKitOverviewBrowserFixtures;
const available = cases.filter(fixture => fixture.data.status === "available");
const priority: ImageKitReconciliationStage[] = ["attention", "due", "checking", "waiting", "uploading"];

afterAll(() => {
  expect(mocks.admin).not.toHaveBeenCalled();
  expect(mocks.service).not.toHaveBeenCalled();
});

describe("synthetic ImageKit overview browser snapshots", () => {
  it("exports only display cases with deterministic safe metadata", () => {
    expect(Object.keys(fixtures)).toEqual(["imageKitOverviewBrowserFixtures"]);
    expect(cases.map(fixture => fixture.id)).toEqual([
      "empty", "uploading", "waiting", "checking", "due", "attention", "mixed",
      "not-configured", "migration-required", "not-ready", "unavailable",
    ]);
    expect(new Set(cases.map(fixture => fixture.id)).size).toBe(cases.length);
    for (const fixture of cases) {
      expect(Object.keys(fixture).sort()).toEqual(["data", "id", "title"]);
      expect(fixture.title.length).toBeGreaterThan(0);
    }
  });

  it.each(available)("$id passes the actual strict read projection parser", ({ data }) => {
    if (data.status !== "available") throw new Error("Expected available fixture");
    expect(parseImageKitReconciliationOverview(data.overview)).toEqual(data.overview);
  });

  it.each(available)("$id has honest counts, bounded rows and snapshot-relative UTC dates", ({ data }) => {
    if (data.status !== "available") throw new Error("Expected available fixture");
    const overview = data.overview;
    const snapshot = Date.parse(overview.generatedAt);
    expect(overview.generatedAt).toBe("2026-09-23T12:00:00.000Z");
    expect(Object.values(overview.counts).reduce((sum, value) => sum + value, 0)).toBe(overview.total);
    expect(overview.items).toHaveLength(Math.min(20, overview.total));
    expect(overview.hasMore).toBe(overview.total > 20);
    for (const item of overview.items) {
      expect(item.intentId).toMatch(/^00000000-0000-4000-8000-\d{12}$/);
      expect(item.label).toMatch(/^Synthetic/);
      expect(item.updatedAt).toMatch(/Z$/);
      expect(Date.parse(item.updatedAt)).toBeLessThanOrEqual(snapshot);
      if (item.stage === "attention") expect(item.nextCheckAt).toBeNull();
      else {
        expect(item.nextCheckAt).toMatch(/Z$/);
        const nextCheck = Date.parse(item.nextCheckAt!);
        if (item.stage === "due") expect(nextCheck).toBeLessThanOrEqual(snapshot);
        else expect(nextCheck).toBeGreaterThan(snapshot);
      }
    }
  });

  it.each(available)("$id follows database urgency, age and ID ordering", ({ data }) => {
    if (data.status !== "available") throw new Error("Expected available fixture");
    const expected = [...data.overview.items].sort((left, right) =>
      priority.indexOf(left.stage) - priority.indexOf(right.stage)
      || Date.parse(left.updatedAt) - Date.parse(right.updatedAt)
      || left.intentId.localeCompare(right.intentId));
    expect(data.overview.items).toEqual(expected);
  });

  it("provides separate closed and automatically expanded disclosure cases", () => {
    for (const fixture of available) {
      if (fixture.data.status !== "available") throw new Error("Expected available fixture");
      const { counts } = fixture.data.overview;
      expect(counts.attention > 0 || counts.due > 0).toBe(["due", "attention", "mixed"].includes(fixture.id));
    }
  });

  it("covers every stage, observation and media kind in an honestly truncated list", () => {
    const mixed = cases.find(fixture => fixture.id === "mixed")!.data;
    if (mixed.status !== "available") throw new Error("Expected available fixture");
    const { overview } = mixed;
    expect(overview.total).toBe(23);
    expect(overview.items).toHaveLength(20);
    expect(overview.hasMore).toBe(true);
    expect(overview.counts).toEqual({ attention: 4, due: 4, checking: 4, waiting: 4, uploading: 7 });
    expect([...new Set(overview.items.map(item => item.stage))]).toEqual(priority);
    expect(new Set(overview.items.map(item => item.lastObservation))).toEqual(new Set([null, "unsafe", "exhausted", "absent", "retry"]));
    expect(new Set(overview.items.map(item => item.mediaType))).toEqual(new Set(["image", "video"]));
    expect(overview.items[0].label).toHaveLength(220);
    expect(overview.items[0].label).not.toMatch(/\s/);
    expect(overview.items[1].label).toContain('<img src=x onerror=alert("fixture")>');
    expect(overview.items[1].label).toContain("<script>fixture</script>");
    expect(overview.items.some(item => item.attempts === 0)).toBe(true);
    expect(overview.items.some(item => item.attempts === 5)).toBe(true);
  });

  it("keeps all four unavailable states distinct from an empty queue", () => {
    const unavailable = cases.filter(fixture => fixture.data.status === "unavailable");
    expect(unavailable).toHaveLength(4);
    for (const fixture of unavailable) {
      expect(fixture.data).toEqual({ status: "unavailable", reason: fixture.id });
      expect(fixture.data).not.toHaveProperty("overview");
    }
  });

  it("has no runtime backend imports, live clock, secrets, URLs or transport calls", () => {
    const source = readFileSync(new URL("./fixtures/imagekit-overview-browser.ts", import.meta.url), "utf8");
    expect(source.match(/^import /gm)).toHaveLength(1);
    expect(source).toMatch(/^import type \{/);
    expect(source).not.toMatch(/\b(?:fetch|requireAdmin|createAdminServiceClient|XMLHttpRequest)\s*\(/);
    expect(source).not.toMatch(/\b(?:process|window|document|localStorage)\s*[.[]/);
    expect(source).not.toMatch(/Date\.now|Math\.random|new Date\(\)|https?:\/\/|imagekit\.io|supabase\.co/);
    expect(JSON.stringify(cases)).not.toMatch(/fileId|objectKey|leaseId|workerId|checksum|storageContainer|privateKey|apiKey|providerUrl/);
  });
});
