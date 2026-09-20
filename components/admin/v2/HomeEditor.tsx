"use client";

import Link from "next/link";
import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { FaArrowDown, FaArrowUp, FaCheck, FaDesktop, FaExternalLinkAlt, FaMobileAlt, FaSlidersH, FaSpinner, FaTimes } from "react-icons/fa";
import { saveHomeSectionV2 } from "@/app/admin/v2/pages/home/actions";
import MediaAssetPicker from "@/components/admin/MediaAssetPicker";
import useUnsavedChangesGuard from "@/components/admin/useUnsavedChangesGuard";
import HomePreviewFrame, { type HomePreviewDevice } from "@/components/admin/v2/HomePreviewFrame";
import {
  HOME_EDITOR_SECTIONS, HOME_SECTION_LABELS, INITIAL_HOME_SAVE_STATE,
  getDirtyHomeSections, parseHomeSectionSubmission,
  type HomeEditorDraft, type HomeEditorSection, type HomeEditorSnapshot,
  type HomeEditorVersions, type HomeSaveState,
} from "@/lib/admin/home-editor";
import type { MediaAsset } from "@/lib/admin/media";

const panelClass = "rounded-[24px] border border-white/10 bg-[#0f0f11]/95";
const inputClass = "mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-white outline-none focus:border-white/40 disabled:opacity-45";
const buttonClass = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/12 px-3 text-xs font-semibold text-white/70 transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-30";

type FieldErrors = Record<string, string[]>;
type Props = {
  assets: MediaAsset[];
  snapshot: HomeEditorSnapshot;
  disabled: boolean;
  migrationRequired: boolean;
  loadError?: string;
  mediaLoadError?: string;
};

function TextField({ id, label, value, onChange, multiline = false, errors, path, maxLength = 2000 }: {
  id: string; label: string; value: string; onChange: (value: string) => void;
  multiline?: boolean; errors: FieldErrors; path: string; maxLength?: number;
}) {
  const error = errors[path]?.join(" ");
  const props = { id, value, maxLength, className: inputClass, "aria-invalid": Boolean(error), "aria-describedby": error ? `${id}-error` : undefined };
  return <label className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-white/55" htmlFor={id}>
    {label}
    {multiline ? <textarea {...props} rows={4} onChange={(event) => onChange(event.target.value)} />
      : <input {...props} onChange={(event) => onChange(event.target.value)} />}
    {error ? <span id={`${id}-error`} className="mt-2 block text-xs normal-case tracking-normal text-red-200">{error}</span> : null}
  </label>;
}

