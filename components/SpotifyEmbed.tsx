"use client";

import { useSyncExternalStore, type CSSProperties } from "react";

type Props = {
  embedUrl: string;
  openUrl: string;
  title?: string;
  heightDesktop?: number; // px
  heightMobile?: number;  // px
};

function detectIOS(): boolean {
  if (typeof navigator === "undefined") return false;

  const ua = navigator.userAgent || "";
  const isAppleMobile = /iPhone|iPad|iPod/i.test(ua);

  // iPadOS sometimes reports as Macintosh, but has touch points.
  const isIpadOS =
    /Macintosh/i.test(ua) && typeof navigator.maxTouchPoints === "number" && navigator.maxTouchPoints > 1;

  return isAppleMobile || isIpadOS;
}

function subscribeToDeviceState() {
  return () => {};
}

function getServerIOSSnapshot() {
  return false;
}

type SpotifyFrameStyle = CSSProperties & {
  "--spotify-desktop-height": string;
  "--spotify-mobile-height": string;
};

export default function SpotifyEmbed({
  embedUrl,
  openUrl,
  title = "Spotify",
  heightDesktop = 520,
  heightMobile = 352,
}: Props) {
  const normalizedEmbedUrl = embedUrl.trim();
  const normalizedOpenUrl = openUrl.trim();
  const isIOS = useSyncExternalStore(
    subscribeToDeviceState,
    detectIOS,
    getServerIOSSnapshot
  );
  const frameStyle: SpotifyFrameStyle = {
    "--spotify-desktop-height": `${heightDesktop}px`,
    "--spotify-mobile-height": `${heightMobile}px`,
  };

  return (
    <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/5">
      {isIOS || !normalizedEmbedUrl ? (
        // ✅ iOS fallback (reliable)
        <div className="flex items-center justify-center" style={{ height: heightMobile }}>
          <div className="mx-auto max-w-[560px] px-6 text-center">
            <div className="text-[11px] tracking-[0.28em] uppercase text-white/60">
              Spotify
            </div>

            <div className="mt-3 text-lg sm:text-xl font-semibold tracking-tight text-white">
              {normalizedOpenUrl ? "Listen on Spotify" : "Spotify releases"}
            </div>

            <p className="mt-2 text-sm text-white/65">
              {normalizedOpenUrl
                ? "Open Spotify directly for the most reliable listening experience."
                : "Releases will appear here when the Spotify player is connected."}
            </p>

            {normalizedOpenUrl ? (
              <div className="mt-5 flex justify-center">
                <a
                  href={normalizedOpenUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-black/35 px-5 h-12 text-xs tracking-[0.22em] uppercase text-white/85 hover:text-white hover:border-white/20 hover:bg-black/45 transition"
                >
                  Open in Spotify <span aria-hidden="true" className="ml-2">↗</span>
                </a>
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <div
          className="relative h-[var(--spotify-mobile-height)] sm:h-[var(--spotify-desktop-height)]"
          style={frameStyle}
        >
          <iframe
            src={normalizedEmbedUrl}
            title={title}
            className="absolute inset-0 h-full w-full"
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            loading="eager"
          />
        </div>
      )}
    </div>
  );
}
