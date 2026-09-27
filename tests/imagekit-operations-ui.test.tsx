import { readFileSync } from "node:fs";
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ImageKitOperationsPanel from "@/components/admin/v2/ImageKitOperationsPanel";
import type { ImageKitObservationOutcome, ImageKitObservationSetupCode, ImageKitOperationsSnapshot } from "@/lib/admin/imagekit-operations-types";

// Deterministic handler tests; the isolated browser fixture covers real DOM/layout.
const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0, effects: [] as (() => void | (() => void))[], refresh: vi.fn(), observe: vi.fn() }));
vi.mock("react", async original => {
  const react = await original<typeof import("react")>();
  function state(initial: unknown) {
    const index = hooks.cursor++;
    if (!(index in hooks.values)) hooks.values[index] = typeof initial === "function" ? initial() : initial;
    return [hooks.values[index], (next: unknown) => { hooks.values[index] = typeof next === "function" ? next(hooks.values[index]) : next; }];
  }
  return { ...react, useState: state, useRef: (initial: unknown) => state({ current: initial })[0], useEffect: (callback: () => void | (() => void)) => { hooks.effects.push(callback); } };
});
vi.mock("@/lib/admin/imagekit-operations-actions", () => ({ refreshImageKitOperations: hooks.refresh, requestImageKitObservation: hooks.observe }));

const at = "2026-09-24T10:30:00.000Z";
function snapshot(code: ImageKitObservationSetupCode = "available"): ImageKitOperationsSnapshot {
  return { setup: { code, checkedAt: at }, overview: { status: "available", overview: {
    version: 1, generatedAt: at, total: 0, counts: { uploading: 0, waiting: 0, due: 0, checking: 0, attention: 0 }, items: [], hasMore: false,
  } } };
}
let initial: ImageKitOperationsSnapshot;
type Element = ReactElement<Record<string, unknown>>;
function nodes(tree: ReactNode): Element[] {
  return Children.toArray(tree).flatMap(node => isValidElement<Record<string, unknown>>(node) ? [node, ...nodes(node.props.children as ReactNode)] : []);
}
function text(tree: ReactNode): string {
  return Children.toArray(tree).map(node => isValidElement<Record<string, unknown>>(node) ? text(node.props.children as ReactNode) : String(node)).join("");
}
function render() { hooks.cursor = 0; return ImageKitOperationsPanel({ initial }); }
function html() { return renderToStaticMarkup(render()); }
function button(label: string) {
  const found = nodes(render()).find(node => node.type === "button" && text(node.props.children as ReactNode) === label);
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
}
function click(node: Element) { return (node.props.onClick as () => Promise<void>)(); }
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks(); hooks.values = []; hooks.cursor = 0; hooks.effects = [];
  initial = snapshot(); hooks.refresh.mockResolvedValue({ ok: true, snapshot: snapshot() }); hooks.observe.mockResolvedValue({ code: "idle" });
});
afterEach(() => { vi.useRealTimers(); });

