import { z } from "zod";
import { parseImageKitReconciliationOverview } from "@/lib/admin/imagekit-reconciliation-overview-contracts";
import type { ImageKitOperationsSnapshot } from "@/lib/admin/imagekit-operations-types";

const snapshotSchema = z.object({
  setup: z.object({
    code: z.enum(["available", "access-required", "configuration-required", "checks-disabled", "security-required",
      "database-unavailable", "migration-required", "database-not-ready", "approval-required", "unavailable"]),
    checkedAt: z.string().max(40).datetime({ offset: true }).refine(value => Number.isFinite(Date.parse(value))).nullable(),
  }).strict(),
  overview: z.discriminatedUnion("status", [
    z.object({ status: z.literal("available"), overview: z.unknown() }).strict(),
    z.object({ status: z.literal("unavailable"), reason: z.enum(["not-configured", "migration-required", "not-ready", "unavailable"]) }).strict(),
  ]),
}).strict();

/** Pure display boundary: reject malformed/over-shared refresh payloads before
 * replacing a working panel snapshot. This is validation, never authorization. */
export function parseImageKitOperationsSnapshot(value: unknown): ImageKitOperationsSnapshot | null {
  try {
    const parsed = snapshotSchema.safeParse(value);
    if (!parsed.success) return null;
    const { setup, overview } = parsed.data;
    if (overview.status === "unavailable") return { setup, overview };
    const checkedOverview = parseImageKitReconciliationOverview(overview.overview);
    return checkedOverview ? { setup, overview: { status: "available", overview: checkedOverview } } : null;
  } catch {
    return null;
  }
}
