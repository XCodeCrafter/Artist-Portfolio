"use client";

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
  FaTrashAlt,
  FaTimes,
} from "react-icons/fa";
import { saveMusicSectionV2 } from "@/app/admin/v2/pages/music/actions";
import MediaAssetPicker from "@/components/admin/MediaAssetPicker";
import useUnsavedChangesGuard from "@/components/admin/useUnsavedChangesGuard";
import MusicPreviewFrame, {
  type MusicPreviewDevice,
} from "@/components/admin/v2/MusicPreviewFrame";
import {
  INITIAL_MUSIC_SAVE_STATE,
  MUSIC_EDITOR_SECTIONS,
  getDirtyMusicSections,
  getMusicSectionPayload,
  getMusicSectionVersions,
  isMusicSectionDirty,
  moveMusicEditorItem,
  deriveSpotifyEmbedUrl,
  parseMusicHeroDraft,
  parseMusicPlatformsDraft,
  parseMusicSectionSubmission,
  parseMusicSoundcloudDraft,
  parseMusicSpotifyDraft,
  type MusicEditorDraft,
  type MusicEditorSection,
  type MusicEditorSnapshot,
  type MusicEditorVersions,
  type MusicHeroDraft,
  type MusicPlatformEditorItem,
  type MusicSaveState,
  type MusicSoundcloudEditorItem,
} from "@/lib/admin/music-editor";
import type { MediaAsset } from "@/lib/admin/media";
import { detectSocialPlatformFromUrl } from "@/lib/content/social-platforms";

