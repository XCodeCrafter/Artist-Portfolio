"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  FaCheckCircle,
  FaArrowDown,
  FaArrowUp,
  FaEye,
  FaEyeSlash,
  FaExclamationTriangle,
  FaImage,
  FaLayerGroup,
  FaPhotoVideo,
  FaPlus,
  FaSearch,
  FaSpinner,
  FaTrash,
  FaUndo,
  FaUpload,
  FaVideo,
  FaExternalLinkAlt,
} from "react-icons/fa";
import CopyButton from "@/components/admin/CopyButton";
import ActionButton from "@/components/admin/ActionButton";
import AdminDisclosure from "@/components/admin/AdminDisclosure";
import MediaAssetPicker from "@/components/admin/MediaAssetPicker";
import useUnsavedChangesGuard from "@/components/admin/useUnsavedChangesGuard";
import {
  deleteMediaAsset,
  deleteMediaGalleryImage,
  deleteShowreelVideo,
  finalizeMediaUpload,
  moveGalleryImage,
  prepareMediaUpload,
  restoreMediaAsset,
  saveGalleryHero,
  saveGalleryPresentation,
  saveShowreelHero,
  saveShowreelPresentation,
  saveShowreelVideo,
  saveMediaGalleryImage,
  updateMediaAsset,
} from "@/app/admin/media/actions";
import type {
  EditableGalleryImage,
  EditablePortfolioContent,
  EditableVideoItem,
} from "@/lib/admin/content";
import type { MediaAsset } from "@/lib/admin/media";
import { VIDEO_TYPES, type PortfolioType } from "@/lib/content";
import { createClient } from "@/lib/supabase/client";

type MediaManagerProps = {
  assets: MediaAsset[];
  content: EditablePortfolioContent;
  contentIsConfigured: boolean;
  contentLoadError?: string;
  galleryV2Enabled: boolean;
  showreelV2Enabled: boolean;
  isConfigured: boolean;
  loadError?: string;
  portfolioType: PortfolioType;
  status?: string;
  initialMode?: MediaMode;
};

type MediaFilter =
  | "all"
  | "image"
  | "video"
  | "published"
  | "hidden"
  | "unused"
  | "missing_alt"
  | "oversized"
  | "recent"
  | "trash";
