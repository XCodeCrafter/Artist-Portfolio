"use client";

import Image from "next/image";
import { useEffect, useRef, type CSSProperties } from "react";
import {
  getHeroMediaStyle,
  type HeroFraming,
  type HeroFramingDevice,
} from "@/lib/content/hero-framing";

type HeroMediaProps = {
  backgroundSrc: string;
  mediaType: "image" | "video";
  posterSrc?: string;
  framing: HeroFraming;
  deviceOverride?: HeroFramingDevice;
  paused?: boolean;
  staticPreview?: boolean;
  sizes?: string;
  priority?: boolean;
  onDimensions?: (dimensions: { width: number; height: number }) => void;
  onError?: () => void;
  onPlaybackError?: () => void;
};

const responsiveMediaClassName = [
  "pointer-events-none absolute inset-0 h-full w-full",
  "[object-fit:var(--hero-fit-mobile)] sm:[object-fit:var(--hero-fit-desktop)]",
  "[object-position:var(--hero-position-mobile)] sm:[object-position:var(--hero-position-desktop)]",
  "[transform-origin:var(--hero-origin-mobile)] sm:[transform-origin:var(--hero-origin-desktop)]",
  "[transform:var(--hero-transform-mobile)] sm:[transform:var(--hero-transform-desktop)]",
].join(" ");

/** One media layer is shared by visitor Heroes and the framing editor. */
export default function HeroMedia({
  backgroundSrc,
  mediaType,
  posterSrc,
  framing,
  deviceOverride,
  paused,
  staticPreview = false,
  sizes = "100vw",
  priority = true,
  onDimensions,
  onError,
  onPlaybackError,
}: HeroMediaProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playbackErrorRef = useRef(onPlaybackError);
  useEffect(() => { playbackErrorRef.current = onPlaybackError; }, [onPlaybackError]);
  useEffect(() => {
    // Public Heroes retain native autoplay. Only the editor explicitly controls playback.
    if (paused === undefined || mediaType !== "video" || staticPreview) return;
    const video = videoRef.current;
    if (!video) return;
    if (paused) {
      video.pause();
      return;
    }
    let cancelled = false;
    const reportPlaybackError = () => { if (!cancelled) playbackErrorRef.current?.(); };
    try {
      void video.play().catch(reportPlaybackError);
    } catch {
      reportPlaybackError();
    }
    return () => { cancelled = true; };
  }, [backgroundSrc, mediaType, paused, staticPreview]);

  const mobile = getHeroMediaStyle(framing.mobile);
  const desktop = getHeroMediaStyle(framing.desktop);
  const style: CSSProperties = deviceOverride
    ? getHeroMediaStyle(framing[deviceOverride])
    : ({
        "--hero-fit-mobile": mobile.objectFit,
        "--hero-fit-desktop": desktop.objectFit,
        "--hero-position-mobile": mobile.objectPosition,
        "--hero-position-desktop": desktop.objectPosition,
        "--hero-origin-mobile": mobile.transformOrigin,
        "--hero-origin-desktop": desktop.transformOrigin,
        "--hero-transform-mobile": mobile.transform,
        "--hero-transform-desktop": desktop.transform,
      } as CSSProperties);
  const className = deviceOverride
    ? "pointer-events-none absolute inset-0 h-full w-full"
    : responsiveMediaClassName;
  const imageSrc = mediaType === "image" ? backgroundSrc : posterSrc;

  function reportDimensions(width: number, height: number) {
    if (width > 0 && height > 0 && Number.isFinite(width) && Number.isFinite(height)) {
      onDimensions?.({ width, height });
    }
  }

  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden bg-black"
      data-hero-framing="custom"
    >
      {mediaType === "video" && !staticPreview ? (
        <video
          aria-hidden="true"
          autoPlay={!paused}
          className={className}
          controls={false}
          controlsList="nodownload noplaybackrate noremoteplayback"
          disablePictureInPicture
          draggable={false}
          loop
          muted
          onError={onError}
          onLoadedMetadata={(event) => {
            reportDimensions(event.currentTarget.videoWidth, event.currentTarget.videoHeight);
          }}
          playsInline
          poster={posterSrc || undefined}
          preload="metadata"
          ref={videoRef}
          src={backgroundSrc}
          style={style}
          tabIndex={-1}
        />
      ) : imageSrc ? (
        <Image
          alt=""
          aria-hidden="true"
          className={className}
          draggable={false}
          fill
          onError={onError}
          onLoad={(event) => {
            reportDimensions(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight);
          }}
          priority={priority}
          sizes={sizes}
          src={imageSrc}
          style={style}
        />
      ) : null}
    </div>
  );
}
