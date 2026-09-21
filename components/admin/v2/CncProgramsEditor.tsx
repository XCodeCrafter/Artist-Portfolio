"use client";

import { useActionState, useDeferredValue, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { FaArrowDown, FaArrowUp, FaCheck, FaPlus, FaTrash } from "react-icons/fa";
import { CncPreviewCode } from "@/components/CncCodeView";
import CncProgramDialog from "@/components/CncProgramDialog";
import useUnsavedChangesGuard from "@/components/admin/useUnsavedChangesGuard";
import { saveCncProgramsV2 } from "@/app/admin/v2/pages/home/programs/actions";
import { buildCncPreviewRows, CNC_DIALECTS, parseCncProgram } from "@/lib/cnc-code";
import { CNC_PROGRAM_LIMIT, CNC_PROGRAM_MAX_SOURCE_CHARS, getCncSourceLineCount, getCncSourceByteLength } from "@/lib/cnc-program-input";
import {
  INITIAL_CNC_PROGRAMS_SAVE_STATE, parseCncProgramsSubmission,
  type CncProgramDraft, type CncProgramsSaveState, type CncProgramsSnapshot,
} from "@/lib/admin/cnc-program-editor";

const panelClass = "min-w-0 rounded-[24px] border border-white/10 bg-[#101012] p-4 sm:p-5";
const buttonClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/12 px-4 text-xs font-semibold text-white/70 outline-none transition hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/65 disabled:cursor-not-allowed disabled:opacity-35";
const inputClass = "mt-2 min-h-11 w-full rounded-xl border border-white/12 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-white/55 disabled:opacity-40";
const DIALECT_LABELS = { siemens: "Siemens / Sinumerik", iso: "ISO G-code", heidenhain: "Heidenhain" };

function ProgramPreview({ program, selected, onSelect }: { program: CncProgramDraft; selected: boolean; onSelect: () => void }) {
  const rows = useMemo(() => buildCncPreviewRows(parseCncProgram({
    ...program, source: program.source.slice(0, CNC_PROGRAM_MAX_SOURCE_CHARS),
  })), [program]);
  return <button type="button" aria-pressed={selected} onClick={onSelect}
    aria-label={"Edit program " + (program.title || program.fileName)}
    className={"cnc-editor block w-full overflow-hidden text-left outline-none focus-visible:ring-2 focus-visible:ring-white " + (selected ? "!border-[#ff684f]/70" : "")}>
    <span className="cnc-editor-header flex flex-wrap gap-3">
      <span className="cnc-file-tab is-active"><span className="cnc-file-icon" aria-hidden="true">NC</span>{program.fileName || "Untitled file"}</span>
      <span className={"ml-auto pr-3 text-[10px] uppercase tracking-wider " + (program.isPublished ? "text-emerald-200" : "text-amber-200")}>{program.isPublished ? "Visible" : "Hidden draft"}</span>
    </span>
    <span className="cnc-code-preview !max-h-60 overflow-hidden">
      <CncPreviewCode idPrefix={"admin-cnc-preview-" + program.id} rows={rows} />
    </span>
    <span className="cnc-editor-toggle">
      <span className="cnc-editor-toggle-copy"><span className="cnc-toggle-kicker">Click to edit</span><span className="cnc-toggle-title">{program.title || "Untitled program"}</span></span>
      {selected ? <FaCheck className="text-[#ff806c]" aria-hidden="true" /> : null}
    </span>
  </button>;
}

export default function CncProgramsEditor({ snapshot, disabled, loadError, copy, homeSectionHidden }: {
  snapshot: CncProgramsSnapshot; disabled: boolean; loadError?: string;
  copy: { eyebrow: string; title: string; body: string }; homeSectionHidden: boolean;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState(snapshot);
  const [programs, setPrograms] = useState(snapshot.programs);
  const [selectedId, setSelectedId] = useState(snapshot.programs[0]?.id || "");
  const [removeId, setRemoveId] = useState("");
  const [viewerId, setViewerId] = useState("");
  const inspectorRef = useRef<HTMLHeadingElement>(null);
  const { markDirty, clearDirty, confirmDiscard } = useUnsavedChangesGuard();
  const deferredPrograms = useDeferredValue(programs);
  const dirty = JSON.stringify(programs) !== JSON.stringify(saved.programs);
  const validation = useMemo(() => parseCncProgramsSubmission({
    programs: deferredPrograms, expectedVersions: saved.expectedVersions,
  }), [deferredPrograms, saved.expectedVersions]);
  const [state, action, pending] = useActionState(async (previous: CncProgramsSaveState, form: FormData) => {
    let result: CncProgramsSaveState;
    try {
      result = await saveCncProgramsV2(previous, form);
    } catch {
      // A lost response does not prove that the server did not commit. Keep
      // local text intact and require an explicit read before another write.
      return {
        status: "error" as const, eventId: crypto.randomUUID(), requiresReload: true,
        message: "The save response was lost. Your draft is kept; reload the saved programs before trying again.",
      };
    }
    if (result.status === "saved" && result.snapshot) {
      setSaved(result.snapshot);
      setPrograms(result.snapshot.programs);
      clearDirty(() => router.refresh());
    }
    return result;
  }, INITIAL_CNC_PROGRAMS_SAVE_STATE);
  const blocked = disabled || pending || Boolean(state.requiresReload);
  const selectedIndex = programs.findIndex((program) => program.id === selectedId);
  const selected = programs[selectedIndex];
  const viewerIndex = deferredPrograms.findIndex((program) => program.id === viewerId);
  const errors = validation.success ? {} : validation.fieldErrors;
  // Client and server share one schema; current errors replace stale failures
  // from the previous submitted draft as the user corrects each field.
  const fieldErrors = errors;
  const errorFor = (key: string) => fieldErrors["programs." + selectedIndex + "." + key]?.join(" ");

  function change(next: CncProgramDraft[]) {
    setPrograms(next);
    setRemoveId("");
    if (JSON.stringify(next) === JSON.stringify(saved.programs)) clearDirty(); else markDirty();
  }
  function patch(patchValue: Partial<CncProgramDraft>) {
    change(programs.map((program) => program.id === selectedId ? { ...program, ...patchValue } : program));
  }
  function select(id: string) {
    setSelectedId(id);
    setRemoveId("");
    inspectorRef.current?.focus({ preventScroll: true });
  }
  function add() {
    if (blocked || programs.length >= CNC_PROGRAM_LIMIT) return;
    const program: CncProgramDraft = {
      id: "cnc-" + crypto.randomUUID(), fileName: "PROGRAM_" + (programs.length + 1) + ".NC",
      title: "", description: "", dialect: "siemens", source: "", previewLineCount: 6, isPublished: false,
    };
    change([...programs, program]);
    select(program.id);
  }
  function move(direction: -1 | 1) {
    const target = selectedIndex + direction;
    if (blocked || selectedIndex < 0 || target < 0 || target >= programs.length) return;
    const next = [...programs];
    [next[selectedIndex], next[target]] = [next[target], next[selectedIndex]];
    change(next);
  }
  function remove() {
    const next = programs.filter((program) => program.id !== removeId);
    change(next);
    setSelectedId(next[Math.min(selectedIndex, next.length - 1)]?.id || "");
    setViewerId("");
  }
  function textField(key: "title" | "fileName" | "description", label: string, maxLength: number, multiline = false) {
    if (!selected) return null;
    const error = errorFor(key);
    const id = "cnc-program-" + key;
    const props = { id, className: inputClass, value: selected[key], maxLength,
      "aria-invalid": error ? true as const : undefined, "aria-describedby": error ? id + "-error" : undefined,
      onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => patch({ [key]: event.target.value }) };
    return <label className="block text-xs font-semibold text-white/65" htmlFor={id}>{label}
      {multiline ? <textarea {...props} rows={3} /> : <input {...props} />}
      {error ? <span className="mt-1 block text-xs text-red-200" id={id + "-error"}>{error}</span> : null}
    </label>;
  }

  return <div className="min-w-0">
    {loadError ? <p role="alert" className="mb-4 rounded-2xl border border-amber-300/20 p-4 text-sm text-amber-100">{loadError}</p> : null}
    {homeSectionHidden ? <p className="mb-4 rounded-2xl border border-amber-300/15 bg-amber-300/5 p-4 text-xs leading-5 text-amber-100/80">Code in motion is hidden in Home → Page sections. You can prepare programs here; enable that section when you want visitors to see them.</p> : null}
    <form action={action} onReset={(event) => event.preventDefault()} data-unsaved-guard-bypass="true">
      <input type="hidden" name="payload" value={JSON.stringify({ programs, expectedVersions: saved.expectedVersions })} />
      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(340px,0.95fr)]">
        <section className={panelClass} aria-label="Live program preview">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><p className="text-[10px] uppercase tracking-widest text-[#ff806c]">Select a program to edit</p><p className="mt-2 text-xs text-white/40">Real public code rendering · hidden drafts stay visible here</p></div>
            <button type="button" className={buttonClass} onClick={add} disabled={blocked || programs.length >= CNC_PROGRAM_LIMIT}><FaPlus /> Add program</button>
          </div>
          <div className="mb-6 rounded-2xl bg-black/25 p-5">
            <p className="text-[10px] uppercase tracking-widest text-[#ff806c]">{copy.eyebrow}</p>
            <h2 className="mt-3 whitespace-pre-line text-3xl font-semibold text-white">{copy.title}</h2>
            <p className="mt-3 text-sm leading-6 text-white/50">{copy.body}</p>
          </div>
          <div className="grid gap-4">{deferredPrograms.map((program) => <ProgramPreview key={program.id} program={program} selected={selectedId === program.id} onSelect={() => select(program.id)} />)}</div>
          {!programs.length ? <div className="rounded-2xl border border-dashed border-white/15 p-8 text-center"><p className="text-sm text-white/65">No code programs</p><p className="mt-2 text-xs leading-5 text-white/40">Add a program to start. Saving an empty collection removes the existing programs and hides the public showcase.</p></div> : null}
          <p className="mt-4 text-xs text-white/40">{programs.length} / {CNC_PROGRAM_LIMIT} programs · order matches Home</p>
        </section>
        <section className={panelClass} aria-labelledby="cnc-inspector-title">
          <h2 id="cnc-inspector-title" ref={inspectorRef} tabIndex={-1} className="heading-ui text-xl font-semibold outline-none">{selected ? selected.title || "New program" : "Program editor"}</h2>
          {selected ? <fieldset disabled={blocked} className="mt-5 grid min-w-0 gap-5">
            <legend className="sr-only">Selected code program</legend>
            <label className="flex min-h-12 items-center gap-3 rounded-xl border border-white/10 px-3 text-sm text-white/75"><input type="checkbox" className="accent-[#ff674f]" checked={selected.isPublished} onChange={(event) => patch({ isPublished: event.target.checked })} />Visible on Home after saving</label>
            {textField("title", "Program title", 220)}
            {textField("fileName", "File name", 100)}
            {textField("description", "Description", 1000, true)}
            <label className="text-xs font-semibold text-white/65" htmlFor="cnc-dialect">Controller / dialect<select id="cnc-dialect" className={inputClass} value={selected.dialect} onChange={(event) => patch({ dialect: event.target.value as CncProgramDraft["dialect"] })}>{CNC_DIALECTS.map((dialect) => <option key={dialect} value={dialect}>{DIALECT_LABELS[dialect]}</option>)}</select></label>
            <label className="text-xs font-semibold text-white/65" htmlFor="cnc-preview-lines">Opening preview lines<input id="cnc-preview-lines" className={inputClass} type="number" min={3} max={20} step={1} value={selected.previewLineCount} aria-invalid={Boolean(errorFor("previewLineCount"))} onChange={(event) => patch({ previewLineCount: Number(event.target.value) })} />{errorFor("previewLineCount") ? <span className="mt-1 block text-red-200">{errorFor("previewLineCount")}</span> : null}</label>
            <label className="text-xs font-semibold text-white/65" htmlFor="cnc-source">Complete program source<textarea id="cnc-source" spellCheck={false} autoCapitalize="off" autoCorrect="off" className={inputClass + " min-h-80 font-mono text-xs leading-5"} rows={16} maxLength={CNC_PROGRAM_MAX_SOURCE_CHARS} value={selected.source} aria-invalid={Boolean(errorFor("source"))} aria-describedby="cnc-source-help" onChange={(event) => patch({ source: event.target.value })} /><span id="cnc-source-help" className={"mt-2 block leading-5 " + (errorFor("source") ? "text-red-200" : "text-white/35")}>{errorFor("source") || (getCncSourceLineCount(selected.source) + " lines · " + Math.ceil(getCncSourceByteLength(selected.source) / 1024) + " KB. Source is displayed as text, never executed.")}</span></label>
            <div className="flex flex-wrap gap-2">
              <button className={buttonClass} type="button" onClick={() => move(-1)} disabled={blocked || selectedIndex === 0} aria-label="Move selected program up"><FaArrowUp /></button>
              <button className={buttonClass} type="button" onClick={() => move(1)} disabled={blocked || selectedIndex === programs.length - 1} aria-label="Move selected program down"><FaArrowDown /></button>
              <button className={buttonClass} type="button" onClick={() => setViewerId(selected.id)}>Open full viewer</button>
              <button className={buttonClass + " text-red-200"} type="button" onClick={() => setRemoveId(selected.id)}><FaTrash /> Remove</button>
            </div>
            {removeId === selected.id ? <div role="group" aria-label="Confirm program removal" className="rounded-2xl border border-red-300/25 bg-red-300/5 p-4 text-xs leading-5 text-red-100"><p>Remove this program from the draft? It is only deleted when you save all programs.</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" className={buttonClass} onClick={remove}>Remove from draft</button><button type="button" className={buttonClass} onClick={() => setRemoveId("")}>Keep program</button></div></div> : null}
          </fieldset> : <p className="mt-4 text-sm text-white/40">Choose a program in the preview or add a new one.</p>}
        </section>
      </div>
      <footer className={panelClass + " sticky bottom-3 z-20 mt-4 flex flex-wrap items-center justify-between gap-4 shadow-xl"}>
        <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{dirty ? "Programs have unsaved changes" : "Programs are up to date"}</p><p aria-live="polite" className={"mt-1 text-xs leading-5 " + (state.status === "saved" ? "text-emerald-200" : "text-white/55")}>{state.message || "Nothing changes for visitors until you save."}</p>{fieldErrors.programs ? <p role="alert" className="mt-1 text-xs text-red-200">{fieldErrors.programs.join(" ")}</p> : null}</div>
        {state.status === "conflict" || state.requiresReload || state.status === "error" ? <button className={buttonClass} type="button" disabled={pending} onClick={() => confirmDiscard(() => window.location.reload())}>Reload saved programs</button> : null}
        <button className={buttonClass} type="button" disabled={blocked || !dirty} onClick={() => confirmDiscard(() => { setPrograms(saved.programs); setSelectedId(saved.programs[0]?.id || ""); setRemoveId(""); setViewerId(""); })}>Discard changes</button>
        <button type="submit" className={buttonClass + " !bg-white !text-black"} disabled={blocked || !dirty || !validation.success || deferredPrograms !== programs}><FaCheck />{pending ? "Saving…" : "Save all programs"}</button>
      </footer>
    </form>
    {viewerIndex >= 0 ? <CncProgramDialog activeIndex={viewerIndex} programs={deferredPrograms} onClose={() => setViewerId("")} onSelectProgram={(index) => setViewerId(deferredPrograms[index].id)} /> : null}
  </div>;
}
