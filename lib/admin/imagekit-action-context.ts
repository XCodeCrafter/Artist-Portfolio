import "server-only";

import { headers } from "next/headers";
import { requireAdmin } from "@/lib/admin/auth";
import { verifyAdminActionOrigin } from "@/lib/admin/action-security";
import { getImageKitPilotUploadCredentials } from "@/lib/admin/media-upload-config";
import { hasAuthSecuritySecret, keyedDigest } from "@/lib/admin/security-secret";
import { createAdminServiceClient } from "@/lib/admin/service";
import { consumeDatabaseRateLimit } from "@/lib/security/rate-limit";

export type ImageKitReservationFailure = Readonly<{
  ok: false;
  code: "origin-blocked" | "pilot-unavailable" | "invalid-request" | "rate-limited" |
    "service-unavailable" | "migration-required" | "intent-unavailable" | "conflict" |
    "unconfirmed";
  message: string;
}>;

/** No signing or provider calls: this admits reservation management only. */
export async function getImageKitReservationContext(operation: "prepare" | "resolve" | "cancel") {
  // Keep Next's login/MFA redirect outside error handling.
  const admin = await requireAdmin();
  const headerStore = await headers();
  const origin = headerStore.get("origin");
  let exactOrigin = false;
  try {
    if (origin) {
      const url = new URL(origin);
      exactOrigin = ["http:", "https:"].includes(url.protocol) && url.origin === origin;
    }
  } catch { /* Invalid/missing Origin never falls back to Referer. */ }
  if (!exactOrigin || !(await verifyAdminActionOrigin(admin.id, "imagekit:reservation"))) {
    return { ok: false, code: "origin-blocked", message: "The request origin was blocked. Refresh Admin V2 and try again." } satisfies ImageKitReservationFailure;
  }
  // This gate validates configuration shape, NOT public/private key pairing.
  // Nothing in this module authorizes provider upload, verification or deletion.
  const pilot = getImageKitPilotUploadCredentials();
  if (!admin.hasActiveProfile || !pilot.isAvailable) {
    return { ok: false, code: "pilot-unavailable", message: "The ImageKit pilot is not available. Current Supabase uploads are unchanged." } satisfies ImageKitReservationFailure;
  }
  if (!hasAuthSecuritySecret()) {
    return { ok: false, code: "service-unavailable", message: "Secure upload controls are unavailable. No upload permission was issued." } satisfies ImageKitReservationFailure;
  }
  const identifierHash = keyedDigest("imagekit-reservation-actor", admin.id);
  // One fixed bucket per actor/operation, never a browser-selected asset/IP.
  // Resolve/cancel retain their own capacity when preparation is throttled.
  const rate = await consumeDatabaseRateLimit({
    bucket: `admin-imagekit:${operation}`, identifierHash,
    limit: operation === "prepare" ? 10 : 60,
    windowSeconds: operation === "prepare" ? 600 : 60,
    failClosed: true,
  });
  if (!rate.allowed || !rate.configured) {
    return { ok: false, code: "rate-limited", message: "Upload request controls are busy or unavailable. Wait a moment and try again." } satisfies ImageKitReservationFailure;
  }
  let client;
  try { client = createAdminServiceClient(); } catch { client = null; }
  if (!client) {
    return { ok: false, code: "service-unavailable", message: "Admin database access is not configured." } satisfies ImageKitReservationFailure;
  }
  // Deliberately retain only account identity, not credential material.
  return { ok: true as const, actorId: admin.id, storageContainer: pilot.credentials.imageKitId, client };
}
