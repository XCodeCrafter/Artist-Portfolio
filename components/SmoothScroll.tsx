//artist-portfolio/components/SmoothScroll.tsx

"use client";

import { useEffect } from "react";

export default function SmoothScroll() {
  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      const anchor = target.closest("a") as HTMLAnchorElement | null;
      if (!anchor) return;

      const href = anchor.getAttribute("href") || "";
      if (!href.startsWith("#") || href.length <= 1) return;

      let element: HTMLElement | null = null;
      try {
        element = document.querySelector(href) as HTMLElement | null;
      } catch {
        return;
      }

      if (!element) return;

      e.preventDefault();

      window.scrollTo({
        top: element.getBoundingClientRect().top + window.scrollY - 90,
        behavior: reduce ? "auto" : "smooth",
      });
      history.pushState(null, "", href);
    };

    window.addEventListener("click", onClick);

    return () => {
      window.removeEventListener("click", onClick);
    };
  }, []);

  return null;
}
