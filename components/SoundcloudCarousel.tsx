//artist-portfolio\components\SoundcloudCarousel.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import ExternalMediaGate from "@/components/privacy/ExternalMediaGate";
import { usePrivacyConsent } from "@/components/privacy/PrivacyProvider";
import SpotifyEmbed from "@/components/SpotifyEmbed";
import { parseMusicTrackUrl, type MusicTrackEmbed } from "@/lib/music-embeds";

type Mix = {
  id?: string;
  title?: string;
  embedUrl: string;
};

type Props = {
  items: Mix[];
  showTitles?: boolean;
  /** Compatibility prop. These collection players do not start automatically. */
  autoPlay?: boolean;
  className?: string;
  interactionMode?: "public" | "preview";
};

function getPerView() {
  // Tailwind-ish breakpoints:
  // <640: 1, 640-1023: 2, >=1024: 4
  if (typeof window === "undefined") return 4;
  const w = window.innerWidth;
  if (w < 640) return 1;
  if (w < 1024) return 2;
  return 4;
}

function MusicTrackCard({
  mix,
  player,
  showTitles,
  interactionMode,
}: {
  mix: Mix;
  player: MusicTrackEmbed | null;
  showTitles: boolean;
  interactionMode: "public" | "preview";
}) {
  const [interactive, setInteractive] = useState<boolean>(false);
  const { externalMedia } = usePrivacyConsent();
  const provider = player?.provider === "spotify" ? "Spotify" : player ? "SoundCloud" : "Music";
  const locked = interactionMode === "public" && externalMedia && !interactive;

  // Auto-lock back after a while (prevents “iframe eats scroll forever”)
  useEffect(() => {
    if (interactionMode === "preview" || !interactive) return;
    const t = window.setTimeout(() => setInteractive(false), 9000);
    return () => window.clearTimeout(t);
  }, [interactionMode, interactive]);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/20 shadow-[0_0_0_1px_rgba(255,255,255,0.04)]">
      {showTitles && mix.title ? (
        <div className="px-4 pt-3 text-sm font-medium tracking-wide text-white/85">
          {mix.title}
        </div>
      ) : null}

      <div className={showTitles && mix.title ? "px-3 pb-3 pt-2" : "p-3"}>
        <div
          className={`relative w-full overflow-hidden rounded-xl ${player?.provider === "spotify" ? "h-[352px]" : "h-[240px]"}`}
        >
          {interactionMode === "preview" ? <div className="flex h-full flex-col items-center justify-center gap-3 border border-dashed border-white/15 bg-white/[0.025] px-4 text-center" aria-label={`${provider} player preview`}>
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" className="h-8 w-8 text-white/45"><path d="M9 18V5l12-2v13M9 8l12-2" /><ellipse cx="6" cy="18" rx="3" ry="2" /><ellipse cx="18" cy="16" rx="3" ry="2" /></svg>
            <span className="font-ui text-[10px] uppercase tracking-[0.2em] text-[#ff806c]">{provider}</span>
            {mix.title ? <span className="text-sm text-white/80">{mix.title}</span> : null}
            <span className="text-xs leading-relaxed text-white/45">{player ? "Player preview. External players stay off while editing." : "Add a Spotify or SoundCloud link to preview this player."}</span>
          </div> : player ? <>
          {/* Shield */}
          {locked ? (
            <button
              type="button"
              className={[
                "absolute inset-0 z-10 flex items-center justify-center",
                "bg-black/10",
                "text-white/80 opacity-0 hover:opacity-100",
                "transition",
              ].join(" ")}
              onClick={() => setInteractive(true)}
              aria-label={`Activate ${provider} embed${mix.title ? `: ${mix.title}` : ""}`}
              title="Click to interact"
            >
              <span className="rounded-full border border-white/15 bg-black/45 px-4 py-2 text-xs tracking-[0.22em] uppercase">
                Click to interact
              </span>
            </button>
          ) : null}

          <div className="h-full" inert={locked}>
          {player.provider === "spotify" ? <SpotifyEmbed embedUrl={player.embedUrl} openUrl={player.openUrl}
            title={mix.title ? `Spotify: ${mix.title}` : "Spotify track"} heightDesktop={352} heightMobile={352} loading="lazy" /> : <ExternalMediaGate provider="SoundCloud"><iframe
            src={player.embedUrl}
            title={mix.title ? `SoundCloud: ${mix.title}` : "SoundCloud track"}
            className="absolute inset-0 h-full w-full"
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            loading="lazy"
            // Key part: while not interactive, iframe can’t steal wheel/touch
            style={{
              pointerEvents:
                interactive ? "auto" : "none",
            }}
            tabIndex={locked ? -1 : undefined}
            referrerPolicy="strict-origin-when-cross-origin"
          /></ExternalMediaGate>
          }
          </div>
          </> : null}
        </div>
      </div>
    </div>
  );
}

