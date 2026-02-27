// artist-portfolio/components/BioScrollGallery.tsx
"use client";

import Image from "next/image";
import {
  AnimatePresence,
  motion,
  useScroll,
  useTransform,
} from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";

type BioScrollGalleryProps = {
  images: { src: string; alt: string }[];

  topLabel?: string; // "BIOGRAPHY"
  introText?: string; // short intro
  caption?: string; // "New York • Producer • DJ"

  intervalMs?: number; // auto change interval (default 4500)
  pauseOnHover?: boolean; // default true

  children: React.ReactNode; // long text block
};

export default function BioScrollGallery({
  images,
  topLabel = "BIOGRAPHY",
  introText = "Emotion first. Genre second. The goal is a cinematic feeling that stays with you after the last kick fades out.",
  caption = "New York • Producer • DJ",
  intervalMs = 4500,
  pauseOnHover = true,
  children,
}: BioScrollGalleryProps) {
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const [index, setIndex] = useState(0);
  const [isHovering, setIsHovering] = useState(false);

  const hasImages = images && images.length > 0;

  // Still use scroll only for a subtle drift (not for switching)
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end end"],
  });

  const driftY = useTransform(scrollYProgress, [0, 1], [-14, 14]);

  const steps = useMemo(() => Math.max(1, images.length), [images.length]);

  // Auto-rotate images by time
  useEffect(() => {
    if (!hasImages) return;
    if (pauseOnHover && isHovering) return;

    const id = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % steps);
    }, Math.max(1200, intervalMs)); // safety floor

    return () => window.clearInterval(id);
  }, [hasImages, intervalMs, steps, isHovering, pauseOnHover]);

  const current = hasImages ? images[index] : null;

  return (
    <section
      ref={sectionRef}
      className="mx-auto max-w-[1400px] px-5 sm:px-8 py-14 sm:py-18"
    >
      {/* Intro row */}
      <div className="mb-10 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-[760px]">
          <p className="text-sm tracking-[0.28em] uppercase text-white/55">
            {topLabel}
          </p>
          <p className="mt-4 text-white/65 leading-relaxed">{introText}</p>
        </div>

        <div className="hidden lg:block text-sm tracking-[0.22em] uppercase text-white/45">
          {caption}
        </div>
      </div>

      {/* Gallery + Text */}
      <div className="grid gap-10 lg:grid-cols-12">
        {/* LEFT: sticky timed gallery */}
        <div className="lg:col-span-5">
          <div className="lg:sticky lg:top-24">
            <motion.div
              style={{ y: driftY }}
              className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5"
              data-reveal="up"
              onMouseEnter={() => setIsHovering(true)}
              onMouseLeave={() => setIsHovering(false)}
            >
              <div className="relative h-[520px] sm:h-[620px] lg:h-[720px]">
                <AnimatePresence mode="wait" initial={false}>
                  {current ? (
                    <motion.div
                      key={current.src}
                      className="absolute inset-0"
                      // Minimal editorial transition: soft fade + micro zoom + tiny vertical slide + light blur
                      initial={{ opacity: 0, scale: 1.01, y: 6, filter: "blur(4px)" }}
                      animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
                      exit={{ opacity: 0, scale: 1.01, y: -6, filter: "blur(4px)" }}
                      transition={{
                        duration: 0.6,
                        ease: [0.22, 1, 0.36, 1],
                      }}
                    >
                      <Image
                        src={current.src}
                        alt={current.alt}
                        fill
                        priority={index === 0}
                        sizes="(min-width: 1024px) 40vw, 100vw"
                        className="object-cover"
                      />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="fallback"
                      className="absolute inset-0 flex items-center justify-center text-white/50 text-sm"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.35 }}
                    >
                      No images
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/10 to-transparent" />
              </div>
            </motion.div>

            {/* caption for mobile/tablet */}
            <p className="mt-4 text-sm tracking-[0.22em] uppercase text-white/45 lg:hidden">
              {caption}
            </p>

            {/* subtle progress hint */}
            <div className="mt-4 hidden lg:flex items-center gap-3 text-xs tracking-[0.28em] uppercase text-white/40">
              <span>{String(index + 1).padStart(2, "0")}</span>
              <span className="h-px flex-1 bg-white/10" />
              <span>{String(steps).padStart(2, "0")}</span>
            </div>
          </div>
        </div>

        {/* RIGHT: long text */}
        <div className="lg:col-span-7">
          <div className="space-y-6 text-white/70 leading-relaxed">
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}