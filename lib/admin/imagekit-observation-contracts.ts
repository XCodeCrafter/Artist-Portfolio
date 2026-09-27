import "server-only";

import { z } from "zod";
import { createImageKitOperationBudget, ImageKitOperationBudgetError, type ImageKitOperationBudget } from "@/lib/admin/imagekit-operation-budget";

export type ImageKitObservationApproval = Readonly<{
  version: 1;
  storageContainer: string;
  urlEndpoint: string;
  credentialBinding: string;
  revision: string;
  expiresAt: string;
}>;

const approvalSchema = z.object({
  version: z.literal(1),
  storageContainer: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
  urlEndpoint: z.string().max(256),
  credentialBinding: z.string().regex(/^[a-f0-9]{64}$/),
  revision: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/),
  expiresAt: z.string().datetime({ offset: true }),
}).strict();

export function parseImageKitObservationApproval(
  value: unknown,
  expected: Pick<ImageKitObservationApproval, "storageContainer" | "urlEndpoint" | "credentialBinding">,
  now: number,
  minimumRemainingMs = 35_000,
): ImageKitObservationApproval | null {
  if (!Number.isSafeInteger(now) || now <= 0 || !Number.isSafeInteger(minimumRemainingMs) || minimumRemainingMs < 5000) return null;
  const parsed = approvalSchema.safeParse(value);
  if (!parsed.success) return null;
  const approval = parsed.data;
  const remaining = Date.parse(approval.expiresAt) - now;
  if (approval.storageContainer !== expected.storageContainer ||
      approval.urlEndpoint !== `https://ik.imagekit.io/${approval.storageContainer}` ||
      approval.urlEndpoint !== expected.urlEndpoint || approval.credentialBinding !== expected.credentialBinding ||
      remaining <= minimumRemainingMs || remaining > 86_400_000) return null;
  return Object.freeze(approval);
}

/** One run's lifetime. Work must be a thunk so an expired run cannot start it. */
export type ImageKitObservationBudget = Readonly<Pick<ImageKitOperationBudget, "signal" | "checkpoint" | "within">>;

function observationBudgetError(error: unknown): never {
  if (error instanceof ImageKitOperationBudgetError) {
    throw new Error(error.code === "invalid-operation-budget" ? "invalid-observation-budget" : "observation-budget-ended");
  }
  throw error;
}

export function createImageKitObservationBudget(options: {
  now?: () => number;
  monotonicNow?: () => number;
  timeoutMs?: number;
} = {}): ImageKitObservationBudget & { close(): void } {
  const timeoutMs = options.timeoutMs ?? 30_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) throw new Error("invalid-observation-budget");
  let budget: ImageKitOperationBudget;
  try { budget = createImageKitOperationBudget({ ...options, timeoutMs }); }
  catch (error) { return observationBudgetError(error); }
  return {
    signal: budget.signal,
    checkpoint() {
      try { return budget.checkpoint(); }
      catch (error) { return observationBudgetError(error); }
    },
    async within<T>(work: () => PromiseLike<T>): Promise<T> {
      try { return await budget.within(work); }
      catch (error) { return observationBudgetError(error); }
    },
    close: budget.close,
  };
}
