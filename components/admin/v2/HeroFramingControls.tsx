"use client";

import { useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import HeroMedia from "@/components/HeroMedia";
import { getDefaultHeroFraming, type HeroFrame, type HeroFraming, type HeroFramingDevice } from "@/lib/content/hero-framing";
import { getHeroFramingPreviewViewport, moveHeroFrame, validHeroDimensions, type HeroMediaDimensions } from "@/lib/admin/hero-framing-geometry";
import { isSafeManagedMediaSource } from "@/lib/media-source";

export type HeroFramingControlsProps = {
  value?: HeroFraming | null;
  onChange: (value: HeroFraming | null) => void;
  src: string;
  posterSrc?: string;
  mediaType: "image" | "video";
  disabled?: boolean;
  unavailableReason?: string;
  device?: HeroFramingDevice;
  onDeviceChange?: (device: HeroFramingDevice) => void;
};

type Drag = {
  pointerId: number;
  clientX: number;
  clientY: number;
  viewport: HeroMediaDimensions;
  media: HeroMediaDimensions;
  frame: HeroFrame;
  device: HeroFramingDevice;
  source: string;
};

const buttonClass = "min-h-10 rounded-xl border border-white/12 px-3 py-2 text-xs font-semibold text-white/70 transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-35";

export default function HeroFramingControls({ value, onChange, src, posterSrc, mediaType, disabled = false, unavailableReason, device: selectedDevice, onDeviceChange }: HeroFramingControlsProps) {
  const id = useId();
  const [localDevice, setLocalDevice] = useState<HeroFramingDevice>("desktop");
  const [loaded, setLoaded] = useState<{ source: string; dimensions: HeroMediaDimensions } | null>(null);
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const [playback, setPlayback] = useState<{ source: string; playing: boolean; failed: boolean } | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const device = selectedDevice ?? localDevice;
  const source = `${mediaType}:${src}`;
  const framing = value ?? getDefaultHeroFraming(mediaType);
  const frame = framing[device];
  const safeSource = isSafeManagedMediaSource(src);
  const locked = disabled || Boolean(unavailableReason) || !safeSource;
  const dimensions = loaded?.source === source && failedSource !== source ? loaded.dimensions : null;
  const viewport = getHeroFramingPreviewViewport(device, mediaType);
  const error = failedSource === source;
  const playing = playback?.source === source && playback.playing;
  const playbackFailed = playback?.source === source && playback.failed;

  function isBlocked(target: HTMLElement) {
    return locked || target.matches(":disabled") || Boolean(target.closest("fieldset:disabled"));
  }
  function changeFrame(next: HeroFrame) {
    if (locked) return;
    onChange({ ...framing, [device]: next });
  }
  function changeDevice(next: HeroFramingDevice) {
    if (locked) return;
    dragRef.current = null;
    if (onDeviceChange) onDeviceChange(next);
    if (selectedDevice === undefined) setLocalDevice(next);
  }
  function endDrag(event: PointerEvent<HTMLButtonElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function startDrag(event: PointerEvent<HTMLButtonElement>) {
    if (isBlocked(event.currentTarget) || !dimensions || dragRef.current || event.button !== 0 || event.isPrimary === false) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (!validHeroDimensions(rect)) return;
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { return; }
    event.preventDefault();
    dragRef.current = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY,
      viewport: { width: rect.width, height: rect.height }, media: dimensions, frame, device, source };
  }
  function moveDrag(event: PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (isBlocked(event.currentTarget) || !dimensions || drag.device !== device || drag.source !== source) { endDrag(event); return; }
    event.preventDefault();
    changeFrame(moveHeroFrame(drag.frame, drag.viewport, drag.media, { x: event.clientX - drag.clientX, y: event.clientY - drag.clientY }));
  }
  function moveWithKeyboard(event: KeyboardEvent<HTMLButtonElement>) {
    if (isBlocked(event.currentTarget) || !dimensions) return;
    const distance = event.shiftKey ? 20 : 4;
    const delta = event.key === "ArrowLeft" ? { x: -distance, y: 0 }
      : event.key === "ArrowRight" ? { x: distance, y: 0 }
        : event.key === "ArrowUp" ? { x: 0, y: -distance }
          : event.key === "ArrowDown" ? { x: 0, y: distance } : null;
    if (!delta) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    changeFrame(moveHeroFrame(frame, rect, dimensions, delta));
  }
  function changeRange(key: "x" | "y" | "zoom", text: string) {
    if (locked || !text.trim()) return;
    const number = Number(text);
    if (!Number.isFinite(number)) return;
    const min = key === "zoom" ? 1 : 0;
    const max = key === "zoom" ? 3 : 100;
    changeFrame({ ...frame, [key]: Math.min(max, Math.max(min, number)) });
  }

  return <section aria-labelledby={`${id}-title`} className="grid gap-4 rounded-[20px] border border-white/10 bg-black/25 p-4">
    <div>
      <h3 className="text-sm font-semibold text-white/85" id={`${id}-title`}>Position &amp; zoom</h3>
      <p className="mt-2 text-xs leading-5 text-white/50">Drag the media to frame your subject. Desktop and mobile are saved separately, only when you save Hero.</p>
    </div>
    {unavailableReason ? <p role="status" className="rounded-xl border border-amber-300/20 bg-amber-300/5 p-3 text-xs leading-5 text-amber-100/80">{unavailableReason}</p> : null}
    <div aria-label="Framing device" className="grid grid-cols-2 gap-2" role="group">
      {(["desktop", "mobile"] as const).map(option => <button aria-pressed={device === option} className={`${buttonClass} ${device === option ? "border-white/40 bg-white/10 text-white" : ""}`} disabled={locked} key={option} onClick={() => changeDevice(option)} type="button">{option === "desktop" ? "Desktop" : "Mobile"}</button>)}
    </div>
    <div aria-label="Media fit" className="grid grid-cols-2 gap-2" role="group">
      <button aria-pressed={frame.fit === "cover"} className={buttonClass} disabled={locked} onClick={() => changeFrame({ ...frame, fit: "cover" })} type="button">Fill Hero</button>
      <button aria-pressed={frame.fit === "contain"} className={buttonClass} disabled={locked} onClick={() => changeFrame({ ...frame, fit: "contain", zoom: 1 })} type="button">Fit whole media</button>
    </div>
    <p className="text-xs leading-5 text-white/45">{frame.fit === "contain" ? "Fit whole keeps the full image or video at 100%. Unused space stays black; zoom in for a closer crop." : "Fill Hero covers the frame and crops its edges. For a tall portrait, try Fit whole media to see more."}</p>
    <div className="flex justify-center rounded-xl border border-white/10 bg-[#141416] p-2">
      <button aria-describedby={`${id}-drag-help`} aria-label={`Position ${device} Hero media`} className="relative block w-full touch-none select-none overflow-hidden rounded-lg bg-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed" disabled={locked}
        onDragStart={event => event.preventDefault()} onKeyDown={moveWithKeyboard} onLostPointerCapture={endDrag} onPointerCancel={endDrag} onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag}
        style={{ aspectRatio: `${viewport.width} / ${viewport.height}`, maxWidth: device === "mobile" ? 230 : undefined, cursor: !locked && dimensions ? "grab" : undefined }} type="button">
        {safeSource ? <HeroMedia backgroundSrc={src} deviceOverride={device} framing={framing} key={source} mediaType={mediaType}
          priority={false} sizes={device === "mobile" ? "230px" : "(min-width: 1024px) 340px, calc(100vw - 80px)"}
          onDimensions={next => { if (validHeroDimensions(next)) { setLoaded({ source, dimensions: next }); setFailedSource(null); } }} onError={() => setFailedSource(source)}
          onPlaybackError={() => setPlayback({ source, playing: false, failed: true })} paused={!playing} posterSrc={posterSrc && isSafeManagedMediaSource(posterSrc) ? posterSrc : undefined} /> : null}
        {!safeSource || error ? <span className="absolute inset-0 flex items-center justify-center p-5 text-center text-xs leading-5 text-white/60">{error ? "Media could not be loaded. Check its source; position sliders remain available." : "Choose a valid library image or video to adjust its framing."}</span> : null}
      </button>
    </div>
    {mediaType === "video" ? <div className="grid gap-2">
      <button className={buttonClass} disabled={locked || error} onClick={() => { if (!locked && !error) setPlayback({ source, playing: !playing, failed: false }); }} type="button">{playing ? "Pause video preview" : "Play video preview"}</button>
      {playbackFailed ? <p role="status" className="text-xs text-amber-100/75">Video playback could not start. Try again or check the source.</p> : null}
    </div> : null}
    <p className="text-xs leading-5 text-white/45" id={`${id}-drag-help`}>{dimensions ? "Drag here, or focus the preview and use arrow keys (Shift for larger moves). The full page preview shows your text and overlays." : "Dragging becomes available when the media dimensions load. You can also use the position sliders."}{mediaType === "video" ? " Video starts paused. Play the preview to check the actual video: a separate poster may have a different crop." : ""}</p>
    <label className="grid gap-2 text-xs text-white/65" htmlFor={`${id}-zoom`}>
      <span className="flex justify-between"><span>Zoom</span><output>{Math.round(frame.zoom * 100)}%</output></span>
      <input aria-label={`${device} Hero zoom`} className="w-full accent-white" disabled={locked} id={`${id}-zoom`} max={3} min={1} onChange={event => changeRange("zoom", event.target.value)} step={0.01} type="range" value={frame.zoom} />
    </label>
    <div className="grid grid-cols-2 gap-3">
      {(["x", "y"] as const).map(axis => <label className="grid gap-2 text-xs text-white/65" htmlFor={`${id}-${axis}`} key={axis}>
        <span>{axis === "x" ? "Horizontal" : "Vertical"} <span className="text-white/35">{Math.round(frame[axis])}%</span></span>
        <input aria-label={`${device} Hero ${axis === "x" ? "horizontal" : "vertical"} position`} className="w-full accent-white" disabled={locked} id={`${id}-${axis}`} max={100} min={0} onChange={event => changeRange(axis, event.target.value)} step={1} type="range" value={frame[axis]} />
      </label>)}
    </div>
    <div className="flex flex-wrap gap-2">
      <button className={buttonClass} disabled={locked} onClick={() => changeFrame(getDefaultHeroFraming(mediaType)[device])} type="button">Reset {device}</button>
      <button className={buttonClass} disabled={locked || value == null} onClick={() => { if (!locked) onChange(null); }} type="button">Reset both to original</button>
    </div>
  </section>;
}
