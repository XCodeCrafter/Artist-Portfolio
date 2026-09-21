"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { FaImage, FaVideo, FaTrash, FaUndo, FaFile, FaSearch, FaCopy, FaArrowRight } from "react-icons/fa";
import type { MediaAsset } from "@/lib/admin/media";
import { filterMediaLibrary, formatMediaBytes, getMediaUsage, getMediaPlacementInfo, mediaReplacementOptions, type MediaFilter, type MediaUsage, type MediaLibraryBrowseOptions } from "@/lib/admin/media-library-editor";
import { saveMediaDetailsV2, mutateMediaAssetV2 } from "@/app/admin/v2/media/actions";
import useUnsavedChangesGuard from "@/components/admin/useUnsavedChangesGuard";
import MediaLibraryUpload from "./MediaLibraryUpload";
import MediaLibraryPreview from "./MediaLibraryPreview";

const field = "min-h-11 w-full rounded-xl border border-white/15 bg-[#09090b] px-3 text-sm text-white outline-none focus:border-white/60";
const button = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/15 px-4 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40";
const pageEditors = [
  ["Home", "home"], ["Bio", "bio"], ["Gallery", "gallery"],
  ["Showreel", "showreel"], ["Music", "music"], ["Contact", "contact"],
] as const;

type BrowseOptions = Required<Pick<MediaLibraryBrowseOptions, "attention" | "availability" | "sort">>;

