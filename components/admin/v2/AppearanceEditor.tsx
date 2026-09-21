"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState, type CSSProperties, type ReactNode, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import GalleryFooter, { type FooterPreviewRegion } from "@/components/GalleryFooter";
import useUnsavedChangesGuard from "@/components/admin/useUnsavedChangesGuard";
import { saveSiteAppearanceV2 } from "@/app/admin/v2/settings/appearance/actions";
import { INITIAL_APPEARANCE_SAVE_STATE, parseAppearanceSubmission, type AppearanceSaveState, type AppearanceEditorDraft } from "@/lib/admin/site-appearance-editor";
import { needsEditorReload, runEditorSave } from "@/lib/admin/editor-save-recovery";
import type { AdminAppearanceData } from "@/lib/admin/site-appearance";
import { DISPLAY_FONT_OPTIONS, BODY_FONT_OPTIONS, UI_FONT_OPTIONS, getFontFamily, getGoogleFontsStylesheetUrl } from "@/lib/content/fonts";
import type { SiteSettings, SocialLink } from "@/lib/content/types";

const fontRoles = [
  { key: "displayFont", label: "Display / headlines", description: "Large titles and the owner’s name.", options: DISPLAY_FONT_OPTIONS },
  { key: "bodyFont", label: "Body / paragraphs", description: "Descriptions, biography and longer reading text.", options: BODY_FONT_OPTIONS },
  { key: "uiFont", label: "UI / navigation", description: "Navigation, buttons and interface headings.", options: UI_FONT_OPTIONS },
] as const;
type Section = "appearance" | "identity" | "footer";
const sections: { id: Section; label: string }[] = [
  { id: "appearance", label: "Fonts & light" },
  { id: "identity", label: "Profile & introduction" },
  { id: "footer", label: "Footer content" },
];
const inputClass = "mt-2 min-h-11 w-full rounded-xl border border-white/15 bg-[#08080a] px-3 py-2 text-sm font-normal outline-none focus:border-white/60";
const buttonClass = "min-h-11 rounded-xl border border-white/15 px-4 text-xs font-semibold text-white/70 disabled:opacity-35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

/** Scaled real rendering, rather than a duplicated approximation of the footer. */
function FooterPreview({ children }: { children: ReactNode }) {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 1200, scale: 0.5, height: 420 });
  useEffect(() => {
    if (!host.current || !canvas.current) return;
    const update = () => {
      if (!host.current || !canvas.current) return;
      const width = window.innerWidth < 768 ? 390 : 1200;
      canvas.current.style.width = `${width}px`;
      const scale = Math.min(1, host.current.clientWidth / width);
      const height = canvas.current.offsetHeight * scale;
      setSize((old) => old.width === width && old.scale === scale && old.height === height ? old : { width, scale, height });
    };
    const observer = new ResizeObserver(update);
    observer.observe(host.current); observer.observe(canvas.current); update();
    return () => observer.disconnect();
  }, []);
  return <div ref={host} className="relative min-w-0 overflow-hidden" style={{ height: size.height }} aria-label="Interactive footer preview">
    <div ref={canvas} style={{ width: size.width, transform: `scale(${size.scale})`, transformOrigin: "top left" }}>{children}</div>
  </div>;
}

