"use client";

import Image from "next/image";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useMemo, useRef, useState } from "react";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

type Props = {
  title: string;
  ctaLabel: string;
  ctaHref: string;
  backgroundSrc: string;
  subtitle?: string;

  /**
   * Optional: override background focal point (object-position).
   * Defaults:
   *  - mobile: 50% 20% (shows more of the top part of the image)
   *  - desktop: 50% 50% (center)
   */
  bgPosMobile?: string; // e.g. "50% 15%"
  bgPosDesktop?: string; // e.g. "50% 50%"
};

export default function HeroCinematic({
  title,
  ctaLabel,
  ctaHref,
  backgroundSrc,
  subtitle,
  bgPosMobile = "50% 20%",
  bgPosDesktop = "50% 50%",
}: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState<number | null>(null);

  const mx = useMotionValue(0);
  const my = useMotionValue(0);

  const sx = useSpring(mx, { stiffness: 120, damping: 22, mass: 0.6 });
  const sy = useSpring(my, { stiffness: 120, damping: 22, mass: 0.6 });

  // Group parallax (small)
  const titleX = useTransform(sx, (v) => v * 14);
  const titleY = useTransform(sy, (v) => v * 10);

  /**
   * Keep words intact on wrap:
   * - Split into words
   * - Render each word as a nowrap "chip"
   * - Still animate per letter (and keep hover per letter)
   */
  const wordLetters = useMemo(() => {
    const words = title.split(" ");

    // Each word contributes: word.length letters
    // Each gap between words contributes: +1 "virtual" index (space)
    // Stable word starts without mutating inside map.
    const starts: number[] = [];
    let acc = 0;

    for (let i = 0; i < words.length; i += 1) {
      starts.push(acc);
      acc += words[i].length;
      if (i < words.length - 1) acc += 1; // virtual space index
    }

    return words.map((word, wIdx) => {
      const start = starts[wIdx];
      const letters = word.split("").map((ch, j) => ({ ch, idx: start + j }));
      return { word, letters, wIdx };
    });
  }, [title]);

  function onMove(e: React.MouseEvent) {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();

    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;

    const dx = (px - 0.5) * 2;
    const dy = (py - 0.5) * 2;

    mx.set(clamp(dx, -1, 1));
    my.set(clamp(dy, -1, 1));
  }

  function onLeave() {
    mx.set(0);
    my.set(0);
    setActive(null);
  }

  return (
    <section
      ref={wrapRef}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      className={[
        "relative w-full overflow-hidden",
        // ✅ mobile shows more of the image (less forced cropping)
        "min-h-[50svh] sm:min-h-[70svh] lg:min-h-[100svh]",
      ].join(" ")}
    >
      {/* BG */}
      <div className="absolute inset-0">
        <Image
          src={backgroundSrc}
          alt="Hero background"
          fill
          priority
          sizes="100vw"
          className={[
            "object-cover",
            // ✅ Mobile: no zoom (show MORE). Desktop: slight cinematic zoom if you want it.
            "scale-100 sm:scale-[1.02] lg:scale-[1.04]",
          ].join(" ")}
          style={{
            objectPosition: bgPosMobile,
          }}
        />

        {/* Desktop focal point override (separate layer for responsive objectPosition) */}
        <div className="pointer-events-none absolute inset-0 hidden sm:block">
          <Image
            src={backgroundSrc}
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover"
            style={{ objectPosition: bgPosDesktop }}
          />
        </div>

        <div className="absolute inset-0 bg-black/35" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-black/25 to-black/80" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_35%,rgba(255,59,31,0.30),transparent_55%)]" />
        <div className="absolute inset-0 gridlines opacity-30" />
      </div>

      {/* Content */}
      <div
        className={[
          "relative z-10 flex items-center justify-center px-5 sm:px-8",
          // ✅ match the hero height so the text sits correctly
          "min-h-[50svh] sm:min-h-[70svh] lg:min-h-[100svh]",
        ].join(" ")}
      >
        <motion.div
          style={{ x: titleX, y: titleY }}
          className="text-center"
          initial={{ opacity: 0, y: 14, filter: "blur(10px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
        >
          {subtitle ? (
            <div className="mb-4 text-xs tracking-[0.35em] text-white/65">
              {subtitle}
            </div>
          ) : null}

          {/* Title */}
          <h1 className="select-none font-semibold tracking-tight leading-[0.95] text-[clamp(2.4rem,10vw,3.6rem)] sm:text-7xl md:text-8xl">
            <span className="inline-flex flex-wrap justify-center gap-x-3 gap-y-2">
              {wordLetters.map(({ letters, wIdx }) => (
                <span key={`word-${wIdx}`} className="inline-flex whitespace-nowrap">
                  {letters.map(({ ch, idx }) => {
                    const dimOthers = active !== null && active !== idx;

                    return (
                      <motion.span
                        key={`${ch}-${idx}`}
                        className="inline-block"
                        initial={{ opacity: 0, y: 18 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{
                          delay: 0.10 + idx * 0.02,
                          duration: 0.48,
                          ease: [0.22, 1, 0.36, 1],
                        }}
                        onMouseEnter={() => setActive(idx)}
                        onMouseLeave={() => setActive(null)}
                        whileHover={{ y: -6, rotate: idx % 2 === 0 ? -1.0 : 1.0 }}
                        style={{
                          opacity: dimOthers ? 0.55 : 1,
                          transition: "opacity 160ms ease",
                          willChange: "transform",
                        }}
                      >
                        {ch}
                      </motion.span>
                    );
                  })}
                </span>
              ))}
            </span>
          </h1>

          {/* CTA */}
          <motion.a
            href={ctaHref}
            className="mx-auto mt-6 sm:mt-8 inline-flex items-center gap-3 text-sm tracking-[0.25em] text-white/80 hover:text-white transition"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            <span className="relative">
              {ctaLabel}
              <span className="absolute -bottom-2 left-0 h-px w-full bg-[rgba(255,59,31,0.75)]" />
            </span>
          </motion.a>
        </motion.div>
      </div>
    </section>
  );
}