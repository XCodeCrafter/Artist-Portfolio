"use client";

import { FaArchive, FaUndo } from "react-icons/fa";
import { ARCHIVE_PAGE_SIZE, type ArchiveData } from "@/lib/admin/content-archive-editor";
import { BIO_ARCHIVE_LIMITS, type BioArchiveCollection } from "@/lib/admin/bio-content-archive-editor";

export const bioArchiveButtonClass = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-white/65 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-35";

export default function BioContentArchivePanel({
  archive, collection, activeCount, dirty, canMutate, canBrowse, loading, onRestore, onPage,
}: {
  archive: ArchiveData;
  collection: BioArchiveCollection;
  activeCount: number;
  dirty: boolean;
  canMutate: boolean;
  canBrowse: boolean;
  loading: boolean;
  onRestore: (id: string) => void;
  onPage: (offset: number) => void;
}) {
  const label = collection === "portraits" ? "Portraits" : collection === "paragraphs" ? "Paragraphs" : "Credits";
  const limit = BIO_ARCHIVE_LIMITS[collection];
  const { page } = archive;
  return (
    <section aria-label={`${label} archive`} className="mt-6 rounded-[20px] border border-white/10 bg-black/20 p-4">
      <h3 className="inline-flex items-center gap-2 text-sm font-semibold text-white/80"><FaArchive /> {label} archive</h3>
      <p className="mt-2 text-xs leading-5 text-white/45">Archived items free an active slot. Restore as hidden with the saved content and order, then make visible when ready. Media files are kept.</p>
      <p className="mt-3 text-xs font-semibold text-white/65">{activeCount}/{limit} active slots · {archive.available ? page.total : "—"} archived</p>
      {!archive.available ? <p className="mt-3 text-xs leading-5 text-amber-100/75" role="status">{archive.message || "Apply migration 0043 to enable this archive. Regular Bio editing still works."}</p> : <>
        {dirty ? <p className="mt-3 text-xs leading-5 text-amber-100/75">{collection === "credits" ? "Save or discard Credits changes before archiving or restoring." : "Save or discard all Biography changes first: introduction, portraits, and paragraphs are saved together."} Other sections can keep their drafts.</p> : null}
        {activeCount >= limit ? <p className="mt-3 text-xs leading-5 text-amber-100/75">All {limit} active slots are used. Archive an item before restoring another.</p> : null}
        {!page.items.length ? <p className="mt-4 text-xs text-white/40">No archived items on this page.</p> : <ul className="mt-4 grid gap-3">
          {page.items.map(item => <li className="rounded-xl border border-white/8 p-3" key={item.id}>
            <p className="break-words text-sm font-semibold text-white/75">{item.label || "Untitled item"}</p>
            <p className="mt-1 text-[11px] text-white/35">Archived {item.archivedAt.slice(0, 10)}</p>
            <button aria-label={`Restore ${item.label || "Untitled item"} as hidden`} className={`${bioArchiveButtonClass} mt-3 w-full`} disabled={!canMutate || activeCount >= limit} onClick={() => onRestore(item.id)} type="button"><FaUndo /> Restore as hidden</button>
          </li>)}
        </ul>}
        <div className="mt-4 flex items-center justify-between gap-2">
          <button aria-label={`Previous archived ${label}`} className={bioArchiveButtonClass} disabled={!canBrowse || loading || page.offset === 0} onClick={() => onPage(Math.max(0, page.offset - ARCHIVE_PAGE_SIZE))} type="button">Previous</button>
          <span aria-live="polite" className="text-xs text-white/45">{loading ? "Loading…" : `Page ${Math.floor(page.offset / ARCHIVE_PAGE_SIZE) + 1}`}</span>
          <button aria-label={`Next archived ${label}`} className={bioArchiveButtonClass} disabled={!canBrowse || loading || page.offset + ARCHIVE_PAGE_SIZE >= page.total} onClick={() => onPage(page.offset + ARCHIVE_PAGE_SIZE)} type="button">Next</button>
        </div>
      </>}
    </section>
  );
}
