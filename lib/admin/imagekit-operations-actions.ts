"use server";

import { z } from "zod";
import { createImageKitObservationEntry } from "@/lib/admin/imagekit-observation-entry";
import { refreshImageKitOperationsSnapshot } from "@/lib/admin/imagekit-operations";
import type { ImageKitObservationOutcome, ImageKitOperationsRefreshResult } from "@/lib/admin/imagekit-operations-types";

const resultSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(false), code: z.enum(["not-admitted", "not-ready", "invalid-lease", "lease-expired", "unconfirmed"]) }).strict(),
  z.discriminatedUnion("state", [
    z.object({ ok: z.literal(true), state: z.literal("idle") }).strict(),
    z.object({ ok: z.literal(true), state: z.literal("observed"), observation: z.enum(["absent", "retry", "unsafe"]),
      queueState: z.enum(["pending", "attention"]) }).strict(),
  ]),
]);

/** One explicit request, no target/approval/configuration from the browser.
 * The worker performs fresh admission; an earlier setup snapshot grants nothing.
 * No retries, cache revalidation, upload issuance or provider deletion. */
export async function requestImageKitObservation(): Promise<ImageKitObservationOutcome> {
  try {
    const parsed = resultSchema.safeParse(await createImageKitObservationEntry().runOnce());
    if (!parsed.success) return { code: "unconfirmed" };
    const result = parsed.data;
    if (!result.ok) return { code: result.code === "not-admitted" ? "blocked" : result.code === "not-ready" ? "not-ready" : "unconfirmed" };
    if (result.state === "idle") return { code: "idle" };
    if (result.observation === "unsafe" && result.queueState !== "attention") return { code: "unconfirmed" };
    if (result.queueState === "attention") return { code: "needs-review" };
    return { code: result.observation === "absent" ? "absent" : "retry" };
  } catch { return { code: "unconfirmed" }; }
}

/** Local panel data only; never calls the worker or refreshes the page/editor. */
export async function refreshImageKitOperations(): Promise<ImageKitOperationsRefreshResult> {
  try { return await refreshImageKitOperationsSnapshot(); }
  catch { return { ok: false, code: "unavailable" }; }
}
