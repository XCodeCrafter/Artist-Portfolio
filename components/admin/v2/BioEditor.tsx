"use client";

import Link from "next/link";
import {
  cloneElement,
  useActionState,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type RefObject,
} from "react";
import {
  FaArrowDown,
  FaArrowUp,
  FaCheck,
  FaChevronLeft,
  FaDesktop,
  FaExclamationTriangle,
  FaExternalLinkAlt,
  FaEye,
  FaEyeSlash,
  FaMobileAlt,
  FaPlus,
  FaSlidersH,
  FaSpinner,
  FaTrashAlt,
  FaTimes,
} from "react-icons/fa";
import { saveBioSectionV2 } from "@/app/admin/v2/pages/bio/actions";
import MediaAssetPicker from "@/components/admin/MediaAssetPicker";
import useUnsavedChangesGuard from "@/components/admin/useUnsavedChangesGuard";
import BioPreviewFrame, {
  type BioPreviewDevice,
} from "@/components/admin/v2/BioPreviewFrame";
import {
  BIO_EDITOR_SECTIONS,
  INITIAL_BIO_SAVE_STATE,
  getBioSectionPayload,
  getBioSectionVersions,
  getBioCreditMoveTarget,
  getDirtyBioSections,
  isBioSectionDirty,
  moveBioEditorItem,
  parseBioBiographyDraft,
  parseBioCreditsDraft,
  parseBioHeroDraft,
  parseBioResumeDraft,
  parseBioSectionSubmission,
  type BioCreditEditorItem,
  type BioEditorDraft,
  type BioEditorSection,
  type BioEditorSnapshot,
  type BioEditorVersions,
  type BioGalleryEditorItem,
  type BioHeroDraft,
  type BioParagraphEditorItem,
  type BioSaveState,
} from "@/lib/admin/bio-editor";
import type { MediaAsset } from "@/lib/admin/media";

type BioEditorProps = {
  snapshot: BioEditorSnapshot;
  assets: MediaAsset[];
  disabled: boolean;
  migrationRequired: boolean;
  loadError?: string;
  mediaLoadError?: string;
};

type FieldErrors = Record<string, string[]>;

const panelClass =
  "rounded-[24px] border border-white/9 bg-[#0f0f11]/94 shadow-[0_22px_80px_rgba(0,0,0,0.3)]";
const inputClass =
  "mt-2 min-h-11 w-full rounded-2xl border border-white/10 bg-black/28 px-3.5 py-2.5 text-sm text-white outline-none transition placeholder:text-white/24 focus:border-white/34 focus:bg-black/38 disabled:cursor-not-allowed disabled:opacity-45";
const labelClass =
  "text-[10px] font-semibold uppercase tracking-[0.17em] text-white/42";

const SECTION_META: Record<
  BioEditorSection,
  { label: string; shortLabel: string; description: string }
> = {
  hero: {
    label: "Hero",
    shortLabel: "Hero",
    description: "Opening title, button, and background media",
  },
  biography: {
    label: "Biography",
    shortLabel: "Biography",
    description: "Introduction, rotating portraits, and the long-form story",
  },
  resume: {
    label: "Resume",
    shortLabel: "Resume",
    description: "Casting profile, representation, skills, and resume link",
  },
  credits: {
    label: "Credits",
    shortLabel: "Credits",
    description: "Selected film, television, theatre, and other work",
  },
};

const CREDIT_TYPES = [
  "film",
  "television",
  "theatre",
  "commercial",
  "voiceover",
  "training",
  "other",
] as const;

const CREDIT_TYPE_LABELS: Record<(typeof CREDIT_TYPES)[number], string> = {
  film: "Film",
  television: "Television",
  theatre: "Theatre",
  commercial: "Commercial",
  voiceover: "Voiceover",
  training: "Training",
  other: "Other",
};

function issueMap(error: {
  issues: Array<{ path: PropertyKey[]; message: string }>;
}): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".") || "form";
    errors[key] = [...(errors[key] || []), issue.message];
  }
  return errors;
}

function validateSection(
  draft: BioEditorDraft,
  section: BioEditorSection
): { ok: boolean; errors: FieldErrors } {
  const payload = getBioSectionPayload(draft, section);
  const parsed =
    section === "hero"
      ? parseBioHeroDraft(payload)
      : section === "biography"
        ? parseBioBiographyDraft(payload)
        : section === "resume"
          ? parseBioResumeDraft(payload)
          : parseBioCreditsDraft(payload);
  return parsed.success
    ? { ok: true, errors: {} }
    : { ok: false, errors: issueMap(parsed.error) };
}

function mergeErrors(...sources: FieldErrors[]) {
  const merged: FieldErrors = {};
  for (const source of sources) {
    for (const [key, messages] of Object.entries(source)) {
      merged[key] = [...(merged[key] || []), ...messages];
    }
  }
  return merged;
}

function fieldMessage(errors: FieldErrors, path: string) {
  return errors[path]?.join(" ") || "";
}

function applyCanonicalSection(
  current: BioEditorDraft,
  section: BioEditorSection,
  value: unknown
): BioEditorDraft | null {
  const parsed =
    section === "hero"
      ? parseBioHeroDraft(value)
      : section === "biography"
        ? parseBioBiographyDraft(value)
        : section === "resume"
          ? parseBioResumeDraft(value)
          : parseBioCreditsDraft(value);
  if (!parsed.success) return null;
  return { ...current, [section]: parsed.data } as BioEditorDraft;
}

function applySavedVersions(
  current: BioEditorVersions,
  section: BioEditorSection,
  value: unknown
) {
  return { ...current, [section]: value } as BioEditorVersions;
}

function createDraftId(prefix: "portrait" | "paragraph" | "credit") {
  return `${prefix}:${crypto.randomUUID()}`;
}

function createEmptyPortrait(): BioGalleryEditorItem {
  return {
    id: createDraftId("portrait"),
    src: "",
    alt: "",
    isPublished: true,
  };
}

function createEmptyParagraph(index: number): BioParagraphEditorItem {
  return {
    id: createDraftId("paragraph"),
    body: "",
    revealDelay: Math.min(5_000, 140 + index * 60),
    isPublished: true,
  };
}

function createEmptyCredit(): BioCreditEditorItem {
  return {
    id: createDraftId("credit"),
    creditType: "film",
    title: "",
    role: "",
    production: "",
    director: "",
    year: "",
    href: "",
    isPublished: true,
  };
}

