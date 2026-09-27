import { z } from "zod";
import type { ImageKitReconciliationOverview, ImageKitReconciliationStage } from "@/lib/admin/imagekit-reconciliation-overview-types";

// Pure display validation shared by the privileged reader and client panel.
// This module contains no auth, credentials, server actions or provider calls.
const LIMIT = 20;
const count = z.number().int().nonnegative().safe();
const timestamp = z.string().max(40).datetime({ offset: true }).refine(value => Number.isFinite(Date.parse(value)));
const overviewSchema = z.object({
  version: z.literal(1), generatedAt: timestamp, total: count,
  counts: z.object({ uploading: count, waiting: count, due: count, checking: count, attention: count }).strict(),
  items: z.array(z.object({
    intentId: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/),
    label: z.string().min(1).max(220), mediaType: z.enum(["image", "video"]),
    sizeBytes: z.number().int().positive().max(95_000_000),
    stage: z.enum(["uploading", "waiting", "due", "checking", "attention"]),
    attempts: z.number().int().min(0).max(5),
    lastObservation: z.enum(["absent", "retry", "unsafe", "exhausted"]).nullable(),
    nextCheckAt: timestamp.nullable(), updatedAt: timestamp,
  }).strict()).max(50),
  hasMore: z.boolean(),
}).strict();

/** Unknown/unavailable is never silently shown as an empty or healthy queue. */
export function parseImageKitReconciliationOverview(input: unknown, limit = LIMIT): ImageKitReconciliationOverview | null {
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) return null;
  const parsed = overviewSchema.safeParse(input);
  if (!parsed.success) return null;
  const value = parsed.data;
  const sum = Object.values(value.counts).reduce((total, current) => total + current, 0);
  if (!Number.isSafeInteger(sum) || sum !== value.total || value.items.length !== Math.min(limit, value.total) ||
      value.hasMore !== (value.total > value.items.length) || new Set(value.items.map(item => item.intentId)).size !== value.items.length) return null;
  const observed: Record<ImageKitReconciliationStage, number> = { uploading: 0, waiting: 0, due: 0, checking: 0, attention: 0 };
  const generatedAt = Date.parse(value.generatedAt);
  for (const item of value.items) {
    observed[item.stage]++;
    if (item.mediaType === "image" && item.sizeBytes > 10 * 1024 * 1024) return null;
    if (item.stage === "attention") {
      if (item.nextCheckAt !== null) return null;
    } else {
      if (item.nextCheckAt === null) return null;
      const nextCheckAt = Date.parse(item.nextCheckAt);
      if (item.stage === "due" ? nextCheckAt > generatedAt : nextCheckAt <= generatedAt) return null;
    }
  }
  if (Object.entries(observed).some(([key, count]) => count > value.counts[key as ImageKitReconciliationStage])) return null;
  return value;
}
