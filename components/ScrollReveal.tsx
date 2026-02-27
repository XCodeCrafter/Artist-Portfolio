//artist-portfolio/components/ScrollReveal.tsx
"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

type RevealEl = HTMLElement & {
  dataset: {
    reveal?: string;
    revealDelay?: string;
    revealFrom?: string;
  };
};

export default function ScrollReveal() {
  const pathname = usePathname();

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const markIn = (el: RevealEl) => {
      el.classList.add("is-in");
    };

    // Query helper
    const getNodes = () =>
      Array.from(document.querySelectorAll<RevealEl>("[data-reveal]"));

    // If reduced motion -> show everything immediately
    if (reduce) {
      getNodes().forEach(markIn);
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;

          const el = entry.target as RevealEl;

          const delayMs = el.dataset.revealDelay
            ? Math.max(0, Number(el.dataset.revealDelay))
            : 0;

          if (delayMs > 0) {
            window.setTimeout(() => markIn(el), delayMs);
          } else {
            markIn(el);
          }

          io.unobserve(el);
        }
      },
      {
        root: null,
        threshold: 0.12,
        rootMargin: "0px 0px -10% 0px",
      }
    );

    const observe = (el: RevealEl) => {
      // prevent double binding
      if (el.getAttribute("data-reveal-bound") === "1") return;
      el.setAttribute("data-reveal-bound", "1");
      io.observe(el);
    };

    const bindAll = () => {
      const nodes = getNodes();
      if (!nodes.length) return;
      nodes.forEach(observe);
    };

    // 1) bind immediately
    bindAll();

    // 2) bind again after a couple of frames (route transitions + framer-motion)
    let raf1 = 0;
    let raf2 = 0;
    raf1 = requestAnimationFrame(() => {
      bindAll();
      raf2 = requestAnimationFrame(() => bindAll());
    });

    // 3) bind again after a short delay (covers slow hydration / images / dynamic sections)
    const t1 = window.setTimeout(bindAll, 60);
    const t2 = window.setTimeout(bindAll, 220);

    // 4) MutationObserver: whenever new nodes appear, bind them
    const mo = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (!m.addedNodes?.length) continue;

        m.addedNodes.forEach((n) => {
          if (!(n instanceof HTMLElement)) return;

          // If the added node itself has data-reveal
          if (n.matches?.("[data-reveal]")) observe(n as RevealEl);

          // Or any children inside it
          const inner = n.querySelectorAll?.("[data-reveal]");
          if (inner && inner.length) {
            inner.forEach((el) => observe(el as RevealEl));
          }
        });
      }
    });

    mo.observe(document.body, { childList: true, subtree: true });

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      mo.disconnect();
      io.disconnect();
    };
  }, [pathname]);

  return null;
}