function Field({
  children,
  error,
  label,
  required = false,
}: {
  children: ReactElement<{
    id?: string;
    required?: boolean;
    "aria-describedby"?: string;
    "aria-invalid"?: boolean;
  }>;
  error?: string;
  label: string;
  required?: boolean;
}) {
  const generatedId = useId();
  const controlId = children.props.id || generatedId;
  const errorId = `${controlId}-error`;
  const describedBy = [
    children.props["aria-describedby"],
    error ? errorId : undefined,
  ]
    .filter(Boolean)
    .join(" ") || undefined;
  const control = cloneElement(children, {
    id: controlId,
    required: children.props.required || required,
    "aria-describedby": describedBy,
    "aria-invalid": error ? true : undefined,
  });

  return (
    <label className="block" htmlFor={controlId}>
      <span className={labelClass}>
        {label}
        {required ? <span className="sr-only"> (required)</span> : null}
      </span>
      {control}
      {error ? (
        <span
          className="mt-2 block text-xs leading-5 text-red-200"
          id={errorId}
          role="alert"
        >
          {error}
        </span>
      ) : null}
    </label>
  );
}

function MoveButtons({
  downDisabled,
  label,
  onDown,
  onUp,
  upDisabled,
}: {
  downDisabled: boolean;
  label: string;
  onDown: () => void;
  onUp: () => void;
  upDisabled: boolean;
}) {
  const buttonClass =
    "grid h-10 w-10 place-items-center rounded-xl border border-white/10 text-white/48 outline-none transition hover:border-white/24 hover:bg-white/8 hover:text-white focus-visible:ring-2 focus-visible:ring-white/55 disabled:cursor-not-allowed disabled:opacity-20";
  return (
    <div className="flex items-center gap-2">
      <button
        aria-label={`Move ${label} up`}
        className={buttonClass}
        disabled={upDisabled}
        onClick={onUp}
        type="button"
      >
        <FaArrowUp />
      </button>
      <button
        aria-label={`Move ${label} down`}
        className={buttonClass}
        disabled={downDisabled}
        onClick={onDown}
        type="button"
      >
        <FaArrowDown />
      </button>
    </div>
  );
}

function VisibilityToggle({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-2xl border border-white/9 bg-black/22 px-3.5 py-2.5">
      <input
        checked={checked}
        className="h-4 w-4 accent-[#ff3b1f]"
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
      <span className="inline-flex items-center gap-2 text-xs font-semibold text-white/68">
        {checked ? <FaEye /> : <FaEyeSlash />}
        {checked ? `${label} is visible` : `${label} is hidden`}
      </span>
    </label>
  );
}

type InspectorProps = {
  assets: MediaAsset[];
  draft: BioEditorDraft;
  errors: FieldErrors;
  instance: "desktop" | "mobile";
  mediaRevision: number;
  savedCreditIds: ReadonlySet<string>;
  savedParagraphIds: ReadonlySet<string>;
  savedPortraitIds: ReadonlySet<string>;
  onHeroChange: (patch: Partial<BioHeroDraft>) => void;
  onBiographyChange: (
    patch: Partial<
      Pick<BioEditorDraft["biography"], "topLabel" | "introText" | "caption">
    >
  ) => void;
  onPortraitChange: (
    index: number,
    patch: Partial<BioGalleryEditorItem>
  ) => void;
  onParagraphChange: (
    index: number,
    patch: Partial<BioParagraphEditorItem>
  ) => void;
  onCreditChange: (index: number, patch: Partial<BioCreditEditorItem>) => void;
  onResumeChange: (patch: Partial<BioEditorDraft["resume"]>) => void;
  onAddPortrait: () => void;
  onAddParagraph: () => void;
  onAddCredit: () => void;
  onMovePortrait: (index: number, direction: -1 | 1) => void;
  onMoveParagraph: (index: number, direction: -1 | 1) => void;
  onMoveCredit: (index: number, direction: -1 | 1) => void;
  onDiscardPortrait: (id: string) => void;
  onDiscardParagraph: (id: string) => void;
  onDiscardCredit: (id: string) => void;
};

function HeroInspector({
  assets,
  draft,
  errors,
  instance,
  mediaRevision,
  onHeroChange,
}: Pick<
  InspectorProps,
  "assets" | "draft" | "errors" | "instance" | "mediaRevision" | "onHeroChange"
>) {
  const hero = draft.hero;
  const advancedErrors = ["ctaHref", "mediaType", "posterSrc"].filter(
    (field) => Boolean(fieldMessage(errors, field))
  );
  const advancedRef = useRef<HTMLDetailsElement | null>(null);

  useEffect(() => {
    if (advancedErrors.length && advancedRef.current) {
      advancedRef.current.open = true;
    }
  }, [advancedErrors.length]);

  return (
    <div className="grid gap-5">
      <Field error={fieldMessage(errors, "title")} label="Main title" required>
        <input
          className={inputClass}
          maxLength={220}
          onChange={(event) => onHeroChange({ title: event.target.value })}
          value={hero.title}
        />
      </Field>
      <Field error={fieldMessage(errors, "subtitle")} label="Subtitle">
        <textarea
          className={`${inputClass} min-h-24 resize-y`}
          maxLength={220}
          onChange={(event) => onHeroChange({ subtitle: event.target.value })}
          value={hero.subtitle}
        />
      </Field>
      <Field error={fieldMessage(errors, "ctaLabel")} label="Button label">
        <input
          className={inputClass}
          maxLength={220}
          onChange={(event) => onHeroChange({ ctaLabel: event.target.value })}
          value={hero.ctaLabel}
        />
      </Field>
      <div>
        <MediaAssetPicker
          assets={assets}
          defaultMediaType={hero.mediaType}
          defaultValue={hero.backgroundSrc}
          error={fieldMessage(errors, "backgroundSrc")}
          key={`${instance}-bio-hero-${mediaRevision}`}
          kind="media"
          label="Hero background"
          mediaType={hero.mediaType}
          name={`${instance}-bio-hero-background`}
          onValueChange={(value, asset) =>
            onHeroChange({
              backgroundSrc: value,
              ...(asset?.mediaType === "image" || asset?.mediaType === "video"
                ? { mediaType: asset.mediaType }
                : {}),
            })
          }
          required
          value={hero.backgroundSrc}
        />
      </div>
      <details
        className="rounded-2xl border border-white/9 bg-black/22 p-4"
        ref={advancedRef}
      >
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.16em] text-white/58">
          <span className="inline-flex items-center gap-2">
            Advanced hero settings
            {advancedErrors.length ? (
              <span className="rounded-full bg-red-300/12 px-2 py-1 text-[9px] text-red-100">
                {advancedErrors.length} {advancedErrors.length === 1 ? "issue" : "issues"}
              </span>
            ) : null}
          </span>
        </summary>
        <div className="mt-5 grid gap-5">
          <Field error={fieldMessage(errors, "ctaHref")} label="Button destination">
            <input
              className={inputClass}
              maxLength={2048}
              onChange={(event) => onHeroChange({ ctaHref: event.target.value })}
              placeholder="#bio"
              value={hero.ctaHref}
            />
          </Field>
          <Field error={fieldMessage(errors, "mediaType")} label="Media type">
            <select
              className={inputClass}
              onChange={(event) =>
                onHeroChange({ mediaType: event.target.value as "image" | "video" })
              }
              value={hero.mediaType}
            >
              <option value="image">Image</option>
              <option value="video">Video</option>
            </select>
          </Field>
          <MediaAssetPicker
            assets={assets}
            defaultValue={hero.posterSrc}
            error={fieldMessage(errors, "posterSrc")}
            key={`${instance}-bio-hero-poster-${mediaRevision}`}
            kind="image"
            label="Video poster (optional)"
            name={`${instance}-bio-hero-poster`}
            onValueChange={(value) => onHeroChange({ posterSrc: value })}
            showPreview={Boolean(hero.posterSrc)}
            value={hero.posterSrc}
          />
        </div>
      </details>
    </div>
  );
}