export default function MediaLibraryEditor({ assets, usage, usageError, disabled, loadError, posters = {}, referenceTime }: {
  assets: MediaAsset[]; usage: MediaUsage; usageError?: string; disabled: boolean; loadError?: string; posters?: Record<string, string>; referenceTime?: number;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<MediaFilter>("all");
  const [browse, setBrowse] = useState<BrowseOptions>({ attention: "all", availability: "all", sort: "newest" });
  const [mountedAt] = useState(() => Date.now());
  const [copyFeedback, setCopyFeedback] = useState({ assetId: "", text: "" });
  // Freeze values AND timestamp together; an RSC refresh must never upgrade a stale draft's CAS token.
  const [selected, setSelected] = useState<MediaAsset | null>(null);
  const [label, setLabel] = useState("");
  const [alt, setAlt] = useState("");
  const [note, setNote] = useState("");
  const [available, setAvailable] = useState(true);
  const [confirmRemoval, setConfirmRemoval] = useState(false);
  const [replacementId, setReplacementId] = useState("");
  const [pending, setPending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [conflict, setConflict] = useState(false);
  const inspector = useRef<HTMLElement>(null);
  const { markDirty, clearDirty, confirmDiscard, hasUnsavedChanges } = useUnsavedChangesGuard(undefined, true);
  const rows = filterMediaLibrary(assets, usage, filter, query, { ...browse, now: referenceTime ?? mountedAt, usageVerified: !usageError });
  const busy = pending || uploading;
  const active = assets.filter((item) => !item.deletedAt);
  const totalBytes = assets.reduce((sum, item) => sum + item.fileSize, 0);
  const selectedUsage = selected ? getMediaUsage(usage, selected.id) : [];
  const replacements = selected ? mediaReplacementOptions(selected, assets) : [];
  const latest = selected ? assets.find((item) => item.id === selected.id) : undefined;
  const changedElsewhere = selected && (!latest || latest.updatedAt !== selected.updatedAt);
  const selectedOutsideResults = selected && !rows.some((item) => item.id === selected.id);
  const filtersActive = Boolean(query) || filter !== "all" || browse.attention !== "all" || browse.availability !== "all";

  async function copyUrl() {
    if (!selected) return;
    const assetId = selected.id;
    try {
      await navigator.clipboard.writeText(selected.src);
      setCopyFeedback({ assetId, text: "URL copied." });
    } catch {
      setCopyFeedback({ assetId, text: "Clipboard unavailable. Select and copy the URL field below." });
    }
  }

  function choose(asset: MediaAsset) {
    if (busy) return;
    confirmDiscard(() => {
      setSelected(asset); setLabel(asset.label); setAlt(asset.alt); setNote(asset.usageKey); setAvailable(asset.isPublished);
      setConfirmRemoval(false); setReplacementId(""); setConflict(false); setMessage(""); setCopyFeedback({ assetId: "", text: "" });
      if (inspector.current) {
        inspector.current.scrollTop = 0;
        // On stacked/mobile layouts, focusing also brings the inspector into
        // view instead of leaving it below a long grid of thumbnails.
        inspector.current.focus();
      }
    });
  }
  function edit(patch: Partial<{ label: string; alt: string; note: string; available: boolean }>) {
    const next = { label, alt, note, available, ...patch };
    setLabel(next.label); setAlt(next.alt); setNote(next.note); setAvailable(next.available);
    setConfirmRemoval(false);
    const matchesSaved = selected && next.label === selected.label && next.alt === selected.alt
      && next.note === selected.usageKey && next.available === selected.isPublished;
    if (matchesSaved) clearDirty(); else markDirty();
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!selected || disabled || busy || conflict || changedElsewhere) return;
    setPending(true); setMessage("");
    try {
      const result = await saveMediaDetailsV2({ id: selected.id, expectedUpdatedAt: selected.updatedAt, label, alt, usageKey: note, isPublished: available });
      setMessage(result.message); setConflict(Boolean(result.conflict));
      if (result.ok) { setSelected(null); clearDirty(() => router.refresh()); }
    } catch { setMessage("The save response was interrupted. Your draft is kept; reload to check whether it was saved."); setConflict(true); }
    finally { setPending(false); }
  }
  async function mutate(operation: "trash" | "replace_and_trash" | "restore") {
    if (!selected || disabled || usageError || busy || hasUnsavedChanges || conflict || changedElsewhere) return;
    setPending(true); setMessage("");
    try {
      const result = await mutateMediaAssetV2({ id: selected.id, expectedUpdatedAt: selected.updatedAt, operation,
        ...(operation === "replace_and_trash" ? { replacementId } : {}) });
      setMessage(result.message); setConflict(Boolean(result.conflict));
      if (result.ok) { setSelected(null); setConfirmRemoval(false); router.refresh(); }
    } catch { setMessage("The response was interrupted. Reload and check the file before repeating the action."); setConflict(true); }
    finally { setPending(false); }
  }

  return <div className="grid min-w-0 gap-5">
    {(loadError || disabled) && <p role="alert" className="rounded-2xl border border-amber-200/20 p-4 text-sm text-amber-200">{loadError || "Admin media access is unavailable. This workspace is read-only."}</p>}
    <div className="grid gap-3 sm:grid-cols-3">
      {[{ label: "Files in library", value: active.length }, { label: "Recorded file sizes (including Trash)", value: formatMediaBytes(totalBytes) }, { label: "Recoverable Trash", value: assets.length - active.length }].map((item) => <div key={item.label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><p className="text-xs text-white/45">{item.label}</p><p className="mt-2 text-2xl font-semibold">{item.value}</p></div>)}
    </div>
    <MediaLibraryUpload disabled={disabled || pending || hasUnsavedChanges} onBusyChange={setUploading} />
    {usageError && <p role="alert" className="rounded-2xl border border-amber-200/20 p-4 text-sm text-amber-200">{usageError}</p>}
    <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.8fr)]">
      <section className="min-w-0 rounded-[24px] border border-white/10 bg-[#0d0d0f] p-4 sm:p-5" aria-label="Media files">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <label className="relative"><span className="sr-only">Search media</span><FaSearch aria-hidden className="absolute left-3 top-4 text-xs text-white/35" /><input className={`${field} pl-9`} placeholder="Search files, descriptions, notes…" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
          <button type="button" className={button} disabled={busy} onClick={() => confirmDiscard(() => { setSelected(null); router.refresh(); })}>Refresh library</button>
        </div>
        <div className="my-4 flex flex-wrap gap-2" aria-label="Filter media">
          {([['all', 'All files'], ['image', 'Photos'], ['video', 'Videos'], ['unused', 'Unused'], ['trash', 'Trash']] as const).map(([key, title]) => <button key={key} type="button" disabled={key === "unused" && Boolean(usageError)} aria-pressed={filter === key} onClick={() => setFilter(key)} className={`${button} ${filter === key ? "border-[#ff6049]/60 bg-[#ff3b1f]/10 text-white" : "text-white/50"}`}>{title}</button>)}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
          <label className="grid gap-2 text-xs text-white/55">Quick filter<select className={field} value={browse.attention} onChange={(event) => setBrowse({ ...browse, attention: event.target.value as BrowseOptions["attention"] })}>
            <option value="all">Any file condition</option><option value="missing-alt">Photos missing alt text</option><option value="oversized">Larger files</option><option value="recent">Added in last 7 days</option>
          </select></label>
          <label className="grid gap-2 text-xs text-white/55">New placements<select className={field} value={browse.availability} onChange={(event) => setBrowse({ ...browse, availability: event.target.value as BrowseOptions["availability"] })}>
            <option value="all">Any availability</option><option value="available">Available</option><option value="unavailable">Unavailable</option>
          </select></label>
          <label className="grid gap-2 text-xs text-white/55">Sort files<select className={field} value={browse.sort} onChange={(event) => setBrowse({ ...browse, sort: event.target.value as BrowseOptions["sort"] })}>
            <option value="newest">Newest first</option><option value="largest">Largest first</option><option value="name">Name A–Z</option>
          </select></label>
        </div>
        <p className="mt-3 text-xs leading-5 text-white/40">Availability controls new placements, not visibility on the public site.</p>
        {browse.attention === "missing-alt" && <p className="mt-2 text-xs leading-5 text-amber-100/70">Checks library descriptions only. Existing page alt text is edited on that page.</p>}
        {browse.attention === "oversized" && <p className="mt-2 text-xs leading-5 text-amber-100/70">Photos over 2 MB or videos over 20 MB, based on recorded size. A review suggestion, not an upload limit; no files are resized here.</p>}
        <div className="my-4 flex flex-wrap items-center justify-between gap-2"><p role="status" className="text-xs text-white/40">{rows.length} files · click a thumbnail to edit</p>{filtersActive && <button type="button" className={button} onClick={() => { setQuery(""); setFilter("all"); setBrowse({ ...browse, attention: "all", availability: "all" }); }}>Clear filters</button>}</div>
        {selectedOutsideResults && <p className="mb-4 rounded-xl border border-white/10 p-3 text-xs leading-5 text-white/60">The selected file is outside these results. Its inspector and any unsaved changes are kept.</p>}
        <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
          {rows.map((asset) => <button key={asset.id} type="button" disabled={busy} aria-pressed={selected?.id === asset.id} aria-label={`Edit ${asset.label}`} onClick={() => choose(asset)} className={`min-w-0 overflow-hidden rounded-2xl border text-left transition focus-visible:outline-2 focus-visible:outline-[#ff6049] ${selected?.id === asset.id ? "border-[#ff6049] bg-white/5" : "border-white/10 hover:border-white/35"}`}>
            <span className="relative block aspect-[4/3] bg-black/30"><MediaLibraryPreview asset={asset} poster={Object.hasOwn(posters, asset.id) ? posters[asset.id] : ""} /></span>
            <span className="block p-3"><span className="block truncate text-sm font-semibold">{asset.label}</span><span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-white/40">{asset.mediaType === "image" ? <FaImage /> : asset.mediaType === "video" ? <FaVideo /> : <FaFile />}{formatMediaBytes(asset.fileSize)} · {asset.deletedAt ? "Trash" : usageError ? "Usage unknown" : getMediaUsage(usage, asset.id).length ? "Saved placements" : "Unused"}</span>{!asset.deletedAt && !asset.isPublished && <span className="mt-2 block text-[10px] text-amber-100/70">Unavailable for new placements</span>}</span>
          </button>)}
        </div>
        {!rows.length && <div className="rounded-2xl border border-dashed border-white/15 p-10 text-center"><FaImage className="mx-auto mb-4 text-3xl text-white/25" /><p className="text-sm text-white/60">{filter === "trash" && !assets.some((asset) => asset.deletedAt) ? "Trash is empty." : "No matching files. Upload a file above or change the filter."}</p></div>}
      </section>

      <aside ref={inspector} tabIndex={0} className="min-w-0 self-start rounded-[24px] border border-white/10 bg-[#111113] p-5 outline-none focus-visible:ring-2 focus-visible:ring-white/60 xl:sticky xl:top-5 xl:max-h-[calc(100dvh-2.5rem)] xl:overflow-y-auto xl:overscroll-contain xl:[scrollbar-gutter:stable]" aria-label="File inspector" aria-describedby="media-inspector-help">
        <p id="media-inspector-help" className="sr-only">On wide screens, scroll inside this panel to reach all file controls. You can also focus it and use the arrow keys.</p>
        {!selected ? <div className="py-8"><p className="text-xs uppercase tracking-[0.2em] text-[#ff806c]">File inspector</p><h2 className="mt-3 text-xl font-semibold">Choose a file</h2><p className="mt-3 text-sm leading-7 text-white/50">Its preview and controls will appear here. Page layouts and captions are edited on the page itself.</p><div className="mt-6 flex flex-wrap gap-2"><Link href="/admin/v2/pages/gallery" className={button}>Edit Gallery</Link><Link href="/admin/v2/pages/showreel" className={button}>Edit Showreel</Link></div></div> : <div className="grid min-w-0 gap-5">
          <div><p className="text-xs uppercase tracking-[0.2em] text-[#ff806c]">{selected.deletedAt ? "Recoverable Trash" : "Selected file"}</p><h2 className="mt-2 break-words text-xl font-semibold">{selected.label}</h2></div>
          <div className="relative aspect-video overflow-hidden rounded-2xl bg-black/30"><MediaLibraryPreview key={selected.id} asset={selected} poster={Object.hasOwn(posters, selected.id) ? posters[selected.id] : ""} large /></div>
          {(changedElsewhere || conflict) && <div role="alert" className="rounded-xl border border-amber-200/25 p-3 text-xs leading-6 text-amber-200">The saved file changed or needs verification. Your local draft has been kept.<button className={`${button} mt-2 w-full`} disabled={busy} type="button" onClick={() => confirmDiscard(() => { setSelected(null); router.refresh(); })}>Discard draft & reload</button></div>}
          <div><h3 className="text-sm font-semibold">Where this file is used</h3><p className="mt-1 text-xs leading-6 text-white/45">Includes hidden items and preserved Classic content. Counts are saved records, not visitor views. Editor links open a new tab, keeping this draft here.</p>{usageError ? <p className="mt-2 text-xs text-amber-200">Usage is not verified. Removal is disabled.</p> : selectedUsage.length ? <ul className="mt-3 grid gap-3 text-sm text-white/65">{selectedUsage.map((item) => { const placement = getMediaPlacementInfo(item.label); return <li key={item.label} className="rounded-xl border border-white/10 p-3"><p className="font-semibold text-white/80">{placement.title} · {item.count} {item.count === 1 ? "record" : "records"}</p><p className="mt-1 text-xs leading-5 text-white/45">{placement.description}</p><div className="mt-2 flex flex-wrap gap-2">{placement.links.map((link) => <Link key={link.href} href={link.href} target="_blank" rel="noopener noreferrer" className={`${button} text-white/75`}>{link.label}<FaArrowRight aria-hidden /></Link>)}</div></li>; })}</ul> : <p className="mt-2 text-xs text-white/50">No saved portfolio references.</p>}</div>
          {!selected.deletedAt && selected.isPublished && !disabled && !changedElsewhere && !conflict && (selected.mediaType === "image" || selected.mediaType === "video") && <details className="rounded-xl border border-white/10 p-3"><summary className="cursor-pointer text-sm text-white/75">Place this file on a page</summary><p className="mt-3 text-xs leading-6 text-white/50">Open an editor, select the section, then choose this file in its media picker. These links open a new tab; nothing is placed or published until you save in that editor.</p><div className="mt-3 grid grid-cols-2 gap-2">{pageEditors.map(([name, slug]) => <Link key={slug} href={`/admin/v2/pages/${slug}`} target="_blank" rel="noopener noreferrer" className={button}>Open {name} editor<FaArrowRight aria-hidden /></Link>)}</div></details>}
          <details className="rounded-xl border border-white/10 p-3"><summary className="cursor-pointer text-xs text-white/55">File information & URL</summary><p className="mt-3 text-xs text-white/45">{selected.mediaType} · {selected.mimeType || "Unknown type"} · {formatMediaBytes(selected.fileSize)}</p><label className="mt-3 grid gap-2 text-xs text-white/45">Public file URL<input readOnly value={selected.src} className={field} onFocus={(event) => event.target.select()} /></label><button type="button" className={`${button} mt-3`} onClick={copyUrl}><FaCopy aria-hidden /> Copy URL</button>{copyFeedback.assetId === selected.id && <p role="status" className="mt-2 text-xs text-white/65">{copyFeedback.text}</p>}</details>
          {!selected.deletedAt ? <form onSubmit={save} data-unsaved-guard-bypass="true" className="grid gap-4">
            <fieldset disabled={disabled || busy || conflict || Boolean(changedElsewhere)} className="grid gap-4 disabled:opacity-50">
              <label className="grid gap-2 text-sm">File name<input className={field} required maxLength={220} value={label} onChange={(event) => edit({ label: event.target.value })} /></label>
              <label className="grid gap-2 text-sm">Image description / alt text<textarea className={`${field} py-3`} maxLength={220} rows={3} value={alt} onChange={(event) => edit({ alt: event.target.value })} /><span className="text-xs leading-5 text-white/45">Library description. Existing page captions and alt text are edited in that page’s inspector.</span></label>
              <label className="grid gap-2 text-sm">Library note<input className={field} maxLength={120} value={note} onChange={(event) => edit({ note: event.target.value })} /><span className="text-xs leading-5 text-white/45">File metadata can be publicly readable. Do not put private information here.</span></label>
              <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={available} onChange={(event) => edit({ available: event.target.checked })} />Available for new page placements</label>
              <p className="text-xs leading-5 text-white/45">Turning availability off does not remove existing page placements or make the file URL private. Use a page editor or the removal controls below.</p>
              <div className="flex flex-wrap gap-2"><button type="submit" disabled={!hasUnsavedChanges} className={`${button} bg-white text-black`}>{pending ? "Saving…" : "Save details"}</button>{hasUnsavedChanges && <button type="button" className={button} onClick={() => confirmDiscard(() => { setLabel(selected.label); setAlt(selected.alt); setNote(selected.usageKey); setAvailable(selected.isPublished); setConfirmRemoval(false); })}>Discard changes</button>}</div>
            </fieldset>
          </form> : null}
          <div className="border-t border-white/10 pt-5">
            <p className="mb-4 text-xs leading-6 text-white/45">Trash keeps the original file so it can be restored. It does not free storage space. Restoring a file does not undo replacements on the portfolio.</p>
            {selected.deletedAt ? <button className={button} disabled={disabled || busy || Boolean(usageError) || conflict || Boolean(changedElsewhere)} type="button" onClick={() => mutate("restore")}><FaUndo /> Restore to library</button>
              : !confirmRemoval ? <button className={`${button} border-red-300/25 text-red-200`} disabled={disabled || busy || Boolean(usageError) || hasUnsavedChanges || conflict || Boolean(changedElsewhere)} type="button" onClick={() => setConfirmRemoval(true)}><FaTrash /> {selectedUsage.length ? "Replace & remove file" : "Move to Trash"}</button>
                : <div className="grid gap-3 rounded-2xl border border-red-300/20 bg-red-400/5 p-4" role="group" aria-label="Confirm file removal">
                  <h3 className="text-sm font-semibold">{selectedUsage.length ? "Choose what visitors will see instead" : "Move this file to Trash?"}</h3>
                  {selectedUsage.length ? <><p className="text-xs leading-6 text-white/60">Every saved reference listed above will use the replacement. The original moves to Trash. No other content or layout changes.</p><label className="grid gap-2 text-xs">Replacement {selected.mediaType}<select className={field} value={replacementId} onChange={(event) => setReplacementId(event.target.value)} disabled={busy}><option value="">Select a replacement…</option>{replacements.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>{!replacements.length && <p className="text-xs text-amber-200">Upload another {selected.mediaType} first, or remove its placements in the page editors.</p>}</> : <p className="text-xs leading-6 text-white/60">This file has no saved portfolio references. You can restore it later.</p>}
                  <div className="flex flex-wrap gap-2"><button className={`${button} bg-red-400/10 text-red-100`} type="button" disabled={busy || (selectedUsage.length > 0 && !replacementId)} onClick={() => mutate(selectedUsage.length ? "replace_and_trash" : "trash")}>{pending ? "Working…" : selectedUsage.length ? "Replace everywhere & move to Trash" : "Confirm move to Trash"}</button><button className={button} disabled={busy} type="button" onClick={() => setConfirmRemoval(false)}>Cancel</button></div>
                </div>}
          </div>
        </div>}
      </aside>
    </div>
    {message && <p role="status" aria-live="polite" className="sticky bottom-3 z-10 rounded-2xl border border-white/15 bg-[#151517]/95 p-4 text-sm shadow-xl backdrop-blur-xl">{message}</p>}
  </div>;
}
