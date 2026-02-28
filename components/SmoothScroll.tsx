//artist-portfolio/components/SmoothScroll.tsx

"use client";

import { useEffect } from "react";
import Lenis from "lenis";

export default function SmoothScroll() {
  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduce) return;

    const lenis = new Lenis({
      duration: 1.05,
      smoothWheel: true,
      wheelMultiplier: 0.95,
      touchMultiplier: 1.05,
      // Pokud chceš, můžeš později zkusit:
      // smoothTouch: true,
      // normalizeWheel: true,
    });

    let raf = 0;
    const loop = (time: number) => {
      lenis.raf(time);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    // Smooth anchor clicks (jen hash na stejné stránce)
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      const a = t.closest("a") as HTMLAnchorElement | null;
      if (!a) return;

      const href = a.getAttribute("href") || "";
      if (!href.startsWith("#")) return;

      const el = document.querySelector(href) as HTMLElement | null;
      if (!el) return;

      e.preventDefault();
      lenis.scrollTo(el, { offset: -90 });
      history.pushState(null, "", href);
    };

    const onResize = () => {
      // Lenis needs to recalc after layout changes (iframes, images, carousel shifts…)
      lenis.resize();
    };

    window.addEventListener("click", onClick);
    window.addEventListener("resize", onResize, { passive: true });

    return () => {
      window.removeEventListener("click", onClick);
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(raf);
      lenis.destroy();
    };
  }, []);

  return null;
}