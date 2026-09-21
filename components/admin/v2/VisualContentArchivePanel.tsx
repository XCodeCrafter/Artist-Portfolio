"use client";

import { useState, type MutableRefObject } from "react";
import { FaArchive, FaUndo } from "react-icons/fa";
import { loadVisualContentArchivePage, mutateVisualContentArchive } from "@/app/admin/v2/content-archive-actions";
import { ARCHIVE_PAGE_SIZE } from "@/lib/admin/content-archive-editor";
import {
  emptyVisualArchiveData, parseVisualArchivePage, parseVisualArchiveSnapshot,
  type VisualArchiveCollection, type VisualArchiveData,
} from "@/lib/admin/visual-content-archive-editor";

export const visualArchiveButtonClass = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-white/65 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-35";
type Snapshot = NonNullable<ReturnType<typeof parseVisualArchiveSnapshot>>;
export type VisualArchiveLocks = {
  operation: MutableRefObject<"mutation" | "page" | null>;
  save: MutableRefObject<boolean>;
  reload: MutableRefObject<boolean>;
};

// The two visual editors share the same fail-closed lifecycle. Read-only paging
// deliberately does not take the Save lock: browsing an archive cannot eat a save.
export function useVisualContentArchive({ collection, initialData, disabled, locks, readActive, isDirty, onAdopt, onReload }: {
  collection: VisualArchiveCollection;
  initialData?: VisualArchiveData;
  disabled: boolean;
  locks: VisualArchiveLocks;
  readActive: () => { items: { id: string; isPublished: boolean }[]; versions: { items: Record<string, string> } };
  isDirty: () => boolean;
  onAdopt: (snapshot: Snapshot, message: string) => void;
  onReload: () => void;
}) {
  const [archive, setArchive] = useState(() => initialData || emptyVisualArchiveData(collection));
  const [pending, setPending] = useState(false);
  const [pagePending, setPagePending] = useState(false);
  const [reloadRequired, setReloadRequired] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; error: boolean } | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const label = collection === "gallery" ? "Gallery" : "Showreel";
  const section = collection === "gallery" ? "frames" : "works";

  function canMutate() {
    return archive.available && !disabled && !pending && !pagePending &&
      !locks.operation.current && !locks.save.current && !locks.reload.current && !isDirty();
  }

  async function mutate(operation: "archive" | "restore", itemId: string) {
    if (!canMutate()) return;
    const { items, versions } = readActive();
    const archivedItem = archive.page.items.find(item => item.id === itemId);
    if (operation === "archive" && (confirmId !== itemId || !items.some(item => item.id === itemId) || !Object.hasOwn(versions.items, itemId))) return;
    if (operation === "restore" && (!archivedItem || items.length >= archive.page.activeLimit || items.some(item => item.id === itemId))) return;
    locks.operation.current = "mutation";
    setPending(true);
    setFeedback(null);
    try {
      const result = await mutateVisualContentArchive({ collection, operation, itemId, expectedVersions: versions,
        ...(operation === "restore" ? { expectedArchiveUpdatedAt: archivedItem!.updatedAt } : {}),
      });
      if (!result || typeof result.ok !== "boolean" || typeof result.message !== "string") throw new Error("Unverified archive response");
      if (!result.ok) {
        if (result.reloadRequired) { locks.reload.current = true; setReloadRequired(true); }
        setFeedback({ error: true, message: result.message });
        return;
      }
      const confirmed = result.collection === collection && result.section === section &&
        parseVisualArchiveSnapshot(collection, result.canonicalSection, result.versions);
      const page = parseVisualArchivePage(collection, result.archive);
      if (!confirmed || !page || page.offset !== 0 || page.activeLimit < archive.page.activeLimit) throw new Error("Unverified archive snapshot");
      const expectedIds = new Set(items.map(item => item.id));
      if (operation === "archive") expectedIds.delete(itemId);
      else expectedIds.add(itemId);
      const nextItems = confirmed.payload.items;
      if (nextItems.length > page.activeLimit || nextItems.length !== expectedIds.size || nextItems.some(item => !expectedIds.has(item.id))) throw new Error("Unverified archive membership");
      const restored = nextItems.find(item => item.id === itemId);
      if ((operation === "archive" && restored) || (operation === "restore" && (!restored || restored.isPublished || page.items.some(item => item.id === itemId)))) throw new Error("Unverified archive operation");
      onAdopt(confirmed, result.message);
      setArchive({ available: true, page });
      setConfirmId(null);
      setFeedback({ error: false, message: result.message });
    } catch {
      locks.reload.current = true;
      setReloadRequired(true);
      setFeedback({ error: true, message: `The archive outcome could not be confirmed. The server may have applied it. Reload the saved ${label} page before trying again.` });
    } finally {
      locks.operation.current = null;
      setPending(false);
    }
  }

  async function loadPage(offset: number) {
    if (!archive.available || disabled || locks.operation.current || locks.save.current || locks.reload.current ||
      !Number.isInteger(offset) || offset < 0 || offset > 1_000_000 || offset % ARCHIVE_PAGE_SIZE !== 0) return;
    locks.operation.current = "page";
    setPagePending(true);
    setFeedback(null);
    try {
      const result = await loadVisualContentArchivePage(collection, offset);
      const page = result && parseVisualArchivePage(collection, result.page);
      if (!result?.available || !page || page.offset !== offset || page.activeLimit < archive.page.activeLimit) {
        setFeedback({ error: true, message: typeof result?.message === "string" && result.message || "Archived items could not be loaded. Your current page has been kept." });
        return;
      }
      setArchive({ ...result, page });
    } catch {
      setFeedback({ error: true, message: "Archived items could not be loaded. Your current page has been kept." });
    } finally {
      locks.operation.current = null;
      setPagePending(false);
    }
  }

  function control(id: string, itemLabel: string) {
    return <div className="mt-3">
      <button aria-label={`Archive ${itemLabel}`} className={visualArchiveButtonClass} disabled={!canMutate()} onClick={() => { if (canMutate()) setConfirmId(id); }} type="button"><FaArchive /> Archive</button>
      {confirmId === id ? <div className="mt-3 rounded-xl border border-amber-200/15 bg-amber-200/[0.035] p-3">
        <p className="text-xs font-semibold text-white/80">Archive {itemLabel}?</p>
        <p className="mt-2 text-xs leading-5 text-white/50">This immediately removes the item from the public portfolio, including any other page using this entry. It stays recoverable in the archive. No Media files are deleted.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className={visualArchiveButtonClass} disabled={!canMutate()} onClick={() => mutate("archive", id)} type="button">Confirm archive</button>
          <button className={visualArchiveButtonClass} disabled={pending} onClick={() => setConfirmId(null)} type="button">Cancel archive</button>
        </div>
      </div> : null}
    </div>;
  }

  const panel = <VisualContentArchivePanel archive={archive} collection={collection} activeCount={readActive().items.length}
    dirty={isDirty()} canMutate={canMutate()} canBrowse={!disabled && !pending && !pagePending && !reloadRequired}
    loading={pagePending} onRestore={id => mutate("restore", id)} onPage={loadPage} />;
  const feedbackPanel = feedback ? <section className={`mt-4 rounded-[18px] border px-4 py-3 text-sm leading-6 ${feedback.error ? "border-amber-300/16 bg-amber-400/[0.06] text-amber-50/76" : "border-emerald-300/16 bg-emerald-400/[0.06] text-emerald-50/76"}`} role={feedback.error ? "alert" : "status"}>
    <p>{feedback.message}</p>
    {reloadRequired ? <button className={`${visualArchiveButtonClass} mt-3`} onClick={onReload} type="button">Reload saved {label} page</button> : null}
  </section> : null;
  return { pending, reloadRequired, activeLimit: archive.page.activeLimit, control, panel, feedbackPanel };
}

