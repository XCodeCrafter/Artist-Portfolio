"use client";

import { useEffect, useRef, useState } from "react";
import ImageKitReconciliationOverview from "@/components/admin/v2/ImageKitReconciliationOverview";
import { refreshImageKitOperations, requestImageKitObservation } from "@/lib/admin/imagekit-operations-actions";
import { parseImageKitOperationsSnapshot } from "@/lib/admin/imagekit-operations-display";
import type { ImageKitObservationOutcome, ImageKitObservationSetupCode, ImageKitOperationsSnapshot } from "@/lib/admin/imagekit-operations-types";

export type ImageKitOperationsCallbacks = {
  refresh: typeof refreshImageKitOperations;
  observe: typeof requestImageKitObservation;
};

const defaultOperations: ImageKitOperationsCallbacks = {
  refresh: refreshImageKitOperations,
  observe: requestImageKitObservation,
};

const setupCopy: Record<ImageKitObservationSetupCode, { title: string; description: string }> = {
  available: { title: "Manual checks are available", description: "The current account is approved for read-only checks. Each click checks at most one eligible upload; it does not scan all storage or enable ImageKit uploads." },
  "access-required": { title: "Administrator access is required", description: "Sign in with an active administrator account and complete the authenticator check. Regular media library tools are separate from these checks." },
  "configuration-required": { title: "ImageKit connection is not configured", description: "The owner still needs to add the ImageKit connection details on the server, then approve this account. Do not paste private API keys into this page." },
  "checks-disabled": { title: "Manual checks are switched off", description: "The server must explicitly enable read-only ImageKit checks. This is separate from enabling uploads; refreshing status does not switch anything on." },
  "security-required": { title: "Security setup needs attention", description: "The server security settings must be completed before a check can run. Existing media tools are unchanged." },
  "database-unavailable": { title: "The database connection is unavailable", description: "The check setup cannot be verified right now. Refresh status after the database connection has been restored." },
  "migration-required": { title: "ImageKit database update required", description: "Ask your developer to verify the ImageKit migrations through 0052. Existing verified migrations do not need to be repeated. This page never applies database updates for you." },
  "database-not-ready": { title: "Database safety checks are not ready", description: "Review the ImageKit database setup and verification results before enabling a check. Refresh status after the setup has been corrected." },
  "approval-required": { title: "This ImageKit account needs approval", description: "The owner must explicitly approve this exact account and its current connection details. Approval may need renewing after it expires or the keys change. No approval is granted by this page." },
  unavailable: { title: "Check setup could not be confirmed", description: "Refresh status to try loading the setup again. Until it can be verified, manual checks remain unavailable." },
};

const outcomeCopy: Record<ImageKitObservationOutcome["code"], { title: string; description: string; error: boolean }> = {
  idle: { title: "No upload was selected", description: "No eligible upload was selected for this check. This is not a full storage scan and does not mean all uploads are resolved.", error: false },
  absent: { title: "The checked upload was not found", description: "The check recorded that the upload was not found. This does not confirm deletion or resolve the upload.", error: false },
  retry: { title: "The check was inconclusive", description: "A reliable result was not available. Refresh status before deciding whether to check again; no automatic retry will run.", error: false },
  "needs-review": { title: "This upload needs manual review", description: "The check found a situation that needs review. No files were deleted and the upload was not automatically resolved.", error: true },
  blocked: { title: "A safety or access check stopped this run", description: "Refresh status and review the setup before another check. A stopped run can still have updated the upload's check status.", error: true },
  "not-ready": { title: "ImageKit checks are not ready", description: "Refresh status and review the setup before another check. Do not assume the upload's check status is unchanged.", error: true },
  unconfirmed: { title: "The check result could not be confirmed", description: "The server may still be working. Waiting here has ended, but that does not cancel the server request. Refresh status before deciding what to do next.", error: true },
};

const refreshErrors = {
  blocked: "Status refresh was blocked. Check your administrator access, then refresh status again.",
  "rate-limited": "Refresh controls are busy or unavailable; wait and try refreshing later.",
  unavailable: "Status could not be refreshed. The displayed snapshot may be out of date; no new check has been unlocked.",
};

/** Stop waiting, not the server operation. Late outcomes never update this panel. */
function bounded<T>(operation: () => Promise<T>, timeout: number): Promise<{ ok: true; value: T } | { ok: false }> {
  return new Promise(resolve => {
    let finished = false;
    const finish = (result: { ok: true; value: T } | { ok: false }) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => finish({ ok: false }), timeout);
    Promise.resolve().then(operation).then(value => finish({ ok: true, value }), () => finish({ ok: false }));
  });
}

function snapshotTime(value: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return null;
  return `${new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(value))} UTC`;
}

