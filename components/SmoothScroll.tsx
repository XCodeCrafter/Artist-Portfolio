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

    // Pokud má uživatel reduced motion, smooth scroll radši vypneme.
    if (reduce) return;

    const lenis = new Lenis({
      duration: 1.05,
      smoothWheel: true,
      wheelMultiplier: 0.95,
      touchMultiplier: 1.05,
      // Občas pomůže, když Lenis nesahá na touch/trackpad moc agresivně:
      // syncTouch: true,
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

    // IMPORTANT: iframes někdy sežerou wheel → přepošleme ho Lenisu
    const onWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      // pokud jsi nad iframe (Spotify/SoundCloud/YT), nenecháme ho spolknout scroll
      if (target.closest("iframe")) {
        e.preventDefault();
        // lenis.scrollTo umí i číslo (pozici)
        const next = (lenis as unknown as { scroll: number }).scroll + e.deltaY;
        lenis.scrollTo(next, { immediate: true });
      }
    };

    window.addEventListener("click", onClick);
    // capture + passive:false je klíč (jinak preventDefault neprojde)
    window.addEventListener("wheel", onWheel, { capture: true, passive: false });

    return () => {
      window.removeEventListener("click", onClick);
      window.removeEventListener("wheel", onWheel, true as unknown as EventListenerOptions);
      cancelAnimationFrame(raf);
      lenis.destroy();
    };
  }, []);

  return null;
}