type MusicEditorProps = {
  snapshot: MusicEditorSnapshot;
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
  MusicEditorSection,
  { label: string; shortLabel: string; description: string }
> = {
  hero: {
    label: "Hero",
    shortLabel: "Hero",
    description: "Opening copy and background media",
  },
  platforms: {
    label: "Platforms",
    shortLabel: "Platforms",
    description: "Streaming destinations and their order",
  },
  spotify: {
    label: "Spotify",
    shortLabel: "Spotify",
    description: "Latest releases heading and player",
  },
  soundcloud: {
    label: "SoundCloud",
    shortLabel: "SoundCloud",
    description: "Latest mixes heading and tracks",
  },
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
  draft: MusicEditorDraft,
  section: MusicEditorSection
): { ok: true; errors: FieldErrors } | { ok: false; errors: FieldErrors } {
  const result =
    section === "hero"
      ? parseMusicHeroDraft(draft.hero)
      : section === "spotify"
        ? parseMusicSpotifyDraft({
            ...draft.spotify,
            embedUrl: deriveSpotifyEmbedUrl(draft.spotify.artistUrl),
          })
        : section === "platforms"
          ? parseMusicPlatformsDraft(getMusicSectionPayload(draft, section))
          : parseMusicSoundcloudDraft(draft.soundcloud);

  return result.success
    ? { ok: true, errors: {} }
    : { ok: false, errors: issueMap(result.error) };
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
  current: MusicEditorDraft,
  section: MusicEditorSection,
  value: unknown
): MusicEditorDraft | null {
  if (section === "hero") {
    const parsed = parseMusicHeroDraft(value);
    return parsed.success ? { ...current, hero: parsed.data } : null;
  }

  if (section === "spotify") {
    const parsed = parseMusicSpotifyDraft(value);
    return parsed.success ? { ...current, spotify: parsed.data } : null;
  }

  if (section === "platforms") {
    const parsed = parseMusicPlatformsDraft(value);
    if (!parsed.success) return null;
    return { ...current, platforms: parsed.data };
  }

  const parsed = parseMusicSoundcloudDraft(value);
  return parsed.success ? { ...current, soundcloud: parsed.data } : null;
}

function createDraftId(prefix: "platform" | "mix") {
  return `${prefix}:${crypto.randomUUID()}`;
}

function createEmptyPlatform(): MusicPlatformEditorItem {
  return {
    id: createDraftId("platform"),
    title: "",
    label: "",
    href: "",
    imageSrc: "",
    iconKey: "website",
    isPublished: true,
  };
}

function createEmptySoundcloudTrack(): MusicSoundcloudEditorItem {
  return {
    id: createDraftId("mix"),
    title: "",
    embedUrl: "",
    isPublished: true,
  };
}

function applySavedVersions(
  current: MusicEditorVersions,
  section: MusicEditorSection,
  value: unknown
): MusicEditorVersions {
  if (section === "hero") {
    const next = value as MusicEditorVersions["hero"];
    return { ...current, hero: next };
  }
  if (section === "platforms") {
    const next = value as MusicEditorVersions["platforms"];
    return { ...current, platforms: next };
  }
  if (section === "spotify") {
    const next = value as MusicEditorVersions["spotify"];
    return {
      ...current,
      spotify: next,
      soundcloud: {
        ...current.soundcloud,
        presentationUpdatedAt: next.presentationUpdatedAt,
      },
    };
  }

  const next = value as MusicEditorVersions["soundcloud"];
  return {
    ...current,
    spotify: {
      ...current.spotify,
      presentationUpdatedAt: next.presentationUpdatedAt,
    },
    soundcloud: next,
  };
}

function Field({
  children,
  error,
  label,
}: {
  children: ReactNode;
  error?: string;
  label: string;
}) {
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      {children}
      {error ? (
        <span className="mt-2 block text-xs leading-5 text-red-200" role="alert">
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

type InspectorFieldsProps = {
  activeSection: MusicEditorSection;
  assets: MediaAsset[];
  draft: MusicEditorDraft;
  errors: FieldErrors;
  instance: "desktop" | "mobile";
  mediaRevision: number;
  savedPlatformIds: ReadonlySet<string>;
  savedSoundcloudIds: ReadonlySet<string>;
  onAddPlatform: () => void;
  onAddSoundcloud: () => void;
  onHeroChange: (patch: Partial<MusicHeroDraft>) => void;
  onMovePlatform: (index: number, direction: -1 | 1) => void;
  onMoveSoundcloud: (index: number, direction: -1 | 1) => void;
  onPlatformChange: (
    index: number,
    patch: Partial<MusicPlatformEditorItem>
  ) => void;
  onSoundcloudChange: (
    index: number,
    patch: Partial<MusicSoundcloudEditorItem>
  ) => void;
  onRemoveNewPlatform: (id: string) => void;
  onRemoveNewSoundcloud: (id: string) => void;
  onSpotifyChange: (patch: Partial<MusicEditorDraft["spotify"]>) => void;
  onSoundcloudHeadingChange: (value: string) => void;
};

function HeroInspector({
  assets,
  draft,
  errors,
  instance,
  mediaRevision,
  onHeroChange,
}: Pick<
  InspectorFieldsProps,
  | "assets"
  | "draft"
  | "errors"
  | "instance"
  | "mediaRevision"
  | "onHeroChange"
>) {
  const hero = draft.hero;

  return (
    <div className="grid gap-5">
      <Field error={fieldMessage(errors, "title")} label="Main title">
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
          key={`${instance}-hero-background-${mediaRevision}`}
          kind="media"
          label="Hero background"
          mediaType={hero.mediaType}
          name={`${instance}-hero-background`}
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
        {fieldMessage(errors, "backgroundSrc") ? (
          <p className="mt-2 text-xs text-red-200" role="alert">
            {fieldMessage(errors, "backgroundSrc")}
          </p>
        ) : null}
      </div>

      <details className="rounded-2xl border border-white/9 bg-black/22 p-4">
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.16em] text-white/58">
          Advanced hero settings
        </summary>
        <div className="mt-5 grid gap-5">
          <Field
            error={fieldMessage(errors, "ctaHref")}
            label="Button destination"
          >
            <input
              className={inputClass}
              maxLength={2048}
              onChange={(event) =>
                onHeroChange({ ctaHref: event.target.value })
              }
              placeholder="#spotify-releases"
              value={hero.ctaHref}
            />
          </Field>
          <Field error={fieldMessage(errors, "mediaType")} label="Media type">
            <select
              className={inputClass}
              onChange={(event) =>
                onHeroChange({
                  mediaType: event.target.value as "image" | "video",
                })
              }
              value={hero.mediaType}
            >
              <option value="image">Image</option>
              <option value="video">Video</option>
            </select>
          </Field>
          <div>
            <MediaAssetPicker
              assets={assets}
              defaultValue={hero.posterSrc}
              key={`${instance}-hero-poster-${mediaRevision}`}
              kind="image"
              label="Video poster (optional)"
              name={`${instance}-hero-poster`}
              onValueChange={(value) => onHeroChange({ posterSrc: value })}
              showPreview={Boolean(hero.posterSrc)}
              value={hero.posterSrc}
            />
            {fieldMessage(errors, "posterSrc") ? (
              <p className="mt-2 text-xs text-red-200" role="alert">
                {fieldMessage(errors, "posterSrc")}
              </p>
            ) : null}
          </div>
        </div>
      </details>
    </div>
  );
}

function SpotifyInspector({
  draft,
  errors,
  onSpotifyChange,
}: Pick<InspectorFieldsProps, "draft" | "errors" | "onSpotifyChange">) {
  const spotify = draft.spotify;
  const spotifyUrlError =
    fieldMessage(errors, "artistUrl") || fieldMessage(errors, "embedUrl");
  return (
    <div className="grid gap-5">
      <Field
        error={fieldMessage(errors, "releasesHeading")}
        label="Section heading"
      >
        <input
          className={inputClass}
          maxLength={220}
          onChange={(event) =>
            onSpotifyChange({ releasesHeading: event.target.value })
          }
          value={spotify.releasesHeading}
        />
      </Field>
      <Field error={spotifyUrlError} label="Spotify artist URL">
        <input
          className={inputClass}
          inputMode="url"
          maxLength={2048}
          onChange={(event) => {
            const artistUrl = event.target.value;
            onSpotifyChange({
              artistUrl,
              embedUrl: deriveSpotifyEmbedUrl(artistUrl),
            });
          }}
          placeholder="https://open.spotify.com/artist/..."
          value={spotify.artistUrl}
        />
      </Field>
      <p className="rounded-2xl border border-white/8 bg-white/[0.025] px-4 py-3 text-xs leading-5 text-white/38">
        Paste the normal Spotify artist link. The player link is created
        automatically.
      </p>
    </div>
  );
}

function PlatformsInspector({
  assets,
  draft,
  errors,
  instance,
  mediaRevision,
  onAddPlatform,
  onMovePlatform,
  onPlatformChange,
  onRemoveNewPlatform,
  savedPlatformIds,
}: Pick<
  InspectorFieldsProps,
  | "assets"
  | "draft"
  | "errors"
  | "instance"
  | "mediaRevision"
  | "onAddPlatform"
  | "onMovePlatform"
  | "onPlatformChange"
  | "onRemoveNewPlatform"
  | "savedPlatformIds"
>) {
  const items = draft.platforms.items;
  return (
    <div className="grid gap-4">
      <div className="flex items-start justify-between gap-3 rounded-2xl border border-white/8 bg-white/[0.025] p-3.5">
        <p className="max-w-[230px] text-xs leading-5 text-white/42">
          Hide a saved card to remove it from the public page without deleting
          it. New unsaved cards can be discarded.
        </p>
        <button
          className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl bg-white px-3 text-xs font-semibold text-black transition hover:bg-[#ff3b1f] hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
          disabled={items.length >= 32}
          onClick={onAddPlatform}
          title={items.length >= 32 ? "Platform limit reached" : undefined}
          type="button"
        >
          <FaPlus /> Add
        </button>
      </div>
      {items.map((item, index) => (
        <section
          className="rounded-[20px] border border-white/9 bg-black/22 p-4"
          key={item.id}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[#ff715b]">
                Platform {String(index + 1).padStart(2, "0")}
              </p>
              <p className="mt-1 truncate text-sm font-semibold text-white/78">
                {item.title || "Untitled platform"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <MoveButtons
                downDisabled={index === items.length - 1}
                label={item.title || `platform ${index + 1}`}
                onDown={() => onMovePlatform(index, 1)}
                onUp={() => onMovePlatform(index, -1)}
                upDisabled={index === 0}
              />
              {!savedPlatformIds.has(item.id) ? (
                <button
                  aria-label={`Discard ${item.title || `new platform ${index + 1}`}`}
                  className="grid h-10 w-10 place-items-center rounded-xl border border-red-200/12 text-red-100/48 transition hover:border-red-200/28 hover:bg-red-300/10 hover:text-red-100"
                  onClick={() => onRemoveNewPlatform(item.id)}
                  title="Discard unsaved platform"
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
              label="Platform card"
              onChange={(isPublished) =>
                onPlatformChange(index, { isPublished })
              }
            />
            <Field
              error={fieldMessage(errors, `items.${index}.title`)}
              label="Title"
            >
              <input
                className={inputClass}
                maxLength={220}
                onChange={(event) =>
                  onPlatformChange(index, { title: event.target.value })
                }
                value={item.title}
              />
            </Field>
            <Field
              error={fieldMessage(errors, `items.${index}.label`)}
              label="Small label"
            >
              <input
                className={inputClass}
                maxLength={220}
                onChange={(event) =>
                  onPlatformChange(index, { label: event.target.value })
                }
                value={item.label}
              />
            </Field>
            <Field
              error={fieldMessage(errors, `items.${index}.href`)}
              label="Destination URL"
            >
              <input
                className={inputClass}
                inputMode="url"
                maxLength={2048}
                onChange={(event) => {
                  const href = event.target.value;
                  onPlatformChange(index, {
                    href,
                    iconKey: detectSocialPlatformFromUrl(href),
                  });
                }}
                value={item.href}
              />
            </Field>
            <div>
              <MediaAssetPicker
                assets={assets}
                defaultValue={item.imageSrc}
                key={`${instance}-platform-${item.id}-${mediaRevision}`}
                kind="image"
                label="Card image"
                name={`${instance}-platform-image-${index}`}
                onValueChange={(imageSrc) =>
                  onPlatformChange(index, { imageSrc })
                }
                required
                value={item.imageSrc}
              />
              {fieldMessage(errors, `items.${index}.imageSrc`) ? (
                <p className="mt-2 text-xs text-red-200" role="alert">
                  {fieldMessage(errors, `items.${index}.imageSrc`)}
                </p>
              ) : null}
            </div>
          </div>
        </section>
      ))}
      {!items.length ? (
        <p className="rounded-2xl border border-dashed border-white/12 px-4 py-8 text-center text-sm text-white/38">
          No platform cards yet. Add the first destination when you are ready.
        </p>
      ) : null}
    </div>
  );
}

function SoundcloudInspector({
  draft,
  errors,
  onAddSoundcloud,
  onMoveSoundcloud,
  onRemoveNewSoundcloud,
  onSoundcloudChange,
  onSoundcloudHeadingChange,
  savedSoundcloudIds,
}: Pick<
  InspectorFieldsProps,
  | "draft"
  | "errors"
  | "onAddSoundcloud"
  | "onMoveSoundcloud"
  | "onRemoveNewSoundcloud"
  | "onSoundcloudChange"
  | "onSoundcloudHeadingChange"
  | "savedSoundcloudIds"
>) {
  const soundcloud = draft.soundcloud;
  return (
    <div className="grid gap-5">
      <Field
        error={fieldMessage(errors, "mixesHeading")}
        label="Section heading"
      >
        <input
          className={inputClass}
          maxLength={220}
          onChange={(event) => onSoundcloudHeadingChange(event.target.value)}
          value={soundcloud.mixesHeading}
        />
      </Field>

      <div className="grid gap-4 border-t border-white/8 pt-5">
        <div className="flex items-start justify-between gap-3 rounded-2xl border border-white/8 bg-white/[0.025] p-3.5">
          <p className="max-w-[230px] text-xs leading-5 text-white/42">
            Hide a saved mix to take it off the public page and restore it
            later. Only new unsaved mixes can be discarded.
          </p>
          <button
            className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl bg-white px-3 text-xs font-semibold text-black transition hover:bg-[#ff3b1f] hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
            disabled={soundcloud.items.length >= 48}
            onClick={onAddSoundcloud}
            title={
              soundcloud.items.length >= 48
                ? "SoundCloud limit reached"
                : undefined
            }
            type="button"
          >
            <FaPlus /> Add
          </button>
        </div>
        {soundcloud.items.map((item, index) => (
          <section
            className="rounded-[20px] border border-white/9 bg-black/22 p-4"
            key={item.id}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[#ff715b]">
                  Mix {String(index + 1).padStart(2, "0")}
                </p>
                <p className="mt-1 truncate text-sm font-semibold text-white/78">
                  {item.title || "Untitled mix"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <MoveButtons
                  downDisabled={index === soundcloud.items.length - 1}
                  label={item.title || `mix ${index + 1}`}
                  onDown={() => onMoveSoundcloud(index, 1)}
                  onUp={() => onMoveSoundcloud(index, -1)}
                  upDisabled={index === 0}
                />
                {!savedSoundcloudIds.has(item.id) ? (
                  <button
                    aria-label={`Discard ${item.title || `new mix ${index + 1}`}`}
                    className="grid h-10 w-10 place-items-center rounded-xl border border-red-200/12 text-red-100/48 transition hover:border-red-200/28 hover:bg-red-300/10 hover:text-red-100"
                    onClick={() => onRemoveNewSoundcloud(item.id)}
                    title="Discard unsaved mix"
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
                label="Mix"
                onChange={(isPublished) =>
                  onSoundcloudChange(index, { isPublished })
                }
              />
              <Field
                error={fieldMessage(errors, `items.${index}.title`)}
                label="Title (optional)"
              >
                <input
                  className={inputClass}
                  maxLength={220}
                  onChange={(event) =>
                    onSoundcloudChange(index, { title: event.target.value })
                  }
                  value={item.title}
                />
              </Field>
              <Field
                error={fieldMessage(errors, `items.${index}.embedUrl`)}
                label="SoundCloud track URL"
              >
                <input
                  className={inputClass}
                  inputMode="url"
                  maxLength={2048}
                  onChange={(event) =>
                    onSoundcloudChange(index, {
                      embedUrl: event.target.value,
                    })
                  }
                  value={item.embedUrl}
                />
              </Field>
            </div>
          </section>
        ))}
        {!soundcloud.items.length ? (
          <p className="rounded-2xl border border-dashed border-white/12 px-4 py-8 text-center text-sm text-white/38">
            No SoundCloud mixes yet. Add the first track when you are ready.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function InspectorFields(props: InspectorFieldsProps) {
  if (props.activeSection === "hero") {
    return <HeroInspector {...props} />;
  }
  if (props.activeSection === "spotify") {
    return <SpotifyInspector {...props} />;
  }
  if (props.activeSection === "platforms") {
    return <PlatformsInspector {...props} />;
  }
  return <SoundcloudInspector {...props} />;
}

function InspectorHeader({
  activeSection,
  onClose,
}: {
  activeSection: MusicEditorSection;
  onClose: () => void;
}) {
  const meta = SECTION_META[activeSection];
  return (
    <div className="flex items-start justify-between gap-3 border-b border-white/8 p-4 sm:p-5">
      <div className="min-w-0">
        <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-[#ff715b]">
          Active inspector
        </p>
        <h2 className="heading-ui mt-2 text-lg font-semibold text-white">
          {meta.label}
        </h2>
        <p className="mt-1 text-xs leading-5 text-white/38">
          {meta.description}
        </p>
      </div>
      <button
        aria-label="Close inspector"
        className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/9 text-white/48 outline-none transition hover:bg-white hover:text-black focus-visible:ring-2 focus-visible:ring-white/60"
        onClick={onClose}
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

export default function MusicEditor({
  snapshot,
  assets,
  disabled,
  migrationRequired,
  loadError,
  mediaLoadError,
}: MusicEditorProps) {
  const [baseline, setBaseline] = useState(snapshot.draft);
  const [draft, setDraft] = useState(snapshot.draft);
  const [versions, setVersions] = useState(snapshot.versions);
  const baselineRef = useRef(baseline);
  const draftRef = useRef(draft);
  const versionsRef = useRef(versions);

  const [activeSection, setActiveSection] =
    useState<MusicEditorSection>("hero");
  const [device, setDevice] = useState<MusicPreviewDevice>("desktop");
  const [previewFocusRequestId, setPreviewFocusRequestId] = useState(0);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState(false);
  const [dismissedEventId, setDismissedEventId] = useState("");
  const [mediaRevision, setMediaRevision] = useState(0);
  const [lastSaved, setLastSaved] = useState<{
    section: MusicEditorSection;
    savedAt: string;
  } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const mobileDialogRef = useRef<HTMLDialogElement | null>(null);
  const handledEventIdsRef = useRef(new Set<string>());
  const latestSaveEventIdRef = useRef("");

  const {
    clearDirty,
    confirmDiscard,
    hasUnsavedChanges,
    markDirty,
  } = useUnsavedChangesGuard(
    "You have unsaved Music page changes. Leave and discard them?",
    true
  );

  const applySaveResult = useCallback(
    (result: MusicSaveState) => {
      if (!result.eventId || handledEventIdsRef.current.has(result.eventId)) {
        return;
      }
      handledEventIdsRef.current.add(result.eventId);
      if (handledEventIdsRef.current.size > 64) {
        handledEventIdsRef.current = new Set([result.eventId]);
      }

      if (
        result.status !== "saved" ||
        !result.section ||
        !result.canonicalSection ||
        !result.versions
      ) {
        return;
      }

      const confirmed = parseMusicSectionSubmission(
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
      } as MusicEditorDraft;
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
      setMediaRevision((revision) => revision + 1);
      setLastSaved({
        section: result.section,
        savedAt: result.savedAt || new Date().toISOString(),
      });
      setAnnouncement(`${SECTION_META[result.section].label} saved.`);

      if (!getDirtyMusicSections(nextBaseline, nextDraft).length) {
        clearDirty();
      }
    },
    [clearDirty]
  );

  const clientAction = useCallback(
    async (previousState: MusicSaveState, formData: FormData) => {
      const result = await saveMusicSectionV2(previousState, formData);
      latestSaveEventIdRef.current = result.eventId;
      applySaveResult(result);
      return result;
    },
    [applySaveResult]
  );
  const [saveState, formAction, pending] = useActionState(
    clientAction,
    INITIAL_MUSIC_SAVE_STATE
  );

  useEffect(() => {
    if (window.matchMedia("(min-width: 1280px)").matches) return;
    const frame = window.requestAnimationFrame(() => setDevice("mobile"));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const dialog = mobileDialogRef.current;
    if (!dialog) return;
    if (mobileInspectorOpen && !dialog.open) {
      dialog.showModal();
    } else if (!mobileInspectorOpen && dialog.open) {
      dialog.close();
    }
  }, [mobileInspectorOpen]);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1280px)");
    const closeMobileDrawerAtDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) setMobileInspectorOpen(false);
    };
    desktop.addEventListener("change", closeMobileDrawerAtDesktop);
    return () =>
      desktop.removeEventListener("change", closeMobileDrawerAtDesktop);
  }, []);

  const dirtySections = useMemo(
    () => getDirtyMusicSections(baseline, draft),
    [baseline, draft]
  );
  const savedPlatformIds = useMemo(
    () => new Set(Object.keys(versions.platforms.items)),
    [versions.platforms.items]
  );
  const savedSoundcloudIds = useMemo(
    () => new Set(Object.keys(versions.soundcloud.items)),
    [versions.soundcloud.items]
  );
  const activeDirty = isMusicSectionDirty(baseline, draft, activeSection);
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

  function commitDraft(next: MusicEditorDraft) {
    if (next === draftRef.current) return;
    draftRef.current = next;
    setDraft(next);
    if (latestSaveEventIdRef.current) {
      setDismissedEventId(latestSaveEventIdRef.current);
    }
    if (getDirtyMusicSections(baselineRef.current, next).length) {
      markDirty();
    } else {
      clearDirty();
    }
  }

  function updateHero(patch: Partial<MusicHeroDraft>) {
    commitDraft({
      ...draftRef.current,
      hero: { ...draftRef.current.hero, ...patch },
    });
  }

  function updateSpotify(patch: Partial<MusicEditorDraft["spotify"]>) {
    commitDraft({
      ...draftRef.current,
      spotify: { ...draftRef.current.spotify, ...patch },
    });
  }

  function updatePlatform(
    index: number,
    patch: Partial<MusicPlatformEditorItem>
  ) {
    const items = draftRef.current.platforms.items.map((item, itemIndex) =>
      itemIndex === index ? { ...item, ...patch } : item
    );
    commitDraft({
      ...draftRef.current,
      platforms: { items },
    });
  }

  function addPlatform() {
    const items = [...draftRef.current.platforms.items, createEmptyPlatform()];
    commitDraft({ ...draftRef.current, platforms: { items } });
    setAnnouncement(
      "New platform draft added. Complete its details, then save Platforms."
    );
  }

  function removeNewPlatform(id: string) {
    if (id in versionsRef.current.platforms.items) return;
    const items = draftRef.current.platforms.items.filter(
      (item) => item.id !== id
    );
    commitDraft({ ...draftRef.current, platforms: { items } });
    setAnnouncement("Unsaved platform draft discarded.");
  }

  function movePlatform(index: number, direction: -1 | 1) {
    const items = moveMusicEditorItem(
      draftRef.current.platforms.items,
      index,
      index + direction
    );
    if (items === draftRef.current.platforms.items) return;
    commitDraft({ ...draftRef.current, platforms: { items } });
    setAnnouncement(
      `Platform moved to position ${index + direction + 1}. Save Platforms to publish the order.`
    );
  }

  function updateSoundcloud(
    index: number,
    patch: Partial<MusicSoundcloudEditorItem>
  ) {
    const items = draftRef.current.soundcloud.items.map((item, itemIndex) =>
      itemIndex === index ? { ...item, ...patch } : item
    );
    commitDraft({
      ...draftRef.current,
      soundcloud: { ...draftRef.current.soundcloud, items },
    });
  }

  function addSoundcloud() {
    const items = [
      ...draftRef.current.soundcloud.items,
      createEmptySoundcloudTrack(),
    ];
    commitDraft({
      ...draftRef.current,
      soundcloud: { ...draftRef.current.soundcloud, items },
    });
    setAnnouncement(
      "New SoundCloud draft added. Paste its track URL, then save SoundCloud."
    );
  }

  function removeNewSoundcloud(id: string) {
    if (id in versionsRef.current.soundcloud.items) return;
    const items = draftRef.current.soundcloud.items.filter(
      (item) => item.id !== id
    );
    commitDraft({
      ...draftRef.current,
      soundcloud: { ...draftRef.current.soundcloud, items },
    });
    setAnnouncement("Unsaved SoundCloud draft discarded.");
  }

  function moveSoundcloud(index: number, direction: -1 | 1) {
    const items = moveMusicEditorItem(
      draftRef.current.soundcloud.items,
      index,
      index + direction
    );
    if (items === draftRef.current.soundcloud.items) return;
    commitDraft({
      ...draftRef.current,
      soundcloud: { ...draftRef.current.soundcloud, items },
    });
    setAnnouncement(
      `Mix moved to position ${index + direction + 1}. Save SoundCloud to publish the order.`
    );
  }

  const selectSection = useCallback(
    (section: MusicEditorSection) => {
      if (pending) return;
      setActiveSection(section);
      setPreviewFocusRequestId((requestId) => requestId + 1);
      if (window.matchMedia("(min-width: 1280px)").matches) {
        setInspectorOpen(true);
      } else {
        setMobileInspectorOpen(true);
      }
    },
    [pending]
  );

  function discardActiveSection() {
    const next = {
      ...draftRef.current,
      [activeSection]: baselineRef.current[activeSection],
    } as MusicEditorDraft;
    commitDraft(next);
    setMediaRevision((revision) => revision + 1);
    setAnnouncement(
      `${SECTION_META[activeSection].label} draft restored to its last saved version.`
    );
  }

  function reloadAfterConflict() {
    if (!confirmDiscard()) return;
    window.location.reload();
  }

  const inspectorProps: Omit<InspectorFieldsProps, "instance"> = {
    activeSection,
    assets,
    draft,
    errors,
    mediaRevision,
    savedPlatformIds,
    savedSoundcloudIds,
    onAddPlatform: addPlatform,
    onAddSoundcloud: addSoundcloud,
    onHeroChange: updateHero,
    onMovePlatform: movePlatform,
    onMoveSoundcloud: moveSoundcloud,
    onPlatformChange: updatePlatform,
    onRemoveNewPlatform: removeNewPlatform,
    onRemoveNewSoundcloud: removeNewSoundcloud,
    onSoundcloudChange: updateSoundcloud,
    onSpotifyChange: updateSpotify,
    onSoundcloudHeadingChange: (mixesHeading) =>
      commitDraft({
        ...draftRef.current,
        soundcloud: { ...draftRef.current.soundcloud, mixesHeading },
      }),
  };

  const statusLabel = pending
    ? `Saving ${SECTION_META[activeSection].label}...`
    : disabled
      ? "Saving paused"
      : activeDirty
        ? `${SECTION_META[activeSection].label} has unsaved changes`
        : dirtySections.length
          ? `${dirtySections.length} other section${dirtySections.length === 1 ? "" : "s"} changed`
          : "Draft matches the last save";
  const statusDetail = !validation.ok
    ? "Fix the highlighted fields before saving this section."
    : responseVisible && statusIsError
      ? saveState.message
      : lastSaved
        ? `${SECTION_META[lastSaved.section].label} last saved at ${formatSavedAt(lastSaved.savedAt)}.`
        : "Only the active section is written when you save.";

  return (
    <form
      action={formAction}
      data-unsaved-guard-bypass="true"
      noValidate
      onSubmit={(event) => {
        if (!canSave) {
          event.preventDefault();
          setAnnouncement(
            validation.ok
              ? "There is nothing valid to save in the active section."
              : "Fix the highlighted fields before saving."
          );
        }
      }}
    >
      <input name="section" readOnly type="hidden" value={activeSection} />
      <input
        name="payload"
        readOnly
        type="hidden"
        value={JSON.stringify(getMusicSectionPayload(draft, activeSection))}
      />
      <input
        name="versions"
        readOnly
        type="hidden"
        value={JSON.stringify(getMusicSectionVersions(versions, activeSection))}
      />

      {(migrationRequired || loadError || (disabled && !pending)) && (
        <section
          className="mb-4 rounded-[20px] border border-amber-300/18 bg-amber-400/[0.065] p-4 text-sm leading-6 text-amber-50/76"
          role="alert"
        >
          <div className="flex items-start gap-3">
            <FaExclamationTriangle className="mt-1 shrink-0 text-amber-200" />
            <div>
              <p className="font-semibold text-amber-50">
                Editing paused · layout example only
              </p>
              <p className="mt-1">
                The content below is sample fallback data, not the current
                public Music page.
              </p>
              {migrationRequired ? (
                <p className="mt-1">
                  Apply database migrations through 0029 to enable section-by-section
                  saves.
                </p>
              ) : null}
              {loadError ? <p className="mt-1">{loadError}</p> : null}
              {disabled && !migrationRequired && !loadError ? (
                <p className="mt-1">
                  Admin database access is unavailable. The preview remains
                  available for review.
                </p>
              ) : null}
            </div>
          </div>
        </section>
      )}

      {mediaLoadError ? (
        <section
          className="mb-4 rounded-[20px] border border-sky-300/14 bg-sky-400/[0.05] p-4 text-sm leading-6 text-sky-50/72"
          role="status"
        >
          The media library could not be loaded. Existing source URLs and all
          non-media fields remain editable; reopen the page before choosing a
          different uploaded asset.
        </section>
      ) : null}

      <section className={`${panelClass} mb-4 overflow-hidden`}>
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/8 p-4 sm:p-5">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#ff715b]">
              Real page preview
            </p>
            <h2 className="heading-ui mt-2 text-xl font-semibold text-white">
              Click the section you want to edit
            </h2>
            <p className="mt-1 text-xs text-white/38">
              The real {device} layout, scaled to fit this workspace.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div
              aria-label="Preview device"
              className="inline-flex rounded-xl border border-white/9 bg-black/25 p-1"
              role="group"
            >
              <button
                aria-pressed={device === "desktop"}
                className={`grid h-10 w-10 place-items-center rounded-lg text-xs transition ${
                  device === "desktop"
                    ? "bg-white text-black"
                    : "text-white/42 hover:text-white"
                }`}
                onClick={() => setDevice("desktop")}
                title="Desktop preview"
                type="button"
              >
                <FaDesktop />
                <span className="sr-only">Desktop</span>
              </button>
              <button
                aria-pressed={device === "mobile"}
                className={`grid h-10 w-10 place-items-center rounded-lg text-xs transition ${
                  device === "mobile"
                    ? "bg-white text-black"
                    : "text-white/42 hover:text-white"
                }`}
                onClick={() => setDevice("mobile")}
                title="Mobile preview"
                type="button"
              >
                <FaMobileAlt />
                <span className="sr-only">Mobile</span>
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

        <div className="flex gap-2 overflow-x-auto p-3 sm:p-4" role="tablist">
          {MUSIC_EDITOR_SECTIONS.map((section) => {
            const active = activeSection === section;
            const dirty = dirtySections.includes(section);
            return (
              <button
                aria-selected={active}
                className={`relative min-h-10 shrink-0 rounded-xl border px-3 text-xs font-semibold transition ${
                  active
                    ? "border-[#ff583f]/32 bg-[#ff3b1f] text-white"
                    : "border-white/9 bg-white/[0.035] text-white/48 hover:border-white/20 hover:text-white"
                }`}
                disabled={pending}
                key={section}
                onClick={() => selectSection(section)}
                role="tab"
                type="button"
              >
                {SECTION_META[section].shortLabel}
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
        className={`grid gap-4 xl:items-start ${
          inspectorOpen
            ? "xl:grid-cols-[minmax(0,1fr)_minmax(350px,420px)]"
            : "xl:grid-cols-[minmax(0,1fr)_64px]"
        }`}
      >
        <MusicPreviewFrame
          device={device}
          draft={draft}
          focusRequestId={previewFocusRequestId}
          footer={snapshot.footer}
          isLive={!disabled && !loadError && !migrationRequired}
          onSelectSection={selectSection}
          selectedSection={activeSection}
        />

        <aside
          aria-label="Music section inspector"
          className={`${panelClass} sticky top-4 hidden max-h-[calc(100vh-2rem)] overflow-hidden xl:block`}
        >
          {inspectorOpen ? (
            <>
              <InspectorHeader
                activeSection={activeSection}
                onClose={() => setInspectorOpen(false)}
              />
              <fieldset
                className="admin-scrollbar-none max-h-[calc(100vh-11rem)] overflow-y-auto p-4 sm:p-5"
                disabled={editorDisabled}
              >
                <InspectorFields {...inspectorProps} instance="desktop" />
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
              className="flex min-h-[260px] w-full flex-col items-center justify-center gap-3 text-white/48 outline-none transition hover:bg-white/[0.055] hover:text-white focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-inset"
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
        aria-label="Music section inspector"
        className="m-0 ml-auto h-dvh max-h-none w-[min(94vw,440px)] max-w-none bg-transparent p-0 text-white backdrop:bg-black/76 xl:hidden"
        onCancel={(event) => {
          event.preventDefault();
          setMobileInspectorOpen(false);
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            setMobileInspectorOpen(false);
          }
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
                <InspectorFields {...inspectorProps} instance="mobile" />
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
                <p className="text-xs font-semibold text-white/72">
                  {statusLabel}
                </p>
                <p
                  aria-live={statusIsError ? "assertive" : "polite"}
                  className={`mt-1 text-[11px] leading-5 ${
                    statusIsError ? "text-red-100/72" : "text-white/38"
                  }`}
                >
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
                    ? `Saving ${SECTION_META[activeSection].label}...`
                    : `Save ${SECTION_META[activeSection].label}`}
                </button>
              </div>
            </>
          ) : null}
        </div>
      </dialog>

      {responseVisible && saveState.status !== "idle" ? (
        <section
          className={`mt-4 rounded-[18px] border px-4 py-3 text-sm leading-6 ${
            saveState.status === "saved"
              ? "border-emerald-300/16 bg-emerald-400/[0.06] text-emerald-50/76"
              : "border-red-300/16 bg-red-400/[0.06] text-red-50/76"
          }`}
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
            {saveState.status === "conflict" ? (
              <button
                className="min-h-10 rounded-xl border border-red-100/16 px-3 text-xs font-semibold transition hover:bg-white hover:text-black"
                onClick={reloadAfterConflict}
                type="button"
              >
                Reload saved Music page
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
              className={`h-2 w-2 rounded-full ${
                pending
                  ? "bg-sky-300"
                  : disabled || statusIsError || !validation.ok
                    ? "bg-amber-300"
                    : hasUnsavedChanges
                      ? "bg-amber-300"
                      : "bg-emerald-300"
              }`}
            />
            {statusLabel}
          </p>
          <p className="mt-1 text-[10px] leading-4 text-white/34">
            {statusDetail}
          </p>
          <p aria-live="polite" className="sr-only">
            {announcement}
          </p>
          <Link
            className="mt-2 inline-flex items-center gap-2 text-[10px] font-semibold text-white/42 underline decoration-white/18 underline-offset-4 transition hover:text-white"
            href="/admin/content#music-links"
          >
            Open classic Music editor <FaExternalLinkAlt />
          </Link>
        </div>

        <div className="mt-3 flex items-center gap-2 sm:mt-0">
          {inspectorOpen ? null : (
            <button
              aria-label="Open inspector"
              className="hidden h-12 items-center gap-2 rounded-2xl border border-white/10 px-4 text-xs font-semibold text-white/56 transition hover:bg-white hover:text-black xl:inline-flex"
              onClick={() => setInspectorOpen(true)}
              type="button"
            >
              <FaChevronLeft /> Inspector
            </button>
          )}
          <button
            aria-busy={pending}
            className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-white px-5 text-sm font-semibold text-black transition hover:bg-[#ff3b1f] hover:text-white disabled:cursor-not-allowed disabled:opacity-40 sm:min-w-[190px] sm:flex-none"
            disabled={!canSave}
            type="submit"
          >
            {pending ? <FaSpinner className="animate-spin" /> : <FaCheck />}
            {pending
              ? `Saving ${SECTION_META[activeSection].label}...`
              : `Save ${SECTION_META[activeSection].label}`}
          </button>
        </div>
      </div>
    </form>
  );
}
