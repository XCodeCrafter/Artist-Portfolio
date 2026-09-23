"use client";

import { useState } from "react";
import HeroFramingControls, { type HeroFramingControlsProps } from "@/components/admin/v2/HeroFramingControls";
import type { HeroFraming } from "@/lib/content/hero-framing";

export type PhotoFramingControlsProps = Pick<HeroFramingControlsProps, "value" | "onChange" | "src" | "disabled" | "device" | "onDeviceChange" | "previewViewport"> & {
  saveSection: string;
  variableAspect?: boolean;
};

const PHOTO_DEFAULT: HeroFraming = {
  desktop: { fit: "cover", x: 50, y: 50, zoom: 1 },
  mobile: { fit: "cover", x: 50, y: 50, zoom: 1 },
};
const SHAPES = {
  portrait: { width: 400, height: 500 },
  square: { width: 400, height: 400 },
  landscape: { width: 600, height: 400 },
};

/** Crop is local to this content placement; it never rewrites the library file. */
export default function PhotoFramingControls({ saveSection, variableAspect = false, ...props }: PhotoFramingControlsProps) {
  const [expanded, setExpanded] = useState(false);
  const [shape, setShape] = useState<keyof typeof SHAPES>("portrait");
  const unavailable = props.value === undefined;
  const viewport = variableAspect
    ? { desktop: SHAPES[shape], mobile: props.previewViewport?.mobile ?? { width: 350, height: 280 } }
    : props.previewViewport;

  return <details className="rounded-2xl border border-white/10 bg-black/15 p-3" onToggle={event => setExpanded(event.currentTarget.open)}>
    <summary className="cursor-pointer text-xs font-semibold text-white/70">Photo position &amp; zoom{unavailable ? " · setup required" : ""}</summary>
    {expanded ? <div className="mt-3 grid gap-3">
      {variableAspect ? <label className="grid gap-2 text-xs text-white/55">
        <span>Desktop preview shape</span>
        <select className="min-h-10 rounded-xl border border-white/10 bg-[#161618] px-3 text-sm text-white" value={shape} onChange={event => {
          const next = event.target.value;
          if (next === "portrait" || next === "square" || next === "landscape") setShape(next);
        }}>
          <option value="portrait">Portrait</option><option value="square">Square</option><option value="landscape">Landscape</option>
        </select>
        <span className="leading-5">Gallery shapes change with position and filters. This only changes the crop preview, not your Gallery layout; check the full page preview too.</span>
      </label> : null}
      <HeroFramingControls {...props} defaultFraming={PHOTO_DEFAULT} mediaType="image" subjectLabel="Photo" previewViewport={viewport}
        saveDescription={`Drag or zoom this photo. Desktop and mobile are saved separately when you save ${saveSection}. This placement only — your original library file stays unchanged.`}
        disabled={props.disabled || unavailable}
        unavailableReason={unavailable ? "Apply migration 0051 and reload to enable photo framing. Other fields remain editable." : undefined} />
    </div> : null}
  </details>;
}
