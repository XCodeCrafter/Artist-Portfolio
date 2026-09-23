"use client";
import HeroFramingControls from "@/components/admin/v2/HeroFramingControls";
import PhotoFramingControls from "@/components/admin/v2/PhotoFramingControls";

import Image from "next/image";
import Link from "next/link";
import {
  useActionState,
  useCallback,
  useEffect,
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
  FaTimes,
  FaTrashAlt,
  FaVideo,
} from "react-icons/fa";
import { saveShowreelSectionV2 } from "@/app/admin/v2/pages/showreel/actions";
import MediaAssetPicker from "@/components/admin/MediaAssetPicker";
import ShowreelPreviewFrame, {
  type ShowreelPreviewDevice,
} from "@/components/admin/v2/ShowreelPreviewFrame";
import useUnsavedChangesGuard from "@/components/admin/useUnsavedChangesGuard";
import { needsEditorReload, runEditorSave } from "@/lib/admin/editor-save-recovery";
import {
  SHOWREEL_EDITOR_SECTIONS,
  INITIAL_SHOWREEL_SAVE_STATE,
  getDirtyShowreelSections,
  getShowreelSectionPayload,
  getShowreelSectionVersions,
  isSafeShowreelAssetSource,
  isShowreelSectionDirty,
  moveShowreelEditorItem,
  parseShowreelHeroDraft,
  parseShowreelIntroductionDraft,
  parseShowreelSectionSubmission,
  parseShowreelWorksDraft,
  type ShowreelEditorDraft,
  type ShowreelEditorSection,
  type ShowreelEditorSnapshot,
  type ShowreelEditorVersions,
  type ShowreelHeroDraft,
  type ShowreelSaveState,
  type ShowreelWorkEditorItem,
} from "@/lib/admin/showreel-editor";
import type { MediaAsset } from "@/lib/admin/media";
import { useVisualContentArchive } from "@/components/admin/v2/VisualContentArchivePanel";
import type { VisualArchiveData } from "@/lib/admin/visual-content-archive-editor";
import { VIDEO_TYPES } from "@/lib/content/types";

type FieldErrors = Record<string, string[]>;

type ShowreelEditorProps = {
  archiveData?: VisualArchiveData;
  assets: MediaAsset[];
  disabled: boolean;
  loadError?: string;
  mediaLoadError?: string;
  migrationRequired: boolean;
  snapshot: ShowreelEditorSnapshot;
};

const panelClass =
  "rounded-[24px] border border-white/9 bg-[#0f0f11]/94 shadow-[0_22px_80px_rgba(0,0,0,0.3)]";
const inputClass =
  "mt-2 min-h-11 w-full rounded-2xl border border-white/10 bg-black/28 px-3.5 py-2.5 text-sm text-white outline-none transition placeholder:text-white/24 focus:border-white/34 focus:bg-black/38 disabled:cursor-not-allowed disabled:opacity-45";
const labelClass =
  "text-[10px] font-semibold uppercase tracking-[0.17em] text-white/42";

const SECTION_META: Record<
  ShowreelEditorSection,
  { label: string; description: string }
> = {
  hero: {
    label: "Hero",
    description: "Opening title, button, and background media",
  },
  introduction: {
    label: "Introduction",
    description: "The heading and copy above the video library",
  },
  works: {
    label: "Videos",
    description: "Showreels, scenes, music videos, visibility, and order",
  },
};

const VIDEO_TYPE_LABELS = {
  showreel: "Showreel",
  scene: "Scene",
  self_tape: "Self-tape",
  interview: "Interview",
  music_video: "Music video",
  behind_scenes: "Behind the scenes",
  other: "Other",
} as const;

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

