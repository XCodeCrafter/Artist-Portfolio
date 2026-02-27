"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type Mix = {
  title?: string;
  embedUrl: string; // https://api.soundcloud.com/tracks/...
};

type Props = {
  items: Mix[];
  showTitles?: boolean;
  autoPlay?: boolean;
  className?: string;
};

// --- helpers ---
function buildSoundcloudPlayerUrl(trackApiUrl: string, autoPlay: boolean) {
  const base = "https://w.soundcloud.com/player/";
  const params = new URLSearchParams({
    url: trackApiUrl,
    color: "#ff3b1f",
    auto_play: autoPlay ? "true" : "false",
    hide_related: "true",
    show_comments: "false",
    show_user: "true",
    show_reposts: "false",
    show_teaser: "false",
    visual: "true",
  });
  return `${base}?${params.toString()}`;
}

function getPerView() {
  // Tailwind-ish breakpoints:
  // <640: 1, 640-1023: 2, >=1024: 4
  if (typeof window === "undefined") return 4;
  const w = window.innerWidth;
  if (w < 640) return 1;
  if (w < 1024) return 2;
  return 4;
}

export default function SoundcloudCarousel({
  items,
  showTitles = false,
  autoPlay = false,
  className = "",
}: Props) {
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

  const n = items.length;

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
    // snap without animation
    el.style.transition = "none";
    setIndex(next);
    // force reflow then restore transition
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    el.offsetHeight;
    el.style.transition = `transform ${transitionMs}ms cubic-bezier(0.2, 0.8, 0.2, 1)`;
  };

  const goNext = () => {
    if (!canNavigate) return;

    // Behavior you requested:
    // 0 => 1 => ... => maxIndex => back to 0 (no wrap-mixed window like 3,4,5,1)
    if (index >= maxIndex) {
      setAnimating(true);
      // instant back to start (looks clean + deterministic for small counts like 5)
      snapTo(0);
      // small timeout to avoid double clicks racing
      window.setTimeout(() => setAnimating(false), 60);
      return;
    }

    setAnimating(true);
    setIndex((i) => i + 1);
  };

  const goPrev = () => {
    if (!canNavigate) return;

    if (index <= 0) {
      setAnimating(true);
      snapTo(maxIndex);
      window.setTimeout(() => setAnimating(false), 60);
      return;
    }

    setAnimating(true);
    setIndex((i) => i - 1);
  };

  // Transition end unlock
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;

    const onEnd = () => setAnimating(false);
    el.addEventListener("transitionend", onEnd);
    return () => el.removeEventListener("transitionend", onEnd);
  }, []);

  // ensure transition style
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    el.style.transition = `transform ${transitionMs}ms cubic-bezier(0.2, 0.8, 0.2, 1)`;
  }, []);

  // Keyboard (ArrowLeft/Right)
  useEffect(() => {
    if (n <= perView) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") goNext();
      if (e.key === "ArrowLeft") goPrev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n, perView, index, animating, maxIndex]);

  // Translate by one card width each step
  const stepPct = 100 / perView;
  const translateX = `-${index * stepPct}%`;

  // If not enough items, just render a stable grid
  if (n === 0) return null;

  if (n <= perView) {
    return (
      <div className={className}>
        <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-4 sm:p-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {items.map((mix, i) => {
              const src = buildSoundcloudPlayerUrl(mix.embedUrl, autoPlay);
              return (
                <div
                  key={i}
                  className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/20 shadow-[0_0_0_1px_rgba(255,255,255,0.04)]"
                >
                  {showTitles && mix.title ? (
                    <div className="px-4 pt-3 text-sm font-medium tracking-wide text-white/85">
                      {mix.title}
                    </div>
                  ) : null}

                  <div className={showTitles && mix.title ? "px-3 pb-3 pt-2" : "p-3"}>
                    <div className="relative h-[240px] w-full overflow-hidden rounded-xl">
                      <iframe
                        src={src}
                        title={mix.title ? `SoundCloud: ${mix.title}` : "SoundCloud track"}
                        className="absolute inset-0 h-full w-full"
                        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                        loading="lazy"
                      />
                    </div>
                  </div>
                </div>
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
          style={{ transform: `translateX(${translateX})` }}
          aria-label="SoundCloud carousel"
        >
          {items.map((mix, i) => {
            const src = buildSoundcloudPlayerUrl(mix.embedUrl, autoPlay);

            return (
              <div
                key={i}
                className="shrink-0 px-2 py-4 sm:px-3 sm:py-5"
                style={{
                  width: `${stepPct}%`, // 100/perView
                }}
              >
                <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/20 shadow-[0_0_0_1px_rgba(255,255,255,0.04)]">
                  {showTitles && mix.title ? (
                    <div className="px-4 pt-3 text-sm font-medium tracking-wide text-white/85">
                      {mix.title}
                    </div>
                  ) : null}

                  <div className={showTitles && mix.title ? "px-3 pb-3 pt-2" : "p-3"}>
                    <div className="relative h-[240px] w-full overflow-hidden rounded-xl">
                      <iframe
                        src={src}
                        title={mix.title ? `SoundCloud: ${mix.title}` : "SoundCloud track"}
                        className="absolute inset-0 h-full w-full"
                        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                        loading="lazy"
                      />
                    </div>
                  </div>
                </div>
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