import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createImageKitOperationBudget, ImageKitOperationBudgetError, type ImageKitOperationBudgetOptions } from "@/lib/admin/imagekit-operation-budget";
import { createImageKitObservationBudget } from "@/lib/admin/imagekit-observation-contracts";

const wallStart = 100_000;
const budgets: ReturnType<typeof createImageKitOperationBudget>[] = [];
function budget(options: ImageKitOperationBudgetOptions = {}) {
  const result = createImageKitOperationBudget({ now: () => wallStart, monotonicNow: () => 10, ...options });
  budgets.push(result);
  return result;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => { budgets.splice(0).forEach(item => item.close()); vi.restoreAllMocks(); vi.useRealTimers(); });

describe("shared ImageKit operation budget limits", () => {
  it("starts work lazily and supports thenables without an independent per-call timer", async () => {
    const item = budget(); const work = vi.fn(() => Promise.resolve(42));
    const pending = item.within(work); expect(work).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(1);
    await expect(pending).resolves.toBe(42); expect(work).toHaveBeenCalledOnce();
    const thenable: PromiseLike<number> = { then: (yes, no) => Promise.resolve(13).then(yes, no) };
    await expect(item.within(() => thenable)).resolves.toBe(13); expect(vi.getTimerCount()).toBe(1);
  });

  it("defaults to a shared 30-second timer even when both clocks freeze", async () => {
    const item = budget(); const never = () => new Promise<never>(() => {});
    const first = expect(item.within(never)).rejects.toThrow("operation-budget-ended");
    await vi.advanceTimersByTimeAsync(20_000);
    const second = expect(item.within(never)).rejects.toThrow("operation-budget-ended");
    await vi.advanceTimersByTimeAsync(9999); expect(item.signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1); await Promise.all([first, second]); expect(item.signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([1, 15_000, 30_001, 60_000])("accepts a bounded %i ms lifetime", async timeoutMs => {
    const item = budget({ timeoutMs }); const pending = expect(item.within(() => new Promise<never>(() => {}))).rejects.toThrow("operation-budget-ended");
    await vi.advanceTimersByTimeAsync(timeoutMs - 1); expect(item.signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1); await pending; expect(item.signal.aborted).toBe(true);
  });

  it.each([0, -1, 60_001, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])("rejects an unsafe timeout %j without allocating a timer", timeoutMs => {
    expect(() => budget({ timeoutMs })).toThrow("invalid-operation-budget"); expect(vi.getTimerCount()).toBe(0);
  });

  it.each([0, -1, NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1])("rejects an invalid initial wall clock %j", value => {
    expect(() => budget({ now: () => value })).toThrow("invalid-operation-budget"); expect(vi.getTimerCount()).toBe(0);
  });

  it.each([-1, NaN, Infinity])("rejects an invalid initial monotonic clock %j", value => {
    expect(() => budget({ monotonicNow: () => value })).toThrow("invalid-operation-budget"); expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["wall", "monotonic"])("fails closed when the initial %s clock throws", kind => {
    const fail = () => { throw new Error("clock provider detail"); };
    expect(() => budget(kind === "wall" ? { now: fail } : { monotonicNow: fail })).toThrow("invalid-operation-budget");
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("operation clock and continuation fences", () => {
  it("advances effective wall time with a frozen wall clock and fractional monotonic time", () => {
    let tick = 10; const item = budget({ monotonicNow: () => tick });
    tick = 1010.9; expect(item.checkpoint()).toBe(wallStart + 1000);
    tick = 30_010; expect(() => item.checkpoint()).toThrow("operation-budget-ended"); expect(vi.getTimerCount()).toBe(0);
  });

  it("uses whichever clock consumes the budget first", () => {
    let wall = wallStart, tick = 10; const item = budget({ now: () => wall, monotonicNow: () => tick });
    wall += 5000; tick += 500; expect(item.checkpoint()).toBe(wall);
    wall += 25_000; expect(() => item.checkpoint()).toThrow("operation-budget-ended"); expect(item.signal.aborted).toBe(true);
  });

  it.each(["wall", "monotonic"])("aborts when the %s clock regresses", kind => {
    let wall = wallStart, tick = 10; const item = budget({ now: () => wall, monotonicNow: () => tick });
    wall++; tick++; item.checkpoint(); if (kind === "wall") wall--; else tick--;
    expect(() => item.checkpoint()).toThrow("operation-budget-ended"); expect(item.signal.aborted).toBe(true);
  });

  it.each(["wall", "monotonic"])("aborts when the %s clock becomes invalid", kind => {
    let wall = wallStart, tick = 10; const item = budget({ now: () => wall, monotonicNow: () => tick });
    if (kind === "wall") wall = NaN; else tick = Infinity;
    expect(() => item.checkpoint()).toThrow("operation-budget-ended"); expect(item.signal.aborted).toBe(true);
  });

  it.each(["wall", "monotonic"])("aborts and rejects parallel work when the %s clock throws", async kind => {
    let throws = false;
    const read = () => { if (throws) throw new Error("clock provider detail"); return kind === "wall" ? wallStart : 10; };
    const item = budget(kind === "wall" ? { now: read } : { monotonicNow: read });
    const pending = expect(item.within(() => new Promise<never>(() => {}))).rejects.toThrow("operation-budget-ended");
    await Promise.resolve(); throws = true;
    expect(() => item.checkpoint()).toThrow("operation-budget-ended"); await pending; expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects unsafe effective wall arithmetic instead of extending validity", () => {
    let tick = 0; const item = budget({ now: () => Number.MAX_SAFE_INTEGER, monotonicNow: () => tick });
    tick = 1; expect(() => item.checkpoint()).toThrow("operation-budget-ended"); expect(item.signal.aborted).toBe(true);
  });

  it("rechecks before releasing a result whose operation consumed the deadline", async () => {
    let wall = wallStart; const item = budget({ now: () => wall });
    await expect(item.within(async () => { wall += 30_000; return "late"; })).rejects.toThrow("operation-budget-ended");
  });

  it("does not start a queued thunk if close occurs before its microtask", async () => {
    const item = budget(); const work = vi.fn(async () => 1); const pending = item.within(work); item.close();
    await expect(pending).rejects.toThrow("operation-budget-ended"); expect(work).not.toHaveBeenCalled();
  });

  it("ignores late success and late rejection without continuing the workflow", async () => {
    const item = budget(); const first = deferred<string>(); const second = deferred<string>(); const next = vi.fn(async () => "unsafe continuation");
    const success = (async () => { await item.within(() => first.promise); return item.within(next); })();
    const failure = item.within(() => second.promise);
    const successCheck = expect(success).rejects.toThrow("operation-budget-ended"); const failureCheck = expect(failure).rejects.toThrow("operation-budget-ended");
    await vi.advanceTimersByTimeAsync(30_000); await Promise.all([successCheck, failureCheck]);
    first.resolve("late"); second.reject(new Error("late error")); await Promise.resolve(); await Promise.resolve();
    expect(next).not.toHaveBeenCalled();
  });

  it("preserves operation errors instead of converting them into budget failures", async () => {
    const item = budget(); const error = new Error("operation-budget-ended");
    await expect(item.within(() => { throw error; })).rejects.toBe(error);
    expect(error).not.toBeInstanceOf(ImageKitOperationBudgetError); expect(item.signal.aborted).toBe(false);
  });
});

describe("external abort and listener lifetime", () => {
  it.each([null, {}, false])("rejects invalid runtime signal %j before allocating a timer", signal => {
    expect(() => budget({ signal: signal as unknown as AbortSignal })).toThrow("invalid-operation-budget");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("accepts an already-aborted signal without leaving a timer or starting work", async () => {
    const controller = new AbortController(); controller.abort(new Error("private reason"));
    const item = budget({ signal: controller.signal }); const work = vi.fn(async () => 1);
    expect(item.signal.aborted).toBe(true); expect(vi.getTimerCount()).toBe(0);
    await expect(item.within(work)).rejects.toThrow("operation-budget-ended"); expect(work).not.toHaveBeenCalled();
  });

  it("aborts all waiting work on external cancellation without exposing its reason", async () => {
    const controller = new AbortController(); const item = budget({ signal: controller.signal });
    const one = expect(item.within(() => new Promise<never>(() => {}))).rejects.toThrow("operation-budget-ended");
    const two = expect(item.within(() => new Promise<never>(() => {}))).rejects.toThrow("operation-budget-ended");
    await Promise.resolve(); controller.abort(new Error("private upstream reason")); await Promise.all([one, two]);
    expect(item.signal.aborted).toBe(true); expect(item.signal.reason).not.toEqual(controller.signal.reason); expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels a pending thunk if the parent aborts before its microtask", async () => {
    const controller = new AbortController(); const item = budget({ signal: controller.signal }); const work = vi.fn(async () => 1);
    const pending = item.within(work); controller.abort(); await expect(pending).rejects.toThrow("operation-budget-ended");
    expect(work).not.toHaveBeenCalled();
  });

  it("does not return a checkpoint if a clock callback aborts the parent", () => {
    const controller = new AbortController(); let shouldAbort = false;
    const item = budget({ signal: controller.signal, now: () => { if (shouldAbort) controller.abort(); return wallStart; } });
    shouldAbort = true; expect(() => item.checkpoint()).toThrow("operation-budget-ended"); expect(item.signal.aborted).toBe(true);
  });

  it.each(["close", "abort", "timeout", "clock"])("detaches the external listener and clears its timer after %s", async kind => {
    const controller = new AbortController(); const add = vi.spyOn(controller.signal, "addEventListener"); const remove = vi.spyOn(controller.signal, "removeEventListener");
    let wall = wallStart; const item = budget({ signal: controller.signal, now: () => wall });
    expect(add).toHaveBeenCalledTimes(1); const handler = add.mock.calls[0][1];
    if (kind === "close") item.close();
    else if (kind === "abort") controller.abort();
    else if (kind === "timeout") await vi.advanceTimersByTimeAsync(30_000);
    else { wall += 30_000; expect(() => item.checkpoint()).toThrow(); }
    expect(remove).toHaveBeenCalledWith("abort", handler); expect(remove).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0); item.close(); expect(remove).toHaveBeenCalledTimes(1);
    if (kind !== "abort") expect(controller.signal.aborted).toBe(false);
  });

  it.each(["resolve", "reject", "abort"])("cleans each within listener after %s", async kind => {
    const item = budget(); const add = vi.spyOn(item.signal, "addEventListener"); const remove = vi.spyOn(item.signal, "removeEventListener");
    if (kind === "resolve") await item.within(async () => 42);
    else if (kind === "reject") await expect(item.within(async () => { throw new Error("fixture"); })).rejects.toThrow("fixture");
    else { const pending = expect(item.within(() => new Promise<never>(() => {}))).rejects.toThrow("operation-budget-ended"); item.close(); await pending; }
    expect(add).toHaveBeenCalledTimes(1); expect(remove).toHaveBeenCalledWith("abort", add.mock.calls[0][1]); expect(remove).toHaveBeenCalledTimes(1);
  });

  it("close aborts observers, clears the timer and remains idempotent", () => {
    const item = budget(); const aborted = vi.fn(); item.signal.addEventListener("abort", aborted);
    item.close(); item.close(); expect(aborted).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
    expect(() => item.checkpoint()).toThrow("operation-budget-ended");
  });
});

describe("observation compatibility wrapper", () => {
  it("keeps its narrower 30-second ceiling and existing error messages", () => {
    expect(() => createImageKitObservationBudget({ timeoutMs: 30_001 })).toThrow("invalid-observation-budget");
    const item = createImageKitObservationBudget({ now: () => wallStart, monotonicNow: () => 0 });
    item.close(); expect(() => item.checkpoint()).toThrow("observation-budget-ended");
  });

  it("does not translate an unrelated work error merely matching a generic budget message", async () => {
    const item = createImageKitObservationBudget({ now: () => wallStart, monotonicNow: () => 0 });
    try {
      const error = new Error("operation-budget-ended");
      await expect(item.within(() => { throw error; })).rejects.toBe(error);
    } finally { item.close(); }
  });
});
