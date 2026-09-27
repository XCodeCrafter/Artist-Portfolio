import { afterEach, describe, expect, it, vi } from "vitest";
import { createImageKitObservationBudget, parseImageKitObservationApproval } from "@/lib/admin/imagekit-observation-contracts";

const now = Date.parse("2026-09-23T12:00:00.000Z");
const approval = {
  version: 1 as const, storageContainer: "fictional_artist", urlEndpoint: "https://ik.imagekit.io/fictional_artist",
  credentialBinding: "a".repeat(64), revision: "00000000-0000-4000-8000-000000000001",
  expiresAt: "2026-09-23T13:00:00.000Z",
};
const expected = { storageContainer: approval.storageContainer, urlEndpoint: approval.urlEndpoint, credentialBinding: approval.credentialBinding };
const budgets: ReturnType<typeof createImageKitObservationBudget>[] = [];
function budget(options: Parameters<typeof createImageKitObservationBudget>[0] = {}) {
  const result = createImageKitObservationBudget({ now: () => now, monotonicNow: () => 0, ...options });
  budgets.push(result); return result;
}
afterEach(() => { budgets.splice(0).forEach(item => item.close()); vi.useRealTimers(); });

describe("exact, short-lived observation approval projection", () => {
  it("accepts only the configured account/binding and freezes the projection", () => {
    const result = parseImageKitObservationApproval(approval, expected, now);
    expect(result).toEqual(approval); expect(Object.isFrozen(result)).toBe(true);
  });
  it.each([null, [], {}, true, "approved", { ...approval, approved: true }, { ...approval, version: 2 },
    { ...approval, storageContainer: "foreign" }, { ...approval, credentialBinding: "b".repeat(64) },
    { ...approval, credentialBinding: "A".repeat(64) }, { ...approval, credentialBinding: "a".repeat(63) },
    { ...approval, revision: "00000000-0000-1000-8000-000000000001" },
    { ...approval, revision: "00000000-0000-4000-0000-000000000001" },
    { ...approval, revision: "00000000-0000-4000-8000-000000000001\n" },
    { ...approval, expiresAt: "not-a-date" }, { ...approval, expiresAt: "2026-09-23T13:00:00" },
  ])("rejects malformed, extra or foreign data %j", value => {
    expect(parseImageKitObservationApproval(value, expected, now)).toBeNull();
  });
  it.each(["https://ik.imagekit.io/fictional_artist/", "https://ik.imagekit.io/fictional_artist?x=1",
    "https://ik.imagekit.io/fictional_artist#x", "https://ik.imagekit.io:443/fictional_artist",
    "http://ik.imagekit.io/fictional_artist", "https://user@ik.imagekit.io/fictional_artist",
    "https://evil.test/fictional_artist", "https://ik.imagekit.io/other",
  ])("rejects a noncanonical endpoint even if expected also contains it: %s", urlEndpoint => {
    expect(parseImageKitObservationApproval({ ...approval, urlEndpoint }, { ...expected, urlEndpoint }, now)).toBeNull();
  });
  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])("rejects invalid current time %j", time => {
    expect(parseImageKitObservationApproval(approval, expected, time)).toBeNull();
  });
  it.each([0, 4999, 5000.5, NaN, Infinity])("rejects unsafe safety margins %j", margin => {
    expect(parseImageKitObservationApproval(approval, expected, now, margin)).toBeNull();
  });
  it.each([-1, 0, 34_999, 35_000, 86_400_001])("rejects expiry outside admission window %i", remaining => {
    expect(parseImageKitObservationApproval({ ...approval, expiresAt: new Date(now + remaining).toISOString() }, expected, now)).toBeNull();
  });
  it.each([35_001, 86_400_000])("accepts the bounded expiry window %i", remaining => {
    expect(parseImageKitObservationApproval({ ...approval, expiresAt: new Date(now + remaining).toISOString() }, expected, now)).not.toBeNull();
  });
  it("uses a smaller but strict five-second safety margin only when explicitly revalidating", () => {
    const short = { ...approval, expiresAt: new Date(now + 5001).toISOString() };
    expect(parseImageKitObservationApproval(short, expected, now)).toBeNull();
    expect(parseImageKitObservationApproval(short, expected, now, 5000)).toEqual(short);
    expect(parseImageKitObservationApproval({ ...short, expiresAt: new Date(now + 5000).toISOString() }, expected, now, 5000)).toBeNull();
  });
});