export default function ImageKitOperationsPanel({ initial, operations = defaultOperations }: {
  initial: ImageKitOperationsSnapshot;
  operations?: ImageKitOperationsCallbacks;
}) {
  const [snapshot, setSnapshot] = useState(initial);
  const [pending, setPending] = useState<"refresh" | "observe" | null>(null);
  const [requiresRefresh, setRequiresRefresh] = useState(false);
  const [outcome, setOutcome] = useState<ImageKitObservationOutcome["code"] | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [refreshed, setRefreshed] = useState(false);
  const lock = useRef(false);
  const revision = useRef(0);
  const ready = useRef(initial.setup.code === "available");
  const mounted = useRef(true);
  // Keep the prop stable so refreshing counts does not overwrite a native
  // disclosure that the user has since opened or closed.
  const [overviewExpanded] = useState(initial.overview.status === "available" &&
    (initial.overview.overview.counts.attention > 0 || initial.overview.overview.counts.due > 0));

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; revision.current += 1; };
  }, []);

  async function refresh() {
    if (lock.current || !mounted.current) return;
    lock.current = true;
    ready.current = false;
    const current = ++revision.current;
    setPending("refresh");
    setRefreshError(null);
    setRefreshed(false);
    const result = await bounded(operations.refresh, 15_000);
    if (revision.current !== current) return;
    const response = result.ok ? result.value : null;
    const next = response?.ok === true && Object.keys(response).length === 2 && Object.hasOwn(response, "snapshot")
      ? parseImageKitOperationsSnapshot(response.snapshot) : null;
    if (next) {
      setSnapshot(next);
      setRequiresRefresh(false);
      ready.current = next.setup.code === "available";
      setRefreshed(true);
    } else {
      const code = response?.ok === false && Object.keys(response).length === 2 && typeof response.code === "string" && Object.hasOwn(refreshErrors, response.code)
        ? response.code : "unavailable";
      setRefreshError(refreshErrors[code]);
      setRequiresRefresh(true);
    }
    lock.current = false;
    setPending(null);
  }

  async function observe() {
    // The ref closes the double-click gap before React renders disabled buttons.
    if (lock.current || !ready.current || !mounted.current) return;
    lock.current = true;
    ready.current = false;
    const current = ++revision.current;
    setPending("observe");
    setRequiresRefresh(true);
    setRefreshError(null);
    setRefreshed(false);
    setOutcome(null);
    const result = await bounded(operations.observe, 45_000);
    if (revision.current !== current) return;
    const code = result.ok && result.value && Object.keys(result.value).length === 1 && typeof result.value.code === "string" && Object.hasOwn(outcomeCopy, result.value.code)
      ? result.value.code : "unconfirmed";
    setOutcome(code);
    lock.current = false;
    setPending(null);
  }

  const setup = setupCopy[snapshot.setup.code];
  const message = outcome ? outcomeCopy[outcome] : null;
  const checkedAt = snapshotTime(snapshot.setup.checkedAt);
  const canCheck = snapshot.setup.code === "available" && !requiresRefresh && pending === null;
  const buttonClass = "min-h-11 rounded-xl border px-4 py-2.5 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0d0d0f] disabled:cursor-not-allowed disabled:opacity-40";

  return <div className="grid min-w-0 gap-4">
    <section aria-labelledby="imagekit-operations-heading" className="min-w-0 rounded-[26px] border border-white/10 bg-[#0d0d0f] p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1 basis-64">
          <div className="flex flex-wrap items-center gap-3">
            <h2 id="imagekit-operations-heading" className="heading-ui text-lg font-semibold text-white">ImageKit operations</h2>
            <span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-white/55">Manual · read-only files</span>
          </div>
          <p className="mt-2 max-w-3xl text-xs leading-6 text-white/60">Refresh the status or check one eligible upload. A check only reads ImageKit and records its result in the database. It never uploads, deletes, or publishes a file.</p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <button type="button" onClick={refresh} disabled={pending !== null} aria-busy={pending === "refresh"}
            className={`${buttonClass} flex-1 border-white/15 text-white/80 hover:bg-white/5 sm:flex-none`}>Refresh status</button>
          <button type="button" onClick={observe} disabled={!canCheck} aria-busy={pending === "observe"} aria-describedby="imagekit-operation-availability"
            className={`${buttonClass} flex-1 border-white bg-white text-black hover:bg-white/90 sm:flex-none`}>Check one upload</button>
        </div>
      </div>
      <p id="imagekit-operation-availability" className="mt-4 text-sm font-medium text-white/85">{setup.title}</p>
      <details className="mt-2 min-w-0">
        <summary className="cursor-pointer rounded-lg py-2 text-xs text-white/65 outline-none focus-visible:ring-2 focus-visible:ring-white/60">Setup details</summary>
        <p className="mt-2 max-w-3xl text-xs leading-6 text-white/60">{setup.description}</p>
        <p className="mt-2 max-w-3xl text-xs leading-6 text-white/50">Access and account approval are checked again on the server for every run. Automatic checks and automatic retries are not enabled.</p>
        {checkedAt && <p className="mt-2 text-xs leading-5 text-white/50">Setup checked <time dateTime={snapshot.setup.checkedAt!}>{checkedAt}</time>.</p>}
      </details>
      <div role="status" aria-live="polite" aria-atomic="true" className="mt-3 text-xs leading-6 text-white/65">
        {pending === "refresh" ? "Refreshing ImageKit status…" : pending === "observe" ? "Checking one eligible upload…" : refreshed ? "Status refreshed. Your media editor and unsaved changes were left in place." : null}
      </div>
      {message && <div role={message.error ? "alert" : "status"} aria-atomic="true" className={`mt-3 rounded-2xl border p-4 ${message.error ? "border-amber-300/20 bg-amber-300/5" : "border-white/10 bg-white/[0.03]"}`}>
        <p className="text-sm font-medium text-white/90">{message.title}</p>
        <p className="mt-1 max-w-3xl text-xs leading-6 text-white/65">{message.description}</p>
      </div>}
      {refreshError && <p role="alert" className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/5 p-3 text-xs leading-6 text-amber-100">{refreshError}</p>}
      {requiresRefresh && pending !== "observe" && <p className="mt-3 text-xs leading-6 text-white/65">Status may have changed. Refresh status before another check.</p>}
    </section>
    <ImageKitReconciliationOverview data={snapshot.overview} initiallyExpanded={overviewExpanded} />
  </div>;
}