function validateSection(
  draft: ShowreelEditorDraft,
  section: ShowreelEditorSection
) {
  const parsed =
    section === "hero"
      ? parseShowreelHeroDraft(draft.hero)
      : section === "introduction"
        ? parseShowreelIntroductionDraft(draft.introduction)
        : parseShowreelWorksDraft(draft.works);
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
  draft: ShowreelEditorDraft,
  section: ShowreelEditorSection,
  value: unknown
): ShowreelEditorDraft | null {
  const parsed =
    section === "hero"
      ? parseShowreelHeroDraft(value)
      : section === "introduction"
        ? parseShowreelIntroductionDraft(value)
        : parseShowreelWorksDraft(value);
  if (!parsed.success) return null;
  return { ...draft, [section]: parsed.data } as ShowreelEditorDraft;
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

type InspectorProps = {
  framingControls: ReactNode;
  device: ShowreelPreviewDevice;
  onDeviceChange: (device: ShowreelPreviewDevice) => void;
  activeSection: ShowreelEditorSection;
  assets: MediaAsset[];
  draft: ShowreelEditorDraft;
  errors: FieldErrors;
  instance: "desktop" | "mobile";
  mediaRevision: number;
  savedWorkIds: ReadonlySet<string>;
  archiveControl: (id: string, label: string) => ReactNode;
  archivePanel: ReactNode;
  onAddWork: () => void;
  onDiscardWork: (id: string) => void;
  onHeroChange: (patch: Partial<ShowreelHeroDraft>) => void;
  onIntroductionChange: (
    patch: Partial<ShowreelEditorDraft["introduction"]>
  ) => void;
  onMoveWork: (index: number, direction: -1 | 1) => void;
  onWorkChange: (index: number, patch: Partial<ShowreelWorkEditorItem>) => void;
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
          onChange={(event) =>
            props.onHeroChange({ subtitle: event.target.value })
          }
          value={hero.subtitle}
        />
      </Field>
      <MediaAssetPicker
        assets={props.assets}
        defaultMediaType={hero.mediaType}
        error={fieldMessage(props.errors, "backgroundSrc")}
        key={`${props.instance}-showreel-hero-${props.mediaRevision}`}
        kind="media"
        label="Hero background"
        mediaType={hero.mediaType}
        name={`${props.instance}-showreel-hero-background`}
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
        showPreview={isSafeShowreelAssetSource(hero.backgroundSrc)}
        value={hero.backgroundSrc}
      />
      {props.framingControls}
      <details className="rounded-[20px] border border-white/9 bg-black/22 p-4">
        <summary className="cursor-pointer text-xs font-semibold text-white/62">
          Button and video options
        </summary>
        <div className="mt-4 grid gap-4">
          <p className="text-xs leading-5 text-white/38">
            Fill both button fields, or leave both empty.
          </p>
          <Field error={fieldMessage(props.errors, "ctaLabel")} label="Button label">
            <input
              className={inputClass}
              maxLength={220}
              onChange={(event) =>
                props.onHeroChange({ ctaLabel: event.target.value })
              }
              value={hero.ctaLabel}
            />
          </Field>
          <Field
            error={fieldMessage(props.errors, "ctaHref")}
            label="Button destination"
          >
            <input
              className={inputClass}
              maxLength={2048}
              onChange={(event) =>
                props.onHeroChange({ ctaHref: event.target.value })
              }
              placeholder="#videos"
              value={hero.ctaHref}
            />
          </Field>
          {hero.mediaType === "video" ? (
            <MediaAssetPicker
              assets={props.assets}
              error={fieldMessage(props.errors, "posterSrc")}
              key={`${props.instance}-showreel-poster-${props.mediaRevision}`}
              kind="image"
              label="Video poster (optional)"
              name={`${props.instance}-showreel-hero-poster`}
              onValueChange={(posterSrc) => props.onHeroChange({ posterSrc })}
              showPreview={
                Boolean(hero.posterSrc) &&
                isSafeShowreelAssetSource(hero.posterSrc)
              }
              value={hero.posterSrc}
            />
          ) : null}
        </div>
      </details>
    </div>
  );
}

function IntroductionInspector(props: InspectorProps) {
  const intro = props.draft.introduction;
  return (
    <div className="grid gap-5">
      <p className="rounded-2xl border border-white/8 bg-white/[0.025] px-4 py-3 text-xs leading-5 text-white/40">
        These fields appear directly above the filters and video cards.
      </p>
      <Field
        error={fieldMessage(props.errors, "sectionEyebrow")}
        label="Small label"
        required
      >
        <input
          className={inputClass}
          maxLength={220}
          onChange={(event) =>
            props.onIntroductionChange({ sectionEyebrow: event.target.value })
          }
          value={intro.sectionEyebrow}
        />
      </Field>
      <Field
        error={fieldMessage(props.errors, "sectionTitle")}
        label="Heading"
        required
      >
        <textarea
          className={`${inputClass} min-h-28 resize-y`}
          maxLength={500}
          onChange={(event) =>
            props.onIntroductionChange({ sectionTitle: event.target.value })
          }
          value={intro.sectionTitle}
        />
      </Field>
      <Field error={fieldMessage(props.errors, "sectionBody")} label="Intro text">
        <textarea
          className={`${inputClass} min-h-32 resize-y`}
          maxLength={1200}
          onChange={(event) =>
            props.onIntroductionChange({ sectionBody: event.target.value })
          }
          value={intro.sectionBody}
        />
      </Field>
      <details className="rounded-[20px] border border-white/9 bg-black/22 p-4">
        <summary className="cursor-pointer text-xs font-semibold text-white/62">
          Empty-library message
        </summary>
        <div className="mt-4">
          <Field
            error={fieldMessage(props.errors, "emptyText")}
            label="Message shown when no videos are visible"
            required
          >
            <textarea
              className={`${inputClass} min-h-24 resize-y`}
              maxLength={500}
              onChange={(event) =>
                props.onIntroductionChange({ emptyText: event.target.value })
              }
              value={intro.emptyText}
            />
          </Field>
        </div>
      </details>
    </div>
  );
}

