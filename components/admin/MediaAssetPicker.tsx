"use client";

import Image from "next/image";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { MediaAsset } from "@/lib/admin/media";

type PickerKind = "image" | "video" | "media";

type MediaAssetPickerProps = {
  assets: MediaAsset[];
  className?: string;
  defaultMediaType?: "image" | "video";
  defaultValue?: string;
  error?: string;
  kind: PickerKind;
  label?: string;
  mediaType?: "image" | "video";
  mediaTypeName?: string;
  name: string;
  onMediaTypeChange?: (value: "image" | "video") => void;
  onValueChange?: (value: string, asset?: MediaAsset) => void;
  openLibraryByDefault?: boolean;
  required?: boolean;
  showPreview?: boolean;
  value?: string;
};

const inputClass =
  "mt-2 w-full rounded-2xl border border-white/10 bg-black/28 px-3.5 py-2.5 text-sm text-white outline-none transition duration-300 placeholder:text-white/25 focus:border-white/35 focus:bg-black/36 disabled:cursor-not-allowed disabled:opacity-50";
const labelClass =
  "text-xs font-medium uppercase tracking-[0.18em] text-white/45";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export default function MediaAssetPicker({
  assets,
  className,
  defaultMediaType = "image",
  defaultValue = "",
  error,
  kind,
  label,
  mediaType: controlledMediaType,
  mediaTypeName,
  name,
  onMediaTypeChange,
  onValueChange,
  openLibraryByDefault = false,
  required = false,
  showPreview = true,
  value: controlledValue,
}: MediaAssetPickerProps) {
  const options = useMemo(
    () =>
      assets.filter((asset) =>
        kind === "media"
          ? asset.mediaType === "image" || asset.mediaType === "video"
          : asset.mediaType === kind
      ),
    [assets, kind]
  );
  const initialValue = controlledValue ?? defaultValue;
  const initialAsset = options.find((asset) => asset.src === initialValue);
  const [uncontrolledValue, setUncontrolledValue] = useState(initialValue);
  const [uncontrolledMediaType, setUncontrolledMediaType] = useState<
    "image" | "video"
  >(
    kind === "video"
      ? "video"
      : initialAsset?.mediaType === "video"
        ? "video"
        : defaultMediaType
  );
  const value = controlledValue ?? uncontrolledValue;
  const mediaType = controlledMediaType ?? uncontrolledMediaType;
  const [libraryOpen, setLibraryOpen] = useState(openLibraryByDefault);
  const sourceDetailsRef = useRef<HTMLDetailsElement | null>(null);
  const sourceInputId = useId();
  const sourceErrorId = `${sourceInputId}-error`;
  const [search, setSearch] = useState("");
  const [visibleLimit, setVisibleLimit] = useState(24);
  const selected = options.find((asset) => asset.src === value);
  const filteredOptions = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return options;

    return options.filter((asset) =>
      [asset.label, asset.alt, asset.mediaType]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [options, search]);
  const visibleOptions = filteredOptions.slice(0, visibleLimit);
  const activeType =
    kind === "video"
      ? "video"
      : kind === "image"
        ? "image"
        : selected?.mediaType === "video"
          ? "video"
          : mediaType;

  useEffect(() => {
    if (error && sourceDetailsRef.current) {
      sourceDetailsRef.current.open = true;
    }
  }, [error]);

  function selectAsset(asset: MediaAsset) {
    setUncontrolledValue(asset.src);
    if (asset.mediaType === "image" || asset.mediaType === "video") {
      setUncontrolledMediaType(asset.mediaType);
      onMediaTypeChange?.(asset.mediaType);
    }
    onValueChange?.(asset.src, asset);
    setLibraryOpen(false);
  }

  return (
    <div className={className}>
      {label ? <p className={labelClass}>{label}</p> : null}
      {showPreview ? (
      <div className="relative mt-2 aspect-video overflow-hidden rounded-xl border border-white/10 bg-black/45">
        {value ? (
          activeType === "video" ? (
            <video
              className="h-full w-full object-cover"
              controls
              muted
              playsInline
              preload="metadata"
              src={value}
            />
          ) : (
            <Image
              alt={selected?.alt || selected?.label || label || "Selected media"}
              className="object-cover"
              fill
              sizes="(min-width: 1280px) 45vw, 100vw"
              src={value}
              unoptimized={value.startsWith("https://")}
            />
          )
        ) : (
          <div className="grid h-full place-items-center px-5 text-center text-sm text-white/35">
            Choose an uploaded {kind === "media" ? "image or video" : kind}
          </div>
        )}
      </div>
      ) : null}

      <details
        className="mt-3 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-3"
        ref={sourceDetailsRef}
      >
        <summary
          aria-label={`${label || "Media"} advanced source URL${error ? " — contains an error" : ""}`}
          className="cursor-pointer text-xs font-semibold uppercase tracking-[0.16em] text-white/42"
        >
          Advanced source URL
          {error ? (
            <span className="ml-2 rounded-full bg-red-300/12 px-2 py-1 text-[9px] text-red-100">
              Needs attention
            </span>
          ) : null}
        </summary>
        <label className="mt-3 block" htmlFor={sourceInputId}>
          <span className={labelClass}>Source URL</span>
          <input
            aria-describedby={error ? sourceErrorId : undefined}
            aria-invalid={error ? true : undefined}
            aria-label={`${label || "Media"} source URL`}
            className={inputClass}
            id={sourceInputId}
            maxLength={2048}
            name={name}
            onChange={(event) => {
              const nextValue = event.target.value;
              setUncontrolledValue(nextValue);
              const nextAsset = options.find((asset) => asset.src === nextValue);
              if (
                nextAsset?.mediaType === "image" ||
                nextAsset?.mediaType === "video"
              ) {
                setUncontrolledMediaType(nextAsset.mediaType);
                onMediaTypeChange?.(nextAsset.mediaType);
              }
              onValueChange?.(nextValue, nextAsset);
            }}
            required={required}
            type="text"
            value={value}
          />
          {error ? (
            <span
              className="mt-2 block text-xs leading-5 text-red-200"
              id={sourceErrorId}
              role="alert"
            >
              {error}
            </span>
          ) : null}
        </label>
      </details>

      {kind === "media" && mediaTypeName ? (
        <label className="mt-3 block">
          <span className={labelClass}>Media type</span>
          <select
            className={inputClass}
            name={mediaTypeName}
            onChange={(event) => {
              const nextType = event.target.value as "image" | "video";
              setUncontrolledMediaType(nextType);
              onMediaTypeChange?.(nextType);
            }}
            value={activeType}
          >
            <option value="image">Image</option>
            <option value="video">Video</option>
          </select>
        </label>
      ) : null}

      <details
        className="mt-3 rounded-2xl border border-white/10 bg-black/25 p-3"
        onToggle={(event) => setLibraryOpen(event.currentTarget.open)}
        open={libraryOpen}
      >
        <summary className="cursor-pointer text-sm font-semibold text-white/75">
          {value ? "Change media" : "Choose from Media Library"}
          {selected ? ` — ${selected.label}` : ""}
        </summary>
        {options.length ? (
          <div className="mt-3">
            <label className="block">
              <span className="sr-only">Search media library</span>
              <input
                className={inputClass}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setVisibleLimit(24);
                }}
                placeholder="Search by label or alt text..."
                type="search"
                value={search}
              />
            </label>
            <p className="mt-2 text-xs text-white/38" role="status">
              Showing {Math.min(visibleOptions.length, filteredOptions.length)} of {filteredOptions.length}
            </p>
            <div className="mt-3 grid max-h-72 grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
            {visibleOptions.map((asset) => (
              <button
                aria-label={`Use ${asset.label}`}
                aria-pressed={asset.src === value}
                className={cx(
                  "group relative aspect-video overflow-hidden rounded-lg border bg-black text-left transition",
                  asset.src === value
                    ? "border-[var(--accent)]"
                    : "border-white/10 hover:border-white/35"
                )}
                key={asset.id}
                onClick={() => selectAsset(asset)}
                type="button"
              >
                {asset.mediaType === "video" ? (
                  <span className="grid h-full place-items-center bg-white/[0.04] px-2 text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-white/42">
                    Video
                  </span>
                ) : (
                  <Image
                    alt={asset.alt || asset.label}
                    className="object-cover"
                    fill
                    sizes="220px"
                    src={asset.src}
                    unoptimized={asset.src.startsWith("https://")}
                  />
                )}
                <span className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-black/78 px-2 py-1 text-[10px] text-white">
                  <span className="truncate">{asset.label}</span>
                  <span className="shrink-0 uppercase text-white/45">
                    {asset.mediaType}
                  </span>
                </span>
              </button>
            ))}
            </div>
            {visibleLimit < filteredOptions.length ? (
              <button
                className="mt-3 h-10 w-full rounded-xl border border-white/10 text-sm font-semibold text-white/65 transition hover:border-white/25 hover:bg-white/[0.06] hover:text-white"
                onClick={() => setVisibleLimit((limit) => limit + 24)}
                type="button"
              >
                Load 24 more
              </button>
            ) : null}
            {!filteredOptions.length ? (
              <p className="mt-4 text-center text-sm text-white/42">
                No media matches this search.
              </p>
            ) : null}
          </div>
        ) : (
          <p className="mt-3 text-sm leading-6 text-white/42">
            No matching files are stored yet. Upload them in Media Library first.
          </p>
        )}
      </details>
    </div>
  );
}
