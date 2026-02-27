// components/ParallaxBackdrop.tsx
"use client";

import { useEffect, useRef } from "react";

type Props = {
  className?: string;
  intensity?: number;       // default necháme 1, ale v AboutHome pošleme nízkou hodnotu
};

export default function ParallaxBackdrop({ className = "", intensity = 1 }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // reduced motion respekt
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight / 2;

    const onMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;

      if (rafRef.current !== null) return;

      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null;

        const w = window.innerWidth / 2;
        const h = window.innerHeight / 2;

        // přesně stejné koeficienty jako v CodePenu, který se ti líbí
        const d1 = `${50 - (mouseX - w) * 0.01 * intensity}% ${50 - (mouseY - h) * 0.01 * intensity}%`;
        const d2 = `${50 - (mouseX - w) * 0.02 * intensity}% ${50 - (mouseY - h) * 0.02 * intensity}%`;
        const d3 = `${50 - (mouseX - w) * 0.06 * intensity}% ${50 - (mouseY - h) * 0.06 * intensity}%`;

        el.style.backgroundPosition = `${d3}, ${d2}, ${d1}`;
      });
    };

    window.addEventListener("mousemove", onMove, { passive: true });

    return () => {
      window.removeEventListener("mousemove", onMove);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [intensity]);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className={`
        pointer-events-none
        absolute inset-0
        w-screen left-1/2 -translate-x-1/2
        bg-no-repeat bg-center
        parallax-shards
        will-change-[background-position]
        transform-gpu
        ${className}
      `}
    />
  );
}