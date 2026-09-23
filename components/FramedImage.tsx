"use client";

import Image, { type ImageProps } from "next/image";
import { useEffect, useState, type CSSProperties, type RefObject } from "react";
import {
  getHeroMediaStyle,
  normalizeHeroFraming,
  type HeroFraming,
  type HeroFramingDevice,
} from "@/lib/content/hero-framing";

export type FramedImageProps = ImageProps & {
  framing?: HeroFraming | null;
  deviceOverride?: HeroFramingDevice;
};

const responsiveImageClass = [
  "[object-fit:var(--photo-fit-mobile)] sm:[object-fit:var(--photo-fit-desktop)]",
  "[object-position:var(--photo-position-mobile)] sm:[object-position:var(--photo-position-desktop)]",
  "[transform-origin:var(--photo-origin-mobile)] sm:[transform-origin:var(--photo-origin-desktop)]",
  "[transform:var(--photo-transform-mobile)] sm:[transform:var(--photo-transform-desktop)]",
].join(" ");

/** A placement crop never changes the original file or the surrounding animation. */
export default function FramedImage({ framing, deviceOverride, ...props }: FramedImageProps) {
  const normalized = normalizeHeroFraming(framing);
  // Keep the previous DOM, loading behavior and CSS exactly intact for legacy photos.
  if (!normalized) return <Image {...props} alt={props.alt} />;

  const { className, style, ...imageProps } = props;
  const desktop = getHeroMediaStyle(normalized.desktop);
  const mobile = getHeroMediaStyle(normalized.mobile);
  const cropStyle: CSSProperties = deviceOverride
    ? getHeroMediaStyle(normalized[deviceOverride])
    : ({
        "--photo-fit-mobile": mobile.objectFit,
        "--photo-fit-desktop": desktop.objectFit,
        "--photo-position-mobile": mobile.objectPosition,
        "--photo-position-desktop": desktop.objectPosition,
        "--photo-origin-mobile": mobile.transformOrigin,
        "--photo-origin-desktop": desktop.transformOrigin,
        "--photo-transform-mobile": mobile.transform,
        "--photo-transform-desktop": desktop.transform,
      } as CSSProperties);

  return (
    <span
      className={className}
      data-photo-framing="custom"
      style={{
        display: "inline-block",
        overflow: "hidden",
        backgroundColor: "black",
        ...(props.fill ? { position: "absolute", inset: 0 } : { position: "relative" }),
        ...style,
      }}
    >
      <Image
        {...imageProps}
        alt={imageProps.alt}
        className={deviceOverride ? undefined : responsiveImageClass}
        style={cropStyle}
      />
    </span>
  );
}

/** Listen only; this never starts, pauses, seeks, or reframes a video. */
export function observeVideoPlaybackFrame(
  video: HTMLVideoElement,
  videoSrc: string,
  onPresented: () => void,
  animation: Pick<Window, "requestAnimationFrame" | "cancelAnimationFrame"> = window,
) {
  let cancelled = false;
  let frameId: number | undefined;
  let animationId: number | undefined;
  const isCurrent = () => !cancelled && !video.paused && !video.ended &&
    video.readyState >= 2 && video.getAttribute("src") === videoSrc;
  const presented = () => {
    frameId = undefined;
    animationId = undefined;
    if (isCurrent()) onPresented();
  };
  const waitForFrame = () => {
    if (!isCurrent() || frameId !== undefined || animationId !== undefined) return;
    if (typeof video.requestVideoFrameCallback === "function") {
      frameId = video.requestVideoFrameCallback(presented);
    } else {
      animationId = animation.requestAnimationFrame(presented);
    }
  };
  video.addEventListener("playing", waitForFrame);
  video.addEventListener("loadeddata", waitForFrame);
  waitForFrame();
  return () => {
    cancelled = true;
    video.removeEventListener("playing", waitForFrame);
    video.removeEventListener("loadeddata", waitForFrame);
    if (frameId !== undefined) video.cancelVideoFrameCallback(frameId);
    if (animationId !== undefined) animation.cancelAnimationFrame(animationId);
  };
}

type VideoPosterProps = FramedImageProps & {
  active?: boolean;
  videoRef: RefObject<HTMLVideoElement | null>;
  videoSrc: string;
};

/** Native video posters cannot be cropped independently from playback. Use a
 * separate photo layer until the browser has actually presented a video frame. */
export function FramedVideoPoster(props: VideoPosterProps) {
  // A source change or a fresh hover after Showreel rewinds to zero needs a
  // newly presented frame, not the readiness state from the preceding play.
  return <PlaybackPoster {...props} key={`${props.videoSrc}:${props.active ?? true}`} />;
}

function PlaybackPoster({
  active = true,
  videoRef,
  videoSrc,
  ...props
}: VideoPosterProps) {
  const [presentedSource, setPresentedSource] = useState<string | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !active) return;
    return observeVideoPlaybackFrame(video, videoSrc, () => setPresentedSource(videoSrc));
  }, [active, videoRef, videoSrc]);

  if (active && presentedSource === videoSrc) return null;
  return <span className="pointer-events-none absolute inset-0 bg-black" data-framed-video-poster="true">
    <FramedImage {...props} />
  </span>;
}
