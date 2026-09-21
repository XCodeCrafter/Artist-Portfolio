"use client";

import Image from "next/image";
import { useState } from "react";
import { FaFile, FaImage, FaPlay, FaVideo } from "react-icons/fa";
import type { MediaAsset } from "@/lib/admin/media";
import { isSafeManagedMediaSource } from "@/lib/media-source";

/** Grid previews fetch images only. A video element exists only in the inspector. */
export default function MediaLibraryPreview({ asset, poster = "", large = false }: {
  asset: MediaAsset; poster?: string; large?: boolean;
}) {
  const [failedImage, setFailedImage] = useState("");
  const safePoster = poster && isSafeManagedMediaSource(poster) ? poster : "";
  const safeSource = isSafeManagedMediaSource(asset.src) ? asset.src : "";
  const imageSource = asset.mediaType === "image" ? safeSource : asset.mediaType === "video" ? safePoster : "";

  if (asset.mediaType === "video" && large && safeSource) {
    return <video key={safeSource} aria-label={`Preview ${asset.label}`} className="h-full w-full object-contain"
      src={safeSource} poster={safePoster || undefined} controls preload="none" playsInline />;
  }
  if (imageSource && failedImage !== imageSource) {
    return <>
      <Image fill unoptimized loading="lazy" src={imageSource} alt={asset.mediaType === "image" ? asset.alt || asset.label : ""}
        sizes={large ? "(min-width:1280px) 35vw, 100vw" : "(min-width:1280px) 18vw, 50vw"}
        onError={() => setFailedImage(imageSource)} className={large ? "object-contain" : "object-cover"} />
      {asset.mediaType === "video" && <span className="absolute bottom-2 left-2 inline-flex items-center gap-2 rounded-lg bg-black/80 px-2 py-1 text-[10px] text-white"><FaPlay aria-hidden /> Video poster</span>}
    </>;
  }
  return <span className="flex h-full flex-col items-center justify-center gap-3 px-3 text-center text-white/40">
    <span className="text-3xl" aria-hidden>{asset.mediaType === "video" ? <FaVideo /> : asset.mediaType === "image" ? <FaImage /> : <FaFile />}</span>
    <span className="text-xs">{asset.mediaType === "video" ? "No saved poster" : asset.mediaType === "image" ? "Preview unavailable" : "File preview"}</span>
  </span>;
}