describe("one shared lazy observation time budget", () => {
  it("starts work lazily and exposes a live abort signal", async () => {
    const item = budget(); const work = vi.fn(async () => "value");
    expect(item.signal.aborted).toBe(false); expect(work).not.toHaveBeenCalled();
    await expect(item.within(work)).resolves.toBe("value"); expect(work).toHaveBeenCalledOnce();
    item.close(); expect(item.signal.aborted).toBe(true);
  });
  it("never starts work after explicit close (including a previously scheduled microtask)", async () => {
    const item = budget(); const work = vi.fn(async () => "value");
    const pending = item.within(work); item.close();
    await expect(pending).rejects.toThrow("observation-budget-ended");
    await expect(item.within(work)).rejects.toThrow("observation-budget-ended"); expect(work).not.toHaveBeenCalled();
    expect(() => item.checkpoint()).toThrow("observation-budget-ended");
  });
  it("times out after 30 seconds even with frozen wall and monotonic clocks", async () => {
    vi.useFakeTimers(); const item = budget(); const work = vi.fn(() => new Promise<string>(() => {}));
    const pending = expect(item.within(work)).rejects.toThrow("observation-budget-ended");
    await vi.advanceTimersByTimeAsync(29_999); expect(item.signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1); await pending; expect(item.signal.aborted).toBe(true);
  });
  it("a late resolution cannot start subsequent work after timeout", async () => {
    vi.useFakeTimers(); const item = budget(); let resolve!: (value: string) => void;
    const next = vi.fn(async () => "second");
    const operation = (async () => { await item.within(() => new Promise<string>(done => { resolve = done; })); return item.within(next); })();
    const assertion = expect(operation).rejects.toThrow("observation-budget-ended");
    await vi.advanceTimersByTimeAsync(30_000); await assertion; resolve("late"); await Promise.resolve();
    expect(next).not.toHaveBeenCalled();
  });
  it("accounts for elapsed monotonic time while the wall clock is frozen", () => {
    let tick = 10; const item = budget({ monotonicNow: () => tick }); tick = 1010.9;
    expect(item.checkpoint()).toBe(now + 1000); tick = 30_010;
    expect(() => item.checkpoint()).toThrow("observation-budget-ended");
  });
  it("does not extend the deadline when wall time advances faster than monotonic time", () => {
    let wall = now; const item = budget({ now: () => wall }); wall += 30_000;
    expect(() => item.checkpoint()).toThrow("observation-budget-ended");
  });
  it.each(["wall", "monotonic"])("aborts on a regressing %s clock", kind => {
    let wall = now, tick = 1; const item = budget({ now: () => wall, monotonicNow: () => tick });
    wall++; tick++; item.checkpoint(); if (kind === "wall") wall--; else tick--;
    expect(() => item.checkpoint()).toThrow("observation-budget-ended"); expect(item.signal.aborted).toBe(true);
  });
  it.each([0, -1, NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1])("rejects invalid initial wall time %j", time => {
    expect(() => budget({ now: () => time })).toThrow("invalid-observation-budget");
  });
  it.each([-1, NaN, Infinity])("rejects invalid initial monotonic time %j", time => {
    expect(() => budget({ monotonicNow: () => time })).toThrow("invalid-observation-budget");
  });
  it.each([0, -1, 30_001, 1.5, NaN, Infinity])("rejects timeout outside the hard limit %j", timeoutMs => {
    expect(() => budget({ timeoutMs })).toThrow("invalid-observation-budget");
  });
  it.each(["wall", "monotonic"])("aborts if %s clock becomes nonfinite", kind => {
    let wall = now, tick = 0; const item = budget({ now: () => wall, monotonicNow: () => tick });
    if (kind === "wall") wall = NaN; else tick = Infinity;
    expect(() => item.checkpoint()).toThrow("observation-budget-ended"); expect(item.signal.aborted).toBe(true);
  });
  it("checks the budget again before handing a result back to its caller", async () => {
    let wall = now; const item = budget({ now: () => wall });
    await expect(item.within(async () => { wall += 30_000; return "too late"; })).rejects.toThrow("observation-budget-ended");
  });
  it("supports thenables and leaves rejection policy to its caller", async () => {
    const item = budget();
    await expect(item.within(() => Promise.resolve(42))).resolves.toBe(42);
    await expect(item.within(() => { throw new Error("fixture failure"); })).rejects.toThrow("fixture failure");
  });
  it("close clears the timer and is idempotent", () => {
    vi.useFakeTimers(); const item = budget(); expect(vi.getTimerCount()).toBe(1);
    item.close(); item.close(); expect(vi.getTimerCount()).toBe(0);
  });
});