function sourceMode(item: ShowreelWorkEditorItem) {
  const platform = item.platform.toLowerCase();
  if (platform === "upload") return "upload";
  if (["direct", "html5"].includes(platform)) return "direct";
  return "embed";
}

function embedPlatformValue(platform: string) {
  switch (platform.toLowerCase()) {
    case "youtube":
      return "YouTube";
    case "vimeo":
      return "Vimeo";
    case "spotify":
      return "Spotify";
    case "soundcloud":
      return "SoundCloud";
    default:
      return platform;
  }
}

function isKnownEmbedPlatform(platform: string) {
  return ["youtube", "vimeo", "spotify", "soundcloud"].includes(
    platform.toLowerCase()
  );
}

function WorkCard({
  index,
  item,
  props,
  visiblePosition,
  visibleTotal,
}: {
  index: number;
  item: ShowreelWorkEditorItem;
  props: InspectorProps;
  visiblePosition: number;
  visibleTotal: number;
}) {
  const saved = props.savedWorkIds.has(item.id);
  const mode = sourceMode(item);
  return (
    <details
      className="group/work overflow-hidden rounded-[20px] border border-white/9 bg-black/22"
      data-showreel-editor-work-id={item.id}
      open={!saved ? true : undefined}
    >
      <summary className="cursor-pointer list-none p-3.5 marker:content-none">
        <div className="flex items-center gap-3">
          <div className="relative h-16 w-24 shrink-0 overflow-hidden rounded-xl border border-white/9 bg-black/45">
            {item.thumbnailSrc &&
            isSafeShowreelAssetSource(item.thumbnailSrc) ? (
              <Image
                alt=""
                className="object-cover"
                fill
                sizes="96px"
                src={item.thumbnailSrc}
                unoptimized={item.thumbnailSrc.startsWith("https://")}
              />
            ) : (
              <span className="grid h-full place-items-center text-white/28">
                <FaVideo />
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-white/30">
                Video {String(index + 1).padStart(2, "0")}
              </span>
              <span
                className={`rounded-full border px-2 py-1 text-[9px] font-semibold ${
                  item.isPublished
                    ? "border-emerald-300/14 bg-emerald-400/[0.07] text-emerald-100/70"
                    : "border-white/9 bg-white/[0.035] text-white/38"
                }`}
              >
                {saved ? (item.isPublished ? "Shown" : "Hidden") : "Draft"}
              </span>
              {item.isPublished && visiblePosition === 0 ? (
                <span className="rounded-full border border-[#ff684f]/20 bg-[#ff3b1f]/10 px-2 py-1 text-[9px] font-semibold text-[#ff927f]">
                  First · large card
                </span>
              ) : null}
            </div>
            <p className="mt-1 truncate text-sm font-semibold text-white/76">
              {item.title || "Untitled video"}
            </p>
            <p className="mt-1 truncate text-[10px] text-white/34">
              {VIDEO_TYPE_LABELS[item.videoType]}
            </p>
          </div>
          <span className="text-xs text-white/30 transition group-open/work:rotate-180">
            ▾
          </span>
        </div>
      </summary>

      <div className="grid gap-4 border-t border-white/8 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            className={`inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 text-xs font-semibold transition ${
              item.isPublished
                ? "border-white/10 text-white/58 hover:bg-white hover:text-black"
                : "border-emerald-300/16 bg-emerald-400/[0.06] text-emerald-100/72 hover:bg-emerald-300 hover:text-black"
            }`}
            onClick={() =>
              props.onWorkChange(index, { isPublished: !item.isPublished })
            }
            type="button"
          >
            {item.isPublished ? <FaEyeSlash /> : <FaEye />}
            {item.isPublished ? "Hide from page" : "Show on page"}
          </button>
          <div className="flex items-center gap-2">
            {item.isPublished ? (
              <>
                <button
                  aria-label={`Move ${item.title || `video ${index + 1}`} up`}
                  className="grid h-10 w-10 place-items-center rounded-xl border border-white/9 text-white/48 transition hover:bg-white hover:text-black disabled:cursor-not-allowed disabled:opacity-25"
                  disabled={visiblePosition <= 0}
                  onClick={() => props.onMoveWork(index, -1)}
                  type="button"
                >
                  <FaArrowUp />
                </button>
                <button
                  aria-label={`Move ${item.title || `video ${index + 1}`} down`}
                  className="grid h-10 w-10 place-items-center rounded-xl border border-white/9 text-white/48 transition hover:bg-white hover:text-black disabled:cursor-not-allowed disabled:opacity-25"
                  disabled={
                    visiblePosition < 0 || visiblePosition >= visibleTotal - 1
                  }
                  onClick={() => props.onMoveWork(index, 1)}
                  type="button"
                >
                  <FaArrowDown />
                </button>
              </>
            ) : null}
            {!saved ? (
              <button
                aria-label={`Discard ${item.title || `new video ${index + 1}`}`}
                className="grid h-10 w-10 place-items-center rounded-xl border border-red-200/12 text-red-100/48 transition hover:bg-red-300/10 hover:text-red-100"
                onClick={() => props.onDiscardWork(item.id)}
                type="button"
              >
                <FaTrashAlt />
              </button>
            ) : null}
          </div>
        </div>

        {saved ? props.archiveControl(item.id, item.title || "Untitled video") : null}
        <Field
          error={fieldMessage(props.errors, `items.${index}.title`)}
          label="Title"
          required
        >
          <input
            className={inputClass}
            maxLength={220}
            onChange={(event) =>
              props.onWorkChange(index, { title: event.target.value })
            }
            value={item.title}
          />
        </Field>
        <Field
          error={fieldMessage(props.errors, `items.${index}.videoType`)}
          label="Type"
          required
        >
          <select
            className={inputClass}
            onChange={(event) =>
              props.onWorkChange(index, {
                videoType: event.target.value as ShowreelWorkEditorItem["videoType"],
              })
            }
            value={item.videoType}
          >
            {VIDEO_TYPES.map((type) => (
              <option key={type} value={type}>
                {VIDEO_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </Field>
        <Field
          error={fieldMessage(props.errors, `items.${index}.description`)}
          label="Description"
        >
          <textarea
            className={`${inputClass} min-h-24 resize-y`}
            maxLength={1000}
            onChange={(event) =>
              props.onWorkChange(index, { description: event.target.value })
            }
            value={item.description}
          />
        </Field>

        <section className="rounded-[18px] border border-white/8 bg-black/18 p-3">
          <p className={labelClass}>Video source</p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {(
              [
                ["upload", "Upload"],
                ["embed", "Embed"],
                ["direct", "Local path"],
              ] as const
            ).map(([value, label]) => (
              <button
                aria-pressed={mode === value}
                className={`min-h-11 rounded-xl border px-2 text-[10px] font-semibold transition ${
                  mode === value
                    ? "border-white bg-white text-black"
                    : "border-white/9 text-white/44 hover:text-white"
                }`}
                key={value}
                onClick={() => {
                  if (mode === value) return;
                  props.onWorkChange(index, {
                    platform:
                      value === "upload"
                        ? "upload"
                        : value === "direct"
                          ? "direct"
                          : "YouTube",
                    embedUrl: "",
                  });
                }}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
          {mode === "upload" ? (
            <div className="mt-4">
              <MediaAssetPicker
                assets={props.assets}
                error={fieldMessage(props.errors, `items.${index}.embedUrl`)}
                key={`${props.instance}-showreel-work-${item.id}-${props.mediaRevision}`}
                kind="video"
                label="Video file"
                name={`${props.instance}-showreel-work-${index}`}
                onValueChange={(embedUrl, asset) =>
                  props.onWorkChange(index, {
                    embedUrl,
                    ...(!item.title && asset?.label
                      ? { title: asset.label }
                      : {}),
                  })
                }
                required
                value={item.embedUrl}
              />
              <Link
                className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-[#ff7863] transition hover:text-white"
                href="/admin/v2/media#upload"
              >
                Upload another video <FaExternalLinkAlt />
              </Link>
            </div>
          ) : (
            <div className="mt-4 grid gap-4">
              {mode === "embed" ? (
                <Field label="Platform">
                  <select
                    className={inputClass}
                    onChange={(event) =>
                      props.onWorkChange(index, { platform: event.target.value })
                    }
                    value={embedPlatformValue(item.platform)}
                  >
                    <option value="YouTube">YouTube</option>
                    <option value="Vimeo">Vimeo</option>
                    <option value="Spotify">Spotify</option>
                    <option value="SoundCloud">SoundCloud</option>
                    {!isKnownEmbedPlatform(item.platform) ? (
                      <option disabled value={item.platform}>
                        Legacy provider · choose a supported platform
                      </option>
                    ) : null}
                  </select>
                </Field>
              ) : null}
              <Field
                error={fieldMessage(props.errors, `items.${index}.embedUrl`)}
                label={mode === "embed" ? "Video link" : "MP4 / WebM link"}
                required
              >
                <input
                  className={inputClass}
                  maxLength={1200}
                  onChange={(event) =>
                    props.onWorkChange(index, { embedUrl: event.target.value })
                  }
                  placeholder={
                    mode === "embed" ? "https://" : "/videos/example.mp4"
                  }
                  value={item.embedUrl}
                />
              </Field>
            </div>
          )}
        </section>

        <MediaAssetPicker
          assets={props.assets}
          error={fieldMessage(props.errors, `items.${index}.thumbnailSrc`)}
          key={`${props.instance}-showreel-thumb-${item.id}-${props.mediaRevision}`}
          kind="image"
          label="Thumbnail (recommended)"
          name={`${props.instance}-showreel-thumb-${index}`}
          onValueChange={(thumbnailSrc) =>
            props.onWorkChange(index, { thumbnailSrc })
          }
          showPreview={
            Boolean(item.thumbnailSrc) &&
            isSafeShowreelAssetSource(item.thumbnailSrc)
          }
          value={item.thumbnailSrc}
        />
        <PhotoFramingControls value={item.framing} src={item.thumbnailSrc} onChange={framing => props.onWorkChange(index, { framing })} saveSection="Videos"
          device={props.device} onDeviceChange={props.onDeviceChange}
          previewViewport={{ desktop: { width: 1600, height: visiblePosition === 0 ? 700 : 900 }, mobile: { width: 1600, height: 900 } }} />
      </div>
    </details>
  );
}

function WorksInspector(props: InspectorProps) {
  const items = props.draft.works.items;
  const visibleIndices = items
    .map((item, index) => (item.isPublished ? index : -1))
    .filter((index) => index >= 0);
  return (
    <div className="grid gap-4">
      <div className="rounded-[20px] border border-white/9 bg-black/22 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className={labelClass}>Video library</p>
            <p className="mt-1 text-xs text-white/36">
              {visibleIndices.length} shown · {items.length - visibleIndices.length} hidden
            </p>
          </div>
          <button
            className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-white px-3 text-xs font-semibold text-black transition hover:bg-[#ff3b1f] hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
            disabled={items.length >= 120}
            onClick={props.onAddWork}
            type="button"
          >
            <FaPlus /> Add video
          </button>
        </div>
        <p className="mt-3 text-xs leading-5 text-white/38">
          Visitor order sets visual priority: the first shown video becomes the
          large opening card. Hide saved videos to keep them here, or archive
          them to free an active slot. Music videos are included too.
        </p>
      </div>
      {items.map((item, index) => (
        <WorkCard
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
          <p className="text-sm font-semibold text-white/62">No videos yet</p>
          <p className="mt-2 text-xs leading-5 text-white/36">
            Add the first video. The public empty message remains visible until
            a complete video is saved.
          </p>
        </div>
      ) : null}
      {props.archivePanel}
    </div>
  );
}

function InspectorFields(props: InspectorProps) {
  if (props.activeSection === "hero") return <HeroInspector {...props} />;
  if (props.activeSection === "introduction") {
    return <IntroductionInspector {...props} />;
  }
  return <WorksInspector {...props} />;
}

function InspectorHeader({
  activeSection,
  closeButtonRef,
  onClose,
}: {
  activeSection: ShowreelEditorSection;
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

function formatSavedAt(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "just now";
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

export default function ShowreelEditor({
  archiveData,
  assets,
  disabled,
  loadError,
  mediaLoadError,
  migrationRequired,
  snapshot,
}: ShowreelEditorProps) {
  const [baseline, setBaseline] = useState(snapshot.draft);
  const [draft, setDraft] = useState(snapshot.draft);
  const [versions, setVersions] = useState(snapshot.versions);
  const baselineRef = useRef(baseline);
  const draftRef = useRef(draft);
  const versionsRef = useRef(versions);
  const [activeSection, setActiveSection] =
    useState<ShowreelEditorSection>("hero");
  const [device, setDevice] = useState<ShowreelPreviewDevice>("desktop");
  const [focusRequestId, setFocusRequestId] = useState(0);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState(false);
  const [dismissedEventId, setDismissedEventId] = useState("");
  const [mediaRevision, setMediaRevision] = useState(0);
  const [savingSection, setSavingSection] =
    useState<ShowreelEditorSection | null>(null);
  const [lastSaved, setLastSaved] = useState<{
    section: ShowreelEditorSection;
    savedAt: string;
  } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const mobileDialogRef = useRef<HTMLDialogElement | null>(null);
  const desktopCloseRef = useRef<HTMLButtonElement | null>(null);
  const handledEventIdsRef = useRef(new Set<string>());
  const latestSaveEventIdRef = useRef("");
  const archiveOperationRef = useRef<"mutation" | "page" | null>(null);
  const archiveReloadRef = useRef(false);
  const saveInFlight = useRef(false);
  const { clearDirty, confirmDiscard, hasUnsavedChanges, markDirty } =
    useUnsavedChangesGuard(
      "You have unsaved Showreel page changes. Leave and discard them?",
      true
    );

  const applySaveResult = useCallback(
    (result: ShowreelSaveState) => {
      if (!result.eventId || handledEventIdsRef.current.has(result.eventId)) return false;
      handledEventIdsRef.current.add(result.eventId);
      if (
        result.status !== "saved" ||
        !result.section ||
        !result.canonicalSection ||
        !result.versions
      ) {
        return false;
      }
      const confirmed = parseShowreelSectionSubmission(
        result.section,
        result.canonicalSection,
        result.versions,
        { requireExactCollectionVersions: true }
      );
      if (!confirmed.success) return false;
      const nextDraft = applyCanonicalSection(
        draftRef.current,
        result.section,
        confirmed.data.payload
      );
      if (!nextDraft) return false;
      const nextBaseline = {
        ...baselineRef.current,
        [result.section]: nextDraft[result.section],
      } as ShowreelEditorDraft;
      const nextVersions = {
        ...versionsRef.current,
        [result.section]: confirmed.data.versions,
      } as ShowreelEditorVersions;
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
      if (!getDirtyShowreelSections(nextBaseline, nextDraft).length) clearDirty();
      return true;
    },
    [clearDirty]
  );

  const clientAction = useCallback(
    async (previousState: ShowreelSaveState, formData: FormData) => {
      if (archiveOperationRef.current === "mutation" || archiveReloadRef.current || saveInFlight.current) return previousState;
      saveInFlight.current = true;
      const section = SHOWREEL_EDITOR_SECTIONS.find(
        (candidate) => candidate === formData.get("section")
      );
      setSavingSection(section || null);
      try {
        const result = await runEditorSave(previousState, () => saveShowreelSectionV2(previousState, formData), (response) => response.section === formData.get("section") && applySaveResult(response));
        latestSaveEventIdRef.current = result.eventId;
        if (needsEditorReload(result)) archiveReloadRef.current = true;
        return result;
      } finally {
        saveInFlight.current = false;
        setSavingSection(null);
      }
    },
    [applySaveResult]
  );
  const [saveState, formAction, pending] = useActionState(
    clientAction,
    INITIAL_SHOWREEL_SAVE_STATE
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

  const dirtySections = useMemo(
    () => getDirtyShowreelSections(baseline, draft),
    [baseline, draft]
  );
  const savedWorkIds = useMemo(
    () => new Set(Object.keys(versions.works.items)),
    [versions.works.items]
  );
  const activeDirty = isShowreelSectionDirty(baseline, draft, activeSection);
  const validation = useMemo(
    () => validateSection(draft, activeSection),
    [activeSection, draft]
  );
  const responseVisible =
    needsEditorReload(saveState) || (Boolean(saveState.eventId) && saveState.eventId !== dismissedEventId);
  const responseErrors =
    responseVisible && saveState.section === activeSection
      ? saveState.fieldErrors || {}
      : {};
  const errors = mergeErrors(validation.errors, responseErrors);
  const baseDisabled = disabled || migrationRequired || Boolean(loadError) || pending || needsEditorReload(saveState);
  const archive = useVisualContentArchive({
    collection: "showreel",
    initialData: archiveData,
    disabled: baseDisabled,
    locks: { operation: archiveOperationRef, reload: archiveReloadRef, save: saveInFlight },
    readActive: () => ({ items: draftRef.current.works.items, versions: versionsRef.current.works }),
    isDirty: () => isShowreelSectionDirty(baselineRef.current, draftRef.current, "works"),
    onReload: () => confirmDiscard(() => window.location.reload()),
    onAdopt: (confirmed, message) => {
      if (confirmed.collection !== "showreel") throw new Error("Wrong archive collection");
      const nextDraft = { ...draftRef.current, works: confirmed.payload };
      const nextBaseline = { ...baselineRef.current, works: confirmed.payload };
      const nextVersions = { ...versionsRef.current, works: confirmed.versions };
      draftRef.current = nextDraft;
      baselineRef.current = nextBaseline;
      versionsRef.current = nextVersions;
      setDraft(nextDraft);
      setBaseline(nextBaseline);
      setVersions(nextVersions);
      setMediaRevision(revision => revision + 1);
      setAnnouncement(message);
      if (latestSaveEventIdRef.current) setDismissedEventId(latestSaveEventIdRef.current);
      if (getDirtyShowreelSections(nextBaseline, nextDraft).length) markDirty();
      else clearDirty();
    },
  });
  const editorDisabled = baseDisabled || archive.pending || archive.reloadRequired;
  const canSave = !editorDisabled && activeDirty && validation.ok;
  const statusIsError =
    responseVisible && !["idle", "saved"].includes(saveState.status);

  function commitDraft(next: ShowreelEditorDraft) {
    if (archiveOperationRef.current === "mutation" || archiveReloadRef.current || saveInFlight.current) return;
    if (next === draftRef.current) return;
    draftRef.current = next;
    setDraft(next);
    if (latestSaveEventIdRef.current) {
      setDismissedEventId(latestSaveEventIdRef.current);
    }
    if (getDirtyShowreelSections(baselineRef.current, next).length) markDirty();
    else clearDirty();
  }

  function updateHero(patch: Partial<ShowreelHeroDraft>) {
    commitDraft({
      ...draftRef.current,
      hero: { ...draftRef.current.hero, ...patch },
    });
  }

  function updateIntroduction(
    patch: Partial<ShowreelEditorDraft["introduction"]>
  ) {
    commitDraft({
      ...draftRef.current,
      introduction: { ...draftRef.current.introduction, ...patch },
    });
  }

  function updateWork(index: number, patch: Partial<ShowreelWorkEditorItem>) {
    const items = draftRef.current.works.items.map((item, itemIndex) =>
      itemIndex === index ? { ...item, ...patch } : item
    );
    commitDraft({ ...draftRef.current, works: { items } });
  }

  function addWork() {
    const item: ShowreelWorkEditorItem = {
      id: `showreel:${crypto.randomUUID()}`,
      title: "",
      description: "",
      embedUrl: "",
      platform: "upload",
      thumbnailSrc: "",
      videoType: "showreel",
      isFeatured: false,
      isPublished: true,
      ...(snapshot.photoFramingAvailable ? { framing: null } : {}),
    };
    commitDraft({
      ...draftRef.current,
      works: { items: [...draftRef.current.works.items, item] },
    });
    setAnnouncement("New video draft added. Complete it, then save Videos.");
  }

  function discardWork(id: string) {
    if (Object.hasOwn(versionsRef.current.works.items, id)) return;
    commitDraft({
      ...draftRef.current,
      works: {
        items: draftRef.current.works.items.filter((item) => item.id !== id),
      },
    });
    setAnnouncement("Unsaved video draft discarded.");
  }

  function moveWork(index: number, direction: -1 | 1) {
    const items = draftRef.current.works.items;
    const visibleIndices = items
      .map((item, itemIndex) => (item.isPublished ? itemIndex : -1))
      .filter((itemIndex) => itemIndex >= 0);
    const position = visibleIndices.indexOf(index);
    const target = visibleIndices[position + direction];
    if (position < 0 || target === undefined) return;
    const next = moveShowreelEditorItem(items, index, target);
    if (next === items) return;
    commitDraft({ ...draftRef.current, works: { items: next } });
    setAnnouncement("Video moved. Save Videos to publish the new order.");
  }

  const selectSection = useCallback(
    (section: ShowreelEditorSection, itemId?: string) => {
      if (pending || savingSection || archiveOperationRef.current === "mutation") return;
      setActiveSection(section);
      setFocusRequestId((value) => value + 1);
      if (window.matchMedia("(min-width: 1280px)").matches) {
        setInspectorOpen(true);
      } else {
        setMobileInspectorOpen(true);
      }
      if (section === "works" && itemId) {
        window.requestAnimationFrame(() => {
          const candidates = Array.from(
            document.querySelectorAll<HTMLDetailsElement>(
              "[data-showreel-editor-work-id]"
            )
          ).filter((element) => element.dataset.showreelEditorWorkId === itemId);
          const target =
            candidates.find((element) => element.getClientRects().length > 0) ||
            candidates[0];
          if (!target) return;
          target.open = true;
          target.scrollIntoView({ behavior: "smooth", block: "center" });
          target.querySelector<HTMLElement>("summary")?.focus({
            preventScroll: true,
          });
        });
      }
    },
    [pending, savingSection]
  );

  function discardActiveSection() {
    commitDraft({
      ...draftRef.current,
      [activeSection]: baselineRef.current[activeSection],
    } as ShowreelEditorDraft);
    setMediaRevision((value) => value + 1);
    setAnnouncement(
      `${SECTION_META[activeSection].label} restored to its last saved version.`
    );
  }

  function reloadAfterConflict() {
    confirmDiscard(() => window.location.reload());
  }

  const inspectorProps: Omit<InspectorProps, "activeSection" | "instance"> = {
    device,
    onDeviceChange: setDevice,
    framingControls: <HeroFramingControls
      value={draft.hero.framing} src={draft.hero.backgroundSrc} posterSrc={draft.hero.posterSrc}
      mediaType={draft.hero.mediaType} onChange={(framing) => updateHero({ framing })}
      device={device} onDeviceChange={setDevice}
      disabled={editorDisabled || snapshot.draft.hero.framing === undefined}
      unavailableReason={snapshot.draft.hero.framing === undefined ? "Apply migration 0046 and reload to enable Hero framing. Other Hero fields remain editable." : undefined}
    />,
    assets,
    draft,
    errors,
    mediaRevision,
    savedWorkIds,
    archiveControl: archive.control,
    archivePanel: archive.panel,
    onAddWork: addWork,
    onDiscardWork: discardWork,
    onHeroChange: updateHero,
    onIntroductionChange: updateIntroduction,
    onMoveWork: moveWork,
    onWorkChange: updateWork,
  };

  const statusLabel = archive.reloadRequired
    ? "Reload required before further changes"
    : archive.pending
      ? "Updating Showreel archive..."
      : pending
    ? `Saving ${SECTION_META[savingSection || activeSection].label}...`
    : disabled
      ? "Editor is read-only"
      : !validation.ok
        ? `${SECTION_META[activeSection].label} needs attention`
        : activeDirty
          ? `${SECTION_META[activeSection].label} has unsaved changes`
          : dirtySections.length
            ? `${dirtySections.length} other ${dirtySections.length === 1 ? "section has" : "sections have"} unsaved changes`
            : "All Showreel changes are saved";
  const statusDetail = migrationRequired
    ? "Database migration 0032 is required before this editor can publish."
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
    <form action={formAction} data-unsaved-guard-bypass="true" id="showreel-content-archive">
      <input name="section" readOnly type="hidden" value={activeSection} />
      <input
        name="payload"
        readOnly
        type="hidden"
        value={JSON.stringify(getShowreelSectionPayload(draft, activeSection))}
      />
      <input
        name="versions"
        readOnly
        type="hidden"
        value={JSON.stringify(
          getShowreelSectionVersions(versions, activeSection)
        )}
      />

      {migrationRequired || loadError || mediaLoadError ? (
        <section aria-label="Showreel editor notices" className="mb-4 grid gap-2">
          {migrationRequired ? (
            <p className="rounded-[18px] border border-amber-300/16 bg-amber-400/[0.055] px-4 py-3 text-sm leading-6 text-amber-100/72">
              The Showreel layout is ready for review, but migration 0032 must
              be applied before saving.
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
                type="button"
              >
                <FaDesktop />
              </button>
              <button
                aria-label="Mobile preview"
                aria-pressed={device === "mobile"}
                className={`grid h-10 w-10 place-items-center rounded-lg text-xs transition ${device === "mobile" ? "bg-white text-black" : "text-white/42 hover:text-white"}`}
                onClick={() => setDevice("mobile")}
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
          aria-label="Showreel editor sections"
          className="flex gap-2 overflow-x-auto p-3 sm:p-4"
          role="group"
        >
          {SHOWREEL_EDITOR_SECTIONS.map((section) => {
            const active = section === activeSection;
            const dirty = dirtySections.includes(section);
            return (
              <button
                aria-pressed={active}
                className={`relative min-h-10 shrink-0 rounded-xl border px-3 text-xs font-semibold transition ${active ? "border-[#ff583f]/32 bg-[#ff3b1f] text-white" : "border-white/9 bg-white/[0.035] text-white/48 hover:border-white/20 hover:text-white"}`}
                disabled={pending || archive.pending}
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
        <ShowreelPreviewFrame
          device={device}
          draft={draft}
          focusRequestId={focusRequestId}
          footer={snapshot.footer}
          isLive={!disabled && !loadError && !migrationRequired}
          onSelectSection={selectSection}
          selectedSection={activeSection}
        />
        <aside
          aria-label="Showreel section inspector"
          className={`${panelClass} sticky top-4 hidden max-h-[calc(100vh-2rem)] overflow-hidden xl:block`}
        >
          {inspectorOpen ? (
            <>
              <InspectorHeader
                activeSection={activeSection}
                closeButtonRef={desktopCloseRef}
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
        aria-label="Showreel section inspector"
        className="m-0 ml-auto h-dvh max-h-none w-[min(94vw,440px)] max-w-none bg-transparent p-0 text-white backdrop:bg-black/76 xl:hidden"
        onCancel={(event) => {
          event.preventDefault();
          setMobileInspectorOpen(false);
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) setMobileInspectorOpen(false);
        }}
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
                {archive.feedbackPanel}
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

      {archive.feedbackPanel}
      {responseVisible && saveState.status !== "idle" ? (
        <section
          className={`mt-4 rounded-[18px] border px-4 py-3 text-sm leading-6 ${saveState.status === "saved" ? "border-emerald-300/16 bg-emerald-400/[0.06] text-emerald-50/76" : "border-red-300/16 bg-red-400/[0.06] text-red-50/76"}`}
          role={statusIsError ? "alert" : "status"}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2">
              {saveState.status === "saved" ? (
                <FaCheck />
              ) : (
                <FaExclamationTriangle />
              )}
              {saveState.message}
            </span>
            {needsEditorReload(saveState) ? (
              <button
                className="min-h-10 rounded-xl border border-red-100/16 px-3 text-xs font-semibold transition hover:bg-white hover:text-black"
                onClick={reloadAfterConflict}
                type="button"
              >
                Reload saved Showreel page
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
          <p aria-live="polite" className="sr-only">
            {announcement}
          </p>
        </div>
        <button
          aria-busy={pending}
          className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white px-5 text-sm font-semibold text-black transition hover:bg-[#ff3b1f] hover:text-white disabled:cursor-not-allowed disabled:opacity-40 sm:mt-0 sm:w-auto sm:min-w-[190px]"
          disabled={!canSave}
          type="submit"
        >
          {pending ? <FaSpinner className="animate-spin" /> : <FaCheck />}
          {pending
            ? `Saving ${SECTION_META[savingSection || activeSection].label}...`
            : `Save ${SECTION_META[activeSection].label}`}
        </button>
      </div>
    </form>
  );
}