export default function VisualContentArchivePanel({ archive, collection, activeCount, dirty, canMutate, canBrowse, loading, onRestore, onPage }: {
  archive: VisualArchiveData; collection: VisualArchiveCollection; activeCount: number; dirty: boolean;
  canMutate: boolean; canBrowse: boolean; loading: boolean; onRestore: (id: string) => void; onPage: (offset: number) => void;
}) {
  const label = collection === "gallery" ? "Frames" : "Videos";
  const { page } = archive;
  return <section aria-label={`${label} archive`} className="mt-6 rounded-[20px] border border-white/10 bg-black/20 p-4">
    <h3 className="inline-flex items-center gap-2 text-sm font-semibold text-white/80"><FaArchive /> {label} archive</h3>
    <p className="mt-2 text-xs leading-5 text-white/45">Archived items free an active slot. Restore as hidden with the saved content and order, then make visible when ready. Media files are kept.</p>
    <p className="mt-3 text-xs font-semibold text-white/65">{activeCount}/{page.activeLimit} active slots · {archive.available ? page.total : "—"} archived</p>
    {!archive.available ? <p className="mt-3 text-xs leading-5 text-amber-100/75" role="status">{archive.message || "Apply migration 0044 to enable this archive. Regular editing still works."}</p> : <>
      {dirty ? <p className="mt-3 text-xs leading-5 text-amber-100/75">Save or discard {collection === "gallery" ? "Frames" : "Videos"} changes before archiving or restoring. Other sections can keep their drafts.</p> : null}
      {activeCount >= page.activeLimit ? <p className="mt-3 text-xs leading-5 text-amber-100/75">All {page.activeLimit} active slots are used. Archive an item before restoring another.</p> : null}
      {!page.items.length ? <p className="mt-4 text-xs text-white/40">No archived items on this page.</p> : <ul className="mt-4 grid gap-3">
        {page.items.map(item => <li className="rounded-xl border border-white/8 p-3" key={item.id}>
          <p className="break-words text-sm font-semibold text-white/75">{item.label || "Untitled item"}</p>
          <p className="mt-1 text-[11px] text-white/35">Archived {item.archivedAt.slice(0, 10)}</p>
          <button aria-label={`Restore ${item.label || "Untitled item"} as hidden`} className={`${visualArchiveButtonClass} mt-3 w-full`} disabled={!canMutate || activeCount >= page.activeLimit} onClick={() => onRestore(item.id)} type="button"><FaUndo /> Restore as hidden</button>
        </li>)}
      </ul>}
      <div className="mt-4 flex items-center justify-between gap-2">
        <button aria-label={`Previous archived ${label}`} className={visualArchiveButtonClass} disabled={!canBrowse || loading || page.offset === 0} onClick={() => onPage(Math.max(0, page.offset - ARCHIVE_PAGE_SIZE))} type="button">Previous</button>
        <span aria-live="polite" className="text-xs text-white/45">{loading ? "Loading…" : `Page ${Math.floor(page.offset / ARCHIVE_PAGE_SIZE) + 1}`}</span>
        <button aria-label={`Next archived ${label}`} className={visualArchiveButtonClass} disabled={!canBrowse || loading || page.offset + ARCHIVE_PAGE_SIZE >= page.total} onClick={() => onPage(page.offset + ARCHIVE_PAGE_SIZE)} type="button">Next</button>
      </div>
    </>}
  </section>;
}