export type MediaMode = "studio" | "showreel" | "library";
type MediaSort = "order" | "newest" | "label" | "largest";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const MAX_BATCH_FILES = 30;
const MAX_BATCH_BYTES = 500 * 1024 * 1024;
const ACCEPTED_MEDIA_TYPES = new Set([
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);

const statusCopy: Record<string, string> = {
  "bucket-error": "Storage bucket could not be prepared.",
  deleted: "Media moved to Trash. Its storage file is still recoverable.",
  "delete-error": "Delete failed.",
  "media-in-use":
    "This asset is still used on the public portfolio. Remove or replace it in the listed sections before moving it to Trash.",
  "trash-migration-required":
    "Media Trash needs Supabase migration 0023_admin_operations_hardening.sql.",
  restored: "Media restored from Trash.",
  "restore-error": "Media could not be restored.",
  "delete-gallery-error": "Gallery image could not be deleted.",
  "deleted-gallery-image": "Gallery image deleted.",
  "file-too-large": "File is too large.",
  "invalid-file-type": "Unsupported file type.",
  "invalid-gallery-metadata": "Gallery image metadata needs attention.",
  "invalid-metadata": "Metadata needs attention.",
  "missing-file": "Choose a file before upload.",
  "missing-service": "Server-side Supabase admin key is missing.",
  "save-error": "Media metadata could not be saved.",
  "save-gallery-error": "Gallery image could not be saved.",
  "save-gallery-copy-error": "Gallery text could not be saved.",
  "save-gallery-hero-error": "Gallery hero could not be saved.",
  "saved-gallery-copy": "Gallery text and Interlude saved.",
  "saved-gallery-hero": "Gallery hero saved.",
  "saved-showreel-hero": "Showreel hero saved.",
  "saved-showreel-video": "Showreel video saved.",
  "saved-showreel-copy": "Showreel page text saved.",
  "deleted-showreel-video": "Showreel video deleted.",
  "invalid-showreel-hero": "Showreel hero needs attention.",
  "invalid-showreel-video": "Showreel video fields need attention.",
  "invalid-showreel-copy": "Showreel page text needs attention.",
  "save-showreel-hero-error": "Showreel hero could not be saved.",
  "save-showreel-video-error": "Showreel video could not be saved.",
  "save-showreel-copy-error": "Showreel page text could not be saved.",
  "delete-showreel-video-error": "Showreel video could not be deleted.",
  "moved-gallery-image": "Gallery order updated.",
  "invalid-gallery-copy": "Gallery text needs attention.",
  "invalid-gallery-hero": "Gallery hero needs attention.",
  "gallery-studio-migration-required":
    "Gallery Studio text storage is not installed. Run migration 0014_gallery_studio.sql.",
  "saved-gallery-image": "Gallery image saved.",
  "placement-migration-required":
    "Gallery placement fields are not in Supabase yet. Run migration 0013_gallery_media_placements.sql, then save again.",
  "story-limit-reached":
    "Artist freelancer life supports four selected frames. Unselect one before adding another.",
  "security-error": "Request origin was blocked. Refresh admin and try again.",
  "upload-error": "Upload failed.",
  uploaded: "Media uploaded.",
  updated: "Media updated.",
};

const sectionClass =
  "rounded-[30px] border border-white/12 bg-white/[0.07] p-5 shadow-[0_22px_80px_rgba(0,0,0,0.28)] backdrop-blur-2xl sm:p-6";
const cardClass =
  "rounded-[24px] border border-white/10 bg-black/24 p-4 shadow-[0_16px_55px_rgba(0,0,0,0.18)] transition duration-300 hover:border-white/18 hover:bg-white/[0.055]";
const labelClass =
  "text-xs font-semibold uppercase tracking-[0.18em] text-white/45";
const inputClass =
  "mt-2 w-full rounded-2xl border border-white/10 bg-black/28 px-3.5 py-2.5 text-sm text-white outline-none transition duration-300 placeholder:text-white/25 focus:border-white/35 focus:bg-black/36 disabled:cursor-not-allowed disabled:opacity-50";
const textareaClass = `${inputClass} min-h-24 resize-y leading-6`;
const buttonClass =
  "inline-flex h-10 items-center justify-center gap-2 rounded-2xl bg-white px-4 text-sm font-semibold text-black transition duration-300 hover:-translate-y-0.5 hover:bg-white/85 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-45";
const secondaryButtonClass =
  "inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-white/12 bg-white/[0.06] px-4 text-sm font-semibold text-white/75 transition duration-300 hover:border-white/22 hover:bg-white/[0.12] hover:text-white disabled:cursor-not-allowed disabled:opacity-45";
const dangerButtonClass =
  "inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-red-300/25 px-4 text-sm font-semibold text-red-100 transition duration-300 hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-45";

const studioMosaicSlots = [
  "lg:col-span-5 lg:row-span-6",
  "lg:col-span-7 lg:row-span-4",
  "lg:col-span-4 lg:row-span-5",
  "lg:col-span-3 lg:row-span-3",
  "lg:col-span-5 lg:row-span-4",
  "lg:col-span-3 lg:row-span-5",
  "lg:col-span-6 lg:row-span-4",
  "lg:col-span-3 lg:row-span-5",
  "lg:col-span-4 lg:row-span-6",
  "lg:col-span-5 lg:row-span-5",
] as const;

const videoTypeLabels: Record<(typeof VIDEO_TYPES)[number], string> = {
  showreel: "Showreel",
  scene: "Scene",
  self_tape: "Self-tape",
  interview: "Interview",
  music_video: "Music video",
  behind_scenes: "Behind the scenes",
  other: "Other",
};

const filterOptions: Array<{
  key: MediaFilter;
  label: string;
  icon: ReactNode;
}> = [
  { key: "all", label: "All", icon: <FaLayerGroup /> },
  { key: "image", label: "Images", icon: <FaImage /> },
  { key: "video", label: "Videos", icon: <FaVideo /> },
  { key: "published", label: "Active", icon: <FaEye /> },
  { key: "hidden", label: "Hidden", icon: <FaEyeSlash /> },
  { key: "unused", label: "Unused", icon: <FaLayerGroup /> },
  { key: "missing_alt", label: "Missing alt", icon: <FaExclamationTriangle /> },
  { key: "oversized", label: "Oversized", icon: <FaPhotoVideo /> },
  { key: "recent", label: "Recent", icon: <FaCheckCircle /> },
  { key: "trash", label: "Trash", icon: <FaTrash /> },
];

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function nextSort(items: Array<{ sortOrder: number }>) {
  if (!items.length) return 10;
  return Math.max(...items.map((item) => item.sortOrder)) + 10;
}

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";

  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const precision = Number.isInteger(value) || value >= 10 || unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(precision)} ${
    units[unitIndex]
  }`;
}

function fileLabel(fileName: string) {
  return (
    fileName
      .replace(/\.[^.]+$/, "")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 220) || "Untitled media"
  );
}

type UploadItemState =
  | "ready"
  | "preparing"
  | "uploading"
  | "saving"
  | "success"
  | "error";

type UploadItem = {
  key: string;
  file: File;
  label: string;
  alt: string;
  state: UploadItemState;
  message: string;
};

function metadataString(asset: MediaAsset, key: string) {
  const value = asset.metadata?.[key];
  return typeof value === "string" ? value : "";
}

function Field({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={wide ? "sm:col-span-2" : ""}>
      <span className={labelClass}>{label}</span>
      {children}
    </label>
  );
}

function TextInput({
  name,
  defaultValue,
  list,
  required = false,
  type = "text",
}: {
  name: string;
  defaultValue?: string | number;
  list?: string;
  required?: boolean;
  type?: "text" | "number";
}) {
  return (
    <input
      className={inputClass}
      defaultValue={defaultValue}
      list={list}
      name={name}
      required={required}
      type={type}
    />
  );
}

function TextArea({
  name,
  defaultValue,
  rows = 3,
}: {
  name: string;
  defaultValue?: string;
  rows?: number;
}) {
  return (
    <textarea
      className={textareaClass}
      defaultValue={defaultValue}
      name={name}
      rows={rows}
    />
  );
}

function StatusNotice({
  status,
  isConfigured,
  loadError,
  contentIsConfigured,
  contentLoadError,
}: {
  status?: string;
  isConfigured: boolean;
  loadError?: string;
  contentIsConfigured: boolean;
  contentLoadError?: string;
}) {
  const message = status ? statusCopy[status] : "";

  if (
    !message &&
    isConfigured &&
    !loadError &&
    contentIsConfigured &&
    !contentLoadError
  ) {
    return null;
  }

  return (
    <div className="grid gap-3">
      {!isConfigured ? (
        <div className="rounded-3xl border border-amber-300/25 bg-amber-400/10 px-4 py-3 text-sm leading-6 text-amber-100">
          Supabase service role key is not configured. Storage uploads are
          read-only.
        </div>
      ) : null}
      {!contentIsConfigured ? (
        <div className="rounded-3xl border border-amber-300/25 bg-amber-400/10 px-4 py-3 text-sm leading-6 text-amber-100">
          Content service access is not configured. Public gallery editing is
          read-only.
        </div>
      ) : null}
      {loadError ? (
        <div className="rounded-3xl border border-red-300/25 bg-red-500/10 px-4 py-3 text-sm leading-6 text-red-100">
          {loadError}
        </div>
      ) : null}
      {contentLoadError ? (
        <div className="rounded-3xl border border-red-300/25 bg-red-500/10 px-4 py-3 text-sm leading-6 text-red-100">
          {contentLoadError}
        </div>
      ) : null}
      {message ? (
        <div className="rounded-3xl border border-white/10 bg-white/10 px-4 py-3 text-sm leading-6 text-white/80">
          {message}
        </div>
      ) : null}
    </div>
  );
}

function PublishedAndOrder({
  isPublished,
  sortOrder,
}: {
  isPublished: boolean;
  sortOrder: number;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-[1fr_130px]">
      <label className="flex h-11 items-center gap-3 rounded-2xl border border-white/10 bg-black/25 px-3 text-sm text-white/75">
        <input
          className="h-4 w-4 accent-white"
          defaultChecked={isPublished}
          name="isPublished"
          type="checkbox"
        />
        Active on site
      </label>
      <Field label="Order">
        <TextInput defaultValue={sortOrder} name="sortOrder" type="number" />
      </Field>
    </div>
  );
}

function Preview({ asset }: { asset: MediaAsset }) {
  if (asset.mediaType === "video") {
    return (
      <video
        className="h-full w-full object-cover"
        controls
        muted
        preload="metadata"
        src={asset.src}
      />
    );
  }

  return (
    <Image
      alt={asset.alt || asset.label}
      className="h-full w-full object-cover"
      fill
      sizes="(min-width: 1280px) 50vw, 100vw"
      src={asset.src}
    />
  );
}

function ImagePreview({
  alt,
  src,
}: {
  alt: string;
  src: string;
}) {
  return (
    <Image
      alt={alt}
      className="h-full w-full object-cover"
      fill
      sizes="(min-width: 1280px) 50vw, 100vw"
      src={src}
      unoptimized={src.startsWith("https://")}
    />
  );
}

function UploadPanel({
  disabled,
  onSaved,
  sortOrder,
}: {
  disabled: boolean;
  onSaved: (form: HTMLFormElement) => void;
  sortOrder: number;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);
  const [uploadState, setUploadState] = useState<{
    kind: "idle" | "pending" | "success" | "error";
    message: string;
  }>({ kind: "idle", message: "" });
  const pending = uploadState.kind === "pending";

  function updateUploadItem(
    key: string,
    update: Partial<Pick<UploadItem, "label" | "alt" | "state" | "message">>
  ) {
    setUploadItems((items) =>
      items.map((item) => (item.key === key ? { ...item, ...update } : item))
    );
  }

  function handleFilesSelected(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);

    if (!files.length) {
      setUploadItems([]);
      return;
    }

    if (files.length > MAX_BATCH_FILES) {
      event.target.value = "";
      setUploadItems([]);
      setUploadState({
        kind: "error",
        message: `Choose no more than ${MAX_BATCH_FILES} files at once.`,
      });
      return;
    }

    const unsupported = files.find(
      (file) => !ACCEPTED_MEDIA_TYPES.has(file.type)
    );
    if (unsupported) {
      event.target.value = "";
      setUploadItems([]);
      setUploadState({
        kind: "error",
        message: `${unsupported.name} has an unsupported file type.`,
      });
      return;
    }

    const oversized = files.find((file) => {
      const limit = file.type.startsWith("video/")
        ? MAX_VIDEO_BYTES
        : MAX_IMAGE_BYTES;
      return file.size <= 0 || file.size > limit;
    });
    if (oversized) {
      const limit = oversized.type.startsWith("video/")
        ? MAX_VIDEO_BYTES
        : MAX_IMAGE_BYTES;
      event.target.value = "";
      setUploadItems([]);
      setUploadState({
        kind: "error",
        message: `${oversized.name} exceeds the ${formatBytes(limit)} limit.`,
      });
      return;
    }

    const batchSize = files.reduce((total, file) => total + file.size, 0);
    if (batchSize > MAX_BATCH_BYTES) {
      event.target.value = "";
      setUploadItems([]);
      setUploadState({
        kind: "error",
        message: `The batch exceeds the ${formatBytes(MAX_BATCH_BYTES)} limit.`,
      });
      return;
    }

    setUploadItems(
      files.map((file, index) => {
        const label = fileLabel(file.name);
        return {
          key: `${file.name}-${file.size}-${file.lastModified}-${index}`,
          file,
          label,
          alt: file.type.startsWith("image/") ? label : "",
          state: "ready",
          message: "Ready",
        };
      })
    );
    setUploadState({ kind: "idle", message: "" });
  }

  function removeUploadItem(key: string) {
    setUploadItems((items) => items.filter((item) => item.key !== key));
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);

    if (!uploadItems.length) {
      setUploadState({ kind: "error", message: "Choose one or more files before upload." });
      return;
    }

    if (uploadItems.some((item) => !item.label.trim())) {
      setUploadState({
        kind: "error",
        message: "Every selected file needs a label.",
      });
      return;
    }

    const baseSortOrder = Number(formData.get("sortOrder") || 0);
    if (baseSortOrder + (uploadItems.length - 1) * 10 > 9999) {
      setUploadState({
        kind: "error",
        message: "The starting order is too high for this batch.",
      });
      return;
    }

    setUploadState({
      kind: "pending",
      message: `Uploading 1 of ${uploadItems.length}...`,
    });

    const failedKeys = new Set<string>();
    let completedCount = 0;

    for (const [index, item] of uploadItems.entries()) {
      setUploadState({
        kind: "pending",
        message: `Uploading ${index + 1} of ${uploadItems.length}: ${item.file.name}`,
      });
      updateUploadItem(item.key, {
        state: "preparing",
        message: "Preparing secure upload...",
      });

      try {
        const prepared = await prepareMediaUpload({
          id:
            uploadItems.length === 1
              ? String(formData.get("id") || "").trim() || undefined
              : undefined,
          label: item.label.trim(),
          alt: item.alt.trim(),
          usageKey: String(formData.get("usageKey") || "").trim(),
          sortOrder: baseSortOrder + index * 10,
          isPublished: formData.get("isPublished") === "on",
          fileName: item.file.name,
          fileSize: item.file.size,
          mimeType: item.file.type,
        });

        if (!prepared.ok) {
          failedKeys.add(item.key);
          updateUploadItem(item.key, {
            state: "error",
            message: prepared.error,
          });
          continue;
        }

        updateUploadItem(item.key, {
          state: "uploading",
          message: `Uploading ${formatBytes(item.file.size)}...`,
        });
        const supabase = createClient();
        const uploaded = await supabase.storage
          .from(prepared.ticket.storageBucket)
          .uploadToSignedUrl(
            prepared.ticket.storagePath,
            prepared.ticket.token,
            item.file,
            {
              cacheControl: "31536000",
              contentType: item.file.type,
            }
          );

        if (uploaded.error) {
          failedKeys.add(item.key);
          updateUploadItem(item.key, {
            state: "error",
            message: uploaded.error.message,
          });
          continue;
        }

        updateUploadItem(item.key, {
          state: "saving",
          message: "Verifying and saving...",
        });
        const finalized = await finalizeMediaUpload(prepared.ticket);
        if (!finalized.ok) {
          failedKeys.add(item.key);
          updateUploadItem(item.key, {
            state: "error",
            message: finalized.error,
          });
          continue;
        }

        completedCount += 1;
        updateUploadItem(item.key, {
          state: "success",
          message: "Uploaded",
        });
      } catch (error) {
        failedKeys.add(item.key);
        updateUploadItem(item.key, {
          state: "error",
          message:
            error instanceof Error
              ? error.message
              : "Upload failed unexpectedly.",
        });
      }
    }

    if (fileInputRef.current) fileInputRef.current.value = "";

    if (completedCount > 0) router.refresh();

    if (failedKeys.size > 0) {
      setUploadItems((items) =>
        items.filter((item) => failedKeys.has(item.key))
      );
      setUploadState({
        kind: "error",
        message: `${completedCount} uploaded, ${failedKeys.size} failed. Review the remaining files and retry.`,
      });
      return;
    }

    formRef.current?.reset();
    setUploadItems([]);
    setUploadState({
      kind: "success",
      message: `${completedCount} ${completedCount === 1 ? "file" : "files"} uploaded successfully.`,
    });
    onSaved(form);
  }

  return (
    <AdminDisclosure
      badge={
        <span className="text-[10px] text-white/40">
          {MAX_BATCH_FILES} files max
        </span>
      }
      description={`Batch upload · images ${formatBytes(MAX_IMAGE_BYTES)} · videos ${formatBytes(MAX_VIDEO_BYTES)} each.`}
      eyebrow="Storage"
      id="upload"
      title="Add media"
    >
      <form onSubmit={handleUpload} ref={formRef}>
        <fieldset disabled={disabled || pending}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Files" wide>
              <input
                accept="image/avif,image/gif,image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
                className={inputClass}
                multiple
                name="files"
                onChange={handleFilesSelected}
                ref={fileInputRef}
                type="file"
              />
            </Field>
            {uploadItems.length <= 1 ? (
              <Field label="Custom ID (optional)">
                <TextInput name="id" />
              </Field>
            ) : null}
            <Field label="Internal note">
              <TextInput name="usageKey" />
            </Field>
          </div>
          {uploadItems.length ? (
            <div className="mt-5 overflow-hidden rounded-[24px] border border-white/10 bg-black/20">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
                <p className="text-sm font-semibold text-white">
                  {uploadItems.length} {uploadItems.length === 1 ? "file" : "files"} selected
                </p>
                <p className="text-xs text-white/45">
                  {formatBytes(
                    uploadItems.reduce((total, item) => total + item.file.size, 0)
                  )} total
                </p>
              </div>
              <div className="grid gap-px bg-white/10">
                {uploadItems.map((item, index) => (
                  <div
                    className="grid gap-3 bg-[#101010] p-4 sm:grid-cols-[42px_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
                    key={item.key}
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] text-white/65">
                      {item.file.type.startsWith("video/") ? <FaVideo /> : <FaImage />}
                    </span>
                    <label className="min-w-0">
                      <span className={labelClass}>Label {index + 1}</span>
                      <input
                        className={inputClass}
                        maxLength={220}
                        onChange={(event) =>
                          updateUploadItem(item.key, { label: event.target.value })
                        }
                        required
                        value={item.label}
                      />
                      <span className="mt-1 block truncate text-xs text-white/35">
                        {item.file.name} · {formatBytes(item.file.size)}
                      </span>
                    </label>
                    <label className="min-w-0">
                      <span className={labelClass}>Alt text</span>
                      <input
                        className={inputClass}
                        maxLength={220}
                        onChange={(event) =>
                          updateUploadItem(item.key, { alt: event.target.value })
                        }
                        placeholder={item.file.type.startsWith("image/") ? "Describe the image" : "Optional"}
                        value={item.alt}
                      />
                      <span
                        className={cx(
                          "mt-1 flex items-center gap-1.5 text-xs",
                          item.state === "error"
                            ? "text-red-200"
                            : item.state === "success"
                              ? "text-emerald-200"
                              : "text-white/35"
                        )}
                      >
                        {item.state === "preparing" ||
                        item.state === "uploading" ||
                        item.state === "saving" ? (
                          <FaSpinner aria-hidden="true" className="animate-spin" />
                        ) : item.state === "success" ? (
                          <FaCheckCircle aria-hidden="true" />
                        ) : item.state === "error" ? (
                          <FaExclamationTriangle aria-hidden="true" />
                        ) : null}
                        {item.message}
                      </span>
                    </label>
                    <button
                      aria-label={`Remove ${item.file.name}`}
                      className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 text-white/45 transition hover:border-red-300/25 hover:bg-red-500/10 hover:text-red-100 disabled:cursor-not-allowed disabled:opacity-40"
                      data-editor-dirty-action
                      disabled={pending}
                      onClick={() => removeUploadItem(item.key)}
                      type="button"
                    >
                      <FaTrash aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-white/42">
              Select several images or videos in the file picker. Labels and image alt text can be adjusted before upload.
            </p>
          )}
          <div className="mt-4">
            <PublishedAndOrder isPublished sortOrder={sortOrder} />
          </div>
          <div className="mt-5 flex justify-end">
            <button
              aria-busy={pending}
              className={buttonClass}
              disabled={disabled || pending || !uploadItems.length}
              type="submit"
            >
              {pending ? (
                <FaSpinner aria-hidden="true" className="animate-spin" />
              ) : (
                <FaUpload aria-hidden="true" />
              )}
              {pending
                ? "Uploading..."
                : uploadItems.length
                  ? `Upload ${uploadItems.length} ${uploadItems.length === 1 ? "file" : "files"}`
                  : "Upload files"}
            </button>
          </div>
          {uploadState.message ? (
            <p
              aria-live="polite"
              className={cx(
                "mt-4 text-right text-sm",
                uploadState.kind === "error"
                  ? "text-red-200"
                  : uploadState.kind === "success"
                    ? "text-emerald-200"
                    : "text-white/58"
              )}
            >
              {uploadState.message}
            </p>
          ) : null}
        </fieldset>
      </form>
    </AdminDisclosure>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded-[18px] border border-white/9 bg-[#101012]/88 p-4">
      <div className="flex items-center justify-between gap-4">
        <p className={labelClass}>{label}</p>
        <span className="text-white/50">{icon}</span>
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-white">
        {value}
      </p>
    </div>
  );
}

function MediaOverview({
  assets,
}: {
  assets: MediaAsset[];
}) {
  const availableAssets = assets.filter((asset) => !asset.deletedAt);
  const imageCount = availableAssets.filter((asset) => asset.mediaType === "image").length;
  const videoCount = availableAssets.filter((asset) => asset.mediaType === "video").length;
  const missingAltCount = availableAssets.filter(
    (asset) => asset.mediaType === "image" && !asset.alt.trim()
  ).length;
  const trashCount = assets.length - availableAssets.length;
  const totalSize = assets.reduce((sum, asset) => sum + asset.fileSize, 0);

  return (
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6">
      <StatCard icon={<FaPhotoVideo />} label="Available" value={availableAssets.length} />
      <StatCard icon={<FaImage />} label="Images" value={imageCount} />
      <StatCard icon={<FaVideo />} label="Videos" value={videoCount} />
      <StatCard icon={<FaExclamationTriangle />} label="Missing alt" value={missingAltCount} />
      <StatCard icon={<FaTrash />} label="Trash" value={trashCount} />
      <StatCard icon={<FaLayerGroup />} label="Storage" value={formatBytes(totalSize)} />
    </section>
  );
}

function ModeTabs({
  hasUnsavedChanges,
  mode,
  onChange,
}: {
  hasUnsavedChanges: boolean;
  mode: MediaMode;
  onChange: (mode: MediaMode) => boolean;
}) {
  const items: Array<{ key: MediaMode; label: string; detail: string }> = [
    {
      key: "studio",
      label: "Gallery Studio",
      detail: "Hero, introduction, and public mosaic",
    },
    {
      key: "showreel",
      label: "Showreel & Video Studio",
      detail: "Hero, featured reel, music videos, scenes, and clips",
    },
    {
      key: "library",
      label: "Media Library",
      detail: "Every uploaded image and video",
    },
  ];

  return (
    <div className="rounded-[22px] border border-white/9 bg-[#0f0f11]/90 p-3">
      {hasUnsavedChanges ? (
        <div className="mb-2 flex justify-end">
          <span
            className="inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-100"
            role="status"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-amber-300" />
            Unsaved changes
          </span>
        </div>
      ) : null}
      <nav
        aria-label="Media workspaces"
        className="admin-scrollbar-none flex gap-1 overflow-x-auto"
        role="tablist"
      >
      {items.map((item, index) => {
        const active = item.key === mode;

        return (
          <button
            aria-controls={`media-${item.key}-panel`}
            aria-selected={active}
            className={cx(
              "min-h-14 min-w-[170px] flex-1 rounded-xl border px-3 py-2.5 text-left transition",
              active
                ? "border-white/14 bg-white/[0.09] text-white"
                : "border-transparent text-white/50 hover:border-white/8 hover:bg-white/[0.045] hover:text-white"
            )}
            id={`media-${item.key}-tab`}
            key={item.key}
            data-media-mode={item.key}
            onKeyDown={(event) => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
                return;
              }
              const tabs = Array.from(
                event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
                  '[role="tab"]'
                ) || []
              );
              const currentIndex = tabs.indexOf(event.currentTarget);
              const nextIndex =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? tabs.length - 1
                    : event.key === "ArrowRight"
                      ? (currentIndex + 1) % tabs.length
                      : (currentIndex - 1 + tabs.length) % tabs.length;
              const nextTab = tabs[nextIndex];
              const nextMode = nextTab?.dataset.mediaMode as MediaMode | undefined;
              if (!nextTab || !nextMode) return;
              event.preventDefault();
              if (onChange(nextMode)) nextTab.focus();
            }}
            onClick={() => {
              if (onChange(item.key)) return;
              window.requestAnimationFrame(() => {
                document.getElementById(`media-${mode}-tab`)?.focus();
              });
            }}
            role="tab"
            tabIndex={active ? 0 : -1}
            type="button"
          >
            <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-white/38">
              {String(index).padStart(2, "0")}
            </span>
            <span className="mt-1 block text-xs font-semibold">{item.label}</span>
            <span className="mt-1 block truncate text-[10px] text-white/32">
              {item.detail}
            </span>
          </button>
        );
      })}
      </nav>
    </div>
  );
}

function LibraryToolbar({
  filter,
  onFilterChange,
  onSearchChange,
  onSortChange,
  search,
  sort,
}: {
  filter: MediaFilter;
  onFilterChange: (filter: MediaFilter) => void;
  onSearchChange: (search: string) => void;
  onSortChange: (sort: MediaSort) => void;
  search: string;
  sort: MediaSort;
}) {
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-2">
        {filterOptions.map((option) => {
          const active = option.key === filter;

          return (
            <button
              aria-pressed={active}
              className={cx(
                "inline-flex h-10 items-center gap-2 rounded-2xl border px-4 text-sm font-semibold transition duration-300",
                active
                  ? "border-white/24 bg-white text-black"
                  : "border-white/10 bg-white/[0.055] text-white/65 hover:border-white/20 hover:bg-white/[0.1] hover:text-white"
              )}
              key={option.key}
              onClick={() => onFilterChange(option.key)}
              type="button"
            >
              {option.icon}
              {option.label}
            </button>
          );
        })}
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_220px]">
        <label className="relative">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/35">
            <FaSearch />
          </span>
          <input
            className="h-12 w-full rounded-2xl border border-white/10 bg-black/28 pl-11 pr-4 text-sm text-white outline-none transition duration-300 placeholder:text-white/25 focus:border-white/35 focus:bg-black/36"
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search label, alt text, ID, or internal note..."
            type="search"
            value={search}
          />
        </label>

        <label>
          <span className="sr-only">Sort media</span>
          <select
            className="h-12 w-full rounded-2xl border border-white/10 bg-black/28 px-4 text-sm text-white outline-none transition duration-300 focus:border-white/35 focus:bg-black/36"
            onChange={(event) => onSortChange(event.target.value as MediaSort)}
            value={sort}
          >
            <option value="order">Portfolio order</option>
            <option value="newest">Newest first</option>
            <option value="label">Label A-Z</option>
            <option value="largest">Largest files</option>
          </select>
        </label>
      </div>
    </div>
  );
}

function AssetBadge({ asset }: { asset: MediaAsset }) {
  return (
    <span className="rounded-2xl border border-white/10 px-3 py-1 text-sm text-white/55">
      {asset.deletedAt ? "Trash" : asset.isPublished ? "Active" : "Hidden"}
    </span>
  );
}

function getAssetDestinations(
  src: string,
  content: EditablePortfolioContent
) {
  if (!src) return [];

  const destinations = new Set<string>();

  for (const hero of content.heroes) {
    if (hero.backgroundSrc === src) {
      destinations.add(`Hero: ${hero.pageSlug}`);
    }
    if (hero.posterSrc === src) {
      destinations.add(`Hero poster: ${hero.pageSlug}`);
    }
  }

  const videoHero = content.heroes.find((hero) => hero.pageSlug === "video");
  const interludeSrc =
    videoHero?.mediaType === "video"
      ? videoHero.backgroundSrc
      : "/media/hero-loop.mp4";
  if (interludeSrc === src) destinations.add("Gallery: The Interlude");

  if (content.aboutHome.imageSrc === src) destinations.add("Home: about");

  for (const update of content.homeUpdates) {
    if (update.avatarSrc === src) destinations.add("Home: updates");
  }

  const homePresentationSources = [
    content.homePresentation.updatesImageSrc,
    content.homePresentation.featureImageSrc,
    content.homePresentation.featureVideoSrc,
    content.homePresentation.featurePosterSrc,
    content.homePresentation.storyImage1Src,
    content.homePresentation.storyImage2Src,
    content.homePresentation.storyImage3Src,
    content.homePresentation.storyImage4Src,
  ];
  if (homePresentationSources.includes(src)) {
    destinations.add("Home: presentation");
  }

  for (const platform of content.musicPlatforms) {
    if (platform.imageSrc === src) destinations.add(`Music: ${platform.title}`);
  }

  for (const image of content.bio.galleryImages) {
    if (image.src === src) destinations.add("Bio gallery");
  }

  for (const image of content.galleryImages) {
    if (image.src !== src) continue;
    if (image.isMosaic) destinations.add("Gallery Mosaic");
    if (image.isFreelanceStory) {
      destinations.add(
        `Artist freelancer life: ${String(image.freelanceStoryOrder).padStart(2, "0")}`
      );
    }
    if (!image.isMosaic && !image.isFreelanceStory) {
      destinations.add("Gallery catalog");
    }
  }

  for (const video of content.videos) {
    if (video.thumbnailSrc === src) {
      destinations.add(`Video thumbnail: ${video.title}`);
    }
    if (video.embedUrl === src) destinations.add(`Video: ${video.title}`);
  }

  return Array.from(destinations);
}

function UseInGalleryForm({
  asset,
  disabled,
  gallerySortOrder,
  inGallery,
  portfolioType,
}: {
  asset: MediaAsset;
  disabled: boolean;
  gallerySortOrder: number;
  inGallery: boolean;
  portfolioType: PortfolioType;
}) {
  if (asset.mediaType !== "image") return null;

  return (
    <form action={saveMediaGalleryImage}>
      <input name="id" type="hidden" value={`gallery-${asset.id}`} />
      <input name="title" type="hidden" value={asset.label} />
      <input name="src" type="hidden" value={asset.src} />
      <input name="alt" type="hidden" value={asset.alt || asset.label} />
      <input name="caption" type="hidden" value="" />
      <input
        name="category"
        type="hidden"
        value={portfolioType === "actor" ? "Headshot" : "Live"}
      />
      <input name="sortOrder" type="hidden" value={gallerySortOrder} />
      <input name="isPublished" type="hidden" value="on" />
      <input name="isMosaic" type="hidden" value="on" />
      <input name="freelanceStoryOrder" type="hidden" value="0" />
      <ActionButton
        className={secondaryButtonClass}
        disabled={disabled || inGallery}
        pendingLabel="Adding..."
      >
        {inGallery ? <FaCheckCircle /> : <FaPlus />}
        {inGallery ? "In Gallery Mosaic" : "Add to Gallery Mosaic"}
      </ActionButton>
    </form>
  );
}

function AssetCard({
  asset,
  contentDisabled,
  disabled,
  gallerySortOrder,
  inGallery,
  portfolioType,
  usage,
}: {
  asset: MediaAsset;
  contentDisabled: boolean;
  disabled: boolean;
  gallerySortOrder: number;
  inGallery: boolean;
  portfolioType: PortfolioType;
  usage: string[];
}) {
  return (
    <article className={cardClass}>
      <div className="relative aspect-video overflow-hidden rounded-[20px] border border-white/10 bg-black/40">
        <Preview asset={asset} />
      </div>

      <div className="mt-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-semibold text-white">
            {asset.label}
          </h3>
          <p className="mt-1 text-sm text-white/45">
            {asset.mediaType} / {asset.mimeType || "unknown"} /{" "}
            {formatBytes(asset.fileSize)}
          </p>
        </div>
        <AssetBadge asset={asset} />
      </div>

      <div className="mt-4 grid gap-2">
        <span className={labelClass}>Public URL</span>
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <input className={inputClass} readOnly value={asset.src} />
          <CopyButton value={asset.src} />
        </div>
      </div>

      <div className="mt-4 grid gap-2">
        <span className={labelClass}>Used on site</span>
        {usage.length ? (
          <div className="flex flex-wrap gap-2">
            {usage.map((destination) => (
              <span
                className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2.5 py-1 text-xs text-emerald-50/85"
                key={destination}
              >
                {destination}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-sm text-white/42">Not used on the site</span>
        )}
      </div>

      <AdminDisclosure
        className="mt-5"
        description="Label, alt text, visibility, placement, and storage actions."
        id={`asset-settings-${asset.id}`}
        title="Edit details & placement"
        variant="advanced"
      >
      {asset.deletedAt ? (
        <div className="flex flex-col gap-4 rounded-2xl border border-amber-300/15 bg-amber-300/[0.06] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-amber-50">Stored safely in Trash</p>
            <p className="mt-1 text-xs leading-5 text-white/45">
              The storage object is intact. Restore it to make the asset available in editors again.
            </p>
          </div>
          <form action={restoreMediaAsset}>
            <input name="id" type="hidden" value={asset.id} />
            <ActionButton
              className={secondaryButtonClass}
              disabled={disabled}
              pendingLabel="Restoring..."
            >
              <FaUndo /> Restore
            </ActionButton>
          </form>
        </div>
      ) : (
      <>
      <form action={updateMediaAsset}>
        <fieldset disabled={disabled}>
          <input name="id" type="hidden" value={asset.id} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Label">
              <TextInput defaultValue={asset.label} name="label" required />
            </Field>
            <Field label="Alt text">
              <TextInput defaultValue={asset.alt} name="alt" />
            </Field>
            <Field label="Internal note" wide>
              <TextInput defaultValue={asset.usageKey} name="usageKey" />
            </Field>
          </div>
          <div className="mt-4">
            <PublishedAndOrder
              isPublished={asset.isPublished}
              sortOrder={asset.sortOrder}
            />
          </div>
          <div className="mt-5 flex justify-end">
            <ActionButton
              className={buttonClass}
              disabled={disabled}
              pendingLabel="Saving..."
            >
              Save
            </ActionButton>
          </div>
        </fieldset>
      </form>

      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:justify-end">
        <UseInGalleryForm
          asset={asset}
          disabled={contentDisabled}
          gallerySortOrder={gallerySortOrder}
          inGallery={inGallery}
          portfolioType={portfolioType}
        />
        <form
          action={deleteMediaAsset}
          onSubmit={(event) => {
            if (!window.confirm(`Move "${asset.label}" to Trash?`)) {
              event.preventDefault();
            }
          }}
        >
          <input name="id" type="hidden" value={asset.id} />
          <ActionButton
            className={dangerButtonClass}
            disabled={disabled || usage.length > 0}
            pendingLabel="Moving..."
          >
            <FaTrash />
            {usage.length ? "Remove usage first" : "Move to Trash"}
          </ActionButton>
        </form>
      </div>
      </>
      )}
      </AdminDisclosure>
    </article>
  );
}

function GalleryImageForm({
  assets,
  disabled,
  item,
  mode = "edit",
}: {
  assets: MediaAsset[];
  disabled: boolean;
  item: EditableGalleryImage;
  mode?: "edit" | "new";
}) {
  const initialAsset = assets.find((asset) => asset.src === item.src);
  const [previewSrc, setPreviewSrc] = useState(item.src);
  const [previewAlt, setPreviewAlt] = useState(
    item.alt || initialAsset?.alt || initialAsset?.label || item.title
  );

  return (
    <AdminDisclosure
      description={mode === "new" ? "Choose an image and add it to the public mosaic." : item.category || "Gallery item"}
      id={mode === "new" ? "studio-frame-new" : `gallery-item-${item.id}`}
      title={mode === "new" ? "+ Add gallery frame" : item.title}
      variant="item"
    >
    <article>
      {previewSrc ? (
        <div className="relative aspect-video overflow-hidden rounded-[20px] border border-white/10 bg-black/40">
          <ImagePreview
            alt={previewAlt || "Selected gallery image"}
            src={previewSrc}
          />
        </div>
      ) : (
        <div className="grid aspect-video place-items-center rounded-[20px] border border-dashed border-white/15 bg-black/30 text-sm text-white/40">
          New gallery image
        </div>
      )}

      <div className="mt-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-semibold text-white">
            {mode === "new" ? "New public gallery item" : item.title}
          </h3>
          <p className="mt-1 text-sm text-white/45">
            {item.category || "No category"} / {item.isMosaic ? "Mosaic" : "Catalog only"}
          </p>
        </div>
        <span className="rounded-2xl border border-white/10 px-3 py-1 text-sm text-white/55">
          {item.isPublished ? "Active" : "Hidden"}
        </span>
      </div>

      <form action={saveMediaGalleryImage} className="mt-5">
        <fieldset disabled={disabled}>
          {mode === "edit" ? (
            <input name="id" type="hidden" value={item.id} />
          ) : null}
          {item.isFreelanceStory ? (
            <input name="isFreelanceStory" type="hidden" value="on" />
          ) : null}
          <input
            name="freelanceStoryOrder"
            type="hidden"
            value={item.freelanceStoryOrder}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            {mode === "new" ? (
              <Field label="ID">
                <TextInput name="id" />
              </Field>
            ) : null}
            <Field label="Title">
              <TextInput defaultValue={item.title} name="title" required />
            </Field>
            <Field label="Category">
              <TextInput defaultValue={item.category} name="category" />
            </Field>
            <MediaAssetPicker
              assets={assets}
              className="sm:col-span-2"
              defaultValue={item.src}
              kind="image"
              label="Image"
              name="src"
              onValueChange={(src, asset) => {
                setPreviewSrc(src);
                if (asset) setPreviewAlt(asset.alt || asset.label);
              }}
              openLibraryByDefault={mode === "new" && !item.src}
              required
              showPreview={false}
            />
            <Field label="Alt text" wide>
              <TextInput defaultValue={item.alt} name="alt" />
            </Field>
            <Field label="Caption" wide>
              <TextArea defaultValue={item.caption} name="caption" rows={3} />
            </Field>
          </div>
          <div className="mt-4">
            <PublishedAndOrder
              isPublished={item.isPublished}
              sortOrder={item.sortOrder}
            />
          </div>
          <label className="mt-4 flex min-h-11 items-center gap-3 rounded-2xl border border-white/10 bg-black/25 px-3 text-sm text-white/75">
            <input
              className="h-4 w-4 accent-white"
              defaultChecked={item.isMosaic}
              name="isMosaic"
              type="checkbox"
            />
            Show in Gallery Mosaic
          </label>
          <div className="mt-5 flex justify-end">
            <ActionButton
              className={buttonClass}
              disabled={disabled}
              pendingLabel="Saving..."
            >
              Save
            </ActionButton>
          </div>
        </fieldset>
      </form>

      {mode === "edit" ? (
        <form
          action={deleteMediaGalleryImage}
          className="mt-3 flex justify-end"
          onSubmit={(event) => {
            if (!window.confirm(`Remove "${item.title}" from public gallery?`)) {
              event.preventDefault();
            }
          }}
        >
          <input name="id" type="hidden" value={item.id} />
          <ActionButton
            className={dangerButtonClass}
            disabled={disabled}
            pendingLabel="Deleting..."
          >
            <FaTrash />
            Delete
          </ActionButton>
        </form>
      ) : null}
    </article>
    </AdminDisclosure>
  );
}

function PresentationHiddenFields({
  content,
  except,
}: {
  content: EditablePortfolioContent["galleryPresentation"];
  except: "intro" | "interlude";
}) {
  const fields = {
    introEyebrow: content.introEyebrow,
    introTitle: content.introTitle,
    interludeLabel: content.interludeLabel,
    interludeMeta: content.interludeMeta,
    interludeEyebrow: content.interludeEyebrow,
    interludeTitle: content.interludeTitle,
    interludeVideoSrc: content.interludeVideoSrc,
    interludePosterSrc: content.interludePosterSrc,
    storyLabel: content.storyLabel,
    storyScrollLabel: content.storyScrollLabel,
  };
  const visible =
    except === "intro"
      ? new Set(["introEyebrow", "introTitle"])
      : new Set([
          "interludeLabel",
          "interludeMeta",
          "interludeEyebrow",
          "interludeTitle",
          "interludeVideoSrc",
          "interludePosterSrc",
          "storyLabel",
          "storyScrollLabel",
        ]);

  return Object.entries(fields)
    .filter(([name]) => !visible.has(name))
    .map(([name, value]) => (
      <input key={name} name={name} type="hidden" value={value} />
    ));
}

function StudioHero({
  assets,
  content,
  disabled,
}: {
  assets: MediaAsset[];
  content: EditablePortfolioContent;
  disabled: boolean;
}) {
  const hero = content.heroes.find((item) => item.pageSlug === "gallery");
  if (!hero) return null;

  return (
    <section className={`${sectionClass} scroll-mt-6`} id="studio-hero">
      <p className={labelClass}>01 / Public sequence</p>
      <h2 className="heading-ui mt-2 text-2xl font-semibold text-white">Gallery Hero</h2>
      <form action={saveGalleryHero} className="mt-5">
        <fieldset disabled={disabled}>
          <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <MediaAssetPicker
              assets={assets}
              defaultMediaType={hero.mediaType}
              defaultValue={hero.backgroundSrc}
              kind="media"
              label="Background image or video"
              mediaTypeName="mediaType"
              name="backgroundSrc"
              required
            />
            <div className="grid content-start gap-4 sm:grid-cols-2">
              <Field label="Title" wide><TextInput defaultValue={hero.title} name="title" required /></Field>
              <Field label="Subtitle"><TextInput defaultValue={hero.subtitle} name="subtitle" /></Field>
              <Field label="Button"><TextInput defaultValue={hero.ctaLabel} name="ctaLabel" /></Field>
              <Field label="Button link"><TextInput defaultValue={hero.ctaHref} name="ctaHref" /></Field>
              <MediaAssetPicker
                assets={assets}
                className="sm:col-span-2"
                defaultValue={hero.posterSrc}
                kind="image"
                label="Video poster / fallback image"
                name="posterSrc"
              />
              <input name="sortOrder" type="hidden" value={hero.sortOrder} />
            </div>
          </div>
          <div className="mt-5 flex justify-end"><ActionButton className={buttonClass} disabled={disabled} pendingLabel="Saving...">Save hero</ActionButton></div>
        </fieldset>
      </form>
    </section>
  );
}

function StudioImageEditor({
  assetListId,
  assets,
  disabled,
  index,
  item,
}: {
  assetListId: string;
  assets: MediaAsset[];
  disabled: boolean;
  index: number;
  item: EditableGalleryImage;
}) {
  return (
    <AdminDisclosure
      badge={<span className="text-[10px] text-white/40">{item.isPublished ? "Published" : "Hidden"}</span>}
      description={[item.category, `Frame ${String(index + 1).padStart(2, "0")}`].filter(Boolean).join(" · ")}
      icon={<FaImage />}
      id={`studio-frame-${item.id}`}
      title={item.title}
      variant="item"
    >
    <article>
      <form action={saveMediaGalleryImage} className="p-4">
        <fieldset disabled={disabled}>
          <input name="id" type="hidden" value={item.id} />
          <MediaAssetPicker assets={assets} defaultValue={item.src} kind="image" name="src" />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="Title"><TextInput defaultValue={item.title} name="title" required /></Field>
            <Field label="Category / story eyebrow"><TextInput defaultValue={item.category} name="category" /></Field>
            <Field label="Alt text" wide><TextInput defaultValue={item.alt} list={assetListId} name="alt" /></Field>
            <Field label="Caption / story paragraph" wide><TextArea defaultValue={item.caption} name="caption" rows={3} /></Field>
          </div>
          <div className="mt-4"><PublishedAndOrder isPublished={item.isPublished} sortOrder={item.sortOrder} /></div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="flex h-11 items-center gap-3 rounded-2xl border border-white/10 bg-black/25 px-3 text-sm text-white/75">
              <input className="h-4 w-4 accent-white" defaultChecked={item.isMosaic} name="isMosaic" type="checkbox" /> Mosaic
            </label>
            <label className="flex h-11 items-center gap-3 rounded-2xl border border-white/10 bg-black/25 px-3 text-sm text-white/75">
              <input className="h-4 w-4 accent-white" defaultChecked={item.isFreelanceStory} name="isFreelanceStory" type="checkbox" /> Freelancer story
            </label>
          </div>
          <Field label="Story order"><TextInput defaultValue={item.freelanceStoryOrder} name="freelanceStoryOrder" type="number" /></Field>
          <div className="mt-4 flex justify-end"><ActionButton className={buttonClass} disabled={disabled} pendingLabel="Saving...">Save frame</ActionButton></div>
        </fieldset>
      </form>
      <div className="flex items-center justify-between border-t border-white/10 px-4 py-3">
        <span className="text-xs font-semibold text-white/40">Frame {String(index + 1).padStart(2, "0")}</span>
        <div className="flex gap-2">
          {(["up", "down"] as const).map((direction) => (
            <form action={moveGalleryImage} key={direction}>
              <input name="id" type="hidden" value={item.id} /><input name="direction" type="hidden" value={direction} />
              <ActionButton className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 text-white/65 hover:bg-white hover:text-black" disabled={disabled} pendingLabel="...">
                {direction === "up" ? <FaArrowUp /> : <FaArrowDown />}<span className="sr-only">Move {direction}</span>
              </ActionButton>
            </form>
          ))}
          <form action={deleteMediaGalleryImage} onSubmit={(event) => { if (!window.confirm(`Remove "${item.title}" from the public gallery?`)) event.preventDefault(); }}>
            <input name="id" type="hidden" value={item.id} />
            <ActionButton className="grid h-9 w-9 place-items-center rounded-xl border border-red-300/20 text-red-200 hover:bg-red-500/15" disabled={disabled} pendingLabel="..."><FaTrash /><span className="sr-only">Delete</span></ActionButton>
          </form>
        </div>
      </div>
    </article>
    </AdminDisclosure>
  );
}

function ShowreelHeroEditor({
  assets,
  content,
  disabled,
  portfolioType,
}: {
  assets: MediaAsset[];
  content: EditablePortfolioContent;
  disabled: boolean;
  portfolioType: PortfolioType;
}) {
  const hero = content.heroes.find((item) => item.pageSlug === "video");
  if (!hero) return null;
  const pageLabel = portfolioType === "actor" ? "Showreel" : "Video";

  return (
    <section className={`${sectionClass} scroll-mt-6`} id="showreel-hero">
      <p className={labelClass}>01 / {pageLabel} page</p>
      <h2 className="heading-ui mt-2 text-2xl font-semibold text-white">{pageLabel} Hero</h2>
      <form action={saveShowreelHero} className="mt-5">
        <fieldset disabled={disabled}>
          <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <MediaAssetPicker
              assets={assets}
              defaultMediaType={hero.mediaType}
              defaultValue={hero.backgroundSrc}
              kind="media"
              label="Background image or video"
              mediaTypeName="mediaType"
              name="backgroundSrc"
              required
            />
            <div className="grid content-start gap-4 sm:grid-cols-2">
              <Field label="Title" wide><TextInput defaultValue={hero.title} name="title" required /></Field>
              <Field label="Subtitle"><TextInput defaultValue={hero.subtitle} name="subtitle" /></Field>
              <Field label="Button"><TextInput defaultValue={hero.ctaLabel} name="ctaLabel" /></Field>
              <Field label="Button link"><TextInput defaultValue={hero.ctaHref} name="ctaHref" /></Field>
              <MediaAssetPicker
                assets={assets}
                className="sm:col-span-2"
                defaultValue={hero.posterSrc}
                kind="image"
                label="Video poster / fallback image"
                name="posterSrc"
              />
              <input name="sortOrder" type="hidden" value={hero.sortOrder} />
            </div>
          </div>
          <div className="mt-5 flex justify-end"><ActionButton className={buttonClass} disabled={disabled} pendingLabel="Saving...">Save {pageLabel.toLowerCase()} hero</ActionButton></div>
        </fieldset>
      </form>
    </section>
  );
}

function ShowreelVideoEditor({
  assets,
  disabled,
  item,
  mode = "edit",
  portfolioType,
}: {
  assets: MediaAsset[];
  disabled: boolean;
  item: EditableVideoItem;
  mode?: "edit" | "new";
  portfolioType: PortfolioType;
}) {
  const initialSource =
    item.platform.toLowerCase() === "upload"
      ? "upload"
      : item.platform.toLowerCase() === "direct"
        ? "direct"
        : "embed";
  const [sourceMode, setSourceMode] = useState<"upload" | "embed" | "direct">(
    initialSource
  );

  return (
    <AdminDisclosure
      badge={<span className="text-[10px] text-white/40">{item.isPublished || mode === "new" ? "Published" : "Hidden"}</span>}
      description={mode === "new" ? "Upload a file or connect a YouTube, Vimeo, or direct video URL." : `${item.videoType} · ${item.platform}`}
      icon={<FaVideo />}
      id={mode === "new" ? "showreel-video-new" : `showreel-video-${item.id}`}
      title={mode === "new" ? "+ Add video" : item.title}
      variant="item"
    >
    <article>
      {item.embedUrl ? (
        <div className="relative aspect-video bg-black">
          {initialSource === "upload" || initialSource === "direct" ? (
            <video className="h-full w-full" controls muted playsInline poster={item.thumbnailSrc} src={item.embedUrl} />
          ) : (
            <iframe allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen className="absolute inset-0 h-full w-full" src={item.embedUrl} title={item.title || "Video preview"} />
          )}
        </div>
      ) : null}
      <form action={saveShowreelVideo} className="p-4">
        <fieldset disabled={disabled}>
          {mode === "edit" ? <input name="id" type="hidden" value={item.id} /> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            {mode === "new" ? <Field label="ID (optional)"><TextInput name="id" /></Field> : null}
            <Field label="Title"><TextInput defaultValue={item.title} name="title" required /></Field>
            <Field label="Collection"><select className={inputClass} defaultValue={item.videoType} name="videoType">{VIDEO_TYPES.map((type) => <option key={type} value={type}>{videoTypeLabels[type]}</option>)}</select></Field>
            <Field label="Description" wide><TextArea defaultValue={item.description} name="description" rows={3} /></Field>
          </div>

          <div className="mt-4">
            <p className={labelClass}>Video source</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {([
                ["upload", "Uploaded file"],
                ["embed", "YouTube / Vimeo"],
                ["direct", "Direct video URL"],
              ] as const).map(([value, label]) => (
                <button
                  aria-pressed={sourceMode === value}
                  className={cx(
                    "h-11 rounded-xl border px-3 text-sm font-semibold transition",
                    sourceMode === value
                      ? "border-white bg-white text-black"
                      : "border-white/10 text-white/60 hover:border-white/30 hover:text-white"
                  )}
                  data-editor-dirty-action
                  key={value}
                  onClick={() => setSourceMode(value)}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>

            {sourceMode === "upload" ? (
              <div className="mt-4">
                <input name="platform" type="hidden" value="upload" />
                <MediaAssetPicker
                  assets={assets}
                  defaultValue={initialSource === "upload" ? item.embedUrl : ""}
                  kind="video"
                  name="embedUrl"
                />
                <a className="mt-3 inline-flex text-sm font-semibold text-[var(--accent)] hover:text-white" href="#upload">
                  Upload another video from this computer
                </a>
              </div>
            ) : sourceMode === "direct" ? (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <input name="platform" type="hidden" value="direct" />
                <Field label="MP4 / WebM URL" wide>
                  <TextInput defaultValue={initialSource === "direct" ? item.embedUrl : ""} name="embedUrl" required />
                </Field>
              </div>
            ) : (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label="Platform">
                  <select className={inputClass} defaultValue={initialSource === "embed" ? item.platform : "YouTube"} name="platform">
                    <option value="YouTube">YouTube</option>
                    <option value="Vimeo">Vimeo</option>
                    <option value="Other">Other embed</option>
                  </select>
                </Field>
                <Field label="Video link">
                  <TextInput defaultValue={initialSource === "embed" ? item.embedUrl : ""} name="embedUrl" required />
                </Field>
              </div>
            )}
          </div>

          <div className="mt-4"><p className={labelClass}>Thumbnail</p><MediaAssetPicker assets={assets} defaultValue={item.thumbnailSrc} kind="image" name="thumbnailSrc" /></div>
          <div className="mt-4 grid gap-3">
            <label className="flex h-11 items-center gap-3 rounded-2xl border border-white/10 bg-black/25 px-3 text-sm text-white/75"><input className="h-4 w-4 accent-white" defaultChecked={item.isFeatured} name="isFeatured" type="checkbox" /> {portfolioType === "actor" ? "Featured reel" : "Featured video"}</label>
            <PublishedAndOrder isPublished={item.isPublished} sortOrder={item.sortOrder} />
          </div>
          <div className="mt-5 flex justify-end"><ActionButton className={buttonClass} disabled={disabled} pendingLabel="Saving...">{mode === "new" ? "Add video" : "Save video"}</ActionButton></div>
        </fieldset>
      </form>
      {mode === "edit" ? <form action={deleteShowreelVideo} className="flex justify-end border-t border-white/10 p-4" onSubmit={(event) => { if (!window.confirm(`Delete "${item.title}"?`)) event.preventDefault(); }}><input name="id" type="hidden" value={item.id} /><ActionButton className={dangerButtonClass} disabled={disabled} pendingLabel="Deleting..."><FaTrash /> Delete</ActionButton></form> : null}
    </article>
    </AdminDisclosure>
  );
}

function ShowreelStudio({
  assets,
  confirmDiscard,
  content,
  disabled,
  portfolioType,
  v2Enabled,
}: {
  assets: MediaAsset[];
  confirmDiscard: () => boolean;
  content: EditablePortfolioContent;
  disabled: boolean;
  portfolioType: PortfolioType;
  v2Enabled: boolean;
}) {
  const videos = [...content.videos].sort((a, b) => Number(b.isFeatured) - Number(a.isFeatured) || a.sortOrder - b.sortOrder);
  const copy = content.videoPresentation;
  const pageLabel = portfolioType === "actor" ? "Showreel" : "Video";
  const [activePanel, setActivePanel] = useState<"hero" | "copy" | "videos">("hero");
  const panels = [
    { id: "hero" as const, label: "01 Hero", target: "showreel-hero" },
    { id: "copy" as const, label: "02 Page text", target: "showreel-copy" },
    { id: "videos" as const, label: `03 Videos · ${videos.length}`, target: "showreel-videos" },
  ];

  function openPanel(id: (typeof panels)[number]["id"]) {
    if (id === activePanel) return true;
    if (!confirmDiscard()) return false;
    setActivePanel(id);
    return true;
  }

  function handlePanelKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number
  ) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      return;
    }

    event.preventDefault();
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? panels.length - 1
          : event.key === "ArrowRight"
            ? (index + 1) % panels.length
            : (index - 1 + panels.length) % panels.length;
    const nextPanel = panels[nextIndex];
    if (!openPanel(nextPanel.id)) return;
    window.requestAnimationFrame(() => {
      document.getElementById(`showreel-${nextPanel.id}-tab`)?.focus();
    });
  }

  return (
    <div className="grid gap-6">
      {v2Enabled ? (
        <div className="rounded-2xl border border-[#ff674f]/20 bg-[#ff3b1f]/[0.075] p-4 text-sm leading-6 text-white/68">
          <p className="font-semibold text-white">
            Showreel editing moved to Admin V2
          </p>
          <p className="mt-1 text-white/46">
            This classic view stays available for reference, but its forms are
            locked so they cannot bypass section history and conflict checks.
          </p>
          <Link
            className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl bg-white px-3 text-xs font-semibold text-black transition hover:bg-[#ff3b1f] hover:text-white"
            href="/admin/v2/pages/showreel"
          >
            Open Showreel V2 <FaExternalLinkAlt />
          </Link>
        </div>
      ) : null}
      <div className="sticky top-4 z-30 flex flex-col gap-3 rounded-2xl border border-emerald-300/15 bg-[#101312]/95 p-4 shadow-2xl backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <nav aria-label={`${pageLabel} Studio sections`} className="admin-scrollbar-none flex gap-2 overflow-x-auto" role="tablist">
          {panels.map((panel, index) => (
            <button
              aria-controls={panel.target}
              aria-selected={activePanel === panel.id}
              className={cx(
                "shrink-0 rounded-xl border px-3 py-2 text-xs font-semibold transition",
                activePanel === panel.id
                  ? "border-white bg-white text-black"
                  : "border-white/10 text-white/60 hover:border-white/30 hover:text-white"
              )}
              id={`showreel-${panel.id}-tab`}
              key={panel.id}
              onClick={() => {
                if (openPanel(panel.id)) return;
                window.requestAnimationFrame(() => {
                  document.getElementById(`showreel-${activePanel}-tab`)?.focus();
                });
              }}
              onKeyDown={(event) => handlePanelKeyDown(event, index)}
              role="tab"
              tabIndex={activePanel === panel.id ? 0 : -1}
              type="button"
            >
              {panel.label}
            </button>
          ))}
        </nav>
        <Link className={secondaryButtonClass} href="/video" rel="noreferrer" target="_blank"><FaExternalLinkAlt /> Open public {pageLabel}</Link>
      </div>
      {panels
        .filter((panel) => panel.id !== activePanel)
        .map((panel) => (
          <div
            aria-labelledby={`showreel-${panel.id}-tab`}
            hidden
            id={panel.target}
            key={panel.id}
            role="tabpanel"
          />
        ))}
      {activePanel === "hero" ? (
        <div
          aria-labelledby="showreel-hero-tab"
          id="showreel-hero"
          role="tabpanel"
        >
          <AdminDisclosure
            collapsible={false}
            description="Opening title, action, and background media."
            eyebrow="01 · Page opening"
            id="showreel-hero-panel"
            title={`${pageLabel} hero`}
          >
            <ShowreelHeroEditor assets={assets} content={content} disabled={disabled} portfolioType={portfolioType} />
          </AdminDisclosure>
        </div>
      ) : null}
      {activePanel === "copy" ? (
        <div
          aria-labelledby="showreel-copy-tab"
          id="showreel-copy"
          role="tabpanel"
        >
        <AdminDisclosure
          collapsible={false}
          description="Section labels, supporting copy, and empty states."
          eyebrow="02 · Page text"
          id="showreel-copy-editor"
          title="Page introduction"
        >
        <p className={labelClass}>02 / Page introduction</p>
        <div className="mt-4 rounded-lg border border-white/10 bg-black/30 p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-white/45">{copy.sectionEyebrow}</p>
          <h2 className="heading-ui mt-3 text-3xl text-white sm:text-4xl">{copy.sectionTitle}</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60">{copy.sectionBody}</p>
        </div>
        <form action={saveShowreelPresentation} className="mt-5">
          <fieldset disabled={disabled}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Section eyebrow"><TextInput defaultValue={copy.sectionEyebrow} name="sectionEyebrow" /></Field>
              <Field label="Section heading"><TextInput defaultValue={copy.sectionTitle} name="sectionTitle" required /></Field>
              <Field label="Section body" wide><TextArea defaultValue={copy.sectionBody} name="sectionBody" rows={3} /></Field>
              <Field label="Featured label"><TextInput defaultValue={copy.featuredLabel} name="featuredLabel" /></Field>
              <Field label="Library eyebrow"><TextInput defaultValue={copy.libraryEyebrow} name="libraryEyebrow" /></Field>
              <Field label="Featured fallback" wide><TextArea defaultValue={copy.featuredFallback} name="featuredFallback" rows={2} /></Field>
              <Field label="Library heading"><TextInput defaultValue={copy.libraryTitle} name="libraryTitle" /></Field>
              <Field label="Empty state"><TextInput defaultValue={copy.emptyText} name="emptyText" /></Field>
            </div>
            <div className="mt-5 flex justify-end"><ActionButton className={buttonClass} disabled={disabled} pendingLabel="Saving...">Save page text</ActionButton></div>
          </fieldset>
        </form>
        </AdminDisclosure>
        </div>
      ) : null}
      {activePanel === "videos" ? (
        <div
          aria-labelledby="showreel-videos-tab"
          id="showreel-videos"
          role="tabpanel"
        >
        <AdminDisclosure
          collapsible={false}
          badge={<span className="text-xs text-white/42">{videos.length} items</span>}
          description="Featured reel, scenes, and supporting clips."
          eyebrow="03 · Video sequence"
          id="showreel-videos-editor"
          title="Videos"
        >
        <div className="flex items-end justify-between gap-4"><div><p className={labelClass}>03 / Video sequence</p><h2 className="heading-ui mt-2 text-2xl font-semibold text-white">Featured reel, scenes, and clips</h2></div><span className="text-sm text-white/45">{videos.length} items</span></div>
        <div className="mt-6 grid gap-3">
          {videos.map((item) => <ShowreelVideoEditor assets={assets} disabled={disabled} item={item} key={item.id} portfolioType={portfolioType} />)}
          <ShowreelVideoEditor assets={assets} disabled={disabled} item={{ id: "", title: "", description: "", embedUrl: "", platform: "upload", thumbnailSrc: "", videoType: portfolioType === "actor" ? "showreel" : "music_video", isFeatured: videos.length === 0, sortOrder: nextSort(videos), isPublished: true }} mode="new" portfolioType={portfolioType} />
        </div>
        </AdminDisclosure>
        </div>
      ) : null}
    </div>
  );
}

function GalleryStudio({
  assetListId,
  assets,
  confirmDiscard,
  content,
  disabled,
  v2Enabled,
  portfolioType,
}: {
  assetListId: string;
  assets: MediaAsset[];
  confirmDiscard: () => boolean;
  content: EditablePortfolioContent;
  disabled: boolean;
  v2Enabled: boolean;
  portfolioType: PortfolioType;
}) {
  const presentation = content.galleryPresentation;
  const mosaic = [...content.galleryImages].filter((item) => item.isMosaic).sort((a, b) => a.sortOrder - b.sortOrder);
  const nextOrder = nextSort(content.galleryImages);
  const [activePanel, setActivePanel] = useState<"hero" | "mosaic">("hero");
  const panels = [
    { id: "hero" as const, label: "01 Hero", target: "studio-hero-panel" },
    {
      id: "mosaic" as const,
      label: `02 Mosaic · ${mosaic.length}`,
      target: "studio-mosaic",
    },
  ];

  function openPanel(id: (typeof panels)[number]["id"]) {
    if (id === activePanel) return true;
    if (!confirmDiscard()) return false;
    setActivePanel(id);
    return true;
  }

  function handlePanelKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number
  ) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      return;
    }

    event.preventDefault();
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? panels.length - 1
          : event.key === "ArrowRight"
            ? (index + 1) % panels.length
            : (index - 1 + panels.length) % panels.length;
    const nextPanel = panels[nextIndex];
    if (!openPanel(nextPanel.id)) return;
    window.requestAnimationFrame(() => {
      document.getElementById(`studio-${nextPanel.id}-tab`)?.focus();
    });
  }

  return (
    <div className="grid gap-6">
      {v2Enabled ? (
        <div className="rounded-2xl border border-[#ff674f]/20 bg-[#ff3b1f]/[0.075] p-4 text-sm leading-6 text-white/68">
          <p className="font-semibold text-white">Gallery editing moved to Admin V2</p>
          <p className="mt-1 text-white/46">
            This classic view stays available for reference, but its forms are
            locked so they cannot bypass the new conflict protection.
          </p>
          <Link
            className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl bg-white px-3 text-xs font-semibold text-black transition hover:bg-[#ff3b1f] hover:text-white"
            href="/admin/v2/pages/gallery"
          >
            Open Gallery V2 <FaExternalLinkAlt />
          </Link>
        </div>
      ) : null}
      <div className="sticky top-4 z-30 flex flex-col gap-3 rounded-2xl border border-emerald-300/15 bg-[#101312]/95 p-4 shadow-2xl backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <nav aria-label="Gallery Studio sections" className="flex gap-2" role="tablist">
          {panels.map((panel, index) => (
            <button
              aria-controls={panel.target}
              aria-selected={activePanel === panel.id}
              className={cx(
                "rounded-xl border px-3 py-2 text-xs font-semibold transition",
                activePanel === panel.id
                  ? "border-white bg-white text-black"
                  : "border-white/10 text-white/60 hover:border-white/30 hover:text-white"
              )}
              id={`studio-${panel.id}-tab`}
              key={panel.id}
              onClick={() => {
                if (openPanel(panel.id)) return;
                window.requestAnimationFrame(() => {
                  document.getElementById(`studio-${activePanel}-tab`)?.focus();
                });
              }}
              onKeyDown={(event) => handlePanelKeyDown(event, index)}
              role="tab"
              tabIndex={activePanel === panel.id ? 0 : -1}
              type="button"
            >
              {panel.label}
            </button>
          ))}
        </nav>
        <Link className={secondaryButtonClass} href="/gallery" rel="noreferrer" target="_blank"><FaExternalLinkAlt /> Open public Gallery</Link>
      </div>

      {panels
        .filter((panel) => panel.id !== activePanel)
        .map((panel) => (
          <div
            aria-labelledby={`studio-${panel.id}-tab`}
            hidden
            id={panel.target}
            key={panel.id}
            role="tabpanel"
          />
        ))}

      {activePanel === "hero" ? (
        <div
          aria-labelledby="studio-hero-tab"
          id="studio-hero-panel"
          role="tabpanel"
        >
          <AdminDisclosure
            collapsible={false}
            description="Opening title, action, and gallery background media."
            eyebrow="01 · Page opening"
            id="studio-hero-editor"
            title="Gallery hero"
          >
            <StudioHero assets={assets} content={content} disabled={disabled} />
          </AdminDisclosure>
        </div>
      ) : null}

      {activePanel === "mosaic" ? (
        <div
          aria-labelledby="studio-mosaic-tab"
          id="studio-mosaic"
          role="tabpanel"
        >
        <AdminDisclosure
          collapsible={false}
          badge={<span className="text-xs text-white/42">{mosaic.length} frames</span>}
          description="Archive introduction and the ordered public image composition."
          eyebrow="02 · Gallery content"
          id="studio-mosaic-editor"
          title="Public mosaic"
        >
        <p className={labelClass}>02 / Archive introduction</p>
        <form action={saveGalleryPresentation} className="mt-4">
          <fieldset disabled={disabled}>
            <PresentationHiddenFields content={presentation} except="intro" />
            <div className="border-b border-white/10 bg-[#070707] px-5 py-10 sm:px-8">
              <Field label="Eyebrow"><TextInput defaultValue={presentation.introEyebrow} name="introEyebrow" required /></Field>
              <Field label="Main heading"><TextArea defaultValue={presentation.introTitle} name="introTitle" rows={2} /></Field>
            </div>
            <div className="mt-4 flex justify-end"><ActionButton className={buttonClass} disabled={disabled} pendingLabel="Saving...">Save introduction</ActionButton></div>
          </fieldset>
        </form>

        <div className="mt-8 flex items-end justify-between gap-4 border-b border-white/10 pb-4">
          <div><p className={labelClass}>Public mosaic</p><h3 className="heading-ui mt-2 text-2xl font-semibold text-white">{mosaic.length} visible frames</h3></div>
          <span className="text-xs text-white/40">Use arrows for visitor order</span>
        </div>
        {mosaic.length ? (
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:auto-rows-[54px] lg:grid-cols-12">
            {mosaic.map((item, index) => (
              <a
                className={cx(
                  "group relative min-h-44 overflow-hidden rounded-lg border border-white/10 bg-black sm:min-h-56 lg:min-h-0",
                  studioMosaicSlots[index % studioMosaicSlots.length]
                )}
                href={`#studio-frame-${item.id}`}
                key={`${item.id}-composition`}
              >
                <ImagePreview alt={item.alt || item.title} src={item.src} />
                <span className="absolute left-3 top-3 rounded-lg bg-black/70 px-2 py-1 text-[10px] font-semibold text-white">{String(index + 1).padStart(2, "0")}</span>
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/60 to-transparent px-4 pb-3 pt-10 text-sm font-semibold text-white">{item.title}</span>
              </a>
            ))}
          </div>
        ) : null}
        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          {mosaic.map((item, index) => <StudioImageEditor assetListId={assetListId} assets={assets} disabled={disabled} index={index} item={item} key={item.id} />)}
          <GalleryImageForm
            assets={assets}
            disabled={disabled}
            item={{ id: "", title: "", src: "", alt: "", caption: "", category: portfolioType === "actor" ? "Headshot" : "Live", isMosaic: true, isFreelanceStory: false, freelanceStoryOrder: 0, sortOrder: nextOrder, isPublished: true }}
            mode="new"
          />
        </div>
        </AdminDisclosure>
        </div>
      ) : null}

    </div>
  );
}

