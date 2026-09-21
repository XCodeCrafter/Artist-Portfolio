import type { HeroFrame } from "@/lib/content/hero-framing";

export type HeroMediaDimensions = { width: number; height: number };

export function validHeroDimensions(value: HeroMediaDimensions | null | undefined): value is HeroMediaDimensions {
  return Boolean(value && Number.isFinite(value.width) && Number.isFinite(value.height) && value.width > 0 && value.height > 0);
}

/** The same fitted object and transform origin used by getHeroMediaStyle(). */
export function getHeroFramingTravel(frame: HeroFrame, viewport: HeroMediaDimensions, media: HeroMediaDimensions) {
  if (!validHeroDimensions(viewport) || !validHeroDimensions(media) || !Number.isFinite(frame.zoom) || frame.zoom < 1) return null;
  const fitScale = frame.fit === "contain"
    ? Math.min(viewport.width / media.width, viewport.height / media.height)
    : Math.max(viewport.width / media.width, viewport.height / media.height);
  return {
    x: viewport.width - media.width * fitScale * frame.zoom,
    y: viewport.height - media.height * fitScale * frame.zoom,
  };
}

function shiftedPosition(position: number, delta: number, travel: number) {
  // A perfectly fitted axis cannot be panned; avoid tiny floating-point divisions.
  if (!Number.isFinite(delta) || Math.abs(travel) < 0.5) return position;
  return Math.round(Math.min(100, Math.max(0, position + delta / travel * 100)) * 100) / 100;
}

export function moveHeroFrame(frame: HeroFrame, viewport: HeroMediaDimensions, media: HeroMediaDimensions, delta: { x: number; y: number }): HeroFrame {
  const travel = getHeroFramingTravel(frame, viewport, media);
  if (!travel) return frame;
  return { ...frame, x: shiftedPosition(frame.x, delta.x, travel.x), y: shiftedPosition(frame.y, delta.y, travel.y) };
}

export function getHeroFramingPreviewViewport(device: "desktop" | "mobile", mediaType: "image" | "video") {
  return device === "desktop" ? { width: 1440, height: 900 } : { width: 390, height: 844 * (mediaType === "image" ? 0.6 : 0.5) };
}
