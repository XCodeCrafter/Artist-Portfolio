"use client";

import Image from "next/image";
import { startTransition, useActionState, useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { FaCheck, FaLink, FaShareAlt } from "react-icons/fa";
import { saveSiteSharingV2 } from "@/app/admin/v2/settings/sharing/actions";
import MediaAssetPicker from "@/components/admin/MediaAssetPicker";
import useUnsavedChangesGuard from "@/components/admin/useUnsavedChangesGuard";
import SocialPreviewCard from "@/components/seo/SocialPreviewCard";
import { needsEditorReload, runEditorSave } from "@/lib/admin/editor-save-recovery";
import type { MediaAsset } from "@/lib/admin/media";
import type { AdminSharingData } from "@/lib/admin/site-sharing";
import { INITIAL_SHARING_SAVE_STATE, parseSharingEditorSnapshot, parseSharingSubmission, type SharingSaveState } from "@/lib/admin/site-sharing-editor";
import { isEligibleSharingImageAsset, type SharingMetadata } from "@/lib/content/site-sharing";
import { resolveSiteSharing } from "@/lib/site-sharing-preview";

type Props = {
  data: AdminSharingData;
  assets: MediaAsset[];
  artistName: string;
  description: string;
  siteUrl: string;
  mediaLoadError?: string;
};

const inputClass = "mt-2 min-h-11 w-full rounded-xl border border-white/15 bg-[#08080a] px-3 py-2 text-sm text-white outline-none transition focus:border-white/60 disabled:opacity-45";
const buttonClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/15 px-4 text-xs font-semibold text-white/75 outline-none transition hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/70 disabled:cursor-not-allowed disabled:opacity-35";

/** Keep the generated preview at its real social-card dimensions. */
function SharingCardFrame({ children }: { children: ReactNode }) {
  const host = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  useEffect(() => {
    if (!host.current) return;
    const resize = () => setScale((host.current?.clientWidth || 0) / 1200);
    const observer = new ResizeObserver(resize);
    observer.observe(host.current);
    resize();
    return () => observer.disconnect();
  }, []);
  return <div ref={host} className="relative aspect-[1200/630] w-full overflow-hidden bg-[#090909]">
    <div style={{ width: 1200, height: 630, transform: `scale(${scale})`, transformOrigin: "top left" }}>{children}</div>
  </div>;
}

export default function SiteSharingEditor({ data, assets, artistName, description, siteUrl, mediaLoadError }: Props) {
  const [saved, setSaved] = useState(data.snapshot);
  const [draft, setDraft] = useState(data.snapshot.draft);
  const [lastSubmittedPayload, setLastSubmittedPayload] = useState("");
  const [repairPending, setRepairPending] = useState(Boolean(data.loadWarning));
  const draftRef = useRef(data.snapshot.draft);
  const savedRef = useRef(data.snapshot);
  const savingRef = useRef(false);
  const lastHandledEventRef = useRef("");
  const repairPendingRef = useRef(Boolean(data.loadWarning));
  const { markDirty, clearDirty, confirmDiscard } = useUnsavedChangesGuard("You have unsaved sharing settings. Leave and discard them?", true);
  const availableAssets = assets.filter(isEligibleSharingImageAsset);
  const unavailable = !data.isConfigured || data.migrationRequired || Boolean(data.loadError);
  const changed = JSON.stringify(draft) !== JSON.stringify(saved.draft);
  const dirty = changed || repairPending;
  const validation = parseSharingSubmission(draft, saved.versions);
  const knownImage = !draft.imageSrc || availableAssets.some(asset => asset.src === draft.imageSrc);
  // A temporary media-list outage must not prevent saving unchanged metadata.
  // The server rechecks every selected image against the authoritative registry.
  const imageAvailable = knownImage || Boolean(mediaLoadError && draft.imageSrc === saved.draft.imageSrc);
  const [state, action, pending] = useActionState(async (previous: SharingSaveState, form: FormData) => {
    if (unavailable || savingRef.current || ["migration-required", "security-error", "missing-service"].includes(previous.status)) return previous;
    const submitted = String(form.get("payload") || "");
    if (submitted !== JSON.stringify(draftRef.current) || form.get("versions") !== JSON.stringify(savedRef.current.versions) ||
      (!repairPendingRef.current && submitted === JSON.stringify(savedRef.current.draft)) || !parseSharingSubmission(draftRef.current, savedRef.current.versions).success) return previous;
    if (draftRef.current.imageSrc && !availableAssets.some(asset => asset.src === draftRef.current.imageSrc) &&
      !(mediaLoadError && draftRef.current.imageSrc === savedRef.current.draft.imageSrc)) return previous;
    savingRef.current = true;
    setLastSubmittedPayload(submitted);
    try {
      return await runEditorSave(previous, () => saveSiteSharingV2(previous, form), result => {
        if (!result.eventId) return false;
        if (lastHandledEventRef.current === result.eventId) return true;
        const confirmed = parseSharingEditorSnapshot({ draft: result.canonical, versions: result.versions });
        if (!confirmed || confirmed.versions.updatedAt === savedRef.current.versions.updatedAt) return false;
        lastHandledEventRef.current = result.eventId;
        repairPendingRef.current = false;
        setRepairPending(false);
        savedRef.current = confirmed;
        setSaved(confirmed);
        // Preserve a newer browser event if it was queued just before locking.
        if (JSON.stringify(draftRef.current) === submitted) {
          draftRef.current = confirmed.draft;
          setDraft(confirmed.draft);
          clearDirty();
        } else if (JSON.stringify(draftRef.current) === JSON.stringify(confirmed.draft)) clearDirty();
        else markDirty();
        return true;
      });
    } finally {
      savingRef.current = false;
    }
  }, INITIAL_SHARING_SAVE_STATE);
  const recoveryRequired = needsEditorReload(state) || ["migration-required", "security-error", "missing-service"].includes(state.status);
  const blocked = unavailable || pending || recoveryRequired;
  const errors: Record<string, string[]> = validation.success ? {} : validation.fieldErrors;
  if (!imageAvailable) errors.imageSrc = ["Choose an active, published JPG, PNG or WebP image from Media Library."];
  const preview = resolveSiteSharing({ artistName, description, sharingMetadata: draft });
  const defaults = resolveSiteSharing({ artistName, description });
  const siteLabel = new URL(siteUrl).hostname;
  const previewImage = knownImage ? draft.imageSrc : "";

  function change(patch: Partial<SharingMetadata>) {
    if (blocked || savingRef.current) return;
    const next = { ...draftRef.current, ...patch };
    draftRef.current = next;
    setDraft(next);
    if (JSON.stringify(next) === JSON.stringify(savedRef.current.draft)) clearDirty();
    else markDirty();
  }
  function discard() {
    if (blocked || savingRef.current) return;
    confirmDiscard(() => {
      draftRef.current = savedRef.current.draft;
      setDraft(savedRef.current.draft);
      clearDirty();
    });
  }
  function textField(key: "title" | "description" | "imageAlt", label: string, maxLength: number, help: string, multiline = false) {
    const id = `site-sharing-${key}`;
    const error = errors[key]?.join(" ");
    const props = {
      id, value: draft[key], maxLength, className: inputClass,
      placeholder: key === "title" ? defaults.title : key === "description" ? defaults.description : "Describe the cover image",
      "aria-invalid": Boolean(error), "aria-describedby": `${id}-help${error ? ` ${id}-error` : ""}`,
      onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => change({ [key]: key === "description" ? event.target.value.replace(/[\r\n]+/g, " ") : event.target.value }),
    };
    return <div>
      <label htmlFor={id} className="text-sm font-semibold text-white/80">{label}</label>
      {multiline ? <textarea {...props} rows={4} /> : <input {...props} />}
      <div className="mt-2 flex items-start justify-between gap-3 text-xs leading-5 text-white/45"><p id={`${id}-help`}>{help}</p><span className="shrink-0 tabular-nums" aria-hidden="true">{draft[key].length}/{maxLength}</span></div>
      {error ? <p id={`${id}-error`} role="alert" className="mt-2 text-xs text-amber-200">{error}</p> : null}
    </div>;
  }

  return <form onSubmit={event => {
    event.preventDefault();
    if (blocked || savingRef.current || !dirty || !validation.success || !imageAvailable) return;
    const form = new FormData();
    form.set("payload", JSON.stringify(draftRef.current));
    form.set("versions", JSON.stringify(savedRef.current.versions));
    startTransition(() => action(form));
  }} onReset={event => event.preventDefault()} data-unsaved-guard-bypass="true" className="grid min-w-0 gap-4">
    <input type="hidden" name="payload" value={JSON.stringify(draft)} readOnly />
    <input type="hidden" name="versions" value={JSON.stringify(saved.versions)} readOnly />
    {data.migrationRequired ? <p role="status" className="rounded-2xl border border-amber-200/20 bg-amber-200/5 p-4 text-sm leading-6 text-amber-100">Apply migration 0056 and verify its checks, then reload. Sharing settings are read-only until the database is ready.</p> : null}
    {data.loadError ? <p role="alert" className="rounded-2xl border border-red-200/20 p-4 text-sm text-red-100">{data.loadError}</p> : null}
    {repairPending && data.loadWarning ? <p role="status" className="rounded-2xl border border-amber-200/20 bg-amber-200/5 p-4 text-sm leading-6 text-amber-100">{data.loadWarning}</p> : null}
    {!data.isConfigured && !data.migrationRequired && !data.loadError ? <p role="status" className="rounded-2xl border border-amber-200/20 p-4 text-sm text-amber-100">Sharing settings are unavailable. The preview is read-only; fallback data cannot overwrite saved settings.</p> : null}
    <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
      <section aria-labelledby="sharing-preview-title" className="min-w-0 overflow-hidden rounded-[26px] border border-white/10 bg-[#0d0d0f]">
        <header className="border-b border-white/10 p-5"><h2 id="sharing-preview-title" className="heading-ui flex items-center gap-2 text-base font-semibold"><FaShareAlt aria-hidden="true" /> Shared-link preview</h2><p className="mt-2 text-xs leading-5 text-white/45">Your changes appear here before saving. Each messaging app controls its final layout and cropping.</p></header>
        <div className="p-4 sm:p-6">
          <div className="overflow-hidden rounded-2xl border border-white/15 bg-[#19191b]" aria-label="Home link preview">
            {previewImage ? <div className="relative aspect-[1200/630] overflow-hidden bg-black"><Image fill unoptimized src={previewImage} alt={draft.imageAlt || preview.imageAlt} className="object-contain" sizes="(min-width: 1280px) 50vw, 100vw" /></div>
              : <SharingCardFrame><SocialPreviewCard brandName={preview.brandName} title={preview.title} /></SharingCardFrame>}
            <div className="border-t border-white/10 p-4 sm:p-5"><p className="flex items-center gap-2 break-all text-[10px] uppercase tracking-[0.15em] text-white/45"><FaLink aria-hidden="true" className="shrink-0" /> {siteLabel}</p><h3 className="mt-2 break-words text-lg font-semibold leading-6 text-white">{preview.title}</h3><p className="mt-2 break-words text-sm leading-6 text-white/60">{preview.description}</p></div>
          </div>
          <p className="mt-4 text-xs leading-6 text-white/45">{draft.imageSrc ? "Your image is the complete cover. Title and description remain readable link metadata below it." : "Automatic cover · dark photograph, your name and sharing text. No image upload required."}</p>
          <div className="mt-5 border-t border-white/10 pt-5"><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40">Search preview</p><p className="mt-3 break-words text-base text-[#c4b9ff]">{preview.title}</p><p className="mt-1 break-all text-xs text-white/45">{siteUrl}</p><p className="mt-2 break-words text-sm leading-6 text-white/60">{preview.description}</p></div>
        </div>
      </section>
      <section className="min-w-0 rounded-[26px] border border-white/10 bg-[#101012] p-5 sm:p-6" aria-labelledby="sharing-inspector-title">
        <h2 id="sharing-inspector-title" className="heading-ui text-xl font-semibold">Sharing &amp; SEO</h2>
        <p className="mt-2 text-xs leading-6 text-white/45">Set the Home title and description for search and shared links. Other pages keep their own titles; the cover is shared across the site.</p>
        <fieldset disabled={blocked} className="mt-6 grid min-w-0 gap-6 disabled:opacity-50"><legend className="sr-only">Sharing settings</legend>
          {textField("title", "Link title", 120, "Aim for around 60 characters. Leave empty to use the owner’s name, never the Home headline.")}
          {textField("description", "Link description", 320, "A short introduction works best. Leave empty to use the site description from Appearance.", true)}
          <div className="border-t border-white/10 pt-5">
            <p className="text-sm font-semibold text-white/80">Preview cover</p>
            <p className="mt-2 text-xs leading-6 text-white/45">Choose a published JPG, PNG or WebP. Recommended: 1200 × 630 px, under 5 MB. Use a finished cover; messaging apps may crop its edges.</p>
            {mediaLoadError ? <p role="alert" className="mt-3 text-xs leading-5 text-amber-200">{mediaLoadError} Existing text can still be edited. Reload after saving or discarding changes to refresh the library.</p> : null}
            <MediaAssetPicker assets={availableAssets} kind="image" name="site-sharing-image" label="Sharing image" value={draft.imageSrc} showPreview={false} error={errors.imageSrc?.join(" ")}
              onValueChange={(imageSrc, asset) => change({ imageSrc, ...(asset && imageSrc !== draft.imageSrc ? { imageAlt: asset.alt || asset.label } : {}) })} />
            {draft.imageSrc ? <button type="button" onClick={() => change({ imageSrc: "", imageAlt: "" })} className={`${buttonClass} mt-4`}>Use automatic cover</button> : null}
          </div>
          {draft.imageSrc ? textField("imageAlt", "Cover description", 500, "Describe what the image shows for people who cannot see it.") : null}
        </fieldset>
      </section>
    </div>
    {state.status !== "idle" && (state.status !== "invalid" || lastSubmittedPayload === JSON.stringify(draft)) ? <div role={state.status === "saved" ? "status" : "alert"} className={`rounded-2xl border p-4 text-sm leading-6 ${state.status === "saved" ? "border-emerald-200/20 text-emerald-100" : "border-amber-200/20 text-amber-100"}`}>{state.message}{state.status !== "saved" && state.fieldErrors ? <ul className="mt-2 list-disc pl-5 text-xs">{Object.entries(state.fieldErrors).map(([key, messages]) => <li key={key}>{messages.join(" ")}</li>)}</ul> : null}</div> : null}
    <footer className="sticky bottom-3 z-20 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/15 bg-[#111113]/95 p-4 shadow-xl backdrop-blur-xl">
      <div className="min-w-0"><p aria-live="polite" className="text-sm font-semibold text-white/85">{pending ? "Saving sharing settings…" : blocked ? "Sharing settings are read-only" : changed ? "Sharing settings have unsaved changes" : repairPending ? "The saved cover needs an update" : "All sharing changes are saved"}</p><p className="mt-1 max-w-xl text-xs leading-5 text-white/45">Already-shared links can keep an older preview in the app’s cache. Saving does not rewrite existing messages.</p></div>
      <div className="flex w-full flex-wrap gap-2 sm:w-auto">
        {recoveryRequired ? <button type="button" disabled={pending} className={buttonClass} onClick={() => confirmDiscard(() => window.location.reload())}>Reload saved settings</button> : null}
        <button type="button" disabled={blocked || !changed} className={buttonClass} onClick={discard}>Discard changes</button>
        <button type="submit" disabled={blocked || !dirty || !validation.success || !imageAvailable} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-white px-4 text-xs font-semibold text-black outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:cursor-not-allowed disabled:opacity-35 sm:flex-none"><FaCheck aria-hidden="true" /> {pending ? "Saving…" : "Save sharing settings"}</button>
      </div>
    </footer>
  </form>;
}