export default function AppearanceEditor({ data, socialLinks }: { data: AdminAppearanceData; settings: SiteSettings; socialLinks: SocialLink[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState(data.snapshot.draft);
  const [saved, setSaved] = useState(data.snapshot.draft);
  const [versions, setVersions] = useState(data.snapshot.versions);
  const [section, setSection] = useState<Section>("appearance");
  const [footerRegion, setFooterRegion] = useState<FooterPreviewRegion>("callout");
  const { markDirty, clearDirty, confirmDiscard } = useUnsavedChangesGuard(undefined, true);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const sectionDirty = JSON.stringify(draft[section]) !== JSON.stringify(saved[section]);
  const [state, action, pending] = useActionState(async (previous: AppearanceSaveState, form: FormData) => {
    const submittedSection = form.get("section");
    return runEditorSave(previous, () => saveSiteAppearanceV2(previous, form), (result) => {
      const confirmed = parseAppearanceSubmission(result.section, result.canonicalSection, result.versions);
      // A success for another section is not confirmation of this submission.
      // Keep every draft and the original CAS until an explicit reload.
      if (!confirmed.success || confirmed.data.section !== submittedSection) return false;
      const nextSaved = { ...saved, [confirmed.data.section]: confirmed.data.payload };
      const nextDraft = { ...draft, [confirmed.data.section]: confirmed.data.payload };
      setSaved(nextSaved); setDraft(nextDraft); setVersions(confirmed.data.versions);
      if (JSON.stringify(nextSaved) === JSON.stringify(nextDraft)) clearDirty(); else markDirty();
      router.refresh();
      return true;
    });
  }, INITIAL_APPEARANCE_SAVE_STATE);
  const unavailable = !data.isConfigured || data.migrationRequired || Boolean(data.loadError);
  const footerBlocked = Boolean(data.footerMigrationRequired) && section === "footer";
  const blocked = unavailable || footerBlocked;
  const appearance = draft.appearance;
  function change<Selected extends Section>(selected: Selected, next: AppearanceEditorDraft[Selected]) {
    const nextDraft = { ...draft, [selected]: next };
    setDraft(nextDraft);
    if (JSON.stringify(nextDraft) === JSON.stringify(saved)) clearDirty(); else markDirty();
  }
  const previewStyle = {
    "--font-display": getFontFamily(appearance.displayFont), "--font-body": getFontFamily(appearance.bodyFont),
    "--font-ui": getFontFamily(appearance.uiFont), fontFamily: getFontFamily(appearance.bodyFont),
  } as CSSProperties;
  function textField(selected: "identity" | "footer", key: string, label: string, help?: string, multiline = false) {
    const values = draft[selected] as unknown as Record<string, string>;
    const id = `site-${selected}-${key}`;
    const error = state.section === selected ? state.fieldErrors?.[key]?.join(" ") : undefined;
    const props = { id, value: values[key], className: inputClass, maxLength: key.endsWith("Href") ? 2048 : ["contactBlurb", "description"].includes(key) ? 1000 : 220,
      "aria-invalid": Boolean(error), "aria-describedby": error ? `${id}-error` : help ? `${id}-help` : undefined,
      onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => change(selected, { ...draft[selected], [key]: event.target.value }) };
    return <div key={key}><label htmlFor={id} className="text-sm font-semibold text-white/80">{label}</label>
      {help && <p id={`${id}-help`} className="mt-1 text-xs leading-5 text-white/45">{help}</p>}
      {multiline ? <textarea {...props} rows={3} /> : <input {...props} />}
      {error && <p id={`${id}-error`} className="mt-2 text-xs text-amber-200">{error}</p>}
    </div>;
  }
  const sectionLabel = sections.find((item) => item.id === section)!.label;

  return <form action={action} className="grid min-w-0 gap-4" data-unsaved-guard-bypass="true">
    <link rel="stylesheet" href={getGoogleFontsStylesheetUrl([appearance.displayFont, appearance.bodyFont, appearance.uiFont])} />
    <input type="hidden" name="section" value={section} />
    <input type="hidden" name="payload" value={JSON.stringify(draft[section])} />
    <input type="hidden" name="versions" value={JSON.stringify(versions)} />
    {unavailable && <p role="alert" className="rounded-2xl border border-amber-200/20 p-4 text-sm text-amber-200">{data.loadError || "The settings database is unavailable. The preview is read-only."}</p>}
    {data.footerMigrationRequired && <p role="status" className="rounded-2xl border border-amber-200/20 p-4 text-sm text-amber-200">Footer content requires migration 0039. Fonts, light and profile text still work. Apply 0039_footer_content_editor.sql and its verification check, then reload.</p>}
    <nav aria-label="Site-wide editor sections" className="flex flex-wrap gap-2">
      {sections.map((item) => <button type="button" key={item.id} disabled={pending} aria-pressed={section === item.id}
        onClick={() => setSection(item.id)} className={`${buttonClass} ${section === item.id ? "border-[#ff6049]/70 bg-[#ff3b1f]/10 text-white" : ""}`}>
        {item.label}{JSON.stringify(draft[item.id]) !== JSON.stringify(saved[item.id]) ? " •" : ""}
      </button>)}
    </nav>
    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(300px,0.7fr)]">
      <section aria-labelledby="appearance-preview-title" className="min-w-0 self-start overflow-hidden rounded-[26px] border border-white/10 bg-[#08080a]" style={previewStyle}>
        <div className="border-b border-white/10 px-5 py-4 text-[10px] uppercase tracking-[0.2em] text-white/40" id="appearance-preview-title">Live preview · click a region to edit · unpublished until saved</div>
        {section === "appearance" && <div className="p-6 sm:p-9">
          <div className="flex flex-wrap gap-5 text-xs uppercase tracking-[0.12em] text-white/55" style={{ fontFamily: "var(--font-ui)" }} aria-label="Navigation typography sample"><span className="text-[#ff6049]">Home</span><span>Bio</span><span>Music</span><span>Contact</span></div>
          <p className="mt-8 text-xs uppercase tracking-[0.2em] text-[#ff806c]">{draft.identity.tagline}</p>
          <h2 className="mt-4 break-words text-4xl leading-tight sm:text-6xl" style={{ fontFamily: "var(--font-display)" }}>{draft.name.artistName}</h2>
          <p className="mt-6 max-w-xl text-base leading-8 text-white/65">{draft.identity.description}</p>
          <p className="mt-3 text-sm leading-7 text-white/40">Příběhy, které stojí za pozornost. Žluťoučký kůň · 0123456789.</p>
        </div>}
        <div className="border-t border-white/10 px-5 py-4 text-xs leading-5 text-white/45">The actual portfolio footer, scaled to fit. Click the introduction, invitation or social headings. Links are disabled; the pointer light stays interactive.</div>
        <FooterPreview><GalleryFooter artistName={draft.name.artistName} {...draft.identity} socialLinks={socialLinks} content={draft.footer} footerEffect={appearance.footerEffect} preview
          selectedRegion={section === "identity" ? "identity" : section === "footer" ? footerRegion : undefined}
          onSelectRegion={(region) => { if (pending) return; if (region === "identity") setSection("identity"); else { setFooterRegion(region); setSection("footer"); } }} />
        </FooterPreview>
        {section === "identity" && <div className="border-t border-white/10 p-5"><p className="text-[10px] uppercase tracking-[0.2em] text-white/40">Search / share description preview</p><p className="mt-3 text-lg text-white">{draft.name.artistName}</p><p className="mt-2 text-sm leading-6 text-white/60">{draft.identity.description || "An automatic portfolio description will be used."}</p></div>}
      </section>
      <fieldset disabled={blocked || pending} className="min-w-0 self-start rounded-[26px] border border-white/10 bg-[#101012] p-5 disabled:opacity-50 sm:p-6">
        <legend className="sr-only">{sectionLabel}</legend>
        <p className="text-[10px] uppercase tracking-[0.2em] text-[#ff806c]">Contextual inspector</p>
        <h2 className="heading-ui mt-2 text-xl font-semibold">{sectionLabel}</h2>
        {section === "appearance" ? <>
          <p className="mt-2 text-xs leading-6 text-white/45">Three independent font roles. Decorative code stays monospace.</p>
          <div className="mt-6 grid gap-6">{fontRoles.map((role) => <div key={role.key}>
            <label htmlFor={role.key} className="text-sm font-semibold text-white/80">{role.label}</label>
            <p id={`${role.key}-help`} className="mt-1 text-xs leading-5 text-white/40">{role.description}</p>
            <select id={role.key} aria-describedby={`${role.key}-help`} value={appearance[role.key]} onChange={(event) => change("appearance", { ...appearance, [role.key]: event.target.value } as AppearanceEditorDraft["appearance"])} className={inputClass}>
              {role.options.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
            </select>
            {state.section === "appearance" && state.fieldErrors?.[role.key]?.map((error) => <p key={error} className="mt-2 text-xs text-amber-200">{error}</p>)}
          </div>)}</div>
          <fieldset className="mt-8 border-t border-white/10 pt-5"><legend className="heading-ui px-1 text-base font-semibold">Footer light</legend>
            <div className="grid gap-3">{([{ value: "soul", label: "White soul", description: "Soft, warm-white light following the pointer." }, { value: "red-light", label: "Red light", description: "A vivid red glow following the pointer." }] as const).map((effect) => <label key={effect.value} className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-4 ${appearance.footerEffect === effect.value ? "border-[#ff6049]/60 bg-[#ff3b1f]/5" : "border-white/10"}`}>
              <input type="radio" name="footerEffectPreview" value={effect.value} checked={appearance.footerEffect === effect.value} onChange={() => change("appearance", { ...appearance, footerEffect: effect.value })} className="accent-[#ff6049]" />
              <span className={`h-6 w-6 shrink-0 rounded-full ${effect.value === "soul" ? "bg-[#fff4cd] shadow-[0_0_18px_#fff4cd55]" : "bg-[#ff3b1f] shadow-[0_0_18px_#ff3b1f77]"}`} aria-hidden="true" />
              <span><span className="block text-sm font-semibold">{effect.label}</span><span className="mt-1 block text-xs leading-5 text-white/45">{effect.description}</span></span>
            </label>)}</div>
          </fieldset>
        </> : section === "identity" ? <div className="mt-6 grid gap-5">
          <p className="text-xs leading-6 text-white/45">Shared across the footer, Contact and search previews. Your wording is kept, whether this portfolio is music, acting or both.</p>
          {textField("identity", "tagline", "Short profile tagline", "Shown in the top strip of every portfolio footer.")}
          {textField("identity", "location", "Based in", "Shared with the Contact page.")}
          {textField("identity", "contactBlurb", "Collaboration introduction", "Shown below the footer invitation and on Contact.", true)}
          {textField("identity", "description", "Site description", "Used for HOME search results and shared-link previews; other page descriptions remain automatic.", true)}
          <Link href="/admin/v2/navigation" className="text-xs underline underline-offset-4">Owner name and platform links → Navbar</Link>
        </div> : <div className="mt-6 grid gap-5">
          <div className="flex flex-wrap gap-2">{([{ id: "callout", label: "Invitation & buttons" }, { id: "social", label: "Social headings" }] as const).map((region) => <button key={region.id} type="button" className={buttonClass} aria-pressed={footerRegion === region.id} onClick={() => setFooterRegion(region.id)}>{region.label}</button>)}</div>
          {footerRegion === "social" ? <>
            {textField("footer", "socialEyebrow", "Small social label")}
            {textField("footer", "socialHeading", "Social heading")}
            <Link href="/admin/v2/navigation" className="text-xs underline underline-offset-4">Add or change platform links → Navbar</Link>
          </> : <>
            {textField("footer", "eyebrow", "Small invitation label")}
            {textField("footer", "heading", "Main footer heading")}
            {textField("footer", "primaryLabel", "Primary button label", "Clear both label and destination to hide this button.")}
            {textField("footer", "primaryHref", "Primary button destination", "Example: /booking, /music or https://your-site.com")}
            {textField("footer", "secondaryLabel", "Secondary button label")}
            {textField("footer", "secondaryHref", "Secondary button destination")}
          </>}
        </div>}
      </fieldset>
    </div>
    <div className="sticky bottom-3 z-30 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/15 bg-[#111113]/95 p-4 shadow-xl backdrop-blur-xl">
      <div role="status" aria-live="polite" className="text-sm text-white/70"><p>{sectionDirty ? `${sectionLabel} has unsaved changes` : `${sectionLabel} matches the saved settings`}</p>{dirty && !sectionDirty && <p className="mt-1 text-xs text-amber-200">Another section has unsaved changes.</p>}{state.message && <p className={`mt-1 text-xs ${state.status === "saved" ? "text-emerald-200" : "text-amber-200"}`}>{state.message}</p>}</div>
      <div className="flex w-full flex-wrap gap-2 sm:w-auto">
        {needsEditorReload(state) && <button type="button" onClick={() => confirmDiscard(() => window.location.reload())} className={buttonClass}>Reload saved settings</button>}
        <button type="button" disabled={pending || !sectionDirty} onClick={() => confirmDiscard(() => change(section, saved[section]))} className={buttonClass}>Discard this section</button>
        <button type="submit" disabled={blocked || pending || !sectionDirty || needsEditorReload(state)} className="min-h-11 flex-1 rounded-xl bg-white px-3 text-xs font-semibold text-black disabled:opacity-35 sm:flex-none">{pending ? "Saving…" : section === "appearance" ? "Save appearance" : section === "identity" ? "Save profile & introduction" : "Save footer content"}</button>
      </div>
    </div>
  </form>;
}
