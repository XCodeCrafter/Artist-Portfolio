'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

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
    // Reduced motion? -> rovnou zobrazit, žádné tanečky.
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const markIn = (el: RevealEl) => {
      el.classList.add('is-in');
    };

    const init = () => {
      const nodes = Array.from(
        document.querySelectorAll<RevealEl>('[data-reveal]')
      );

      if (!nodes.length) return;

      if (reduce) {
        nodes.forEach(markIn);
        return;
      }

      const io = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;

            const el = entry.target as RevealEl;

            // Delay (ms) z data-reveal-delay
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
          rootMargin: '0px 0px -10% 0px',
        }
      );

      nodes.forEach((el) => {
        // ochrana proti dvojitému pozorování při hot reloadu
        if (el.getAttribute('data-reveal-bound') === '1') return;
        el.setAttribute('data-reveal-bound', '1');
        io.observe(el);
      });

      return () => io.disconnect();
    };

    // Po změně routy init znovu (App Router)
    // + ještě jednou po microtasku (někdy se DOM dorenderuje chvíli po routě)
    const cleanup = init();
    const t = window.setTimeout(() => init(), 0);

    return () => {
      window.clearTimeout(t);
      if (typeof cleanup === 'function') cleanup();
    };
  }, [pathname]);

  return null;
}