function ContentInspector({ section, draft, assets, errors, instance, onChange }: {
  section: Exclude<HomeEditorSection, "layout">; draft: HomeEditorDraft; assets: MediaAsset[];
  errors: FieldErrors; instance: string; onChange: (next: HomeEditorDraft) => void;
}) {
  const value = draft[section];
  const patch = (fields: Record<string, unknown>) => onChange({ ...draft, [section]: { ...value, ...fields } });
  const field = (key: string, label: string, multiline = false, maxLength = 2000) => <TextField
    key={key} id={`${instance}-home-${section}-${key}`} path={key} errors={errors} label={label}
    value={String((value as unknown as Record<string, unknown>)[key] ?? "")} multiline={multiline} maxLength={maxLength}
    onChange={(next) => patch({ [key]: next })} />;
  const media = (key: string, label: string, kind: "image" | "video" | "media") => <MediaAssetPicker
    key={`${instance}-${section}-${key}`} name={`${instance}-home-${section}-${key}`} assets={assets} kind={kind}
    label={label} error={errors[key]?.join(" ")} value={String((value as unknown as Record<string, unknown>)[key] ?? "")}
    mediaTypeName={section === "hero" && key === "backgroundSrc" ? `${instance}-home-background-type` : undefined}
    mediaType={section === "hero" && key === "backgroundSrc" ? draft.hero.mediaType : undefined}
    onMediaTypeChange={section === "hero" && key === "backgroundSrc" ? (mediaType) => patch({ mediaType }) : undefined}
    onValueChange={(src, asset) => patch({ [key]: src, ...(section === "hero" && key === "backgroundSrc" && asset && (asset.mediaType === "image" || asset.mediaType === "video") ? { mediaType: asset.mediaType } : {}) })} />;
  const cta = <div className="grid gap-4 rounded-2xl border border-white/8 p-4">
    <p className="text-xs text-white/45">Section button — clear both fields to hide it.</p>
    {field("ctaLabel", "Button label", false, 220)}{field("ctaHref", "Button destination", false, 2048)}
  </div>;

  if (section === "hero") return <div className="grid gap-5">
    {field("title", "Main title", false, 220)}{field("subtitle", "Subtitle", true, 220)}
    {media("backgroundSrc", "Background image or video", "media")}
    {draft.hero.mediaType === "video" ? media("posterSrc", "Video poster", "image") : null}{cta}
  </div>;
  if (section === "about") return <div className="grid gap-5">
    {field("heading", "Heading", false, 220)}{field("body", "Introduction", true, 5000)}
    {media("imageSrc", "About image", "image")}{field("imageAlt", "Image description", false, 500)}{cta}
  </div>;
  if (section === "cnc") return <div className="grid gap-5">
    <p className="rounded-2xl bg-white/5 p-4 text-xs leading-5 text-white/55">This optional section shows your code programs. Turn it off in Page sections if it does not belong in this portfolio.</p>
    {field("eyebrow", "Small label", false, 220)}{field("title", "Heading", true, 220)}{field("body", "Description", true, 5000)}
    <Link className={buttonClass} href="/admin/content#home-cnc">Manage code programs <FaExternalLinkAlt /></Link>
  </div>;
  if (section === "feature") return <div className="grid gap-5">
    {field("title", "Heading", true, 220)}{field("body", "Description", true, 5000)}
    {media("videoSrc", "Feature video", "video")}{media("posterSrc", "Video poster", "image")}{cta}
    <details className="rounded-2xl border border-white/10 p-4"><summary className="cursor-pointer text-xs text-white/60">Small labels</summary>
      <div className="mt-4 grid gap-4">{field("label", "Section label", false, 220)}{field("eyebrow", "Eyebrow", false, 220)}{field("meta", "Video caption", false, 220)}</div>
    </details>
  </div>;
  return <div className="grid gap-5">
    {field("title", "Default story heading", false, 220)}{field("body", "Default story text", true, 5000)}{cta}
    {draft.stories.images.map((image, index) => {
      const changeImage = (fields: Partial<typeof image>) => patch({ images: draft.stories.images.map((item, position) => position === index ? { ...item, ...fields } : item) });
      return <section className="grid gap-4 rounded-2xl border border-white/10 bg-black/20 p-4" key={index}>
        <h3 className="text-xs font-semibold text-white/75">Story {index + 1}</h3>
        <MediaAssetPicker assets={assets} kind="image" label="Story image" name={`${instance}-home-story-${index}`} value={image.src}
          error={errors[`images.${index}.src`]?.join(" ")} onValueChange={(src, asset) => changeImage({ src, ...(asset?.alt ? { alt: asset.alt } : {}) })} />
        <p className="text-xs leading-5 text-white/40">Clear the image to leave this story out. Its text is kept.</p>
        {([['title', 'Story heading'], ['body', 'Story text'], ['alt', 'Image description']] as const).map(([key, label]) => <TextField
          key={key} id={`${instance}-home-story-${index}-${key}`} path={`images.${index}.${key}`} label={label}
          errors={errors} value={image[key]} multiline={key === "body"} maxLength={key === "body" ? 5000 : key === "alt" ? 500 : 220}
          onChange={(next) => changeImage({ [key]: next })} />)}
      </section>;
    })}
    <details className="rounded-2xl border border-white/10 p-4"><summary className="cursor-pointer text-xs text-white/60">Small labels</summary>
      <div className="mt-4 grid gap-4">{field("label", "Section label", false, 220)}{field("scrollLabel", "Scroll hint", false, 220)}</div>
    </details>
  </div>;
}

