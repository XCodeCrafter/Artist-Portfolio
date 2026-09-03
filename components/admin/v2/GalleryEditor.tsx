"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useActionState,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
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
import { saveGallerySectionV2 } from "@/app/admin/v2/pages/gallery/actions";
import MediaAssetPicker from "@/components/admin/MediaAssetPicker";
import useUnsavedChangesGuard from "@/components/admin/useUnsavedChangesGuard";
import GalleryPreviewFrame, {
  type GalleryPreviewDevice,
} from "@/components/admin/v2/GalleryPreviewFrame";
import {
  GALLERY_EDITOR_SECTIONS,
  INITIAL_GALLERY_SAVE_STATE,
  getDirtyGallerySections,
  getGallerySectionPayload,
  getGallerySectionVersions,
  isGallerySectionDirty,
  moveGalleryEditorItem,
  parseGalleryFramesDraft,
  parseGalleryHeroDraft,
  parseGalleryIntroductionDraft,
  parseGallerySectionSubmission,
  type GalleryEditorDraft,
  type GalleryEditorSection,
  type GalleryEditorSnapshot,
  type GalleryEditorVersions,
  type GalleryFrameEditorItem,
  type GalleryHeroDraft,
  type GallerySaveState,
} from "@/lib/admin/gallery-editor";
import type { MediaAsset } from "@/lib/admin/media";

type FieldErrors = Record<string, string[]>;

type GalleryEditorProps = {
  assets: MediaAsset[];
  disabled: boolean;
  loadError?: string;
  mediaLoadError?: string;
  migrationRequired: boolean;
  snapshot: GalleryEditorSnapshot;
};

const panelClass =
  "rounded-[24px] border border-white/9 bg-[#0f0f11]/94 shadow-[0_22px_80px_rgba(0,0,0,0.3)]";
const inputClass =
  "mt-2 min-h-11 w-full rounded-2xl border border-white/10 bg-black/28 px-3.5 py-2.5 text-sm text-white outline-none transition placeholder:text-white/24 focus:border-white/34 focus:bg-black/38 disabled:cursor-not-allowed disabled:opacity-45";
const labelClass =
  "text-[10px] font-semibold uppercase tracking-[0.17em] text-white/42";

const SECTION_META: Record<
  GalleryEditorSection,
  { label: string; description: string }
> = {
  hero: {
    label: "Hero",
    description: "Opening title, button, and background media",
  },
  introduction: {
    label: "Introduction",
    description: "The eyebrow and headline above the image archive",
  },
  frames: {
    label: "Frames",
    description: "Images, captions, categories, visibility, and visitor order",
  },
};

function issueMap(error: {
  issues: Array<{ path: PropertyKey[]; message: string }>;
}) {
  const errors: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".") || "form";
    errors[key] = [...(errors[key] || []), issue.message];
  }
  return errors;
}

function validateSection(draft: GalleryEditorDraft, section: GalleryEditorSection) {
  const value = draft[section];
  const parsed =
    section === "hero"
      ? parseGalleryHeroDraft(value)
      : section === "introduction"
        ? parseGalleryIntroductionDraft(value)
        : parseGalleryFramesDraft(value);
  return parsed.success
    ? { ok: true, errors: {} as FieldErrors }
    : { ok: false, errors: issueMap(parsed.error) };
}

