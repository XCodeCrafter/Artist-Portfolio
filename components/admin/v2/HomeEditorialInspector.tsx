"use client";

import { useState } from "react";
import { FaArrowDown, FaArrowUp, FaPlus, FaTrash } from "react-icons/fa";
import MediaAssetPicker from "@/components/admin/MediaAssetPicker";
import PhotoFramingControls from "@/components/admin/v2/PhotoFramingControls";
import type { HomePreviewDevice } from "@/components/admin/v2/HomePreviewFrame";
import type { HomeEditorDraft } from "@/lib/admin/home-editor";
import {
  HOME_PLAYBACK_KINDS, HOME_PRESS_KINDS, MAX_HOME_PRESS_ITEMS,
  type HomeEditorialImage, type HomePressItem, type HomePlayback,
} from "@/lib/admin/home-editorial";
import type { MediaAsset } from "@/lib/admin/media";

const inputClass = "mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-[#161618] px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-white outline-none focus:border-white/40 disabled:opacity-45";
const buttonClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/12 px-3 text-xs font-semibold text-white/70 transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-30";
const boxClass = "grid gap-4 rounded-2xl border border-white/10 bg-black/20 p-4";
type Errors = Record<string, string[]>;
type Props = {
  section: "release" | "work" | "press";
  draft: HomeEditorDraft;
  assets: MediaAsset[];
  errors: Errors;
  instance: string;
  onChange: (next: HomeEditorDraft) => void;
  device: HomePreviewDevice;
  onDeviceChange: (device: HomePreviewDevice) => void;
  pressPage?: boolean;
};
const playbackLabels: Record<HomePlayback["kind"], string> = {
  none: "No player", audio: "Direct audio file", spotify: "Spotify", youtube: "YouTube",
};
const pressLabels: Record<HomePressItem["kind"], string> = {
  review: "Review", interview: "Interview", radio: "Radio", feature: "Feature",
};

function Field({ id, label, value, onChange, path, errors, multiline = false, maxLength = 220, type = "text" }: {
  id: string; label: string; value: string; onChange: (next: string) => void;
  path: string; errors: Errors; multiline?: boolean; maxLength?: number; type?: "text" | "date";
}) {
  const error = errors[path]?.join(" ");
  const attributes = { id, value, maxLength, className: inputClass, "aria-invalid": Boolean(error), "aria-describedby": error ? `${id}-error` : undefined };
  return <label htmlFor={id} className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-white/55">
    {label}
    {multiline ? <textarea {...attributes} rows={4} onChange={event => onChange(event.target.value)} />
      : <input {...attributes} type={type} onChange={event => onChange(event.target.value)} />}
    {error ? <span id={`${id}-error`} className="mt-2 block text-xs normal-case tracking-normal text-red-200">{error}</span> : null}
  </label>;
}

function ImageField({ id, path, label, value, onChange, assets, errors, device, onDeviceChange, saveSection, shape = "landscape" }: {
  id: string; path: string; label: string; value: HomeEditorialImage; onChange: (next: HomeEditorialImage) => void;
  assets: MediaAsset[]; errors: Errors; device: HomePreviewDevice; onDeviceChange: (device: HomePreviewDevice) => void;
  saveSection: string; shape?: "landscape" | "portrait" | "square";
}) {
  const viewport = shape === "portrait" ? { desktop: { width: 260, height: 590 }, mobile: { width: 320, height: 460 } }
    : shape === "square" ? { desktop: { width: 400, height: 400 }, mobile: { width: 300, height: 300 } }
      : { desktop: { width: 1440, height: 800 }, mobile: { width: 390, height: 700 } };
  const framingErrors = Object.entries(errors).filter(([key]) => key === path || key === `${path}.framing` || key.startsWith(`${path}.framing.`)).flatMap(([, messages]) => messages);
  return <div className="grid gap-3">
    <MediaAssetPicker assets={assets} kind="image" label={label} name={`${id}-src`} value={value.src}
      error={errors[`${path}.src`]?.join(" ")}
      onValueChange={(src, asset) => onChange({ ...value, src, framing: src === value.src ? value.framing : null, ...(asset?.alt ? { alt: asset.alt } : {}) })} />
    <PhotoFramingControls value={value.framing} src={value.src} onChange={framing => onChange({ ...value, framing })}
      device={device} onDeviceChange={onDeviceChange} saveSection={saveSection} previewViewport={viewport} />
    {framingErrors.length ? <p className="text-xs leading-5 text-red-200">{framingErrors.join(" ")}</p> : null}
    <Field id={`${id}-alt`} label={`${label} description`} path={`${path}.alt`} errors={errors} value={value.alt}
      maxLength={500} onChange={alt => onChange({ ...value, alt })} />
    {value.src ? <button type="button" className={`${buttonClass} justify-self-start`} onClick={() => onChange({ ...value, src: "", framing: null })}>Clear {label.toLowerCase()}</button> : null}
  </div>;
}

