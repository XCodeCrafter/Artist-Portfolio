"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { prepareMediaUpload, finalizeMediaUpload } from "@/lib/admin/media-upload-actions";
import { createClient } from "@/lib/supabase/client";
import { formatMediaBytes, validateMediaUploadFiles } from "@/lib/admin/media-library-editor";
import useUnsavedChangesGuard from "@/components/admin/useUnsavedChangesGuard";

type UploadTicket = Extract<Awaited<ReturnType<typeof prepareMediaUpload>>, { ok: true }>["ticket"];
type Upload = { id: string; file: File; label: string; alt: string; message: string; ticket?: UploadTicket; verifyOnly?: boolean };
const field = "min-h-11 w-full rounded-xl border border-white/15 bg-black/30 px-3 text-sm text-white outline-none focus:border-white/60";

export default function MediaLibraryUpload({ disabled, onBusyChange }: { disabled: boolean; onBusyChange: (busy: boolean) => void }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [queue, setQueue] = useState<Upload[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const { markDirty, clearDirty } = useUnsavedChangesGuard("Files are queued or uploading. Leave the upload workspace?", true);

  async function upload(event: FormEvent) {
    event.preventDefault();
    if (busy || disabled || !queue.length) return;
    if (queue.some((item) => !item.label.trim())) { setMessage("Every file needs a name."); return; }
    setBusy(true); onBusyChange(true);
    let complete = 0;
    const remaining: Upload[] = [];
    for (const [index, item] of queue.entries()) {
      setMessage(`Uploading ${index + 1} of ${queue.length}: ${item.file.name}`);
      let staged = item;
      try {
        if (!staged.ticket) {
          const prepared = await prepareMediaUpload({ label: item.label.trim(), alt: item.alt.trim(), usageKey: "", sortOrder: 0,
            isPublished: true, fileName: item.file.name, fileSize: item.file.size, mimeType: item.file.type });
          if (!prepared.ok) throw new Error(prepared.error);
          staged = { ...item, ticket: prepared.ticket };
        }
        const ticket = staged.ticket!;
        if (!staged.verifyOnly) {
          // Once transfer starts its result may be ambiguous. Never allocate a
          // fresh storage object on retry: inspect/finalize this same ticket.
          staged = { ...staged, verifyOnly: true };
          try {
            await createClient().storage.from(ticket.storageBucket).uploadToSignedUrl(
              ticket.storagePath, ticket.token, item.file, { contentType: item.file.type, cacheControl: "31536000" });
          } catch {
            // The connection may have failed after the object was stored.
            // Finalization checks actual object existence, size and file magic.
          }
        }
        const finalized = await finalizeMediaUpload(ticket);
        if (!finalized.ok) throw new Error(finalized.error);
        complete++;
      } catch (error) {
        remaining.push({ ...staged, message: `${error instanceof Error ? error.message : "Upload could not be completed."}${staged.verifyOnly ? " Retry verifies the same upload without transferring it again. If it cannot be verified, check the library/storage before starting over." : ""}` });
      }
    }
    setQueue(remaining);
    if (input.current) input.current.value = "";
    setMessage(`${complete} uploaded${remaining.length ? `; ${remaining.length} need attention. Only failed files remain below.` : ". Ready to choose in any page editor."}`);
    setBusy(false); onBusyChange(remaining.length > 0);
    if (!remaining.length) clearDirty(() => router.refresh());
    else if (complete) router.refresh();
  }

  return <details className="rounded-[24px] border border-white/10 bg-[#111113] p-5" id="upload">
    <summary className="cursor-pointer text-base font-semibold">Upload photos & videos <span className="ml-2 text-xs font-normal text-white/45">Choose files, name them, upload</span></summary>
    <form className="mt-5 grid gap-4" onSubmit={upload} data-unsaved-guard-bypass="true">
      <p className="text-xs leading-6 text-white/50">Up to 10 files per batch · images up to 10 MB · videos up to 100 MB · 250 MB per batch. Uploading adds files to the library; it does not place them on a public page. These uploads currently use Supabase. Optimization and ImageKit cutover are not enabled by this screen.</p>
      <fieldset disabled={disabled || busy} className="grid min-w-0 gap-4 disabled:opacity-50">
        <label className="grid gap-2 text-sm">Choose files
          <input ref={input} type="file" multiple className={`${field} py-3`}
            accept="image/avif,image/gif,image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
            onChange={(event) => {
              const files = Array.from(event.target.files || []);
              if (!files.length) return;
              const error = validateMediaUploadFiles(files);
              if (error) { setMessage(error); event.target.value = ""; return; }
              if (queue.length) { setMessage("Remove the queued files before selecting a new batch."); event.target.value = ""; return; }
              setQueue(files.map((file, index) => ({ id: `${index}-${file.name}`, file, label: file.name.replace(/\.[^.]+$/, "").slice(0, 220), alt: "", message: "Ready" })));
              setMessage(""); markDirty(); onBusyChange(true);
            }} />
        </label>
        {queue.map((item) => <div key={item.id} className="grid min-w-0 gap-3 rounded-2xl border border-white/10 p-4 md:grid-cols-[1fr_1fr_auto]">
          <label className="grid min-w-0 gap-2 text-xs text-white/60">File name
            <input className={field} required maxLength={220} disabled={Boolean(item.ticket)} value={item.label} onChange={(event) => setQueue(queue.map((row) => row.id === item.id ? { ...row, label: event.target.value } : row))} />
            <span className="break-all">{item.file.name} · {formatMediaBytes(item.file.size)}</span>
          </label>
          <label className="grid gap-2 text-xs text-white/60">Image description / alt text
            <input className={field} maxLength={220} disabled={Boolean(item.ticket)} value={item.alt} onChange={(event) => setQueue(queue.map((row) => row.id === item.id ? { ...row, alt: event.target.value } : row))} />
            <span className={item.message === "Ready" ? "text-white/40" : "text-amber-200"}>{item.message}</span>
          </label>
          <button type="button" aria-label={`Remove queued ${item.file.name}`} className="min-h-11 rounded-xl border border-white/15 px-3 text-xs" onClick={() => {
            const next = queue.filter((row) => row.id !== item.id); setQueue(next);
            if (!next.length) { clearDirty(); onBusyChange(false); if (input.current) input.current.value = ""; }
          }}>Remove</button>
        </div>)}
        <button type="submit" disabled={!queue.length || busy} className="min-h-11 justify-self-start rounded-xl bg-white px-5 text-sm font-semibold text-black disabled:opacity-40">{busy ? "Uploading…" : `Upload${queue.length ? ` ${queue.length} files` : " files"}`}</button>
      </fieldset>
      {message && <p role="status" className="text-sm text-white/70">{message}</p>}
    </form>
  </details>;
}
