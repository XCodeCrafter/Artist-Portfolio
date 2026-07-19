"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import type { MediaAsset } from "@/lib/admin/media";

type PickerKind = "image" | "video" | "media";

type MediaAssetPickerProps = {
  assets: MediaAsset[];
  className?: string;
  defaultMediaType?: "image" | "video";
  defaultValue?: string;
  kind: PickerKind;
  label?: string;
  mediaTypeName?: string;
  name: string;
  onValueChange?: (value: string, asset?: MediaAsset) => void;
  openLibraryByDefault?: boolean;
  required?: boolean;
  showPreview?: boolean;
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
  kind,
  label,
  mediaTypeName,
  name,
  onValueChange,
  openLibraryByDefault = false,
  required = false,
  showPreview = true,
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
  const initialAsset = options.find((asset) => asset.src === defaultValue);
  const [value, setValue] = useState(defaultValue);
  const [mediaType, setMediaType] = useState<"image" | "video">(
    kind === "video"
      ? "video"
      : initialAsset?.mediaType === "video"
        ? "video"
        : defaultMediaType
  );
  const [libraryOpen, setLibraryOpen] = useState(openLibraryByDefault);
  const selected = options.find((asset) => asset.src === value);
  const activeType =
    kind === "video"
      ? "video"
      : kind === "image"
        ? "image"
        : selected?.mediaType === "video"
          ? "video"
          : mediaType;

  function selectAsset(asset: MediaAsset) {
    setValue(asset.src);
    if (asset.mediaType === "image" || asset.mediaType === "video") {
      setMediaType(asset.mediaType);
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
            />
          )
        ) : (
          <div className="grid h-full place-items-center px-5 text-center text-sm text-white/35">
            Choose an uploaded {kind === "media" ? "image or video" : kind}
          </div>
        )}
      </div>
      ) : null}

      <label className="mt-3 block">
        <span className={labelClass}>Source URL</span>
        <input
          className={inputClass}
          name={name}
          onChange={(event) => {
            const nextValue = event.target.value;
            setValue(nextValue);
            const nextAsset = options.find((asset) => asset.src === nextValue);
            if (
              nextAsset?.mediaType === "image" ||
              nextAsset?.mediaType === "video"
            ) {
              setMediaType(nextAsset.mediaType);
            }
            onValueChange?.(nextValue, nextAsset);
          }}
          required={required}
          type="text"
          value={value}
        />
      </label>

      {kind === "media" && mediaTypeName ? (
        <label className="mt-3 block">
          <span className={labelClass}>Media type</span>
          <select
            className={inputClass}
            name={mediaTypeName}
            onChange={(event) =>
              setMediaType(event.target.value as "image" | "video")
            }
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
          <div className="mt-3 grid max-h-72 grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
            {options.map((asset) => (
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
                  <video
                    className="h-full w-full object-cover"
                    muted
                    playsInline
                    preload="metadata"
                    src={asset.src}
                  />
                ) : (
                  <Image
                    alt={asset.alt || asset.label}
                    className="object-cover"
                    fill
                    sizes="220px"
                    src={asset.src}
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
        ) : (
          <p className="mt-3 text-sm leading-6 text-white/42">
            No matching files are stored yet. Upload them in Media Library first.
          </p>
        )}
      </details>
    </div>
  );
}
