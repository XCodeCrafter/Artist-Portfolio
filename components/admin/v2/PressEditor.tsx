"use client";

import Link from "next/link";
import { startTransition, useActionState, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FaCheck, FaDesktop, FaExternalLinkAlt, FaMobileAlt, FaSlidersH, FaSpinner, FaTimes } from "react-icons/fa";
import { savePressPageV2 } from "@/app/admin/v2/pages/press/actions";
import HomeEditorialInspector from "@/components/admin/v2/HomeEditorialInspector";
import PressPreviewFrame, { type PressPreviewDevice } from "@/components/admin/v2/PressPreviewFrame";
import useUnsavedChangesGuard from "@/components/admin/useUnsavedChangesGuard";
import { needsEditorReload, runEditorSave } from "@/lib/admin/editor-save-recovery";
import { createFallbackHomeEditorSnapshot, INITIAL_HOME_SAVE_STATE, parseHomeSectionSubmission, type HomeSaveState } from "@/lib/admin/home-editor";
import type { HomePress } from "@/lib/admin/home-editorial";
import type { MediaAsset } from "@/lib/admin/media";
import type { PressEditorSnapshot } from "@/lib/admin/press";

type Props = { snapshot: PressEditorSnapshot; assets: MediaAsset[]; disabled: boolean; migrationRequired: boolean; loadError?: string; mediaLoadError?: string };
const panelClass = "rounded-[24px] border border-white/10 bg-[#0f0f11]/95";
const buttonClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/12 px-3 text-xs font-semibold text-white/70 transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-30";
const changed = (baseline: HomePress, draft: HomePress) => JSON.stringify(baseline) !== JSON.stringify(draft);