/** Every picture belongs to this exact placement, never to a global Media Library crop. */
export default function HomeEditorialInspector({ section, draft, assets, errors, instance, onChange, device, onDeviceChange, pressPage = false }: Props) {
  const [selectedPressId, setSelectedPressId] = useState("");
  const [removeId, setRemoveId] = useState("");
  const baseId = `${instance}-home-${section}`;
  const value = draft[section];
  const patch = (fields: Record<string, unknown>) => onChange({ ...draft, [section]: { ...value, ...fields } });
  const field = (key: string, label: string, multiline = false, maxLength = 220) => <Field
    key={key} id={`${baseId}-${key}`} label={label} value={String((value as unknown as Record<string, unknown>)[key] ?? "")}
    path={key} errors={errors} multiline={multiline} maxLength={maxLength} onChange={next => patch({ [key]: next })} />;
  const image = (path: string, label: string, value: HomeEditorialImage, onChange: (next: HomeEditorialImage) => void, shape?: "landscape" | "portrait" | "square") => <ImageField
    id={`${baseId}-${path.replaceAll(".", "-")}`} path={path} label={label} value={value} onChange={onChange}
    assets={assets} errors={errors} device={device} onDeviceChange={onDeviceChange} saveSection={section === "release" ? "Latest release" : section === "work" ? "Selected work" : "Press & reviews"} shape={shape} />;

  if (section === "release") return <div className="grid gap-5">
    {field("eyebrow", "Small label")}{field("title", "Heading", true)}{field("subtitle", "Subtitle", false, 500)}{field("body", "Description", true, 2000)}
    <details className={boxClass}><summary className="cursor-pointer text-xs font-semibold text-white/75">Background photo</summary>
      {image("background", "Release background", draft.release.background, background => patch({ background }))}
    </details>
    <section className={boxClass} aria-label="Release details">
      {field("releaseTitle", "Release title")}{field("artist", "Artist")}
      <p className="text-xs leading-5 text-white/45">Add the real release title before showing this section. Nothing is published merely by selecting an audio source.</p>
      {image("cover", "Release cover", draft.release.cover, cover => patch({ cover }), "square")}
      <label htmlFor={`${baseId}-playback-kind`} className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-white/55">Playback source
        <select id={`${baseId}-playback-kind`} className={inputClass} value={draft.release.playback.kind}
          aria-invalid={Boolean(errors.playback)} aria-describedby={errors.playback ? `${baseId}-playback-error` : undefined} onChange={event => {
          const kind = event.target.value;
          if (HOME_PLAYBACK_KINDS.some(item => item === kind)) patch({ playback: { kind, url: kind === draft.release.playback.kind ? draft.release.playback.url : "" } });
        }}>{HOME_PLAYBACK_KINDS.map(kind => <option key={kind} value={kind}>{playbackLabels[kind]}</option>)}</select>
      </label>
      {draft.release.playback.kind !== "none" ? <Field id={`${baseId}-playback-url`} label="Playback URL" value={draft.release.playback.url}
        path="playback.url" errors={errors} maxLength={2048} onChange={url => patch({ playback: { ...draft.release.playback, url } })} /> : null}
      {errors.playback ? <p id={`${baseId}-playback-error`} role="alert" className="text-xs leading-5 text-red-200">{errors.playback.join(" ")}</p> : null}
      <p className="text-xs leading-5 text-white/45">{draft.release.playback.kind === "audio"
        ? "Use a direct HTTPS or local .mp3, .m4a, .ogg or .wav file URL, not a download page. Visitors start playback with Play; the page never autoplays. File availability and playback depend on its host."
        : draft.release.playback.kind === "spotify" ? "Paste an open.spotify.com track, album or playlist link. The visitor opens the Spotify player; playback length and access depend on Spotify."
          : draft.release.playback.kind === "youtube" ? "Paste a YouTube video link. The embedded player loads only after a visitor chooses to open it; YouTube may require another press of Play."
            : "The player stays hidden. You can still add listening links below, then connect playable audio later."}</p>
    </section>
    <section className={boxClass} aria-label="Release buttons">
      <p className="text-xs leading-5 text-white/45">Listening links are separate from the player. Clear a button label to hide that button.</p>
      {field("primaryLabel", "Main button label", false, 100)}{field("primaryHref", "Main button destination", false, 2048)}
      {field("secondaryLabel", "Second button label", false, 100)}{field("secondaryHref", "Second button destination", false, 2048)}
    </section>
    {field("note", "Handwritten note", true, 500)}
  </div>;

  if (section === "work") return <div className="grid gap-5">
    {field("eyebrow", "Small label")}{field("title", "Heading", true)}{field("body", "Introduction", true, 2000)}{field("note", "Handwritten note", true, 500)}
    <details className={boxClass}><summary className="cursor-pointer text-xs font-semibold text-white/75">Atmosphere photo</summary>
      {image("background", "Work background", draft.work.background, background => patch({ background }))}
    </details>
    {draft.work.cards.map((card, index) => {
      const update = (fields: Partial<typeof card>) => patch({ cards: draft.work.cards.map(item => item.id === card.id ? { ...item, ...fields } : item) });
      const move = (direction: -1 | 1) => {
        const target = index + direction;
        if (target < 0 || target >= draft.work.cards.length) return;
        const cards = [...draft.work.cards];
        [cards[index], cards[target]] = [cards[target], cards[index]];
        patch({ cards });
      };
      return <details className={boxClass} key={card.id}>
        <summary className="cursor-pointer text-xs font-semibold text-white/75">{index + 1}. {card.title || card.id}</summary>
        <div className="flex gap-2">
          <button type="button" className={buttonClass} disabled={index === 0} aria-label={`Move ${card.id} card up`} onClick={() => move(-1)}><FaArrowUp /> Up</button>
          <button type="button" className={buttonClass} disabled={index === draft.work.cards.length - 1} aria-label={`Move ${card.id} card down`} onClick={() => move(1)}><FaArrowDown /> Down</button>
        </div>
        {image(`cards.${index}.image`, `${card.id} card photo`, card.image, next => update({ image: next }), "portrait")}
        {([['title', 'Card heading', 220], ['body', 'Card description', 1000], ['href', 'Card destination', 2048]] as const).map(([key, label, maxLength]) => <Field
          key={key} id={`${baseId}-card-${card.id}-${key}`} label={label} value={card[key]} path={`cards.${index}.${key}`}
          errors={errors} multiline={key === "body"} maxLength={maxLength} onChange={next => update({ [key]: next })} />)}
        <label className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-white/55" htmlFor={`${baseId}-card-${card.id}-tone`}>Photo treatment
          <select id={`${baseId}-card-${card.id}-tone`} className={inputClass} value={card.tone} onChange={event => {
            if (event.target.value === "mono" || event.target.value === "red") update({ tone: event.target.value });
          }}><option value="mono">Monochrome</option><option value="red">Red accent</option></select>
        </label>
      </details>;
    })}
  </div>;

  const press = draft.press;
  const selected = press.items.find(item => item.id === selectedPressId) ?? press.items[0];
  const selectedIndex = selected ? press.items.findIndex(item => item.id === selected.id) : -1;
  const updateItem = (fields: Partial<HomePressItem>) => {
    if (!selected) return;
    patch({ items: press.items.map(item => item.id === selected.id ? { ...item, ...fields } : item),
      ...(fields.visible === false && press.featuredId === selected.id ? { featuredId: "" } : {}) });
  };
  const moveItem = (direction: -1 | 1) => {
    const target = selectedIndex + direction;
    if (!selected || target < 0 || target >= press.items.length) return;
    const items = [...press.items];
    [items[selectedIndex], items[target]] = [items[target], items[selectedIndex]];
    setSelectedPressId(selected.id);
    patch({ items });
  };
  return <div className="grid gap-5">
    {field("eyebrow", "Small label")}{field("title", "Heading", true)}{field("body", "Introduction", true, 2000)}{field("buttonLabel", "Browse press button", false, 100)}
    <details className={boxClass}><summary className="cursor-pointer text-xs font-semibold text-white/75">Background photo</summary>
      {image("background", "Press background", press.background, background => patch({ background }))}
    </details>
    <p className="rounded-2xl border border-amber-300/15 bg-amber-300/5 p-4 text-xs leading-5 text-amber-100/75">Use real, attributed quotes only. Hidden content remains in the public website configuration — it is not private. Do not enter confidential drafts here. {pressPage ? "Only visible items appear on the Press page." : "Empty Press stays off the website."}</p>
    <label htmlFor={`${baseId}-featured`} className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-white/55">{pressPage ? "Featured press item" : "Featured item on Home"}
      <select id={`${baseId}-featured`} className={inputClass} value={press.featuredId} aria-invalid={Boolean(errors.featuredId)} aria-describedby={errors.featuredId ? `${baseId}-featured-error` : undefined}
        onChange={event => patch({ featuredId: event.target.value })}>
        <option value="">Automatic — first visible quotation, then first item</option>
        {press.items.filter(item => item.visible).map(item => <option value={item.id} key={item.id}>{item.title || "Untitled item"} · {item.publication || "No publication"}</option>)}
      </select>
    </label>
    {errors.featuredId ? <p id={`${baseId}-featured-error`} className="text-xs text-red-200">{errors.featuredId.join(" ")}</p> : null}
    <section className={boxClass} aria-label="Press collection">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-xs font-semibold text-white/75">Press items · {press.items.length}/{MAX_HOME_PRESS_ITEMS}</h3>
        <button type="button" className={buttonClass} disabled={press.items.length >= MAX_HOME_PRESS_ITEMS} onClick={() => {
          if (press.items.length >= MAX_HOME_PRESS_ITEMS) return;
          const item: HomePressItem = { id: crypto.randomUUID(), kind: "review", title: "", quote: "", publication: "", date: "", href: "", image: { src: "", alt: "", framing: null }, visible: false };
          patch({ items: [...press.items, item] }); setSelectedPressId(item.id); setRemoveId("");
        }}><FaPlus /> Add press item</button>
      </div>
      {errors.items ? <p role="alert" className="text-xs text-red-200">{errors.items.join(" ")}</p> : null}
      {selected ? <>
        <label htmlFor={`${baseId}-item-selector`} className="text-xs text-white/55">Edit press item
          <select id={`${baseId}-item-selector`} className={inputClass} value={selected.id} onChange={event => { setSelectedPressId(event.target.value); setRemoveId(""); }}>
            {press.items.map((item, index) => <option key={item.id} value={item.id}>{index + 1}. {item.title || "Untitled item"}{item.visible ? "" : " · hidden"}</option>)}
          </select>
        </label>
        <div className="flex gap-2">
          <button type="button" className={buttonClass} disabled={selectedIndex === 0} aria-label="Move selected press item up" onClick={() => moveItem(-1)}><FaArrowUp /> Up</button>
          <button type="button" className={buttonClass} disabled={selectedIndex === press.items.length - 1} aria-label="Move selected press item down" onClick={() => moveItem(1)}><FaArrowDown /> Down</button>
        </div>
        <label htmlFor={`${baseId}-item-kind`} className="text-xs text-white/55">Item type
          <select id={`${baseId}-item-kind`} className={inputClass} value={selected.kind} onChange={event => {
            const kind = event.target.value;
            if (HOME_PRESS_KINDS.some(item => item === kind)) updateItem({ kind: kind as HomePressItem["kind"] });
          }}>{HOME_PRESS_KINDS.map(kind => <option key={kind} value={kind}>{pressLabels[kind]}</option>)}</select>
        </label>
        {([['title', 'Article or item title', 220], ['publication', 'Publication / radio station', 220], ['quote', 'Quotation or excerpt', 1500], ['date', 'Publication date (optional)', 10], ['href', 'Original article URL (optional)', 2048]] as const).map(([key, label, maxLength]) => <Field
          key={key} id={`${baseId}-item-${key}`} label={label} value={selected[key]} path={`items.${selectedIndex}.${key}`}
          errors={errors} multiline={key === "quote"} type={key === "date" ? "date" : "text"} maxLength={maxLength} onChange={next => updateItem({ [key]: next })} />)}
        {errors[`items.${selectedIndex}`] ? <p role="alert" className="text-xs text-red-200">{errors[`items.${selectedIndex}`].join(" ")}</p> : null}
        {image(`items.${selectedIndex}.image`, "Clipping or press photo", selected.image, next => updateItem({ image: next }), "portrait")}
        <p className="text-xs leading-5 text-white/45">A clipping is optional. The quotation stays readable as text; visitors can enlarge the original image and follow its source link.</p>
        <label htmlFor={`${baseId}-item-visible`} className="flex min-h-11 items-center gap-3 text-sm text-white/80">
          <input id={`${baseId}-item-visible`} type="checkbox" checked={selected.visible} className="size-4 accent-[#ff3b1f]" onChange={event => updateItem({ visible: event.target.checked })} /> Show this item in Press
        </label>
        {removeId === selected.id ? <div className="grid gap-3 rounded-xl border border-red-300/20 bg-red-300/5 p-3">
          <p className="text-xs leading-5 text-red-100/80">Remove this item from {pressPage ? "Press" : "Home"}? Removal is published only when you save Press &amp; reviews. Its Media Library file is not deleted.</p>
          <div className="flex flex-wrap gap-2"><button type="button" className={buttonClass} onClick={() => {
            patch({ items: press.items.filter(item => item.id !== selected.id), ...(press.featuredId === selected.id ? { featuredId: "" } : {}) });
            setRemoveId(""); setSelectedPressId("");
          }}>Confirm removal</button><button type="button" className={buttonClass} onClick={() => setRemoveId("")}>Keep item</button></div>
        </div> : <button type="button" className={`${buttonClass} justify-self-start`} onClick={() => setRemoveId(selected.id)}><FaTrash /> Remove press item</button>}
      </> : <p className="text-xs leading-5 text-white/45">No press items yet. Add a real quotation, article, interview or radio feature when ready.</p>}
    </section>
  </div>;
}