function filterAssets(
  assets: MediaAsset[],
  assetUsage: Map<string, string[]>,
  filter: MediaFilter,
  search: string,
  sort: MediaSort
) {
  const needle = search.trim().toLowerCase();

  return assets
    .filter((asset) => {
      if (filter !== "trash" && asset.deletedAt) return false;
      if (filter === "trash" && !asset.deletedAt) return false;
      if (filter === "image" && asset.mediaType !== "image") return false;
      if (filter === "video" && asset.mediaType !== "video") return false;
      if (filter === "published" && !asset.isPublished) return false;
      if (filter === "hidden" && asset.isPublished) return false;
      if (filter === "unused" && (assetUsage.get(asset.id)?.length || 0) > 0) {
        return false;
      }
      if (
        filter === "missing_alt" &&
        (asset.mediaType !== "image" || asset.alt.trim())
      ) {
        return false;
      }
      if (
        filter === "oversized" &&
        asset.fileSize <=
          (asset.mediaType === "video" ? 50 * 1024 * 1024 : 5 * 1024 * 1024)
      ) {
        return false;
      }
      if (
        filter === "recent" &&
        Date.now() - new Date(asset.createdAt).getTime() > 30 * 24 * 60 * 60 * 1000
      ) {
        return false;
      }

      if (!needle) return true;

      const haystack = [
        asset.id,
        asset.label,
        asset.alt,
        asset.usageKey,
        asset.mimeType,
        asset.storagePath,
        metadataString(asset, "originalName"),
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(needle);
    })
    .sort((a, b) => {
      if (sort === "newest") {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      if (sort === "label") return a.label.localeCompare(b.label);
      if (sort === "largest") return b.fileSize - a.fileSize;
      return a.sortOrder - b.sortOrder;
    });
}

function replaceMediaModeInUrl(nextMode: MediaMode) {
  const url = new URL(window.location.href);
  url.searchParams.set("view", nextMode);
  url.searchParams.delete("status");
  url.hash = "";
  const search = url.searchParams.toString();

  window.history.replaceState(
    window.history.state,
    "",
    `${url.pathname}${search ? `?${search}` : ""}`
  );
}

export default function MediaManager({
  assets,
  content,
  contentIsConfigured,
  contentLoadError,
  galleryV2Enabled,
  showreelV2Enabled,
  isConfigured,
  loadError,
  portfolioType,
  status,
  initialMode = "studio",
}: MediaManagerProps) {
  const galleryImages = content.galleryImages;
  const mediaDisabled = !isConfigured || Boolean(loadError);
  const contentDisabled = !contentIsConfigured || Boolean(contentLoadError);
  const [mode, setMode] = useState<MediaMode>(initialMode);
  const [filter, setFilter] = useState<MediaFilter>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<MediaSort>("order");
  const {
    clearDirty,
    confirmDiscard,
    hasUnsavedChanges,
    markDirty,
  } = useUnsavedChangesGuard();
  const dirtyFormsRef = useRef<Set<HTMLFormElement>>(new Set());
  const previousInitialModeRef = useRef(initialMode);
  const expectedRestoredModeRef = useRef<MediaMode | null>(null);
  const assetListId = "media-asset-url-options";
  const availableAssets = useMemo(
    () => assets.filter((asset) => !asset.deletedAt),
    [assets]
  );
  const gallerySrcSet = useMemo(
    () =>
      new Set(
        galleryImages
          .filter((image) => image.isMosaic)
          .map((image) => image.src)
          .filter(Boolean)
      ),
    [galleryImages]
  );
  const assetUsage = useMemo(
    () =>
      new Map(
        assets.map((asset) => [
          asset.id,
          getAssetDestinations(asset.src, content),
        ])
      ),
    [assets, content]
  );
  const filteredAssets = useMemo(
    () => filterAssets(assets, assetUsage, filter, search, sort),
    [assetUsage, assets, filter, search, sort]
  );
  const nextGallerySort = nextSort(galleryImages);

  const confirmAndDiscardDrafts = useCallback(() => {
    if (!confirmDiscard()) return false;
    dirtyFormsRef.current.clear();
    return true;
  }, [confirmDiscard]);

  function rememberDirtyForm(target: EventTarget | null) {
    if (!(target instanceof Element)) return;
    const form = target.closest<HTMLFormElement>("form");
    if (!form) return;

    dirtyFormsRef.current.add(form);
    markDirty();
  }

  function submitNavigatingForm(form: HTMLFormElement) {
    const otherDraftForms = [...dirtyFormsRef.current].filter(
      (dirtyForm) => dirtyForm !== form && dirtyForm.isConnected
    );

    if (
      otherDraftForms.length > 0 &&
      !window.confirm(
        "You also have unsaved changes in another media form. Continuing reloads this workspace and discards those drafts. Continue?"
      )
    ) {
      return false;
    }

    dirtyFormsRef.current.clear();
    clearDirty();
    return true;
  }

  function finishFormWithoutNavigation(form: HTMLFormElement) {
    const remainingDraftForms = [...dirtyFormsRef.current].filter(
      (dirtyForm) => dirtyForm !== form && dirtyForm.isConnected
    );
    dirtyFormsRef.current = new Set(remainingDraftForms);
    if (remainingDraftForms.length === 0) clearDirty();
  }

  useEffect(() => {
    if (initialMode === previousInitialModeRef.current) return;

    if (initialMode === expectedRestoredModeRef.current) {
      previousInitialModeRef.current = initialMode;
      expectedRestoredModeRef.current = null;
      return;
    }

    previousInitialModeRef.current = initialMode;

    if (!confirmAndDiscardDrafts()) {
      expectedRestoredModeRef.current = mode;
      replaceMediaModeInUrl(mode);
      return;
    }

    expectedRestoredModeRef.current = null;
    const nextMode = initialMode;
    const timeoutId = window.setTimeout(() => setMode(nextMode), 0);
    return () => window.clearTimeout(timeoutId);
  }, [confirmAndDiscardDrafts, initialMode, mode]);

  function changeMode(nextMode: MediaMode) {
    if (nextMode === mode) return true;
    if (!confirmAndDiscardDrafts()) return false;

    setMode(nextMode);
    replaceMediaModeInUrl(nextMode);
    return true;
  }

  return (
    <div
      className="grid gap-6"
      onChangeCapture={(event) => {
        const target = event.target;
        if (
          (target instanceof HTMLInputElement ||
            target instanceof HTMLSelectElement ||
            target instanceof HTMLTextAreaElement) &&
          target.name &&
          target.closest("form")
        ) {
          rememberDirtyForm(target);
        }
      }}
      onClickCapture={(event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const button = target.closest("button");
        if (
          button instanceof HTMLButtonElement &&
          button.type === "button" &&
          button.closest("form") &&
          (button.hasAttribute("data-editor-dirty-action") ||
            (button.getAttribute("aria-label")?.startsWith("Use ") &&
              button.getAttribute("aria-pressed") !== "true"))
        ) {
          rememberDirtyForm(button);
        }
      }}
      onSubmit={(event) => {
        if (event.defaultPrevented) return;
        const form = event.target;
        if (
          form instanceof HTMLFormElement &&
          !submitNavigatingForm(form)
        ) {
          event.preventDefault();
        }
      }}
    >
      <StatusNotice
        contentIsConfigured={contentIsConfigured}
        contentLoadError={contentLoadError}
        isConfigured={isConfigured}
        loadError={loadError}
        status={status}
      />

      <ModeTabs
        hasUnsavedChanges={hasUnsavedChanges}
        mode={mode}
        onChange={changeMode}
      />
      <datalist id={assetListId}>
        {availableAssets
          .filter((asset) => asset.mediaType === "image")
          .map((asset) => (
            <option key={asset.id} label={asset.label} value={asset.src} />
          ))}
      </datalist>

      {(["studio", "showreel", "library"] as const)
        .filter((panelMode) => panelMode !== mode)
        .map((panelMode) => (
          <div
            aria-labelledby={`media-${panelMode}-tab`}
            hidden
            id={`media-${panelMode}-panel`}
            key={panelMode}
            role="tabpanel"
          />
        ))}

      {mode === "studio" ? (
        <div aria-labelledby="media-studio-tab" id="media-studio-panel" role="tabpanel">
          <GalleryStudio
            assetListId={assetListId}
            assets={availableAssets}
            confirmDiscard={confirmAndDiscardDrafts}
            content={content}
            disabled={contentDisabled || galleryV2Enabled}
            v2Enabled={galleryV2Enabled}
            portfolioType={portfolioType}
          />
        </div>
      ) : mode === "showreel" ? (
        <div aria-labelledby="media-showreel-tab" id="media-showreel-panel" role="tabpanel">
          <ShowreelStudio
            assets={availableAssets}
            confirmDiscard={confirmAndDiscardDrafts}
            content={content}
            disabled={contentDisabled || showreelV2Enabled}
            portfolioType={portfolioType}
            v2Enabled={showreelV2Enabled}
          />
        </div>
      ) : mode === "library" ? (
        <div
          aria-labelledby="media-library-tab"
          className="grid gap-4"
          id="media-library-panel"
          role="tabpanel"
        >
        <MediaOverview assets={assets} />
        <UploadPanel
          disabled={mediaDisabled}
          onSaved={finishFormWithoutNavigation}
          sortOrder={nextSort(availableAssets)}
        />
        <section className={sectionClass}>
          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className={labelClass}>Storage library</p>
              <h2 className="heading-ui mt-2 text-2xl font-semibold tracking-tight text-white">
                Uploaded Media
              </h2>
            </div>
            <span className="text-sm text-white/45">
              Showing {filteredAssets.length} of {assets.length}
            </span>
          </div>

          <LibraryToolbar
            filter={filter}
            onFilterChange={setFilter}
            onSearchChange={setSearch}
            onSortChange={setSort}
            search={search}
            sort={sort}
          />

          {filteredAssets.length ? (
            <div className="mt-6 grid gap-4 xl:grid-cols-2">
              {filteredAssets.map((asset) => (
                <AssetCard
                  asset={asset}
                  contentDisabled={contentDisabled}
                  disabled={mediaDisabled}
                  gallerySortOrder={nextGallerySort}
                  inGallery={gallerySrcSet.has(asset.src)}
                  key={asset.id}
                  portfolioType={portfolioType}
                  usage={assetUsage.get(asset.id) || []}
                />
              ))}
            </div>
          ) : (
            <div className="mt-6 rounded-[24px] border border-white/10 bg-black/25 p-8 text-center text-sm text-white/50">
              No media matches this view.
            </div>
          )}
        </section>
        </div>
      ) : null}
    </div>
  );
}