export default function SoundcloudCarousel({
  items,
  showTitles = false,
  className = "",
  interactionMode = "public",
}: Props) {
  const playableItems = useMemo(() => items.map(mix => ({ mix, player: parseMusicTrackUrl(mix.embedUrl) }))
    .filter(item => interactionMode === "preview" || item.player !== null), [items, interactionMode]);
  const [perView, setPerView] = useState<number>(4);
  const [index, setIndex] = useState<number>(0); // window start index (0..maxIndex)
  const [animating, setAnimating] = useState<boolean>(false);

  const trackRef = useRef<HTMLDivElement | null>(null);
  const transitionMs = 520;

  // responsive perView
  useEffect(() => {
    const apply = () => setPerView(getPerView());
    apply();
    window.addEventListener("resize", apply, { passive: true });
    return () => window.removeEventListener("resize", apply);
  }, []);

  const n = playableItems.length;

  // max window start index so we always show a full "window" without wrap-mixing
  const maxIndex = useMemo(() => {
    const m = n - perView;
    return m > 0 ? m : 0;
  }, [n, perView]);

  // Clamp index if items/perView changed
  useEffect(() => {
    setIndex((i) => {
      if (i < 0) return 0;
      if (i > maxIndex) return maxIndex;
      return i;
    });
  }, [maxIndex]);

  const canNavigate = n > perView && !animating;

  const snapTo = (next: number) => {
    const el = trackRef.current;
    if (!el) {
      setIndex(next);
      return;
    }
    el.style.transition = "none";
    setIndex(next);
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    el.offsetHeight;
    el.style.transition = `transform ${transitionMs}ms cubic-bezier(0.2, 0.8, 0.2, 1)`;
  };

  const goNext = () => {
    if (interactionMode === "preview" || !canNavigate) return;

    if (index >= maxIndex) {
      setAnimating(true);
      snapTo(0);
      window.setTimeout(() => setAnimating(false), 60);
      return;
    }

    setAnimating(true);
    setIndex((i) => i + 1);
  };

  const goPrev = () => {
    if (interactionMode === "preview" || !canNavigate) return;

    if (index <= 0) {
      setAnimating(true);
      snapTo(maxIndex);
      window.setTimeout(() => setAnimating(false), 60);
      return;
    }

    setAnimating(true);
    setIndex((i) => i - 1);
  };

  // Keyboard (ArrowLeft/Right)
  useEffect(() => {
    if (interactionMode === "preview" || n <= perView) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") goNext();
      if (e.key === "ArrowLeft") goPrev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactionMode, n, perView, index, animating, maxIndex]);

  // Translate by one card width each step
  const stepPct = 100 / perView;
  const translateX = `-${index * stepPct}%`;

  if (n === 0) return null;

  if (n <= perView) {
    return (
      <div className={className}>
        <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-4 sm:p-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {playableItems.map(({ mix, player }, i) => {
              return (
                <MusicTrackCard
                  key={`${mix.id || i}:${player?.sourceUrl || mix.embedUrl}`}
                  mix={mix}
                  player={player}
                  showTitles={showTitles}
                  interactionMode={interactionMode}
                />
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/5">
        {/* Track */}
        <div
          ref={trackRef}
          className="flex"
          style={{ transform: `translateX(${translateX})`, transition: `transform ${transitionMs}ms cubic-bezier(0.2, 0.8, 0.2, 1)` }}
          onTransitionEnd={() => setAnimating(false)}
          aria-label="Music tracks carousel"
        >
          {playableItems.map(({ mix, player }, i) => {
            return (
              <div
                key={`${mix.id || i}:${player?.sourceUrl || mix.embedUrl}`}
                className="shrink-0 px-2 py-4 sm:px-3 sm:py-5"
                style={{ width: `${stepPct}%` }}
              >
                <MusicTrackCard
                  mix={mix}
                  player={player}
                  showTitles={showTitles}
                  interactionMode={interactionMode}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Controls */}
      <div className="mt-4 flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={goPrev}
          disabled={!canNavigate}
          className={[
            "inline-flex items-center justify-center rounded-full",
            "h-11 w-11 border border-white/15 bg-white/5",
            "text-white/90 transition",
            "hover:bg-white/10 hover:border-white/25",
            "disabled:opacity-40 disabled:cursor-not-allowed",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30",
          ].join(" ")}
          aria-label="Previous"
          title="Previous"
        >
          <span className="text-xl leading-none">‹</span>
        </button>

        <button
          type="button"
          onClick={goNext}
          disabled={!canNavigate}
          className={[
            "inline-flex items-center justify-center rounded-full",
            "h-11 w-11 border border-white/15 bg-white/5",
            "text-white/90 transition",
            "hover:bg-white/10 hover:border-white/25",
            "disabled:opacity-40 disabled:cursor-not-allowed",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30",
          ].join(" ")}
          aria-label="Next"
          title="Next"
        >
          <span className="text-xl leading-none">›</span>
        </button>
      </div>
    </div>
  );
}
