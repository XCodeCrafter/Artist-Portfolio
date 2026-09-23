import "server-only";

import { z } from "zod";
import {
  parseImageKitUploadSnapshot,
  type ImageKitUploadSnapshot,
} from "@/lib/admin/imagekit-lifecycle-contracts";

const leaseFieldsSchema = z.object({
  leaseId: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/),
  leaseExpiresAt: z.string().max(40).datetime({ offset: true })
    .refine((value) => Number.isFinite(Date.parse(value))),
}).strict();
const observationSchema = z.enum(["absent", "retry", "unsafe"]);

export type ImageKitCleanupLease = ImageKitUploadSnapshot & Readonly<z.infer<typeof leaseFieldsSchema>>;

function parseLeaseShape(
  input: unknown,
  expected: { storageContainer: string },
): ImageKitCleanupLease | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const { leaseId, leaseExpiresAt, ...base } = input as Record<string, unknown>;
  const fields = leaseFieldsSchema.safeParse({ leaseId, leaseExpiresAt });
  if (!fields.success || typeof base.intentId !== "string") return null;
  // Strip only the two documented lease fields. Unknown fields must still fail
  // the existing strict snapshot parser, including its server-owned namespace.
  const snapshot = parseImageKitUploadSnapshot(base, {
    intentId: base.intentId,
    storageContainer: expected.storageContainer,
  });
  if (!snapshot || !["expired", "cancelled", "failed"].includes(snapshot.status) ||
      snapshot.issuedAt === null || snapshot.authorityExpiresAt === null ||
      snapshot.cleanupState !== "leased") return null;
  // The base parser also requires every provider/source binding to remain null.
  return { ...snapshot, ...fields.data };
}

/**
 * Accept only a currently usable 0047 observation lease for this account.
 * The settling delay permits observation; it proves neither upload quiescence
 * nor safe deletion (an already accepted upload might still finish later).
 */
export function parseImageKitCleanupLease(
  input: unknown,
  expected: { storageContainer: string },
  now: number,
): ImageKitCleanupLease | null {
  if (!Number.isSafeInteger(now) || now <= 0) return null;
  const lease = parseLeaseShape(input, expected);
  if (!lease) return null;
  if (now - Date.parse(lease.expiresAt) < 3_600_000 ||
      Date.parse(lease.authorityExpiresAt!) >= now) return null;
  const remaining = Date.parse(lease.leaseExpiresAt) - now;
  // Leave enough time for a bounded read and its fenced observation commit;
  // tolerate at most five seconds of database/application clock skew.
  if (remaining <= 30_000 || remaining > 305_000) return null;
  return lease;
}

/** Check a fenced observation result; neither pending nor attention means deleted. */
export function parseImageKitCleanupFinished(
  input: unknown,
  lease: ImageKitCleanupLease,
  observation: "absent" | "retry" | "unsafe",
): ImageKitUploadSnapshot | null {
  if (!observationSchema.safeParse(observation).success) return null;
  if (!lease || typeof lease !== "object" || Array.isArray(lease)) return null;
  const original = parseLeaseShape(lease, { storageContainer: lease.storageContainer });
  if (!original) return null;
  const snapshot = parseImageKitUploadSnapshot(input, {
    intentId: original.intentId,
    storageContainer: original.storageContainer,
  });
  if (!snapshot || !["pending", "attention"].includes(snapshot.cleanupState) ||
      (observation === "unsafe" && snapshot.cleanupState !== "attention")) return null;
  // Do not normalize timestamps or silently accept drift of any reservation,
  // issuance, status or binding field. Only cleanupState may have changed.
  for (const key of Object.keys(snapshot) as (keyof ImageKitUploadSnapshot)[]) {
    if (key !== "cleanupState" && snapshot[key] !== original[key]) return null;
  }
  return snapshot;
}