export default function PressEditor({ snapshot, assets, disabled, migrationRequired, loadError, mediaLoadError }: Props) {
  const [draft, setDraft] = useState(snapshot.draft);
  const [baseline, setBaseline] = useState(snapshot.draft);
  const [versions, setVersions] = useState(snapshot.versions);
  const draftRef = useRef(draft);
  const baselineRef = useRef(baseline);
  const versionsRef = useRef(versions);
  const savingRef = useRef(false);
  const [device, setDevice] = useState<PressPreviewDevice>("desktop");
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dismissedEvent, setDismissedEvent] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inspectorTriggerRef = useRef<HTMLButtonElement>(null);
  const { markDirty, clearDirty, confirmDiscard } = useUnsavedChangesGuard("You have unsaved Press changes. Leave and discard them?", true);
  const unavailable = disabled || migrationRequired || Boolean(loadError);

  const clientAction = useCallback(async (previous: HomeSaveState, formData: FormData) => {
    if (unavailable || savingRef.current || needsEditorReload(previous) ||
      ["migration-required", "security-error", "missing-service"].includes(previous.status)) return previous;
    if (formData.get("section") !== "press" ||
      formData.get("payload") !== JSON.stringify(draftRef.current) ||
      formData.get("versions") !== JSON.stringify(versionsRef.current) ||
      !changed(baselineRef.current, draftRef.current) ||
      !parseHomeSectionSubmission("press", draftRef.current, versionsRef.current).success) return previous;
    savingRef.current = true;
    try {
      return await runEditorSave(previous, () => savePressPageV2(INITIAL_HOME_SAVE_STATE, formData), result => {
        if (result.section !== "press" || !result.canonicalSection || !result.versions) return false;
        const parsed = parseHomeSectionSubmission("press", result.canonicalSection, result.versions);
        if (!parsed.success || parsed.data.versions.updatedAt === versionsRef.current.updatedAt) return false;
        const saved = parsed.data.payload as HomePress;
        draftRef.current = saved; baselineRef.current = saved; versionsRef.current = parsed.data.versions;
        setDraft(saved); setBaseline(saved); setVersions(parsed.data.versions); clearDirty();
        setAnnouncement(`Press & reviews: ${result.message}`);
        return true;
      });
    } finally { savingRef.current = false; }
  }, [clearDirty, unavailable]);
  const [saveState, formAction, pending] = useActionState(clientAction, INITIAL_HOME_SAVE_STATE);
  const dirty = changed(baseline, draft);
  const validation = parseHomeSectionSubmission("press", draft, versions);
  const visibleResponse = needsEditorReload(saveState) || Boolean(saveState.eventId && saveState.eventId !== dismissedEvent);
  const errors = { ...(!validation.success ? validation.fieldErrors : {}), ...(visibleResponse ? saveState.fieldErrors : {}) };
  const locked = unavailable || pending || needsEditorReload(saveState) || ["migration-required", "security-error", "missing-service"].includes(saveState.status);
  const canSave = !locked && dirty && validation.success;
  // The established collection inspector receives only Press changes. The
  // compatibility wrapper never submits or changes another Home section.
  const inspectorDraft = useMemo(() => ({ ...createFallbackHomeEditorSnapshot().draft, press: draft }), [draft]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (mobileOpen && dialog && !dialog.open) dialog.showModal();
    if (!mobileOpen && dialog?.open) dialog.close();
    if (!mobileOpen) return;
    const overflow = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = overflow; };
  }, [mobileOpen]);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1280px)");
    const frame = requestAnimationFrame(() => { if (!desktop.matches) setDevice("mobile"); });
    const onChange = () => { if (desktop.matches) setMobileOpen(false); };
    desktop.addEventListener("change", onChange);
    return () => { cancelAnimationFrame(frame); desktop.removeEventListener("change", onChange); };
  }, []);

  function change(next: HomePress) {
    if (locked || savingRef.current) return;
    draftRef.current = next; setDraft(next); setDismissedEvent(saveState.eventId);
    if (changed(baselineRef.current, next)) markDirty(); else clearDirty();
  }
  function discard() { change(baselineRef.current); setAnnouncement("Press restored to its last saved version."); }
  function closeMobile() { setMobileOpen(false); requestAnimationFrame(() => inspectorTriggerRef.current?.focus()); }
  function openInspector() {
    if (window.matchMedia("(min-width: 1280px)").matches) setInspectorOpen(true); else setMobileOpen(true);
  }
  const inspector = (instance: string) => <fieldset disabled={locked} className="min-w-0 disabled:opacity-60">
    <HomeEditorialInspector section="press" pressPage draft={inspectorDraft} assets={assets} errors={errors} instance={instance}
      onChange={next => change(next.press)} device={device} onDeviceChange={setDevice} />
  </fieldset>;
  const saveButton = <button aria-busy={pending} aria-label={pending ? "Saving Press & reviews" : "Save Press & reviews"} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-white px-5 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-35" type="submit" disabled={!canSave}>
    {pending ? <FaSpinner className="animate-spin" /> : <FaCheck />} {pending ? "Saving…" : <span>Save Press<span className="hidden sm:inline"> &amp; reviews</span></span>}
  </button>;
  const statusLabel = unavailable ? "Review-only editor" : pending ? "Saving Press & reviews…" : dirty ? "Press has unsaved changes" : "All Press changes saved";

  return <form data-unsaved-guard-bypass="true" onSubmit={event => {
    event.preventDefault();
    if (!canSave || savingRef.current) return;
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }}>
    <input name="section" type="hidden" value="press" readOnly />
    <input name="payload" type="hidden" value={JSON.stringify(draft)} readOnly />
    <input name="versions" type="hidden" value={JSON.stringify(versions)} readOnly />
    <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
    {migrationRequired ? <p className="mb-4 rounded-2xl border border-amber-300/20 bg-amber-300/5 p-4 text-sm text-amber-100/80">Apply migration 0055 and its prerequisites, then reload to edit and publish Press.</p> : null}
    {loadError || mediaLoadError ? <p role="alert" className="mb-4 rounded-2xl bg-red-400/5 p-4 text-sm text-red-200">{loadError || mediaLoadError}</p> : null}
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs leading-5 text-white/45">{draft.items.filter(item => item.visible).length} visible · {draft.items.length} total items · unsaved changes appear in the preview</p>
      <Link className={buttonClass} href="/press" target="_blank" rel="noopener noreferrer">View Press page <FaExternalLinkAlt /></Link>
    </div>
    <div className={`grid items-start gap-4 ${inspectorOpen ? "xl:grid-cols-[minmax(0,1fr)_420px]" : ""}`}>
      <section className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-white/40">Page preview · readers and links open on the published page</p>
          <div className="flex gap-2">
            <button type="button" className={buttonClass} aria-label="Desktop preview" aria-pressed={device === "desktop"} onClick={() => setDevice("desktop")}><FaDesktop /></button>
            <button type="button" className={buttonClass} aria-label="Mobile preview" aria-pressed={device === "mobile"} onClick={() => setDevice("mobile")}><FaMobileAlt /></button>
            <button type="button" className={buttonClass} ref={inspectorTriggerRef} aria-label="Open Press inspector" onClick={openInspector}><FaSlidersH /> Editor</button>
          </div>
        </div>
        <PressPreviewFrame device={device} draft={draft} isLive={!unavailable} />
      </section>
      {inspectorOpen ? <aside className={`${panelClass} sticky top-5 hidden min-w-0 overflow-hidden xl:block`} aria-label="Press page inspector">
        <div className="flex items-center justify-between border-b border-white/8 p-4"><h2 className="heading-ui font-semibold text-white">Press &amp; reviews</h2><button type="button" className={buttonClass} aria-label="Hide Press inspector" onClick={() => { setInspectorOpen(false); requestAnimationFrame(() => inspectorTriggerRef.current?.focus()); }}><FaTimes /></button></div>
        <div className="max-h-[72vh] overflow-y-auto p-4">{inspector("desktop")}</div>
      </aside> : null}
    </div>
    {visibleResponse ? <div role={saveState.status === "saved" ? "status" : "alert"} className={`mt-4 rounded-2xl border p-4 text-sm ${saveState.status === "saved" ? "border-emerald-300/15 text-emerald-100/80" : "border-red-300/20 text-red-100/80"}`}>
      {saveState.message}
      {needsEditorReload(saveState) ? <button type="button" className={`${buttonClass} ml-3`} onClick={() => confirmDiscard(() => window.location.reload())}>Reload saved Press</button> : null}
    </div> : null}
    <footer className={`${panelClass} sticky bottom-3 z-20 mt-4 flex flex-wrap items-center justify-between gap-4 p-4 shadow-xl`}>
      <div><p className="text-sm font-semibold text-white/85">{statusLabel}</p><p className="mt-1 hidden text-xs leading-5 text-white/45 sm:block">The heading, introduction, and whole Press collection are saved together.</p>
        {!validation.success ? <p className="mt-1 text-xs text-amber-100/70">{Object.values(validation.fieldErrors).flat()[0]}</p> : null}</div>
      <div className="flex flex-wrap gap-2"><button type="button" aria-label="Discard Press changes" className={buttonClass} disabled={locked || !dirty} onClick={discard}>Discard<span className="hidden sm:inline"> Press changes</span></button>{saveButton}</div>
    </footer>
    <dialog ref={dialogRef} className="fixed inset-x-0 bottom-0 top-auto m-0 max-h-[92dvh] w-full max-w-none overflow-auto rounded-t-3xl border border-white/15 bg-[#101012] p-0 text-white backdrop:bg-black/75"
      aria-labelledby="press-mobile-inspector-title" onCancel={event => { event.preventDefault(); closeMobile(); }} onClose={() => setMobileOpen(false)}>
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-[#101012] p-4"><h2 id="press-mobile-inspector-title">Press &amp; reviews</h2><button type="button" className={buttonClass} aria-label="Close Press inspector" onClick={closeMobile}><FaTimes /></button></div>
      <div className="p-4">{mobileOpen ? inspector("mobile") : null}</div>
      <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 bg-[#101012] p-4"><button type="button" className={buttonClass} onClick={closeMobile}>Back to preview</button>{saveButton}</div>
    </dialog>
  </form>;
}