function CollectionHeader({
  count,
  label,
  limit,
  onAdd,
}: {
  count: number;
  label: string;
  limit: number;
  onAdd: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className={labelClass}>{label}</p>
        <p className="mt-1 text-xs text-white/35">{count} items</p>
      </div>
      <button
        aria-label={`Add ${label}`}
        className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-white px-3 text-xs font-semibold text-black transition hover:bg-[#ff3b1f] hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
        disabled={count >= limit}
        onClick={onAdd}
        title={count >= limit ? `${label} limit reached` : undefined}
        type="button"
      >
        <FaPlus /> Add
      </button>
    </div>
  );
}

function BiographyInspector(props: InspectorProps) {
  const biography = props.draft.biography;
  return (
    <div className="grid gap-5">
      <div className="grid gap-4 rounded-[20px] border border-white/9 bg-black/22 p-4">
        <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-[#ff715b]">
          Introduction
        </p>
        <Field error={fieldMessage(props.errors, "topLabel")} label="Top label">
          <input
            className={inputClass}
            maxLength={220}
            onChange={(event) => props.onBiographyChange({ topLabel: event.target.value })}
            value={biography.topLabel}
          />
        </Field>
        <Field error={fieldMessage(props.errors, "caption")} label="Side caption">
          <input
            className={inputClass}
            maxLength={220}
            onChange={(event) => props.onBiographyChange({ caption: event.target.value })}
            value={biography.caption}
          />
        </Field>
        <Field error={fieldMessage(props.errors, "introText")} label="Intro text">
          <textarea
            className={`${inputClass} min-h-28 resize-y`}
            maxLength={6_000}
            onChange={(event) => props.onBiographyChange({ introText: event.target.value })}
            value={biography.introText}
          />
        </Field>
      </div>

      <section className="rounded-[20px] border border-white/9 bg-black/22 p-4">
        <CollectionHeader
          count={biography.galleryImages.length}
          label="Rotating portraits"
          limit={32}
          onAdd={props.onAddPortrait}
        />
        <div className="mt-4 grid gap-4">
          {biography.galleryImages.map((item, index) => (
            <section className="rounded-2xl border border-white/9 bg-black/25 p-4" key={item.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-white/32">
                    Portrait {String(index + 1).padStart(2, "0")}
                  </p>
                  <p className="mt-1 truncate text-sm font-semibold text-white/70">
                    {item.alt || "Untitled portrait"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <MoveButtons
                    downDisabled={index === biography.galleryImages.length - 1}
                    label={`portrait ${index + 1}: ${item.alt || "untitled"}`}
                    onDown={() => props.onMovePortrait(index, 1)}
                    onUp={() => props.onMovePortrait(index, -1)}
                    upDisabled={index === 0}
                  />
                  {!props.savedPortraitIds.has(item.id) ? (
                    <button
                      aria-label={`Discard portrait ${index + 1}: ${item.alt || "untitled"}`}
                      className="grid h-10 w-10 place-items-center rounded-xl border border-red-200/12 text-red-100/48 transition hover:bg-red-300/10 hover:text-red-100"
                      onClick={() => props.onDiscardPortrait(item.id)}
                      type="button"
                    >
                      <FaTrashAlt />
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="mt-4 grid gap-4">
                <VisibilityToggle
                  checked={item.isPublished}
                  label={`Portrait ${index + 1}: ${item.alt || "untitled"}`}
                  onChange={(isPublished) => props.onPortraitChange(index, { isPublished })}
                />
                <MediaAssetPicker
                  assets={props.assets}
                  defaultValue={item.src}
                  error={fieldMessage(props.errors, `galleryImages.${index}.src`)}
                  key={`${props.instance}-bio-portrait-${item.id}-${props.mediaRevision}`}
                  kind="image"
                  label={`Portrait ${index + 1} image: ${item.alt || "untitled"}`}
                  name={`${props.instance}-bio-portrait-${index}`}
                  onValueChange={(src) => props.onPortraitChange(index, { src })}
                  required
                  value={item.src}
                />
                <Field error={fieldMessage(props.errors, `galleryImages.${index}.alt`)} label="Alternative text">
                  <input
                    className={inputClass}
                    maxLength={220}
                    onChange={(event) => props.onPortraitChange(index, { alt: event.target.value })}
                    value={item.alt}
                  />
                </Field>
              </div>
            </section>
          ))}
          {!biography.galleryImages.length ? (
            <p className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-center text-xs text-white/38">
              No portraits yet. Add one when you are ready.
            </p>
          ) : null}
        </div>
      </section>

      <section className="rounded-[20px] border border-white/9 bg-black/22 p-4">
        <CollectionHeader
          count={biography.paragraphs.length}
          label="Biography paragraphs"
          limit={50}
          onAdd={props.onAddParagraph}
        />
        <div className="mt-4 grid gap-4">
          {biography.paragraphs.map((item, index) => (
            <section className="rounded-2xl border border-white/9 bg-black/25 p-4" key={item.id}>
              <div className="flex items-start justify-between gap-3">
                <p className="pt-2 text-[9px] font-semibold uppercase tracking-[0.18em] text-white/32">
                  Paragraph {String(index + 1).padStart(2, "0")}
                </p>
                <div className="flex items-center gap-2">
                  <MoveButtons
                    downDisabled={index === biography.paragraphs.length - 1}
                    label={`paragraph ${index + 1}`}
                    onDown={() => props.onMoveParagraph(index, 1)}
                    onUp={() => props.onMoveParagraph(index, -1)}
                    upDisabled={index === 0}
                  />
                  {!props.savedParagraphIds.has(item.id) ? (
                    <button
                      aria-label={`Discard new paragraph ${index + 1}`}
                      className="grid h-10 w-10 place-items-center rounded-xl border border-red-200/12 text-red-100/48 transition hover:bg-red-300/10 hover:text-red-100"
                      onClick={() => props.onDiscardParagraph(item.id)}
                      type="button"
                    >
                      <FaTrashAlt />
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="mt-4 grid gap-4">
                <VisibilityToggle
                  checked={item.isPublished}
                  label={`Paragraph ${index + 1}`}
                  onChange={(isPublished) => props.onParagraphChange(index, { isPublished })}
                />
                <Field
                  error={fieldMessage(props.errors, `paragraphs.${index}.body`)}
                  label="Paragraph text"
                  required
                >
                  <textarea
                    className={`${inputClass} min-h-36 resize-y`}
                    maxLength={6_000}
                    onChange={(event) => props.onParagraphChange(index, { body: event.target.value })}
                    value={item.body}
                  />
                </Field>
              </div>
            </section>
          ))}
          {!biography.paragraphs.length ? (
            <p className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-center text-xs text-white/38">
              No biography paragraphs yet.
            </p>
          ) : null}
        </div>
      </section>

      <p className="rounded-2xl border border-white/8 bg-white/[0.025] px-4 py-3 text-xs leading-5 text-white/38">
        Saved items stay recoverable: switch them to hidden instead of deleting them.
      </p>
    </div>
  );
}

function ResumeInspector({
  draft,
  errors,
  onResumeChange,
}: Pick<InspectorProps, "draft" | "errors" | "onResumeChange">) {
  const resume = draft.resume;
  const shortFields: Array<[keyof typeof resume, string]> = [
    ["headline", "Headline"],
    ["location", "Location"],
    ["playingAge", "Playing age"],
    ["height", "Height"],
    ["eyes", "Eyes"],
    ["hair", "Hair"],
    ["representation", "Representation"],
  ];
  return (
    <div className="grid gap-5">
      {shortFields.map(([key, label]) => (
        <Field error={fieldMessage(errors, key)} key={key} label={label}>
          <input
            className={inputClass}
            maxLength={220}
            onChange={(event) => onResumeChange({ [key]: event.target.value })}
            value={resume[key]}
          />
        </Field>
      ))}
      <Field error={fieldMessage(errors, "languages")} label="Languages">
        <textarea
          className={`${inputClass} min-h-24 resize-y`}
          maxLength={1_000}
          onChange={(event) => onResumeChange({ languages: event.target.value })}
          placeholder="English, Czech, Slovak"
          value={resume.languages}
        />
      </Field>
      <Field error={fieldMessage(errors, "skills")} label="Skills">
        <textarea
          className={`${inputClass} min-h-24 resize-y`}
          maxLength={1_000}
          onChange={(event) => onResumeChange({ skills: event.target.value })}
          placeholder="Improvisation, movement, stage combat"
          value={resume.skills}
        />
      </Field>
      <Field error={fieldMessage(errors, "summary")} label="Profile summary">
        <textarea
          className={`${inputClass} min-h-36 resize-y`}
          maxLength={6_000}
          onChange={(event) => onResumeChange({ summary: event.target.value })}
          value={resume.summary}
        />
      </Field>
      <Field error={fieldMessage(errors, "resumeUrl")} label="Resume URL">
        <input
          className={inputClass}
          inputMode="url"
          maxLength={2048}
          onChange={(event) => onResumeChange({ resumeUrl: event.target.value })}
          placeholder="https://.../resume.pdf"
          value={resume.resumeUrl}
        />
      </Field>
      <p className="rounded-2xl border border-white/8 bg-white/[0.025] px-4 py-3 text-xs leading-5 text-white/38">
        PDF uploads will move into the Media workspace later. For now, paste a secure public resume link.
      </p>
    </div>
  );
}

function CreditsInspector(props: InspectorProps) {
  const items = props.draft.credits.items;
  return (
    <div className="grid gap-4">
      <div className="rounded-2xl border border-white/8 bg-white/[0.025] p-3.5">
        <CollectionHeader count={items.length} label="Selected work" limit={100} onAdd={props.onAddCredit} />
        <p className="mt-3 text-xs leading-5 text-white/38">
          Hide a saved credit to keep it recoverable. Only a new unsaved draft can be discarded.
        </p>
      </div>
      {items.map((item, index) => (
        <section className="rounded-[20px] border border-white/9 bg-black/22 p-4" key={item.id}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[#ff715b]">
                Credit {String(index + 1).padStart(2, "0")}
              </p>
              <p className="mt-1 truncate text-sm font-semibold text-white/78">
                {item.title || "Untitled credit"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <MoveButtons
                downDisabled={getBioCreditMoveTarget(items, index, 1) < 0}
                label={`credit ${index + 1}: ${item.title || "untitled"}`}
                onDown={() => props.onMoveCredit(index, 1)}
                onUp={() => props.onMoveCredit(index, -1)}
                upDisabled={getBioCreditMoveTarget(items, index, -1) < 0}
              />
              {!props.savedCreditIds.has(item.id) ? (
                <button
                  aria-label={`Discard credit ${index + 1}: ${item.title || "untitled"}`}
                  className="grid h-10 w-10 place-items-center rounded-xl border border-red-200/12 text-red-100/48 transition hover:bg-red-300/10 hover:text-red-100"
                  onClick={() => props.onDiscardCredit(item.id)}
                  type="button"
                >
                  <FaTrashAlt />
                </button>
              ) : null}
            </div>
          </div>
          <div className="mt-4 grid gap-4">
            <VisibilityToggle
              checked={item.isPublished}
              label={`Credit ${index + 1}: ${item.title || "untitled"}`}
              onChange={(isPublished) => props.onCreditChange(index, { isPublished })}
            />
            <Field error={fieldMessage(props.errors, `items.${index}.creditType`)} label="Type">
              <select
                className={inputClass}
                onChange={(event) =>
                  props.onCreditChange(index, {
                    creditType: event.target.value as BioCreditEditorItem["creditType"],
                  })
                }
                value={item.creditType}
              >
                {CREDIT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {CREDIT_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              error={fieldMessage(props.errors, `items.${index}.title`)}
              label="Title"
              required
            >
              <input
                className={inputClass}
                maxLength={220}
                onChange={(event) => props.onCreditChange(index, { title: event.target.value })}
                value={item.title}
              />
            </Field>
            <Field error={fieldMessage(props.errors, `items.${index}.role`)} label="Role">
              <input
                className={inputClass}
                maxLength={220}
                onChange={(event) => props.onCreditChange(index, { role: event.target.value })}
                value={item.role}
              />
            </Field>
            <Field error={fieldMessage(props.errors, `items.${index}.production`)} label="Production">
              <input
                className={inputClass}
                maxLength={220}
                onChange={(event) => props.onCreditChange(index, { production: event.target.value })}
                value={item.production}
              />
            </Field>
            <Field error={fieldMessage(props.errors, `items.${index}.director`)} label="Director">
              <input
                className={inputClass}
                maxLength={220}
                onChange={(event) => props.onCreditChange(index, { director: event.target.value })}
                value={item.director}
              />
            </Field>
            <Field error={fieldMessage(props.errors, `items.${index}.year`)} label="Year">
              <input
                className={inputClass}
                maxLength={220}
                onChange={(event) => props.onCreditChange(index, { year: event.target.value })}
                value={item.year}
              />
            </Field>
            <Field error={fieldMessage(props.errors, `items.${index}.href`)} label="Project link (optional)">
              <input
                className={inputClass}
                inputMode="url"
                maxLength={2048}
                onChange={(event) => props.onCreditChange(index, { href: event.target.value })}
                value={item.href}
              />
            </Field>
          </div>
        </section>
      ))}
      {!items.length ? (
        <p className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-xs text-white/38">
          No credits yet. Add the first project when it is ready.
        </p>
      ) : null}
    </div>
  );
}

function InspectorFields({ activeSection, ...props }: InspectorProps & { activeSection: BioEditorSection }) {
  if (activeSection === "hero") return <HeroInspector {...props} />;
  if (activeSection === "biography") return <BiographyInspector {...props} />;
  if (activeSection === "resume") return <ResumeInspector {...props} />;
  return <CreditsInspector {...props} />;
}

function InspectorHeader({
  activeSection,
  closeButtonRef,
  onClose,
}: {
  activeSection: BioEditorSection;
  closeButtonRef?: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}) {
  const meta = SECTION_META[activeSection];
  return (
    <div className="flex items-start justify-between gap-3 border-b border-white/8 p-4 sm:p-5">
      <div className="min-w-0">
        <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-[#ff715b]">Active inspector</p>
        <h2 className="heading-ui mt-2 text-lg font-semibold text-white">{meta.label}</h2>
        <p className="mt-1 text-xs leading-5 text-white/38">{meta.description}</p>
      </div>
      <button
        aria-label="Close inspector"
        className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/9 text-white/48 outline-none transition hover:bg-white hover:text-black focus-visible:ring-2 focus-visible:ring-white/60"
        onClick={onClose}
        ref={closeButtonRef}
        type="button"
      >
        <FaTimes />
      </button>
    </div>
  );
}

function formatSavedAt(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

export default function BioEditor({
  snapshot,
  assets,
  disabled,
  migrationRequired,
  loadError,
  mediaLoadError,
}: BioEditorProps) {
  const [baseline, setBaseline] = useState(snapshot.draft);
  const [draft, setDraft] = useState(snapshot.draft);
  const [versions, setVersions] = useState(snapshot.versions);
  const baselineRef = useRef(baseline);
  const draftRef = useRef(draft);
  const versionsRef = useRef(versions);
  const [activeSection, setActiveSection] = useState<BioEditorSection>("hero");
  const [device, setDevice] = useState<BioPreviewDevice>("desktop");
  const [previewFocusRequestId, setPreviewFocusRequestId] = useState(0);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState(false);
  const [dismissedEventId, setDismissedEventId] = useState("");
  const [mediaRevision, setMediaRevision] = useState(0);
  const [savingSection, setSavingSection] = useState<BioEditorSection | null>(null);
  const [lastSaved, setLastSaved] = useState<{ section: BioEditorSection; savedAt: string } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const mobileDialogRef = useRef<HTMLDialogElement | null>(null);
  const desktopInspectorCloseRef = useRef<HTMLButtonElement | null>(null);
  const desktopInspectorOpenRef = useRef<HTMLButtonElement | null>(null);
  const desktopFocusTargetRef = useRef<"open" | "close" | null>(null);
  const handledEventIdsRef = useRef(new Set<string>());
  const latestSaveEventIdRef = useRef("");
  const { clearDirty, confirmDiscard, hasUnsavedChanges, markDirty } =
    useUnsavedChangesGuard("You have unsaved Bio page changes. Leave and discard them?", true);

  const applySaveResult = useCallback(
    (result: BioSaveState) => {
      if (!result.eventId || handledEventIdsRef.current.has(result.eventId)) return;
      handledEventIdsRef.current.add(result.eventId);
      if (handledEventIdsRef.current.size > 64) handledEventIdsRef.current = new Set([result.eventId]);
      if (result.status !== "saved" || !result.section || !result.canonicalSection || !result.versions) return;
      const confirmed = parseBioSectionSubmission(
        result.section,
        result.canonicalSection,
        result.versions,
        { requireExactCollectionVersions: true }
      );
      if (!confirmed.success) return;
      const nextDraft = applyCanonicalSection(draftRef.current, result.section, confirmed.data.payload);
      if (!nextDraft) return;
      const nextBaseline = { ...baselineRef.current, [result.section]: nextDraft[result.section] } as BioEditorDraft;
      const nextVersions = applySavedVersions(versionsRef.current, result.section, confirmed.data.versions);
      draftRef.current = nextDraft;
      baselineRef.current = nextBaseline;
      versionsRef.current = nextVersions;
      setDraft(nextDraft);
      setBaseline(nextBaseline);
      setVersions(nextVersions);
      setMediaRevision((value) => value + 1);
      setLastSaved({ section: result.section, savedAt: result.savedAt || new Date().toISOString() });
      setAnnouncement(`${SECTION_META[result.section].label} saved.`);
      if (!getDirtyBioSections(nextBaseline, nextDraft).length) clearDirty();
    },
    [clearDirty]
  );

  const clientAction = useCallback(
    async (previousState: BioSaveState, formData: FormData) => {
      const submittedSection = formData.get("section");
      const section = BIO_EDITOR_SECTIONS.find(
        (candidate) => candidate === submittedSection
      );
      setSavingSection(section || null);
      try {
        const result = await saveBioSectionV2(previousState, formData);
        latestSaveEventIdRef.current = result.eventId;
        applySaveResult(result);
        return result;
      } finally {
        setSavingSection(null);
      }
    },
    [applySaveResult]
  );
  const [saveState, formAction, pending] = useActionState(clientAction, INITIAL_BIO_SAVE_STATE);

  useEffect(() => {
    if (window.matchMedia("(min-width: 1280px)").matches) return;
    const frame = window.requestAnimationFrame(() => setDevice("mobile"));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const target = desktopFocusTargetRef.current;
    if (!target) return;
    desktopFocusTargetRef.current = null;
    const frame = window.requestAnimationFrame(() => {
      if (target === "open") desktopInspectorOpenRef.current?.focus();
      else desktopInspectorCloseRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [inspectorOpen]);

  useEffect(() => {
    const dialog = mobileDialogRef.current;
    if (!dialog) return;
    if (mobileInspectorOpen && !dialog.open) dialog.showModal();
    else if (!mobileInspectorOpen && dialog.open) dialog.close();
  }, [mobileInspectorOpen]);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1280px)");
    const closeAtDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) setMobileInspectorOpen(false);
    };
    desktop.addEventListener("change", closeAtDesktop);
    return () => desktop.removeEventListener("change", closeAtDesktop);
  }, []);

  const dirtySections = useMemo(() => getDirtyBioSections(baseline, draft), [baseline, draft]);
  const savedPortraitIds = useMemo(
    () => new Set(Object.keys(versions.biography.galleryItems)),
    [versions.biography.galleryItems]
  );
  const savedParagraphIds = useMemo(
    () => new Set(Object.keys(versions.biography.paragraphItems)),
    [versions.biography.paragraphItems]
  );
  const savedCreditIds = useMemo(
    () => new Set(Object.keys(versions.credits.items)),
    [versions.credits.items]
  );
  const activeDirty = isBioSectionDirty(baseline, draft, activeSection);
  const validation = useMemo(() => validateSection(draft, activeSection), [draft, activeSection]);
  const responseVisible = Boolean(saveState.eventId) && saveState.eventId !== dismissedEventId;
  const responseErrors =
    responseVisible && saveState.section === activeSection ? saveState.fieldErrors || {} : {};
  const errors = mergeErrors(validation.errors, responseErrors);
  const editorDisabled = disabled || pending;
  const canSave = !editorDisabled && activeDirty && validation.ok;
  const statusIsError = responseVisible && !["idle", "saved"].includes(saveState.status);

  function commitDraft(next: BioEditorDraft) {
    if (next === draftRef.current) return;
    draftRef.current = next;
    setDraft(next);
    if (latestSaveEventIdRef.current) setDismissedEventId(latestSaveEventIdRef.current);
    if (getDirtyBioSections(baselineRef.current, next).length) markDirty();
    else clearDirty();
  }

  function updateHero(patch: Partial<BioHeroDraft>) {
    commitDraft({ ...draftRef.current, hero: { ...draftRef.current.hero, ...patch } });
  }

  function updateBiography(
    patch: Partial<Pick<BioEditorDraft["biography"], "topLabel" | "introText" | "caption">>
  ) {
    commitDraft({
      ...draftRef.current,
      biography: { ...draftRef.current.biography, ...patch },
    });
  }

  function updatePortrait(index: number, patch: Partial<BioGalleryEditorItem>) {
    const galleryImages = draftRef.current.biography.galleryImages.map((item, itemIndex) =>
      itemIndex === index ? { ...item, ...patch } : item
    );
    commitDraft({
      ...draftRef.current,
      biography: { ...draftRef.current.biography, galleryImages },
    });
  }

  function updateParagraph(index: number, patch: Partial<BioParagraphEditorItem>) {
    const paragraphs = draftRef.current.biography.paragraphs.map((item, itemIndex) =>
      itemIndex === index ? { ...item, ...patch } : item
    );
    commitDraft({
      ...draftRef.current,
      biography: { ...draftRef.current.biography, paragraphs },
    });
  }

  function updateResume(patch: Partial<BioEditorDraft["resume"]>) {
    commitDraft({ ...draftRef.current, resume: { ...draftRef.current.resume, ...patch } });
  }

  function updateCredit(index: number, patch: Partial<BioCreditEditorItem>) {
    const items = draftRef.current.credits.items.map((item, itemIndex) =>
      itemIndex === index ? { ...item, ...patch } : item
    );
    commitDraft({ ...draftRef.current, credits: { items } });
  }

  function updateBiographyItems(
    key: "galleryImages" | "paragraphs",
    items: BioGalleryEditorItem[] | BioParagraphEditorItem[]
  ) {
    commitDraft({
      ...draftRef.current,
      biography: { ...draftRef.current.biography, [key]: items },
    } as BioEditorDraft);
  }

  function addPortrait() {
    updateBiographyItems("galleryImages", [
      ...draftRef.current.biography.galleryImages,
      createEmptyPortrait(),
    ]);
    setAnnouncement("New portrait draft added. Choose an image, then save Biography.");
  }

  function addParagraph() {
    updateBiographyItems("paragraphs", [
      ...draftRef.current.biography.paragraphs,
      createEmptyParagraph(draftRef.current.biography.paragraphs.length),
    ]);
    setAnnouncement("New paragraph draft added. Write it, then save Biography.");
  }

  function addCredit() {
    commitDraft({
      ...draftRef.current,
      credits: { items: [...draftRef.current.credits.items, createEmptyCredit()] },
    });
    setAnnouncement("New credit draft added. Complete it, then save Credits.");
  }

  function discardNew(kind: "portrait" | "paragraph" | "credit", id: string) {
    if (kind === "portrait") {
      if (id in versionsRef.current.biography.galleryItems) return;
      updateBiographyItems(
        "galleryImages",
        draftRef.current.biography.galleryImages.filter((item) => item.id !== id)
      );
    } else if (kind === "paragraph") {
      if (id in versionsRef.current.biography.paragraphItems) return;
      updateBiographyItems(
        "paragraphs",
        draftRef.current.biography.paragraphs.filter((item) => item.id !== id)
      );
    } else {
      if (id in versionsRef.current.credits.items) return;
      commitDraft({
        ...draftRef.current,
        credits: { items: draftRef.current.credits.items.filter((item) => item.id !== id) },
      });
    }
    setAnnouncement("Unsaved draft discarded.");
  }

  function moveBiographyItem(kind: "galleryImages" | "paragraphs", index: number, direction: -1 | 1) {
    if (kind === "galleryImages") {
      const items = moveBioEditorItem(
        draftRef.current.biography.galleryImages,
        index,
        index + direction
      );
      if (items === draftRef.current.biography.galleryImages) return;
      updateBiographyItems("galleryImages", items);
    } else {
      const items = moveBioEditorItem(
        draftRef.current.biography.paragraphs,
        index,
        index + direction
      );
      if (items === draftRef.current.biography.paragraphs) return;
      updateBiographyItems("paragraphs", items);
    }
    setAnnouncement(`${kind === "galleryImages" ? "Portrait" : "Paragraph"} moved. Save Biography to publish the order.`);
  }

  function moveCredit(index: number, direction: -1 | 1) {
    const target = getBioCreditMoveTarget(
      draftRef.current.credits.items,
      index,
      direction
    );
    if (target < 0) return;
    const items = moveBioEditorItem(
      draftRef.current.credits.items,
      index,
      target
    );
    if (items === draftRef.current.credits.items) return;
    commitDraft({ ...draftRef.current, credits: { items } });
    setAnnouncement("Credit moved. Save Credits to publish the order.");
  }

  const selectSection = useCallback(
    (section: BioEditorSection) => {
      if (pending || savingSection) return;
      setActiveSection(section);
      setPreviewFocusRequestId((value) => value + 1);
      if (window.matchMedia("(min-width: 1280px)").matches) setInspectorOpen(true);
      else setMobileInspectorOpen(true);
    },
    [pending, savingSection]
  );

  function discardActiveSection() {
    const next = {
      ...draftRef.current,
      [activeSection]: baselineRef.current[activeSection],
    } as BioEditorDraft;
    commitDraft(next);
    setMediaRevision((value) => value + 1);
    setAnnouncement(`${SECTION_META[activeSection].label} restored to its last saved version.`);
  }

  function reloadAfterConflict() {
    if (hasUnsavedChanges && !confirmDiscard()) return;
    window.location.reload();
  }

  function closeDesktopInspector() {
    desktopFocusTargetRef.current = "open";
    setInspectorOpen(false);
  }

  function openDesktopInspector() {
    desktopFocusTargetRef.current = "close";
    setInspectorOpen(true);
  }

  const inspectorProps: Omit<InspectorProps, "instance"> = {
    assets,
    draft,
    errors,
    mediaRevision,
    savedCreditIds,
    savedParagraphIds,
    savedPortraitIds,
    onHeroChange: updateHero,
    onBiographyChange: updateBiography,
    onPortraitChange: updatePortrait,
    onParagraphChange: updateParagraph,
    onCreditChange: updateCredit,
    onResumeChange: updateResume,
    onAddPortrait: addPortrait,
    onAddParagraph: addParagraph,
    onAddCredit: addCredit,
    onMovePortrait: (index, direction) => moveBiographyItem("galleryImages", index, direction),
    onMoveParagraph: (index, direction) => moveBiographyItem("paragraphs", index, direction),
    onMoveCredit: moveCredit,
    onDiscardPortrait: (id) => discardNew("portrait", id),
    onDiscardParagraph: (id) => discardNew("paragraph", id),
    onDiscardCredit: (id) => discardNew("credit", id),
  };

  const statusLabel = pending
    ? `Saving ${SECTION_META[savingSection || activeSection].label}...`
    : disabled
      ? "Editor is read-only"
      : !validation.ok
        ? `${SECTION_META[activeSection].label} needs attention`
        : activeDirty
          ? `${SECTION_META[activeSection].label} has unsaved changes`
          : dirtySections.length
            ? `${dirtySections.length} other ${dirtySections.length === 1 ? "section has" : "sections have"} unsaved changes`
            : "All Bio changes are saved";
  const statusDetail = migrationRequired
    ? "Database migration 0030 is required before this editor can publish."
    : loadError
      ? loadError
      : mediaLoadError
        ? mediaLoadError
        : !validation.ok
          ? `${Object.values(validation.errors).flat().length} highlighted ${Object.values(validation.errors).flat().length === 1 ? "field needs" : "fields need"} attention before saving.`
        : activeDirty
          ? "Only the active section will be published."
          : dirtySections.length
            ? `Return to ${dirtySections.map((section) => SECTION_META[section].label).join(", ")} to review and save ${dirtySections.length === 1 ? "it" : "them"}.`
          : lastSaved
            ? `${SECTION_META[lastSaved.section].label} last saved at ${formatSavedAt(lastSaved.savedAt)}.`
            : "Select a section in the preview or use the tabs above.";

  return (
    <form action={formAction} data-unsaved-guard-bypass="true">
      <input name="section" readOnly type="hidden" value={activeSection} />
      <input name="payload" readOnly type="hidden" value={JSON.stringify(getBioSectionPayload(draft, activeSection))} />
      <input name="versions" readOnly type="hidden" value={JSON.stringify(getBioSectionVersions(versions, activeSection))} />

      {migrationRequired || loadError || mediaLoadError ? (
        <section className="mb-4 grid gap-2" aria-label="Bio editor notices">
          {migrationRequired ? (
            <p className="rounded-[18px] border border-amber-300/16 bg-amber-400/[0.055] px-4 py-3 text-sm leading-6 text-amber-100/72">
              The Bio layout is available for review, but migration 0030 must be applied before saving.
            </p>
          ) : null}
          {loadError ? (
            <p className="rounded-[18px] border border-red-300/16 bg-red-400/[0.055] px-4 py-3 text-sm leading-6 text-red-100/72">{loadError}</p>
          ) : null}
          {mediaLoadError ? (
            <p className="rounded-[18px] border border-amber-300/16 bg-amber-400/[0.055] px-4 py-3 text-sm leading-6 text-amber-100/72">{mediaLoadError}</p>
          ) : null}
        </section>
      ) : null}

      <section className={`${panelClass} mb-4 overflow-hidden`}>
        <div className="flex flex-col gap-3 border-b border-white/8 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-white/30">Page preview</p>
            <p className="mt-1 text-xs text-white/46">Click a section to edit it. Changes appear here before saving.</p>
          </div>
          <div className="flex items-center justify-between gap-2">
            <div className="flex rounded-xl border border-white/9 bg-black/28 p-1">
              <button
                aria-pressed={device === "desktop"}
                className={`grid h-10 w-10 place-items-center rounded-lg text-xs transition ${device === "desktop" ? "bg-white text-black" : "text-white/42 hover:text-white"}`}
                onClick={() => setDevice("desktop")}
                title="Desktop preview"
                type="button"
              >
                <FaDesktop /><span className="sr-only">Desktop</span>
              </button>
              <button
                aria-pressed={device === "mobile"}
                className={`grid h-10 w-10 place-items-center rounded-lg text-xs transition ${device === "mobile" ? "bg-white text-black" : "text-white/42 hover:text-white"}`}
                onClick={() => setDevice("mobile")}
                title="Mobile preview"
                type="button"
              >
                <FaMobileAlt /><span className="sr-only">Mobile</span>
              </button>
            </div>
            <button
              className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-white/10 px-3.5 text-xs font-semibold text-white/64 transition hover:bg-white hover:text-black xl:hidden"
              onClick={() => setMobileInspectorOpen(true)}
              type="button"
            >
              <FaSlidersH /> Inspector
            </button>
          </div>
        </div>
        <div
          aria-label="Bio editor sections"
          className="flex gap-2 overflow-x-auto p-3 sm:p-4"
          role="group"
        >
          {BIO_EDITOR_SECTIONS.map((section) => {
            const active = activeSection === section;
            const dirty = dirtySections.includes(section);
            return (
              <button
                aria-pressed={active}
                className={`relative min-h-10 shrink-0 rounded-xl border px-3 text-xs font-semibold transition ${active ? "border-[#ff583f]/32 bg-[#ff3b1f] text-white" : "border-white/9 bg-white/[0.035] text-white/48 hover:border-white/20 hover:text-white"}`}
                disabled={pending}
                key={section}
                onClick={() => selectSection(section)}
                type="button"
              >
                {SECTION_META[section].shortLabel}
                {dirty ? <span aria-label="Unsaved changes" className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-[#0f0f11] bg-amber-300" /> : null}
              </button>
            );
          })}
        </div>
      </section>

      <div className={`grid gap-4 xl:items-start ${inspectorOpen ? "xl:grid-cols-[minmax(0,1fr)_minmax(350px,440px)]" : "xl:grid-cols-[minmax(0,1fr)_64px]"}`}>
        <BioPreviewFrame
          device={device}
          draft={draft}
          focusRequestId={previewFocusRequestId}
          footer={snapshot.footer}
          hasResumeDetails={snapshot.hasResumeDetails}
          isLive={!disabled && !loadError && !migrationRequired}
          onSelectSection={selectSection}
          selectedSection={activeSection}
        />
        <aside aria-label="Bio section inspector" className={`${panelClass} sticky top-4 hidden max-h-[calc(100vh-2rem)] overflow-hidden xl:block`}>
          {inspectorOpen ? (
            <>
              <InspectorHeader
                activeSection={activeSection}
                closeButtonRef={desktopInspectorCloseRef}
                onClose={closeDesktopInspector}
              />
              <fieldset className="admin-scrollbar-none max-h-[calc(100vh-11rem)] overflow-y-auto p-4 sm:p-5" disabled={editorDisabled}>
                <InspectorFields {...inspectorProps} activeSection={activeSection} instance="desktop" />
                {activeDirty ? (
                  <button className="mt-5 min-h-11 w-full rounded-xl border border-white/10 text-xs font-semibold text-white/52 transition hover:bg-white hover:text-black" onClick={discardActiveSection} type="button">
                    Discard changes in {SECTION_META[activeSection].label}
                  </button>
                ) : null}
              </fieldset>
            </>
          ) : (
            <button aria-label="Open inspector" className="flex min-h-[260px] w-full flex-col items-center justify-center gap-3 text-white/48 outline-none transition hover:bg-white/[0.055] hover:text-white focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-inset" onClick={openDesktopInspector} ref={desktopInspectorOpenRef} type="button">
              <FaChevronLeft />
              <span className="[writing-mode:vertical-rl] text-[10px] font-semibold uppercase tracking-[0.2em]">Open inspector</span>
            </button>
          )}
        </aside>
      </div>

      <dialog
        aria-label="Bio section inspector"
        className="m-0 ml-auto h-dvh max-h-none w-[min(94vw,440px)] max-w-none bg-transparent p-0 text-white backdrop:bg-black/76 xl:hidden"
        onCancel={(event) => { event.preventDefault(); setMobileInspectorOpen(false); }}
        onClick={(event) => { if (event.target === event.currentTarget) setMobileInspectorOpen(false); }}
        onClose={() => setMobileInspectorOpen(false)}
        ref={mobileDialogRef}
      >
        <div className="flex h-dvh flex-col border-l border-white/10 bg-[#0d0d0f] shadow-[-30px_0_100px_rgba(0,0,0,0.55)]">
          <InspectorHeader activeSection={activeSection} onClose={() => setMobileInspectorOpen(false)} />
          {mobileInspectorOpen ? (
            <>
              <fieldset className="admin-scrollbar-none min-h-0 flex-1 overflow-y-auto p-4 sm:p-5" disabled={editorDisabled}>
                <InspectorFields {...inspectorProps} activeSection={activeSection} instance="mobile" />
                {activeDirty ? (
                  <button className="mt-5 min-h-11 w-full rounded-xl border border-white/10 text-xs font-semibold text-white/52 transition hover:bg-white hover:text-black" onClick={discardActiveSection} type="button">
                    Discard changes in {SECTION_META[activeSection].label}
                  </button>
                ) : null}
              </fieldset>
              <div className="shrink-0 border-t border-white/9 bg-[#111113] p-4 shadow-[0_-18px_50px_rgba(0,0,0,0.34)]">
                <p className="text-xs font-semibold text-white/72">{statusLabel}</p>
                <p aria-live={statusIsError ? "assertive" : "polite"} className={`mt-1 text-[11px] leading-5 ${statusIsError ? "text-red-100/72" : "text-white/38"}`}>
                  {responseVisible && saveState.status !== "idle" ? saveState.message : statusDetail}
                </p>
                <button aria-busy={pending} className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white px-5 text-sm font-semibold text-black transition hover:bg-[#ff3b1f] hover:text-white disabled:cursor-not-allowed disabled:opacity-40" disabled={!canSave} type="submit">
                  {pending ? <FaSpinner className="animate-spin" /> : <FaCheck />}
                  {pending ? `Saving ${SECTION_META[savingSection || activeSection].label}...` : `Save ${SECTION_META[activeSection].label}`}
                </button>
              </div>
            </>
          ) : null}
        </div>
      </dialog>

      {responseVisible && saveState.status !== "idle" ? (
        <section className={`mt-4 rounded-[18px] border px-4 py-3 text-sm leading-6 ${saveState.status === "saved" ? "border-emerald-300/16 bg-emerald-400/[0.06] text-emerald-50/76" : "border-red-300/16 bg-red-400/[0.06] text-red-50/76"}`} role={statusIsError ? "alert" : "status"}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2">
              {saveState.status === "saved" ? <FaCheck /> : <FaExclamationTriangle />}
              {saveState.message}
            </span>
            {saveState.status === "conflict" ? (
              <button className="min-h-10 rounded-xl border border-red-100/16 px-3 text-xs font-semibold transition hover:bg-white hover:text-black" onClick={reloadAfterConflict} type="button">Reload saved Bio page</button>
            ) : null}
          </div>
          {fieldMessage(responseErrors, "form") ? <p className="mt-2 text-xs">{fieldMessage(responseErrors, "form")}</p> : null}
        </section>
      ) : null}

      <div className="sticky bottom-3 z-20 mt-4 rounded-[20px] border border-white/10 bg-[#101012]/95 p-3 shadow-[0_18px_70px_rgba(0,0,0,0.52)] backdrop-blur-2xl sm:flex sm:items-center sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-2 text-xs font-semibold text-white/66">
            <span className={`h-2 w-2 rounded-full ${pending ? "bg-sky-300" : disabled || statusIsError || !validation.ok || hasUnsavedChanges ? "bg-amber-300" : "bg-emerald-300"}`} />
            {statusLabel}
          </p>
          <p className="mt-1 text-[10px] leading-4 text-white/34">{statusDetail}</p>
          <p aria-live="polite" className="sr-only">{announcement}</p>
          <Link className="mt-2 inline-flex items-center gap-2 text-[10px] font-semibold text-white/42 underline decoration-white/18 underline-offset-4 transition hover:text-white" href="/admin/content#bio-intro">
            Open classic Bio editor <FaExternalLinkAlt />
          </Link>
        </div>
        <div className="mt-3 flex items-center gap-2 sm:mt-0">
          {!inspectorOpen ? (
            <button aria-label="Open inspector" className="hidden h-12 items-center gap-2 rounded-2xl border border-white/10 px-4 text-xs font-semibold text-white/56 transition hover:bg-white hover:text-black xl:inline-flex" onClick={openDesktopInspector} type="button">
              <FaChevronLeft /> Inspector
            </button>
          ) : null}
          <button aria-busy={pending} className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-white px-5 text-sm font-semibold text-black transition hover:bg-[#ff3b1f] hover:text-white disabled:cursor-not-allowed disabled:opacity-40 sm:min-w-[190px] sm:flex-none" disabled={!canSave} type="submit">
            {pending ? <FaSpinner className="animate-spin" /> : <FaCheck />}
            {pending ? `Saving ${SECTION_META[savingSection || activeSection].label}...` : `Save ${SECTION_META[activeSection].label}`}
          </button>
        </div>
      </div>
    </form>
  );
}
