"use client";

import { useActionState, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import GalleryFooter from "@/components/GalleryFooter";
import useUnsavedChangesGuard from "@/components/admin/useUnsavedChangesGuard";
import { saveSiteAppearanceV2 } from "@/app/admin/v2/settings/appearance/actions";
import { INITIAL_APPEARANCE_SAVE_STATE, type AppearanceSaveState, type AppearanceEditorDraft } from "@/lib/admin/site-appearance-editor";
import type { AdminAppearanceData } from "@/lib/admin/site-appearance";
import { DISPLAY_FONT_OPTIONS, BODY_FONT_OPTIONS, UI_FONT_OPTIONS, getFontFamily, getGoogleFontsStylesheetUrl } from "@/lib/content/fonts";
import type { SiteSettings, SocialLink } from "@/lib/content/types";

const fontRoles = [
  { key: "displayFont", label: "Display / headlines", description: "Large titles, portfolio headings, and the owner’s name.", options: DISPLAY_FONT_OPTIONS },
  { key: "bodyFont", label: "Body / paragraphs", description: "Descriptions, biography, and longer reading text.", options: BODY_FONT_OPTIONS },
  { key: "uiFont", label: "UI / navigation", description: "Navigation, buttons, small labels, and interface headings.", options: UI_FONT_OPTIONS },
] as const;
type Appearance = AppearanceEditorDraft["appearance"];

export default function AppearanceEditor({ data, settings, socialLinks }: { data: AdminAppearanceData; settings: SiteSettings; socialLinks: SocialLink[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState(data.snapshot.draft.appearance);
  const [saved, setSaved] = useState(data.snapshot.draft.appearance);
  const [versions, setVersions] = useState(data.snapshot.versions);
  const { markDirty, clearDirty, confirmDiscard } = useUnsavedChangesGuard(undefined, true);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const [state, action, pending] = useActionState(async (previous: AppearanceSaveState, form: FormData) => {
    const result = await saveSiteAppearanceV2(previous, form);
    if (result.status === "saved" && result.versions && result.canonicalSection && "displayFont" in result.canonicalSection) {
      setSaved(result.canonicalSection);
      setDraft(result.canonicalSection);
      setVersions(result.versions);
      clearDirty(() => router.refresh());
    }
    return result;
  }, INITIAL_APPEARANCE_SAVE_STATE);
  const blocked = !data.isConfigured || data.migrationRequired || Boolean(data.loadError);
  function change(next: Appearance) {
    setDraft(next);
    if (JSON.stringify(next) === JSON.stringify(saved)) clearDirty(); else markDirty();
  }
  const previewStyle = {
    "--font-display": getFontFamily(draft.displayFont),
    "--font-body": getFontFamily(draft.bodyFont),
    "--font-ui": getFontFamily(draft.uiFont),
    fontFamily: getFontFamily(draft.bodyFont),
  } as CSSProperties;

  return (
    <form action={action} className="grid min-w-0 gap-4" data-unsaved-guard-bypass="true">
      <link rel="stylesheet" href={getGoogleFontsStylesheetUrl([draft.displayFont, draft.bodyFont, draft.uiFont])} />
      <input type="hidden" name="section" value="appearance" />
      <input type="hidden" name="payload" value={JSON.stringify(draft)} />
      <input type="hidden" name="versions" value={JSON.stringify(versions)} />
      {blocked && <p role="alert" className="rounded-2xl border border-amber-200/20 p-4 text-sm text-amber-200">{data.loadError || "The settings database is unavailable. The preview is read-only."}</p>}
      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(300px,0.75fr)]">
        <section aria-labelledby="appearance-preview-title" className="order-2 min-w-0 overflow-hidden rounded-[26px] border border-white/10 bg-[#08080a] xl:order-1" style={previewStyle}>
          <div className="border-b border-white/10 px-5 py-4 text-[10px] uppercase tracking-[0.2em] text-white/40" style={{ fontFamily: "var(--font-ui)" }} id="appearance-preview-title">Live preview · unpublished until saved</div>
          <div className="p-6 sm:p-9">
            <div className="flex flex-wrap gap-5 text-xs uppercase tracking-[0.12em] text-white/55" style={{ fontFamily: "var(--font-ui)" }} aria-label="Navigation typography sample"><span className="text-[#ff6049]">Home</span><span>Bio</span><span>Music</span><span>Contact</span></div>
            <p className="mt-12 text-xs uppercase tracking-[0.25em] text-[#ff806c]" style={{ fontFamily: "var(--font-ui)" }}>Your portfolio · your voice</p>
            <h2 className="mt-4 break-words text-4xl leading-tight sm:text-6xl" style={{ fontFamily: "var(--font-display)" }}>{data.snapshot.draft.name.artistName}</h2>
            <p className="mt-6 max-w-xl text-base leading-8 text-white/65">A story told through music, film, and performance. These are the typefaces visitors will see across the portfolio.</p>
            <p className="mt-3 text-sm leading-7 text-white/40">Příběhy, které stojí za pozornost. Žluťoučký kůň · 0123456789.</p>
            <span className="mt-7 inline-flex rounded-xl border border-white/20 px-5 py-3 text-xs font-semibold uppercase tracking-[0.1em]" style={{ fontFamily: "var(--font-ui)" }}>Explore the work ↗</span>
          </div>
          <div className="border-t border-white/10 px-5 py-4 text-xs leading-5 text-white/45" style={{ fontFamily: "var(--font-ui)" }}>Footer preview: move your pointer over the light. Links are disabled here. Touch screens use a static glow; reduced-motion preferences are respected.</div>
          <div className="max-h-[580px] overflow-auto" aria-label="Interactive footer effect preview">
            <GalleryFooter artistName={data.snapshot.draft.name.artistName} contactBlurb={settings.contactBlurb} location={settings.location} tagline={settings.tagline} socialLinks={socialLinks} footerEffect={draft.footerEffect} preview />
          </div>
        </section>
        <fieldset disabled={blocked || pending} className="order-1 min-w-0 rounded-[26px] border border-white/10 bg-[#101012] p-5 disabled:opacity-50 sm:p-6 xl:order-2">
          <legend className="sr-only">Typography and footer settings</legend>
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#ff806c]">Site-wide style</p>
          <h2 className="heading-ui mt-2 text-xl font-semibold">Three type roles</h2>
          <p className="mt-2 text-xs leading-6 text-white/45">Change each role independently. The preview changes immediately; the live portfolio changes only after Save. Decorative code stays monospace.</p>
          <div className="mt-6 grid gap-6">
            {fontRoles.map((role) => <div key={role.key}>
              <label htmlFor={role.key} className="text-sm font-semibold text-white/80">{role.label}</label>
              <p id={`${role.key}-help`} className="mb-2 mt-1 text-xs leading-5 text-white/40">{role.description}</p>
              <select id={role.key} aria-describedby={`${role.key}-help`} value={draft[role.key]} onChange={(event) => change({ ...draft, [role.key]: event.target.value } as Appearance)} className="min-h-12 w-full rounded-xl border border-white/15 bg-[#08080a] px-3 text-sm outline-none focus:border-white/60">
                {role.options.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
              </select>
              {state.fieldErrors?.[role.key]?.map((error) => <p key={error} className="mt-2 text-xs text-amber-200">{error}</p>)}
            </div>)}
          </div>
          <fieldset className="mt-8 border-t border-white/10 pt-5">
            <legend className="heading-ui px-1 text-base font-semibold">Footer light</legend>
            <p className="mb-4 text-xs leading-5 text-white/45">The same pointer-following effects from the original editor, now in V2.</p>
            <div className="grid gap-3">
              {([{ value: "soul", label: "White soul", description: "Soft, warm-white light following the pointer." }, { value: "red-light", label: "Red light", description: "A vivid red glow following the pointer." }] as const).map((effect) => <label key={effect.value} className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-4 ${draft.footerEffect === effect.value ? "border-[#ff6049]/60 bg-[#ff3b1f]/5" : "border-white/10"}`}>
                <input type="radio" name="footerEffectPreview" value={effect.value} checked={draft.footerEffect === effect.value} onChange={() => change({ ...draft, footerEffect: effect.value })} className="accent-[#ff6049]" />
                <span className={`h-6 w-6 shrink-0 rounded-full ${effect.value === "soul" ? "bg-[#fff4cd] shadow-[0_0_18px_#fff4cd55]" : "bg-[#ff3b1f] shadow-[0_0_18px_#ff3b1f77]"}`} aria-hidden="true" />
                <span><span className="block text-sm font-semibold">{effect.label}</span><span className="mt-1 block text-xs leading-5 text-white/45">{effect.description}</span></span>
              </label>)}
            </div>
          </fieldset>
        </fieldset>
      </div>
      <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/15 bg-[#111113]/95 p-4 shadow-xl backdrop-blur-xl">
        <div role="status" aria-live="polite" className="text-sm text-white/70"><p>{dirty ? "Appearance has unsaved changes" : "Appearance matches the saved settings"}</p>{state.message && <p className={`mt-1 text-xs ${state.status === "saved" ? "text-emerald-200" : "text-amber-200"}`}>{state.message}</p>}</div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          {state.status === "conflict" && <button type="button" onClick={() => confirmDiscard(() => window.location.reload())} className="min-h-11 rounded-xl border border-amber-200/30 px-4 text-xs text-amber-200">Reload saved settings</button>}
          <button type="button" disabled={pending || !dirty} onClick={() => { setDraft(saved); clearDirty(); }} className="min-h-11 flex-1 rounded-xl border border-white/15 px-3 text-xs disabled:opacity-35 sm:flex-none">Discard changes</button>
          <button type="submit" disabled={blocked || pending || !dirty || state.status === "conflict"} className="min-h-11 flex-1 rounded-xl bg-white px-3 text-xs font-semibold text-black disabled:opacity-35 sm:flex-none">{pending ? "Saving…" : "Save appearance"}</button>
        </div>
      </div>
    </form>
  );
}
