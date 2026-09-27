import "server-only";

export type ImageKitOperationBudgetOptions = {
  now?: () => number;
  monotonicNow?: () => number;
  timeoutMs?: number;
  signal?: AbortSignal;
};

/** One operation's lifetime. Work must be lazy so an ended run cannot start it. */
export type ImageKitOperationBudget = Readonly<{
  signal: AbortSignal;
  checkpoint(): number;
  within<T>(work: () => PromiseLike<T>): Promise<T>;
  close(): void;
}>;

/** A typed marker lets compatibility wrappers translate only budget failures,
 * never an unrelated operation error that happens to use the same message. */
export class ImageKitOperationBudgetError extends Error {
  constructor(readonly code: "invalid-operation-budget" | "operation-budget-ended") {
    super(code);
    this.name = "ImageKitOperationBudgetError";
  }
}

export function createImageKitOperationBudget(options: ImageKitOperationBudgetOptions = {}): ImageKitOperationBudget {
  const now = options.now ?? Date.now;
  const monotonicNow = options.monotonicNow ?? (() => performance.now());
  const timeoutMs = options.timeoutMs ?? 30_000;
  let wallStart: number;
  let monotonicStart: number;
  try {
    wallStart = now();
    monotonicStart = monotonicNow();
  } catch {
    throw new ImageKitOperationBudgetError("invalid-operation-budget");
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000 ||
      !Number.isSafeInteger(wallStart) || wallStart <= 0 ||
      !Number.isFinite(monotonicStart) || monotonicStart < 0 ||
      (options.signal !== undefined && !(options.signal instanceof AbortSignal))) {
    throw new ImageKitOperationBudgetError("invalid-operation-budget");
  }

  const controller = new AbortController();
  const external = options.signal;
  let externalAttached = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const end = () => {
    if (timer !== undefined) { clearTimeout(timer); timer = undefined; }
    if (externalAttached) {
      external?.removeEventListener("abort", end);
      externalAttached = false;
    }
    controller.abort();
  };
  timer = setTimeout(end, timeoutMs);
  if (external) {
    if (external.aborted) end();
    else {
      external.addEventListener("abort", end, { once: true });
      externalAttached = true;
      if (external.aborted) end();
    }
  }

  let lastWall = wallStart;
  let lastMonotonic = monotonicStart;
  const stop = (): never => {
    end();
    throw new ImageKitOperationBudgetError("operation-budget-ended");
  };
  const checkpoint = () => {
    if (controller.signal.aborted) return stop();
    let wall: number;
    let monotonic: number;
    try { wall = now(); monotonic = monotonicNow(); }
    catch { return stop(); }
    if (controller.signal.aborted || !Number.isSafeInteger(wall) || wall < lastWall ||
        !Number.isFinite(monotonic) || monotonic < lastMonotonic) return stop();
    lastWall = wall;
    lastMonotonic = monotonic;
    const elapsed = Math.max(wall - wallStart, monotonic - monotonicStart);
    if (elapsed >= timeoutMs) return stop();
    // A frozen wall clock cannot extend account approval or an upload lease.
    const effectiveWall = Math.max(wall, wallStart + Math.floor(monotonic - monotonicStart));
    if (!Number.isSafeInteger(effectiveWall)) return stop();
    return effectiveWall;
  };

  return {
    signal: controller.signal,
    checkpoint,
    async within<T>(work: () => PromiseLike<T>): Promise<T> {
      checkpoint();
      let abort: (() => void) | undefined;
      const interrupted = new Promise<never>((_, reject) => {
        abort = () => reject(new ImageKitOperationBudgetError("operation-budget-ended"));
        controller.signal.addEventListener("abort", abort, { once: true });
        if (controller.signal.aborted) abort();
      });
      try {
        const value = await Promise.race([
          Promise.resolve().then(() => { checkpoint(); return work(); }), interrupted,
        ]);
        checkpoint();
        return value;
      } finally {
        if (abort) controller.signal.removeEventListener("abort", abort);
      }
    },
    close: end,
  };
}