function fieldMessage(errors: FieldErrors, path: string) {
  return errors[path]?.join(" ") || "";
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

function applyCanonicalSection(
  draft: GalleryEditorDraft,
  section: GalleryEditorSection,
  value: unknown
): GalleryEditorDraft | null {
  const parsed =
    section === "hero"
      ? parseGalleryHeroDraft(value)
      : section === "introduction"
        ? parseGalleryIntroductionDraft(value)
        : parseGalleryFramesDraft(value);
  if (!parsed.success) return null;
  return { ...draft, [section]: parsed.data } as GalleryEditorDraft;
}

function applySavedVersions(
  versions: GalleryEditorVersions,
  section: GalleryEditorSection,
  value: unknown
) {
  return { ...versions, [section]: value } as GalleryEditorVersions;
}

function Field({
  children,
  error,
  label,
  required = false,
}: {
  children: ReactNode;
  error?: string;
  label: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className={labelClass}>
        {label}
        {required ? <span className="ml-1 text-[#ff715b]">*</span> : null}
      </span>
      {children}
      {error ? (
        <span className="mt-2 block text-xs leading-5 text-red-200" role="alert">
          {error}
        </span>
      ) : null}
    </label>
  );
}

function InspectorHeader({
  activeSection,
  closeButtonRef,
  onClose,
}: {
  activeSection: GalleryEditorSection;
  closeButtonRef?: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}) {
  const meta = SECTION_META[activeSection];
  return (
    <header className="flex items-start justify-between gap-4 border-b border-white/9 p-4 sm:p-5">
      <div>
        <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-[#ff715b]">
          Page section
        </p>
        <h2 className="heading-ui mt-2 text-xl font-semibold text-white">
          {meta.label}
        </h2>
        <p className="mt-1 text-xs leading-5 text-white/36">{meta.description}</p>
      </div>
      <button
        aria-label="Close inspector"
        className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/9 text-white/48 transition hover:bg-white hover:text-black"
        onClick={onClose}
        ref={closeButtonRef}
        type="button"
      >
        <FaTimes />
      </button>
    </header>
  );
}

type InspectorProps = {
  activeSection: GalleryEditorSection;
  assets: MediaAsset[];
  draft: GalleryEditorDraft;
  errors: FieldErrors;
  instance: "desktop" | "mobile";
  mediaRevision: number;
  savedFrameIds: ReadonlySet<string>;
  onAddFrame: () => void;
  onDiscardFrame: (id: string) => void;
  onFrameChange: (index: number, patch: Partial<GalleryFrameEditorItem>) => void;
  onHeroChange: (patch: Partial<GalleryHeroDraft>) => void;
  onIntroductionChange: (
    patch: Partial<GalleryEditorDraft["introduction"]>
  ) => void;
  onMoveFrame: (index: number, direction: -1 | 1) => void;
};

function HeroInspector(props: InspectorProps) {
  const hero = props.draft.hero;
  return (
    <div className="grid gap-5">
      <Field error={fieldMessage(props.errors, "title")} label="Main title" required>
        <input
          className={inputClass}
          maxLength={220}
          onChange={(event) => props.onHeroChange({ title: event.target.value })}
          value={hero.title}
        />
      </Field>
      <Field error={fieldMessage(props.errors, "subtitle")} label="Subtitle">
        <textarea
          className={`${inputClass} min-h-24 resize-y`}
          maxLength={220}
          onChange={(event) => props.onHeroChange({ subtitle: event.target.value })}
          value={hero.subtitle}
        />
      </Field>
      <MediaAssetPicker
        assets={props.assets}
        defaultMediaType={hero.mediaType}
        error={fieldMessage(props.errors, "backgroundSrc")}
        key={`${props.instance}-gallery-hero-${props.mediaRevision}`}
        kind="media"
        label="Hero background"
        mediaType={hero.mediaType}
        name={`${props.instance}-gallery-hero-background`}
        onMediaTypeChange={(mediaType) => props.onHeroChange({ mediaType })}
        onValueChange={(backgroundSrc, asset) =>
          props.onHeroChange({
            backgroundSrc,
            ...(asset?.mediaType === "image" || asset?.mediaType === "video"
              ? { mediaType: asset.mediaType }
              : {}),
          })
        }
        required
        value={hero.backgroundSrc}
      />
      <section className="grid gap-4 rounded-[20px] border border-white/9 bg-black/22 p-4">
        <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-white/34">
          Hero button
        </p>
        <p className="text-xs leading-5 text-white/38">
          Fill both fields to show the button, or leave both empty.
        </p>
        <Field error={fieldMessage(props.errors, "ctaLabel")} label="Button label">
          <input
            className={inputClass}
            maxLength={220}
            onChange={(event) => props.onHeroChange({ ctaLabel: event.target.value })}
            value={hero.ctaLabel}
          />
        </Field>
        <Field error={fieldMessage(props.errors, "ctaHref")} label="Button destination">
          <input
            className={inputClass}
            maxLength={2048}
            onChange={(event) => props.onHeroChange({ ctaHref: event.target.value })}
            placeholder="#gallery"
            value={hero.ctaHref}
          />
        </Field>
      </section>
      {hero.mediaType === "video" ? (
        <MediaAssetPicker
          assets={props.assets}
          error={fieldMessage(props.errors, "posterSrc")}
          key={`${props.instance}-gallery-poster-${props.mediaRevision}`}
          kind="image"
          label="Video poster (optional)"
          name={`${props.instance}-gallery-hero-poster`}
          onValueChange={(posterSrc) => props.onHeroChange({ posterSrc })}
          showPreview={Boolean(hero.posterSrc)}
          value={hero.posterSrc}
        />
      ) : null}
    </div>
  );
}

function IntroductionInspector(props: InspectorProps) {
  const introduction = props.draft.introduction;
  return (
    <div className="grid gap-5">
      <p className="rounded-2xl border border-white/8 bg-white/[0.025] px-4 py-3 text-xs leading-5 text-white/40">
        These two fields sit directly above the category filters and image grid.
      </p>
      <Field
        error={fieldMessage(props.errors, "introEyebrow")}
        label="Small label"
        required
      >
        <input
          className={inputClass}
          maxLength={220}
          onChange={(event) =>
            props.onIntroductionChange({ introEyebrow: event.target.value })
          }
          value={introduction.introEyebrow}
        />
      </Field>
      <Field
        error={fieldMessage(props.errors, "introTitle")}
        label="Main heading"
        required
      >
        <textarea
          className={`${inputClass} min-h-36 resize-y`}
          maxLength={500}
          onChange={(event) =>
            props.onIntroductionChange({ introTitle: event.target.value })
          }
          value={introduction.introTitle}
        />
      </Field>
      <p className="rounded-2xl border border-white/8 bg-black/22 px-4 py-3 text-xs leading-5 text-white/36">
        HOME interlude and story text live in the future HOME editor. They are
        intentionally not mixed into this page.
      </p>
    </div>
  );
}

function FrameCard({
  index,
  item,
  props,
  visiblePosition,
  visibleTotal,
}: {
  index: number;
  item: GalleryFrameEditorItem;
  props: InspectorProps;
  visiblePosition: number;
  visibleTotal: number;
}) {
  const saved = props.savedFrameIds.has(item.id);
  const [expanded, setExpanded] = useState(!saved);
  const visible = item.isMosaic && item.isPublished;
  const status = visible
    ? "Visible"
    : item.isPublished
      ? "Hidden from Gallery"
      : "Hidden";
  return (
    <details
      className="group/frame overflow-hidden rounded-[20px] border border-white/9 bg-black/22"
      onToggle={(event) => setExpanded(event.currentTarget.open)}
      open={expanded}
    >
      <summary className="cursor-pointer list-none p-3.5 marker:content-none">
        <div className="flex items-center gap-3">
          <div className="relative h-16 w-20 shrink-0 overflow-hidden rounded-xl border border-white/9 bg-black/45">
            {item.src ? (
              <Image
                alt=""
                className="object-cover"
                fill
                sizes="80px"
                src={item.src}
                unoptimized={item.src.startsWith("https://")}
              />
            ) : (
              <span className="grid h-full place-items-center text-[9px] uppercase tracking-[0.15em] text-white/26">
                No image
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-white/30">
                Frame {String(index + 1).padStart(2, "0")}
              </span>
              <span
                className={`rounded-full border px-2 py-1 text-[9px] font-semibold ${
                  visible
                    ? "border-emerald-300/14 bg-emerald-400/[0.07] text-emerald-100/70"
                    : "border-white/9 bg-white/[0.035] text-white/38"
                }`}
              >
                {status}
              </span>
            </div>
            <p className="mt-1 truncate text-sm font-semibold text-white/76">
              {item.title || "Untitled frame"}
            </p>
            <p className="mt-1 truncate text-[10px] text-white/34">
              {item.category || "Selected"}
            </p>
          </div>
          <span className="text-xs text-white/30 transition group-open/frame:rotate-180">
            ▾
          </span>
        </div>
      </summary>

      <div className="grid gap-4 border-t border-white/8 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            className={`inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 text-xs font-semibold transition ${
              visible
                ? "border-white/10 text-white/58 hover:bg-white hover:text-black"
                : "border-emerald-300/16 bg-emerald-400/[0.06] text-emerald-100/72 hover:bg-emerald-300 hover:text-black"
            }`}
            onClick={() =>
              props.onFrameChange(index, {
                isMosaic: !visible,
                ...(!visible ? { isPublished: true } : {}),
              })
            }
            type="button"
          >
            {visible ? <FaEyeSlash /> : <FaEye />}
            {visible ? "Hide from Gallery" : "Show in Gallery"}
          </button>
          <div className="flex items-center gap-2">
            {visible ? (
              <>
                <button
                  aria-label={`Move ${item.title || `frame ${index + 1}`} up`}
                  className="grid h-10 w-10 place-items-center rounded-xl border border-white/9 text-white/48 transition hover:bg-white hover:text-black disabled:cursor-not-allowed disabled:opacity-25"
                  disabled={visiblePosition <= 0}
                  onClick={() => props.onMoveFrame(index, -1)}
                  type="button"
                >
                  <FaArrowUp />
                </button>
                <button
                  aria-label={`Move ${item.title || `frame ${index + 1}`} down`}
                  className="grid h-10 w-10 place-items-center rounded-xl border border-white/9 text-white/48 transition hover:bg-white hover:text-black disabled:cursor-not-allowed disabled:opacity-25"
                  disabled={visiblePosition < 0 || visiblePosition >= visibleTotal - 1}
                  onClick={() => props.onMoveFrame(index, 1)}
                  type="button"
                >
                  <FaArrowDown />
                </button>
              </>
            ) : null}
            {!saved ? (
              <button
                aria-label={`Discard ${item.title || `new frame ${index + 1}`}`}
                className="grid h-10 w-10 place-items-center rounded-xl border border-red-200/12 text-red-100/48 transition hover:bg-red-300/10 hover:text-red-100"
                onClick={() => props.onDiscardFrame(item.id)}
                type="button"
              >
                <FaTrashAlt />
              </button>
            ) : null}
          </div>
        </div>

        <MediaAssetPicker
          assets={props.assets}
          error={fieldMessage(props.errors, `items.${index}.src`)}
          key={`${props.instance}-gallery-frame-${item.id}-${props.mediaRevision}`}
          kind="image"
          label="Image"
          name={`${props.instance}-gallery-frame-${index}`}
          onValueChange={(src, asset) =>
            props.onFrameChange(index, {
              src,
              ...(!item.alt && asset?.alt ? { alt: asset.alt } : {}),
              ...(!item.title && asset?.label ? { title: asset.label } : {}),
            })
          }
          required
          value={item.src}
        />
        <Field error={fieldMessage(props.errors, `items.${index}.title`)} label="Title" required>
          <input
            className={inputClass}
            maxLength={180}
            onChange={(event) => props.onFrameChange(index, { title: event.target.value })}
            value={item.title}
          />
        </Field>
        <Field error={fieldMessage(props.errors, `items.${index}.category`)} label="Category">
          <input
            className={inputClass}
            list={`${props.instance}-gallery-category-options`}
            maxLength={80}
            onChange={(event) => props.onFrameChange(index, { category: event.target.value })}
            placeholder="Headshot, Editorial, Live..."
            value={item.category}
          />
        </Field>
        <Field error={fieldMessage(props.errors, `items.${index}.alt`)} label="Alternative text">
          <input
            className={inputClass}
            maxLength={220}
            onChange={(event) => props.onFrameChange(index, { alt: event.target.value })}
            placeholder="Describe the image for visitors using a screen reader"
            value={item.alt}
          />
        </Field>
        <Field error={fieldMessage(props.errors, `items.${index}.caption`)} label="Lightbox caption">
          <textarea
            className={`${inputClass} min-h-24 resize-y`}
            maxLength={600}
            onChange={(event) => props.onFrameChange(index, { caption: event.target.value })}
            value={item.caption}
          />
        </Field>
      </div>
    </details>
  );
}

function FramesInspector(props: InspectorProps) {
  const categoryListId = useId();
  const items = props.draft.frames.items;
  const categories = Array.from(
    new Set(items.map((item) => item.category.trim()).filter(Boolean))
  ).sort((left, right) => left.localeCompare(right));
  const visibleIndices = items
    .map((item, index) => (item.isMosaic && item.isPublished ? index : -1))
    .filter((index) => index >= 0);

  return (
    <div className="grid gap-4">
      <div className="rounded-[20px] border border-white/9 bg-black/22 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className={labelClass}>Gallery frames</p>
            <p className="mt-1 text-xs text-white/36">
              {visibleIndices.length} visible · {items.length - visibleIndices.length} hidden
            </p>
          </div>
          <button
            className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-white px-3 text-xs font-semibold text-black transition hover:bg-[#ff3b1f] hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
            disabled={items.length >= 120}
            onClick={props.onAddFrame}
            type="button"
          >
            <FaPlus /> Add frame
          </button>
        </div>
        <p className="mt-3 text-xs leading-5 text-white/38">
          Open a card to edit it. Hidden saved frames remain recoverable; only
          a brand-new unsaved card has a discard button.
        </p>
      </div>
      <datalist id={`${props.instance}-gallery-category-options`}>
        {categories.map((category) => (
          <option key={`${categoryListId}-${category}`} value={category} />
        ))}
      </datalist>
      {items.map((item, index) => (
        <FrameCard
          index={index}
          item={item}
          key={item.id}
          props={props}
          visiblePosition={visibleIndices.indexOf(index)}
          visibleTotal={visibleIndices.length}
        />
      ))}
      {!items.length ? (
        <div className="rounded-[20px] border border-dashed border-white/10 px-5 py-8 text-center">
          <p className="text-sm font-semibold text-white/62">No Gallery frames yet</p>
          <p className="mt-2 text-xs leading-5 text-white/36">
            Add the first image here; the public empty state remains intact until you save it.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function InspectorFields(props: InspectorProps) {
  if (props.activeSection === "hero") return <HeroInspector {...props} />;
  if (props.activeSection === "introduction") {
    return <IntroductionInspector {...props} />;
  }
  return <FramesInspector {...props} />;
}

function formatSavedAt(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "just now";
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

export default function GalleryEditor({
  assets,
  disabled,
  loadError,
  mediaLoadError,
  migrationRequired,
  snapshot,
}: GalleryEditorProps) {
  const [baseline, setBaseline] = useState(snapshot.draft);
  const [draft, setDraft] = useState(snapshot.draft);
  const [versions, setVersions] = useState(snapshot.versions);
  const baselineRef = useRef(baseline);
  const draftRef = useRef(draft);
  const versionsRef = useRef(versions);
  const [activeSection, setActiveSection] = useState<GalleryEditorSection>("hero");
  const [device, setDevice] = useState<GalleryPreviewDevice>("desktop");
  const [focusRequestId, setFocusRequestId] = useState(0);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState(false);
  const [dismissedEventId, setDismissedEventId] = useState("");
  const [mediaRevision, setMediaRevision] = useState(0);
  const [savingSection, setSavingSection] = useState<GalleryEditorSection | null>(null);
  const [lastSaved, setLastSaved] = useState<{
    section: GalleryEditorSection;
    savedAt: string;
  } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const mobileDialogRef = useRef<HTMLDialogElement | null>(null);
  const desktopInspectorCloseRef = useRef<HTMLButtonElement | null>(null);
  const desktopInspectorOpenRef = useRef<HTMLButtonElement | null>(null);
  const handledEventIdsRef = useRef(new Set<string>());
  const latestSaveEventIdRef = useRef("");
  const { clearDirty, confirmDiscard, hasUnsavedChanges, markDirty } =
    useUnsavedChangesGuard(
      "You have unsaved Gallery page changes. Leave and discard them?",
      true
    );

  const applySaveResult = useCallback(
    (result: GallerySaveState) => {
      if (!result.eventId || handledEventIdsRef.current.has(result.eventId)) return;
      handledEventIdsRef.current.add(result.eventId);
      if (
        result.status !== "saved" ||
        !result.section ||
        !result.canonicalSection ||
        !result.versions
      ) {
        return;
      }
      const confirmed = parseGallerySectionSubmission(
        result.section,
        result.canonicalSection,
        result.versions,
        { requireExactCollectionVersions: true }
      );
      if (!confirmed.success) return;
      const nextDraft = applyCanonicalSection(
        draftRef.current,
        result.section,
        confirmed.data.payload
      );
      if (!nextDraft) return;
      const nextBaseline = {
        ...baselineRef.current,
        [result.section]: nextDraft[result.section],
      } as GalleryEditorDraft;
      const nextVersions = applySavedVersions(
        versionsRef.current,
        result.section,
        confirmed.data.versions
      );
      draftRef.current = nextDraft;
      baselineRef.current = nextBaseline;
      versionsRef.current = nextVersions;
      setDraft(nextDraft);
      setBaseline(nextBaseline);
      setVersions(nextVersions);
      setMediaRevision((value) => value + 1);
      setLastSaved({
        section: result.section,
        savedAt: result.savedAt || new Date().toISOString(),
      });
      setAnnouncement(`${SECTION_META[result.section].label} saved.`);
      if (!getDirtyGallerySections(nextBaseline, nextDraft).length) clearDirty();
    },
    [clearDirty]
  );

  const clientAction = useCallback(
    async (previousState: GallerySaveState, formData: FormData) => {
      const section = GALLERY_EDITOR_SECTIONS.find(
        (candidate) => candidate === formData.get("section")
      );
      setSavingSection(section || null);
      try {
        const result = await saveGallerySectionV2(previousState, formData);
        latestSaveEventIdRef.current = result.eventId;
        applySaveResult(result);
        return result;
      } finally {
        setSavingSection(null);
      }
    },
    [applySaveResult]
  );
  const [saveState, formAction, pending] = useActionState(
    clientAction,
    INITIAL_GALLERY_SAVE_STATE
  );

  useEffect(() => {
    if (window.matchMedia("(min-width: 1280px)").matches) return;
    const frame = window.requestAnimationFrame(() => setDevice("mobile"));
    return () => window.cancelAnimationFrame(frame);
  }, []);

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

  const dirtySections = useMemo(
    () => getDirtyGallerySections(baseline, draft),
    [baseline, draft]
  );
  const savedFrameIds = useMemo(
    () => new Set(Object.keys(versions.frames.items)),
    [versions.frames.items]
  );
  const activeDirty = isGallerySectionDirty(baseline, draft, activeSection);
  const validation = useMemo(
    () => validateSection(draft, activeSection),
    [activeSection, draft]
  );
  const responseVisible =
    Boolean(saveState.eventId) && saveState.eventId !== dismissedEventId;
  const responseErrors =
    responseVisible && saveState.section === activeSection
      ? saveState.fieldErrors || {}
      : {};
  const errors = mergeErrors(validation.errors, responseErrors);
  const editorDisabled = disabled || pending;
  const canSave = !editorDisabled && activeDirty && validation.ok;
  const statusIsError =
    responseVisible && !["idle", "saved"].includes(saveState.status);

  function commitDraft(next: GalleryEditorDraft) {
    if (next === draftRef.current) return;
    draftRef.current = next;
    setDraft(next);
    if (latestSaveEventIdRef.current) {
      setDismissedEventId(latestSaveEventIdRef.current);
    }
    if (getDirtyGallerySections(baselineRef.current, next).length) markDirty();
    else clearDirty();
  }

  function updateHero(patch: Partial<GalleryHeroDraft>) {
    commitDraft({
      ...draftRef.current,
      hero: { ...draftRef.current.hero, ...patch },
    });
  }

  function updateIntroduction(
    patch: Partial<GalleryEditorDraft["introduction"]>
  ) {
    commitDraft({
      ...draftRef.current,
      introduction: { ...draftRef.current.introduction, ...patch },
    });
  }

  function updateFrame(index: number, patch: Partial<GalleryFrameEditorItem>) {
    const items = draftRef.current.frames.items.map((item, itemIndex) =>
      itemIndex === index ? { ...item, ...patch } : item
    );
    commitDraft({ ...draftRef.current, frames: { items } });
  }

  function addFrame() {
    const item: GalleryFrameEditorItem = {
      id: `gallery:${crypto.randomUUID()}`,
      title: "",
      src: "",
      alt: "",
      caption: "",
      category: "",
      isMosaic: true,
      isPublished: true,
    };
    commitDraft({
      ...draftRef.current,
      frames: { items: [...draftRef.current.frames.items, item] },
    });
    setAnnouncement("New frame draft added. Choose an image, then save Frames.");
  }

  function discardFrame(id: string) {
    if (id in versionsRef.current.frames.items) return;
    commitDraft({
      ...draftRef.current,
      frames: {
        items: draftRef.current.frames.items.filter((item) => item.id !== id),
      },
    });
    setAnnouncement("Unsaved frame draft discarded.");
  }

  function moveFrame(index: number, direction: -1 | 1) {
    const items = draftRef.current.frames.items;
    const visibleIndices = items
      .map((item, itemIndex) =>
        item.isMosaic && item.isPublished ? itemIndex : -1
      )
      .filter((itemIndex) => itemIndex >= 0);
    const position = visibleIndices.indexOf(index);
    const target = visibleIndices[position + direction];
    if (position < 0 || target === undefined) return;
    const next = moveGalleryEditorItem(items, index, target);
    if (next === items) return;
    commitDraft({ ...draftRef.current, frames: { items: next } });
    setAnnouncement("Frame moved. Save Frames to publish the new visitor order.");
  }

  const selectSection = useCallback(
    (section: GalleryEditorSection) => {
      if (pending || savingSection) return;
      setActiveSection(section);
      setFocusRequestId((value) => value + 1);
      if (window.matchMedia("(min-width: 1280px)").matches) {
        setInspectorOpen(true);
      } else {
        setMobileInspectorOpen(true);
      }
    },
    [pending, savingSection]
  );

  function discardActiveSection() {
    commitDraft({
      ...draftRef.current,
      [activeSection]: baselineRef.current[activeSection],
    } as GalleryEditorDraft);
    setMediaRevision((value) => value + 1);
    setAnnouncement(
      `${SECTION_META[activeSection].label} restored to its last saved version.`
    );
  }

  function reloadAfterConflict() {
    if (hasUnsavedChanges && !confirmDiscard()) return;
    window.location.reload();
  }

  const inspectorProps: Omit<InspectorProps, "activeSection" | "instance"> = {
    assets,
    draft,
    errors,
    mediaRevision,
    savedFrameIds,
    onAddFrame: addFrame,
    onDiscardFrame: discardFrame,
    onFrameChange: updateFrame,
    onHeroChange: updateHero,
    onIntroductionChange: updateIntroduction,
    onMoveFrame: moveFrame,
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
            : "All Gallery changes are saved";
  const statusDetail = migrationRequired
    ? "Database migration 0031 is required before this editor can publish."
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
      <input
        name="payload"
        readOnly
        type="hidden"
        value={JSON.stringify(getGallerySectionPayload(draft, activeSection))}
      />
      <input
        name="versions"
        readOnly
        type="hidden"
        value={JSON.stringify(getGallerySectionVersions(versions, activeSection))}
      />

      {migrationRequired || loadError || mediaLoadError ? (
        <section aria-label="Gallery editor notices" className="mb-4 grid gap-2">
          {migrationRequired ? (
            <p className="rounded-[18px] border border-amber-300/16 bg-amber-400/[0.055] px-4 py-3 text-sm leading-6 text-amber-100/72">
              The Gallery layout is available for review, but migration 0031
              must be applied before saving.
            </p>
          ) : null}
          {loadError ? (
            <p className="rounded-[18px] border border-red-300/16 bg-red-400/[0.055] px-4 py-3 text-sm leading-6 text-red-100/72">
              {loadError}
            </p>
          ) : null}
          {mediaLoadError ? (
            <p className="rounded-[18px] border border-amber-300/16 bg-amber-400/[0.055] px-4 py-3 text-sm leading-6 text-amber-100/72">
              {mediaLoadError}
            </p>
          ) : null}
        </section>
      ) : null}

      <section className={`${panelClass} mb-4 overflow-hidden`}>
        <div className="flex flex-col gap-3 border-b border-white/8 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-white/30">
              Page preview
            </p>
            <p className="mt-1 text-xs text-white/46">
              Click a section to edit it. Changes appear here before saving.
            </p>
          </div>
          <div className="flex items-center justify-between gap-2">
            <div className="flex rounded-xl border border-white/9 bg-black/28 p-1">
              <button
                aria-label="Desktop preview"
                aria-pressed={device === "desktop"}
                className={`grid h-10 w-10 place-items-center rounded-lg text-xs transition ${device === "desktop" ? "bg-white text-black" : "text-white/42 hover:text-white"}`}
                onClick={() => setDevice("desktop")}
                title="Desktop preview"
                type="button"
              >
                <FaDesktop />
              </button>
              <button
                aria-label="Mobile preview"
                aria-pressed={device === "mobile"}
                className={`grid h-10 w-10 place-items-center rounded-lg text-xs transition ${device === "mobile" ? "bg-white text-black" : "text-white/42 hover:text-white"}`}
                onClick={() => setDevice("mobile")}
                title="Mobile preview"
                type="button"
              >
                <FaMobileAlt />
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
          aria-label="Gallery editor sections"
          className="flex gap-2 overflow-x-auto p-3 sm:p-4"
          role="group"
        >
          {GALLERY_EDITOR_SECTIONS.map((section) => {
            const active = section === activeSection;
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
                {SECTION_META[section].label}
                {dirty ? (
                  <span
                    aria-label="Unsaved changes"
                    className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-[#0f0f11] bg-amber-300"
                  />
                ) : null}
              </button>
            );
          })}
        </div>
      </section>

      <div
        className={`grid gap-4 xl:items-start ${inspectorOpen ? "xl:grid-cols-[minmax(0,1fr)_minmax(350px,440px)]" : "xl:grid-cols-[minmax(0,1fr)_64px]"}`}
      >
        <GalleryPreviewFrame
          device={device}
          draft={draft}
          focusRequestId={focusRequestId}
          footer={snapshot.footer}
          isLive={!disabled && !loadError && !migrationRequired}
          onSelectSection={selectSection}
          selectedSection={activeSection}
        />
        <aside
          aria-label="Gallery section inspector"
          className={`${panelClass} sticky top-4 hidden max-h-[calc(100vh-2rem)] overflow-hidden xl:block`}
        >
          {inspectorOpen ? (
            <>
              <InspectorHeader
                activeSection={activeSection}
                closeButtonRef={desktopInspectorCloseRef}
                onClose={() => setInspectorOpen(false)}
              />
              <fieldset
                className="admin-scrollbar-none max-h-[calc(100vh-11rem)] overflow-y-auto p-4 sm:p-5"
                disabled={editorDisabled}
              >
                <InspectorFields
                  {...inspectorProps}
                  activeSection={activeSection}
                  instance="desktop"
                />
                {activeDirty ? (
                  <button
                    className="mt-5 min-h-11 w-full rounded-xl border border-white/10 text-xs font-semibold text-white/52 transition hover:bg-white hover:text-black"
                    onClick={discardActiveSection}
                    type="button"
                  >
                    Discard changes in {SECTION_META[activeSection].label}
                  </button>
                ) : null}
              </fieldset>
            </>
          ) : (
            <button
              aria-label="Open inspector"
              className="flex min-h-[260px] w-full flex-col items-center justify-center gap-3 text-white/48 transition hover:bg-white/[0.055] hover:text-white"
              onClick={() => setInspectorOpen(true)}
              ref={desktopInspectorOpenRef}
              type="button"
            >
              <FaChevronLeft />
              <span className="[writing-mode:vertical-rl] text-[10px] font-semibold uppercase tracking-[0.2em]">
                Open inspector
              </span>
            </button>
          )}
        </aside>
      </div>

      <dialog
        aria-label="Gallery section inspector"
        className="m-0 ml-auto h-dvh max-h-none w-[min(94vw,440px)] max-w-none bg-transparent p-0 text-white backdrop:bg-black/76 xl:hidden"
        onCancel={(event) => {
          event.preventDefault();
          setMobileInspectorOpen(false);
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) setMobileInspectorOpen(false);
        }}
        onClose={() => setMobileInspectorOpen(false)}
        ref={mobileDialogRef}
      >
        <div className="flex h-dvh flex-col border-l border-white/10 bg-[#0d0d0f] shadow-[-30px_0_100px_rgba(0,0,0,0.55)]">
          <InspectorHeader
            activeSection={activeSection}
            onClose={() => setMobileInspectorOpen(false)}
          />
          {mobileInspectorOpen ? (
            <>
              <fieldset
                className="admin-scrollbar-none min-h-0 flex-1 overflow-y-auto p-4 sm:p-5"
                disabled={editorDisabled}
              >
                <InspectorFields
                  {...inspectorProps}
                  activeSection={activeSection}
                  instance="mobile"
                />
                {activeDirty ? (
                  <button
                    className="mt-5 min-h-11 w-full rounded-xl border border-white/10 text-xs font-semibold text-white/52 transition hover:bg-white hover:text-black"
                    onClick={discardActiveSection}
                    type="button"
                  >
                    Discard changes in {SECTION_META[activeSection].label}
                  </button>
                ) : null}
              </fieldset>
              <div className="shrink-0 border-t border-white/9 bg-[#111113] p-4 shadow-[0_-18px_50px_rgba(0,0,0,0.34)]">
                <p className="text-xs font-semibold text-white/72">{statusLabel}</p>
                <p className="mt-1 text-[11px] leading-5 text-white/38">
                  {responseVisible && saveState.status !== "idle"
                    ? saveState.message
                    : statusDetail}
                </p>
                <button
                  aria-busy={pending}
                  className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white px-5 text-sm font-semibold text-black transition hover:bg-[#ff3b1f] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={!canSave}
                  type="submit"
                >
                  {pending ? <FaSpinner className="animate-spin" /> : <FaCheck />}
                  {pending
                    ? `Saving ${SECTION_META[savingSection || activeSection].label}...`
                    : `Save ${SECTION_META[activeSection].label}`}
                </button>
              </div>
            </>
          ) : null}
        </div>
      </dialog>

      {responseVisible && saveState.status !== "idle" ? (
        <section
          className={`mt-4 rounded-[18px] border px-4 py-3 text-sm leading-6 ${saveState.status === "saved" ? "border-emerald-300/16 bg-emerald-400/[0.06] text-emerald-50/76" : "border-red-300/16 bg-red-400/[0.06] text-red-50/76"}`}
          role={statusIsError ? "alert" : "status"}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2">
              {saveState.status === "saved" ? <FaCheck /> : <FaExclamationTriangle />}
              {saveState.message}
            </span>
            {saveState.status === "conflict" ? (
              <button
                className="min-h-10 rounded-xl border border-red-100/16 px-3 text-xs font-semibold transition hover:bg-white hover:text-black"
                onClick={reloadAfterConflict}
                type="button"
              >
                Reload saved Gallery page
              </button>
            ) : null}
          </div>
          {fieldMessage(responseErrors, "form") ? (
            <p className="mt-2 text-xs">{fieldMessage(responseErrors, "form")}</p>
          ) : null}
        </section>
      ) : null}

      <div className="sticky bottom-3 z-20 mt-4 rounded-[20px] border border-white/10 bg-[#101012]/95 p-3 shadow-[0_18px_70px_rgba(0,0,0,0.52)] backdrop-blur-2xl sm:flex sm:items-center sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-2 text-xs font-semibold text-white/66">
            <span
              className={`h-2 w-2 rounded-full ${pending ? "bg-sky-300" : disabled || statusIsError || !validation.ok || hasUnsavedChanges ? "bg-amber-300" : "bg-emerald-300"}`}
            />
            {statusLabel}
          </p>
          <p className="mt-1 text-[10px] leading-4 text-white/34">{statusDetail}</p>
          <p aria-live="polite" className="sr-only">{announcement}</p>
          <Link
            className="mt-2 inline-flex items-center gap-2 text-[10px] font-semibold text-white/42 underline decoration-white/18 underline-offset-4 transition hover:text-white"
            href="/admin/media?view=studio"
          >
            Open classic Gallery Studio <FaExternalLinkAlt />
          </Link>
        </div>
        <div className="mt-3 flex items-center gap-2 sm:mt-0">
          {!inspectorOpen ? (
            <button
              className="hidden h-12 items-center gap-2 rounded-2xl border border-white/10 px-4 text-xs font-semibold text-white/56 transition hover:bg-white hover:text-black xl:inline-flex"
              onClick={() => setInspectorOpen(true)}
              type="button"
            >
              <FaChevronLeft /> Inspector
            </button>
          ) : null}
          <button
            aria-busy={pending}
            className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-white px-5 text-sm font-semibold text-black transition hover:bg-[#ff3b1f] hover:text-white disabled:cursor-not-allowed disabled:opacity-40 sm:min-w-[190px] sm:flex-none"
            disabled={!canSave}
            type="submit"
          >
            {pending ? <FaSpinner className="animate-spin" /> : <FaCheck />}
            {pending
              ? `Saving ${SECTION_META[savingSection || activeSection].label}...`
              : `Save ${SECTION_META[activeSection].label}`}
          </button>
        </div>
      </div>
    </form>
  );
}