describe("ImageKit operational status rendering", () => {
  it("renders accessible manual controls without invoking any operation", () => {
    const markup = html();
    expect(markup).toContain('aria-labelledby="imagekit-operations-heading"');
    expect(markup).toContain("Manual · read-only files");
    expect(markup).toContain("It never uploads, deletes, or publishes a file.");
    expect(markup).toContain("Setup details");
    expect(markup).toContain("24 Sept 2026, 10:30 UTC");
    expect(markup).toContain("ImageKit upload checks");
    expect(markup).toContain('role="status"');
    expect(button("Check one upload").props.disabled).toBe(false);
    expect(button("Check one upload").props.type).toBe("button");
    expect(hooks.refresh).not.toHaveBeenCalled(); expect(hooks.observe).not.toHaveBeenCalled();
  });

  it.each([
    ["access-required", "Administrator access is required"], ["configuration-required", "ImageKit connection is not configured"],
    ["checks-disabled", "Manual checks are switched off"], ["security-required", "Security setup needs attention"],
    ["database-unavailable", "The database connection is unavailable"], ["migration-required", "ImageKit database update required"],
    ["database-not-ready", "Database safety checks are not ready"], ["approval-required", "This ImageKit account needs approval"],
    ["unavailable", "Check setup could not be confirmed"],
  ] as const)("keeps %s fail-closed and describes the next step", async (code, title) => {
    initial = snapshot(code);
    expect(text(render())).toContain(title);
    expect(button("Check one upload").props.disabled).toBe(true);
    expect(button("Refresh status").props.disabled).toBe(false);
    await click(button("Check one upload"));
    expect(hooks.observe).not.toHaveBeenCalled();
  });

  it("does not enable checks based on global overview counts", () => {
    initial = snapshot("approval-required");
    if (initial.overview.status === "available") { initial.overview.overview.total = 10; initial.overview.overview.counts.due = 10; }
    expect(button("Check one upload").props.disabled).toBe(true);
    expect(hooks.observe).not.toHaveBeenCalled();
  });

  it("keeps unavailable counts unknown while approved setup can request one bounded check", () => {
    initial.overview = { status: "unavailable", reason: "unavailable" };
    expect(html()).toContain("This does not mean there are no unfinished uploads.");
    expect(button("Check one upload").props.disabled).toBe(false);
  });

  it("keeps disclosures native, controls wrap-safe and ordinary media editing outside the panel", () => {
    const markup = html();
    expect(markup).toContain("flex w-full flex-wrap gap-2 sm:w-auto");
    expect(markup).toContain("min-h-11");
    expect(markup).toContain("focus-visible:ring-2");
    expect(markup.match(/<details\b[^>]*>/)?.[0]).not.toContain("open");
    expect(markup).not.toMatch(/<form|<input|<textarea|<iframe/);
    const source = readFileSync(new URL("../components/admin/v2/ImageKitOperationsPanel.tsx", import.meta.url), "utf8");
    expect(source).not.toMatch(/useRouter|router\.|revalidate|setInterval|process\.env|createClient|fetch\(/);
    expect(source).not.toContain("dangerouslySetInnerHTML");
  });

  it("ignores invalid setup timestamps rather than crashing the media page", () => {
    initial.setup.checkedAt = "invalid";
    expect(html()).not.toContain("Setup checked");
  });
});

describe("ImageKit manual check transitions", () => {
  it("closes synchronous double-click and cross-operation races before awaiting", async () => {
    const response = deferred<ImageKitObservationOutcome>(); hooks.observe.mockReturnValue(response.promise);
    const check = button("Check one upload"); const refresh = button("Refresh status");
    const pending = click(check); await click(check); await click(refresh);
    expect(hooks.observe).toHaveBeenCalledTimes(1); expect(hooks.refresh).not.toHaveBeenCalled();
    expect(button("Check one upload").props.disabled).toBe(true); expect(button("Refresh status").props.disabled).toBe(true);
    expect(text(render())).toContain("Checking one eligible upload…");
    response.resolve({ code: "idle" }); await pending;
    await click(check); expect(hooks.observe).toHaveBeenCalledTimes(1);
    expect(text(render())).toContain("Refresh status before another check.");
    expect(button("Refresh status").props.disabled).toBe(false);
  });

  it.each([
    ["idle", "No upload was selected", "does not mean all uploads are resolved"],
    ["absent", "The checked upload was not found", "does not confirm deletion"],
    ["retry", "The check was inconclusive", "no automatic retry will run"],
    ["needs-review", "This upload needs manual review", "No files were deleted"],
    ["blocked", "A safety or access check stopped this run", "can still have updated"],
    ["not-ready", "ImageKit checks are not ready", "Do not assume"],
    ["unconfirmed", "The check result could not be confirmed", "does not cancel the server request"],
  ] as const)("shows a truthful %s outcome and always requires explicit refresh", async (code, title, caveat) => {
    hooks.observe.mockResolvedValue({ code }); await click(button("Check one upload"));
    const copy = text(render()); expect(copy).toContain(title); expect(copy).toContain(caveat);
    expect(button("Check one upload").props.disabled).toBe(true);
    expect(hooks.refresh).not.toHaveBeenCalled();
    await click(button("Refresh status")); expect(button("Check one upload").props.disabled).toBe(false);
    expect(text(render())).toContain(title);
    expect(text(render())).toContain("Your media editor and unsaved changes were left in place.");
    expect(hooks.observe).toHaveBeenCalledTimes(1);
  });

  it("marks thrown or malformed observation results unconfirmed without showing server text", async () => {
    hooks.observe.mockRejectedValue(new Error("private_server_details"));
    await click(button("Check one upload")); expect(text(render())).toContain("The check result could not be confirmed");
    expect(text(render())).not.toContain("private_server_details");
    await click(button("Refresh status")); hooks.observe.mockResolvedValue({ code: "private_unknown_result" });
    await click(button("Check one upload")); expect(text(render())).not.toContain("private_unknown_result");
  });

  it("stops waiting at 45 seconds and ignores a late result even after a newer run", async () => {
    const late = deferred<ImageKitObservationOutcome>(); hooks.observe.mockReturnValueOnce(late.promise);
    const first = click(button("Check one upload"));
    await vi.advanceTimersByTimeAsync(44_999); expect(text(render())).toContain("Checking one eligible upload…");
    await vi.advanceTimersByTimeAsync(1); await first;
    expect(text(render())).toContain("The server may still be working."); expect(button("Check one upload").props.disabled).toBe(true);
    await click(button("Refresh status")); hooks.observe.mockResolvedValueOnce({ code: "needs-review" });
    await click(button("Check one upload")); late.resolve({ code: "absent" }); await Promise.resolve(); await Promise.resolve();
    expect(text(render())).toContain("This upload needs manual review"); expect(text(render())).not.toContain("The checked upload was not found");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not apply outcomes after unmount and denies stale handlers", async () => {
    const response = deferred<ImageKitObservationOutcome>(); hooks.observe.mockReturnValue(response.promise);
    const check = button("Check one upload"); const cleanup = hooks.effects[0]();
    const pending = click(check); if (cleanup) cleanup();
    response.resolve({ code: "absent" }); await pending;
    expect(text(render())).not.toContain("The checked upload was not found");
    await click(check); expect(hooks.observe).toHaveBeenCalledTimes(1);
  });

  it("survives the development effect setup-cleanup-setup cycle", async () => {
    render(); const effect = hooks.effects[0]; const cleanup = effect(); if (cleanup) cleanup(); effect();
    await click(button("Check one upload")); expect(hooks.observe).toHaveBeenCalledTimes(1);
  });
});

describe("ImageKit local status refresh", () => {
  it("locks both operations during refresh and only adopts the returned snapshot", async () => {
    const response = deferred<{ ok: true; snapshot: ImageKitOperationsSnapshot }>(); hooks.refresh.mockReturnValue(response.promise);
    const check = button("Check one upload"); const refresh = button("Refresh status");
    const pending = click(refresh); await click(refresh); await click(check);
    expect(hooks.refresh).toHaveBeenCalledTimes(1); expect(hooks.observe).not.toHaveBeenCalled();
    expect(button("Check one upload").props.disabled).toBe(true);
    response.resolve({ ok: true, snapshot: snapshot("approval-required") }); await pending;
    expect(text(render())).toContain("This ImageKit account needs approval"); expect(button("Check one upload").props.disabled).toBe(true);
  });

  it.each(["blocked", "rate-limited", "unavailable"] as const)("preserves the previous outcome after a %s refresh failure", async code => {
    hooks.observe.mockResolvedValue({ code: "absent" }); await click(button("Check one upload"));
    hooks.refresh.mockResolvedValue({ ok: false, code }); await click(button("Refresh status"));
    expect(text(render())).toContain("The checked upload was not found"); expect(button("Check one upload").props.disabled).toBe(true);
    expect(nodes(render()).some(node => node.props.role === "alert")).toBe(true);
    expect(text(render())).not.toContain("Status refreshed.");
  });

  it("makes even a formerly ready snapshot stale after refresh transport failure", async () => {
    hooks.refresh.mockRejectedValue(new Error("secret details")); await click(button("Refresh status"));
    expect(button("Check one upload").props.disabled).toBe(true); expect(text(render())).not.toContain("secret details");
    expect(text(render())).toContain("no new check has been unlocked");
  });

  it("bounds refresh at 15 seconds and prevents a late success from unlocking checks", async () => {
    const late = deferred<{ ok: true; snapshot: ImageKitOperationsSnapshot }>(); hooks.refresh.mockReturnValue(late.promise);
    const pending = click(button("Refresh status")); await vi.advanceTimersByTimeAsync(15_000); await pending;
    expect(button("Check one upload").props.disabled).toBe(true); expect(text(render())).toContain("Status could not be refreshed");
    late.resolve({ ok: true, snapshot: snapshot() }); await Promise.resolve(); await Promise.resolve();
    expect(button("Check one upload").props.disabled).toBe(true); expect(text(render())).not.toContain("Status refreshed.");
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    ["missing snapshot", { ok: true }], ["null snapshot", { ok: true, snapshot: null }],
    ["unknown setup code", { ok: true, snapshot: { ...snapshot(), setup: { code: "private_unknown_code", checkedAt: at } } }],
    ["unknown setup field", { ok: true, snapshot: { ...snapshot(), setup: { code: "available", checkedAt: at, privateKey: "private_secret" } } }],
    ["unknown snapshot field", { ok: true, snapshot: { ...snapshot(), privateKey: "private_secret" } }],
    ["unknown response field", { ok: true, snapshot: snapshot(), privateKey: "private_secret" }],
    ["malformed overview", { ok: true, snapshot: { ...snapshot(), overview: { status: "available", overview: {} } } }],
    ["unknown overview reason", { ok: true, snapshot: { ...snapshot(), overview: { status: "unavailable", reason: "private_reason" } } }],
    ["string true", { ok: "true", snapshot: snapshot() }], ["null response", null],
    ["inherited error name", { ok: false, code: "constructor" }],
  ])("rejects a refresh with %s without replacing or wedging the panel", async (_name, value) => {
    hooks.observe.mockResolvedValue({ code: "absent" }); await click(button("Check one upload"));
    hooks.refresh.mockResolvedValue(value); await click(button("Refresh status"));
    expect(text(render())).toContain("The checked upload was not found");
    expect(text(render())).toContain("Status could not be refreshed");
    expect(text(render())).toContain("Manual checks are available");
    expect(text(render())).not.toMatch(/private_secret|private_reason|private_unknown_code/);
    expect(button("Check one upload").props.disabled).toBe(true);
    expect(button("Refresh status").props.disabled).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    hooks.refresh.mockResolvedValue({ ok: true, snapshot: snapshot("approval-required") }); await click(button("Refresh status"));
    expect(text(render())).toContain("This ImageKit account needs approval");
    expect(text(render())).not.toContain("Status could not be refreshed");
  });

  it("supports injected fixture operations without calling the production actions", async () => {
    const observe = vi.fn().mockResolvedValue({ code: "idle" }); const refresh = vi.fn().mockResolvedValue({ ok: true, snapshot: snapshot() });
    hooks.cursor = 0; const tree = ImageKitOperationsPanel({ initial, operations: { observe, refresh } });
    const check = nodes(tree).find(node => node.type === "button" && text(node.props.children as ReactNode) === "Check one upload")!;
    await click(check); expect(observe).toHaveBeenCalledTimes(1); expect(hooks.observe).not.toHaveBeenCalled();
  });

  it("keeps the overview expansion prop stable when refreshed priority counts change", async () => {
    const overviewNode = () => nodes(render()).find(node => typeof node.type === "function" && node.type.name === "ImageKitReconciliationOverview")!;
    expect(overviewNode().props.initiallyExpanded).toBe(false);
    const next = snapshot();
    if (next.overview.status === "available") {
      next.overview.overview.total = 1; next.overview.overview.counts.attention = 1;
      next.overview.overview.items = [{ intentId: "00000000-0000-4000-8000-000000000001", label: "Check portrait", mediaType: "image", sizeBytes: 1000, stage: "attention", attempts: 1, lastObservation: "unsafe", nextCheckAt: null, updatedAt: at }];
    }
    hooks.refresh.mockResolvedValue({ ok: true, snapshot: next }); await click(button("Refresh status"));
    expect(overviewNode().props.initiallyExpanded).toBe(false);
    expect(overviewNode().props.data).toEqual(next.overview);
  });
});