export default function HomeEditor({ assets, snapshot, disabled, migrationRequired, loadError, mediaLoadError }: Props) {
  const [draft, setDraft] = useState(snapshot.draft);
  const [baseline, setBaseline] = useState(snapshot.draft);
  const [versions, setVersions] = useState(snapshot.versions);
  const draftRef = useRef(draft);
  const baselineRef = useRef(baseline);
  const [activeSection, setActiveSection] = useState<HomeEditorSection>("layout");
  const [device, setDevice] = useState<HomePreviewDevice>("desktop");
  const [focusRequestId, setFocusRequestId] = useState(0);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inspectorTriggerRef = useRef<HTMLButtonElement>(null);
  const [announcement, setAnnouncement] = useState("");
  const [dismissedEvent, setDismissedEvent] = useState("");
  const { markDirty, clearDirty, confirmDiscard } = useUnsavedChangesGuard("You have unsaved Home changes. Leave and discard them?", true);

  const clientAction = useCallback(async (previous: HomeSaveState, formData: FormData) => {
    try {
      const result = await saveHomeSectionV2(previous, formData);
      if (result.status === "saved" && result.section && result.canonicalSection && result.versions) {
        const parsed = parseHomeSectionSubmission(result.section, result.canonicalSection, result.versions);
        if (parsed.success) {
          const next = { ...draftRef.current, [result.section]: parsed.data.payload } as HomeEditorDraft;
          const saved = { ...baselineRef.current, [result.section]: parsed.data.payload } as HomeEditorDraft;
          draftRef.current = next;
          baselineRef.current = saved;
          setDraft(next); setBaseline(saved); setVersions(parsed.data.versions as HomeEditorVersions);
          if (!getDirtyHomeSections(saved, next).length) clearDirty();
          setAnnouncement(`${HOME_SECTION_LABELS[result.section]} saved and published.`);
        }
      }
      return result;
    } catch {
      return { status: "error", message: "The save could not be confirmed. Your draft is kept. Reload before trying again.", eventId: crypto.randomUUID() } as HomeSaveState;
    }
  }, [clearDirty]);
  const [saveState, formAction, pending] = useActionState(clientAction, INITIAL_HOME_SAVE_STATE);
  const dirty = getDirtyHomeSections(baseline, draft);
  const validation = parseHomeSectionSubmission(activeSection, draft[activeSection], versions);
  const visibleResponse = Boolean(saveState.eventId && saveState.eventId !== dismissedEvent);
  const errors: FieldErrors = { ...(!validation.success ? validation.fieldErrors : {}), ...(visibleResponse && saveState.section === activeSection ? saveState.fieldErrors : {}) };
  const locked = disabled || pending;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (mobileOpen && dialog && !dialog.open) dialog.showModal();
    if (!mobileOpen && dialog?.open) dialog.close();
    if (!mobileOpen) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = overflow; };
  }, [mobileOpen]);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1280px)");
    const frame = requestAnimationFrame(() => { if (!desktop.matches) setDevice("mobile"); });
    const onChange = () => { if (desktop.matches) setMobileOpen(false); };
    desktop.addEventListener("change", onChange);
    return () => { cancelAnimationFrame(frame); desktop.removeEventListener("change", onChange); };
  }, []);

  function change(next: HomeEditorDraft) {
    if (locked) return;
    draftRef.current = next; setDraft(next); setDismissedEvent(saveState.eventId);
    if (getDirtyHomeSections(baselineRef.current, next).length) markDirty(); else clearDirty();
  }
  const select = useCallback((section: HomeEditorSection) => {
    if (pending) return;
    setActiveSection(section); setFocusRequestId((value) => value + 1);
    if (window.matchMedia("(min-width: 1280px)").matches) setInspectorOpen(true); else setMobileOpen(true);
  }, [pending]);
  function closeMobile() {
    setMobileOpen(false);
    requestAnimationFrame(() => inspectorTriggerRef.current?.focus());
  }
  function move(index: number, direction: -1 | 1) {
    const next = [...draft.layout];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    change({ ...draft, layout: next });
    setAnnouncement(`${HOME_SECTION_LABELS[next[target].id]} moved to position ${target + 1}. Save Page sections to publish.`);
  }

  const inspector = (instance: string) => <fieldset disabled={locked} className="min-w-0 space-y-5 disabled:opacity-60">
    {activeSection === "layout" ? <>
      <p className="text-sm leading-6 text-white/55">Choose what belongs on Home. Use the arrows to set the order. Hidden sections keep all their content.</p>
      <ol className="grid gap-3">{draft.layout.map((item, index) => <li key={item.id} className="rounded-2xl border border-white/10 bg-black/20 p-3">
        <div className="flex items-center gap-3">
          <span className="text-xs tabular-nums text-white/30">{String(index + 1).padStart(2, "0")}</span>
          <label className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-2 text-sm text-white/85">
            <input type="checkbox" className="size-4 accent-[#ff3b1f]" checked={item.enabled}
              disabled={item.enabled && draft.layout.filter((row) => row.enabled).length === 1}
              onChange={(event) => change({ ...draft, layout: draft.layout.map((row) => row.id === item.id ? { ...row, enabled: event.target.checked } : row) })} />
            {HOME_SECTION_LABELS[item.id]}
          </label>
          <button type="button" className={`${buttonClass} px-2.5`} disabled={index === 0} aria-label={`Move ${HOME_SECTION_LABELS[item.id]} up`} onClick={() => move(index, -1)}><FaArrowUp /></button>
          <button type="button" className={`${buttonClass} px-2.5`} disabled={index === draft.layout.length - 1} aria-label={`Move ${HOME_SECTION_LABELS[item.id]} down`} onClick={() => move(index, 1)}><FaArrowDown /></button>
        </div>
        <div className="mt-2 flex items-center justify-between pl-7 text-xs"><span className={item.enabled ? "text-emerald-200/60" : "text-white/35"}>{item.enabled ? "Visible on Home" : "Hidden · content kept"}</span><button type="button" className="min-h-9 px-2 text-white/65 underline underline-offset-4" onClick={() => select(item.id)}>Edit content</button></div>
      </li>)}</ol>
      <p className="text-xs leading-5 text-white/40">At least one section stays visible. The shared footer is managed in site settings.</p>
      <Link href="/admin/v2/settings" className={buttonClass}>Site settings <FaExternalLinkAlt /></Link>
    </> : <>
      {!draft.layout.find((row) => row.id === activeSection)?.enabled ? <p className="rounded-2xl bg-amber-300/5 p-3 text-xs leading-5 text-amber-100/70">This section is hidden. You can still edit its content. Enable it in Page sections when ready.</p> : null}
      <ContentInspector section={activeSection} draft={draft} assets={assets} errors={errors} instance={instance} onChange={change} />
    </>}
  </fieldset>;
  const saveButton = <button className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-white px-5 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-35"
    type="submit" disabled={locked || !dirty.includes(activeSection) || !validation.success}>
    {pending ? <FaSpinner className="animate-spin" /> : <FaCheck />} {pending ? "Saving…" : `Save ${HOME_SECTION_LABELS[activeSection]}`}
  </button>;

  return <form action={formAction} data-unsaved-guard-bypass="true">
    <input type="hidden" name="section" value={activeSection} readOnly />
    <input type="hidden" name="payload" value={JSON.stringify(draft[activeSection])} readOnly />
    <input type="hidden" name="versions" value={JSON.stringify(versions)} readOnly />
    <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
    {migrationRequired ? <p className="mb-4 rounded-2xl border border-amber-300/20 bg-amber-300/5 p-4 text-sm text-amber-100/80">Home V2 is ready for review. Apply migration 0037 to enable editing and publishing.</p> : null}
    {loadError || mediaLoadError ? <p role="alert" className="mb-4 rounded-2xl bg-red-400/5 p-4 text-sm text-red-200">{loadError || mediaLoadError}</p> : null}
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <div className="flex flex-1 flex-wrap gap-2" aria-label="Home editor sections">
        {HOME_EDITOR_SECTIONS.map((section) => <button type="button" key={section} disabled={pending} aria-pressed={section === activeSection}
          className={`${buttonClass} ${section === activeSection ? "border-[#ff3b1f]/60 bg-[#ff3b1f]/10 text-white" : ""}`}
          onClick={() => select(section)}>{HOME_SECTION_LABELS[section]}{dirty.includes(section) ? <span className="size-1.5 rounded-full bg-amber-300" aria-label="Unsaved changes" /> : null}</button>)}
      </div>
      <Link className={buttonClass} href="/" target="_blank" rel="noopener noreferrer">View website <FaExternalLinkAlt /></Link>
    </div>
    <div className={`grid items-start gap-4 ${inspectorOpen ? "xl:grid-cols-[minmax(0,1fr)_380px]" : ""}`}>
      <section className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-white/40">{draft.layout.filter((row) => row.enabled).length} of {draft.layout.length} sections visible · click to edit</p>
          <div className="flex gap-2">
            <button type="button" className={buttonClass} aria-label="Desktop preview" aria-pressed={device === "desktop"} onClick={() => setDevice("desktop")}><FaDesktop /></button>
            <button type="button" className={buttonClass} aria-label="Mobile preview" aria-pressed={device === "mobile"} onClick={() => setDevice("mobile")}><FaMobileAlt /></button>
            <button type="button" className={buttonClass} ref={inspectorTriggerRef} aria-label="Open Home inspector" onClick={() => select(activeSection)}><FaSlidersH /> Editor</button>
          </div>
        </div>
        <HomePreviewFrame device={device} draft={draft} focusRequestId={focusRequestId} selectedSection={activeSection} onSelectSection={select} isLive={!disabled} />
      </section>
      {inspectorOpen ? <aside className={`${panelClass} sticky top-5 hidden min-w-0 overflow-hidden xl:block`} aria-label="Home section inspector">
        <div className="flex items-center justify-between border-b border-white/8 p-4"><h2 className="heading-ui font-semibold text-white">{HOME_SECTION_LABELS[activeSection]}</h2><button type="button" className={buttonClass} aria-label="Hide Home inspector" onClick={() => { setInspectorOpen(false); requestAnimationFrame(() => inspectorTriggerRef.current?.focus()); }}><FaTimes /></button></div>
        <div className="max-h-[72vh] overflow-y-auto p-4">{inspector("desktop")}</div>
      </aside> : null}
    </div>
    {visibleResponse ? <div role="status" className={`mt-4 rounded-2xl border p-4 text-sm ${saveState.status === "saved" ? "border-emerald-300/15 text-emerald-100/80" : "border-red-300/20 text-red-100/80"}`}>
      {saveState.message}
      {saveState.status === "conflict" || saveState.status === "error" ? <button type="button" className={`${buttonClass} ml-3`} onClick={() => confirmDiscard(() => window.location.reload())}>Reload saved Home</button> : null}
    </div> : null}
    <footer className={`${panelClass} sticky bottom-3 z-20 mt-4 flex flex-wrap items-center justify-between gap-4 p-4 shadow-xl`}>
      <div><p className="text-sm font-semibold text-white/85">{disabled ? "Review-only editor" : dirty.length ? `${dirty.length} unsaved ${dirty.length === 1 ? "section" : "sections"}` : "All Home changes saved"}</p>
        <p className="mt-1 text-xs leading-5 text-white/45">Only {HOME_SECTION_LABELS[activeSection]} will be published.{activeSection !== "layout" && dirty.includes("layout") ? ` Visibility and order still need Save ${HOME_SECTION_LABELS.layout}.` : ""}</p>
        {!validation.success ? <p className="mt-1 text-xs text-amber-100/70">{Object.values(validation.fieldErrors).flat()[0]}</p> : null}
      </div>
      <div className="flex flex-wrap gap-2"><button type="button" className={buttonClass} disabled={locked || !dirty.includes(activeSection)} onClick={() => {
        change({ ...draftRef.current, [activeSection]: baselineRef.current[activeSection] } as HomeEditorDraft);
        setAnnouncement(`${HOME_SECTION_LABELS[activeSection]} restored to its last saved version.`);
      }}>Discard section changes</button>{saveButton}</div>
    </footer>
    <dialog ref={dialogRef} className="fixed inset-x-0 bottom-0 top-auto m-0 max-h-[92dvh] w-full max-w-none overflow-auto rounded-t-3xl border border-white/15 bg-[#101012] p-0 text-white backdrop:bg-black/75"
      aria-labelledby="home-mobile-inspector-title" onCancel={(event) => { event.preventDefault(); closeMobile(); }} onClose={() => setMobileOpen(false)}>
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-[#101012] p-4"><h2 id="home-mobile-inspector-title">{HOME_SECTION_LABELS[activeSection]}</h2><button type="button" className={buttonClass} aria-label="Close Home inspector" onClick={closeMobile}><FaTimes /></button></div>
      <div className="p-4">{mobileOpen ? inspector("mobile") : null}</div>
      <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-white/10 bg-[#101012] p-4"><button type="button" className={buttonClass} onClick={closeMobile}>Back to preview</button>{saveButton}</div>
    </dialog>
  </form>;
}
