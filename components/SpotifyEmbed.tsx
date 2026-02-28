"use client";

import { useState } from "react";

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

export default function SpotifyEmbed({
  embedUrl,
  openUrl,
  title = "Spotify",
  heightDesktop = 520,
  heightMobile = 352,
}: Props) {
  // ✅ No effect + no setState in effect (passes strict lint rules)
  const [isIOS] = useState<boolean>(() => detectIOS());

  return (
    <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/5">
      {isIOS ? (
        // ✅ iOS fallback (reliable)
        <div className="flex items-center justify-center" style={{ height: heightMobile }}>
          <div className="mx-auto max-w-[560px] px-6 text-center">
            <div className="text-[11px] tracking-[0.28em] uppercase text-white/60">
              Spotify
            </div>

            <div className="mt-3 text-lg sm:text-xl font-semibold tracking-tight text-white">
              Listen on Spotify
            </div>

            <p className="mt-2 text-sm text-white/65">
              iOS Safari sometimes blocks embedded players. Open it directly in Spotify for the best experience.
            </p>

            <div className="mt-5 flex justify-center">
              <a
                href={openUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-black/35 px-5 h-12 text-xs tracking-[0.22em] uppercase text-white/85 hover:text-white hover:border-white/20 hover:bg-black/45 transition"
              >
                Open in Spotify <span aria-hidden="true" className="ml-2">↗</span>
              </a>
            </div>
          </div>
        </div>
      ) : (
        // ✅ Desktop/Android: embed
        <>
          {/* Desktop */}
          <div className="relative hidden sm:block" style={{ height: heightDesktop }}>
            <iframe
              src={embedUrl}
              title={title}
              className="absolute inset-0 h-full w-full"
              allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
              loading="eager"
            />
          </div>

          {/* Mobile/XS (non-iOS) */}
          <div className="relative sm:hidden" style={{ height: heightMobile }}>
            <iframe
              src={embedUrl}
              title={title}
              className="absolute inset-0 h-full w-full"
              allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
              loading="eager"
            />
          </div>
        </>
      )}
    </div>
  );
}