//artist-portfolio/components/SmoothScroll.tsx

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export default function SmoothScroll() {
  const pathname = usePathname();

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let scrollFrame = 0;
    let scrollGeneration = 0;

    const scrollToCurrentHash = () => {
      const generation = ++scrollGeneration;
      let attempts = 0;

      window.cancelAnimationFrame(scrollFrame);

      const findAndScroll = () => {
        if (generation !== scrollGeneration) return;
        const rawId = window.location.hash.slice(1);
        if (!rawId) return;

        let id = rawId;
        try {
          id = decodeURIComponent(rawId);
        } catch {
          return;
        }

        const element = document.getElementById(id);
        if (element) {
          element.scrollIntoView({
            block: "start",
            behavior: reduce ? "auto" : "smooth",
          });
          return;
        }

        attempts += 1;
        if (attempts < 60) {
          scrollFrame = window.requestAnimationFrame(findAndScroll);
        }
      };

      scrollFrame = window.requestAnimationFrame(findAndScroll);
    };

    const onClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const target = event.target as HTMLElement | null;
      if (!target) return;

      const anchor = target.closest("a") as HTMLAnchorElement | null;
      if (!anchor) return;

      const href = anchor.getAttribute("href") || "";
      if (!href || anchor.target === "_blank") return;

      let targetUrl: URL;
      try {
        targetUrl = new URL(href, window.location.href);
      } catch {
        return;
      }

      if (
        targetUrl.origin !== window.location.origin ||
        targetUrl.pathname !== window.location.pathname ||
        !targetUrl.hash
      ) {
        return;
      }

      event.preventDefault();
      const oldUrl = window.location.href;
      window.history.pushState(null, "", targetUrl.hash);
      window.dispatchEvent(
        new HashChangeEvent("hashchange", {
          oldURL: oldUrl,
          newURL: window.location.href,
        })
      );
    };

    window.addEventListener("click", onClick);
    window.addEventListener("hashchange", scrollToCurrentHash);
    window.addEventListener("popstate", scrollToCurrentHash);
    scrollToCurrentHash();

    return () => {
      scrollGeneration += 1;
      window.cancelAnimationFrame(scrollFrame);
      window.removeEventListener("click", onClick);
      window.removeEventListener("hashchange", scrollToCurrentHash);
      window.removeEventListener("popstate", scrollToCurrentHash);
    };
  }, [pathname]);

  return null;
}
