"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { saveSiteAppearanceV2 } from "@/app/admin/v2/settings/appearance/actions";
import { useNavbarUnsavedChanges } from "./NavbarUnsavedChangesProvider";
import { INITIAL_APPEARANCE_SAVE_STATE, type AppearanceSaveState } from "@/lib/admin/site-appearance-editor";
import type { AdminAppearanceData } from "@/lib/admin/site-appearance";

export default function NavbarNameEditor({ snapshot, isConfigured, migrationRequired, loadError }: AdminAppearanceData) {
  const router = useRouter();
  const [saved, setSaved] = useState(snapshot.draft.name);
  const [draft, setDraft] = useState(snapshot.draft.name);
  const [versions, setVersions] = useState(snapshot.versions);
  const { markDirty, clearDirty, confirmDiscard } = useNavbarUnsavedChanges("name");
  const dirty = draft.artistName !== saved.artistName;
  const [state, action, pending] = useActionState(async (previous: AppearanceSaveState, form: FormData) => {
    const result = await saveSiteAppearanceV2(previous, form);
    if (result.status === "saved" && result.versions && result.canonicalSection && "artistName" in result.canonicalSection) {
      setSaved(result.canonicalSection);
      setDraft(result.canonicalSection);
      setVersions(result.versions);
      clearDirty(() => router.refresh());
    }
    return result;
  }, INITIAL_APPEARANCE_SAVE_STATE);
  const blocked = !isConfigured || migrationRequired || Boolean(loadError);

  return (
    <section aria-labelledby="navbar-owner-title" className="rounded-[26px] border border-white/10 bg-[#101012] p-5 sm:p-6">
      <div className="grid gap-6 xl:grid-cols-2">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#ff806c]">Brand · owner</p>
          <h2 className="heading-ui mt-2 text-xl font-semibold" id="navbar-owner-title">Name in the navbar</h2>
          <p className="mt-2 max-w-lg text-sm leading-6 text-white/45">Set the portfolio owner’s name. Saving updates the shared name in the header, footer, and site metadata; page-specific headlines stay unchanged.</p>
          <div aria-label="Owner name preview" className="mt-5 rounded-2xl border border-white/10 bg-black/30 px-6 py-5 text-center">
            <span className="break-words text-2xl" style={{ fontFamily: "var(--font-display)" }}>{draft.artistName || "Owner name"}</span>
          </div>
        </div>
        <form action={action} data-unsaved-guard-bypass="true" className="grid content-start gap-3">
          <input type="hidden" name="section" value="name" />
          <input type="hidden" name="payload" value={JSON.stringify(draft)} />
          <input type="hidden" name="versions" value={JSON.stringify(versions)} />
          {blocked && <p role="alert" className="text-sm text-amber-200">{loadError || "The settings database is unavailable. This editor is read-only."}</p>}
          <label className="text-xs font-semibold text-white/65" htmlFor="navbar-owner-name">Owner / artist name</label>
          <input id="navbar-owner-name" autoComplete="off" maxLength={220} required disabled={blocked || pending} value={draft.artistName} aria-describedby="navbar-owner-feedback" className="min-h-12 w-full rounded-xl border border-white/15 bg-black/30 px-4 text-sm outline-none focus:border-white/60 disabled:opacity-45" onChange={(event) => {
            const value = event.target.value;
            setDraft({ artistName: value });
            if (value === saved.artistName) clearDirty(); else markDirty();
          }} />
          <div id="navbar-owner-feedback" role="status" aria-live="polite" className="text-xs leading-5 text-white/60">
            {dirty ? "Unsaved name · not published yet." : state.message}
            {state.status !== "saved" && dirty && state.message && <p>{state.message}</p>}
            {state.fieldErrors?.artistName?.map((error) => <p key={error} className="text-amber-200">{error}</p>)}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={blocked || pending || !dirty || state.status === "conflict"} className="min-h-11 rounded-xl bg-white px-5 text-xs font-semibold text-black disabled:opacity-35">{pending ? "Saving…" : "Save owner name"}</button>
            <button type="button" disabled={pending || !dirty} className="min-h-11 rounded-xl border border-white/15 px-4 text-xs disabled:opacity-35" onClick={() => { setDraft(saved); clearDirty(); }}>Discard name changes</button>
            {state.status === "conflict" && <button type="button" className="min-h-11 rounded-xl border border-amber-200/30 px-4 text-xs text-amber-200" onClick={() => confirmDiscard(() => window.location.reload())}>Reload saved settings</button>}
          </div>
        </form>
      </div>
    </section>
  );
}
