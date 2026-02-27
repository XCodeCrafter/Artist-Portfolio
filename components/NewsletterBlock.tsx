// components/Footer.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type FooterNavItem = { label: string; href: string };

const FOOTER_NAV: FooterNavItem[] = [
  { label: "HOME", href: "/" },
  { label: "BIO", href: "/bio" },
  { label: "MUSIC", href: "/music" },
  { label: "VIDEO", href: "/video" },
  { label: "BOOKING", href: "/booking" },
];

function isActivePath(pathname: string, href: string) {
  const p = pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
  const h = href.length > 1 ? href.replace(/\/$/, "") : href;
  return p === h;
}

// ---------------------------------------------------------------------------
// Icon helpers (clean, consistent, brand-like)
// ---------------------------------------------------------------------------

function IconSpotify(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M12 2C6.486 2 2 6.486 2 12s4.486 10 10 10 10-4.486 10-10S17.514 2 12 2zm4.589 14.45a.75.75 0 0 1-1.033.244c-2.829-1.73-6.389-2.12-10.58-1.155a.75.75 0 1 1-.337-1.462c4.57-1.053 8.493-.608 11.702 1.356a.75.75 0 0 1 .248 1.017zm.93-2.398a.9.9 0 0 1-1.239.292c-3.24-1.993-8.177-2.57-12.01-1.406a.9.9 0 0 1-.523-1.723c4.29-1.304 9.62-.662 13.3 1.6a.9.9 0 0 1 .472 1.237zM17.6 10.9a1.05 1.05 0 0 1-1.446.343c-3.7-2.27-9.35-2.47-12.88-1.4a1.05 1.05 0 1 1-.61-2.01c4.03-1.22 10.44-0.98 14.68 1.61.5.31.66.95.256 1.457z" />
    </svg>
  );
}

function IconYouTube(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M21.582 7.186a2.75 2.75 0 0 0-1.936-1.94C17.94 4.75 12 4.75 12 4.75s-5.94 0-7.646.496a2.75 2.75 0 0 0-1.936 1.94C1.95 8.9 1.95 12 1.95 12s0 3.1.468 4.814a2.75 2.75 0 0 0 1.936 1.94c1.706.496 7.646.496 7.646.496s5.94 0 7.646-.496a2.75 2.75 0 0 0 1.936-1.94C22.05 15.1 22.05 12 22.05 12s0-3.1-.468-4.814ZM10.9 15.25v-6.5L16.7 12l-5.8 3.25Z" />
    </svg>
  );
}

function IconInstagram(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M7.5 2.75h9A4.75 4.75 0 0 1 21.25 7.5v9A4.75 4.75 0 0 1 16.5 21.25h-9A4.75 4.75 0 0 1 2.75 16.5v-9A4.75 4.75 0 0 1 7.5 2.75Zm0 1.5A3.25 3.25 0 0 0 4.25 7.5v9A3.25 3.25 0 0 0 7.5 19.75h9a3.25 3.25 0 0 0 3.25-3.25v-9A3.25 3.25 0 0 0 16.5 4.25h-9Zm4.5 3.25A4.5 4.5 0 1 1 7.5 12a4.505 4.505 0 0 1 4.5-4.5Zm0 1.5A3 3 0 1 0 15 12a3.003 3.003 0 0 0-3-3Zm5.05-2.05a1.05 1.05 0 1 1-1.05-1.05 1.05 1.05 0 0 1 1.05 1.05Z" />
    </svg>
  );
}

export default function Footer() {
  const pathname = usePathname() || "/";
  const [showBackToTop, setShowBackToTop] = useState(false);

  // tiny scroll throttle (raf)
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const handleScroll = () => {
      if (rafRef.current != null) return;
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null;
        setShowBackToTop(window.scrollY > 400);
      });
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const iconClass =
    "w-8 h-8 transition-all duration-300 text-white/60 hover:text-[var(--accent)] hover:scale-110";

  const iconLinkClass =
    "inline-flex items-center justify-center rounded-2xl p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950";

  return (
    <>
      <footer className="mx-auto max-w-5xl px-6 py-20">
        <div className="rounded-3xl border border-white/10 bg-zinc-950/90 backdrop-blur-2xl p-10 md:p-16 relative">
          <div className="max-w-2xl mx-auto text-center">
            {/* Big Title + CTA */}
            <h2 className="text-5xl md:text-7xl font-light tracking-[-2px] text-[var(--accent)]">
              LET&apos;S CONNECT
            </h2>
            <p className="mt-6 text-lg text-white/70 leading-relaxed">
              Follow the journey. Explore releases. Send an email or just say hi.
            </p>

            {/* Primary CTA buttons */}
            <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/booking"
                className="px-10 py-5 bg-[var(--accent)] hover:bg-white text-zinc-950 font-medium rounded-2xl text-sm tracking-[0.5px] uppercase transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                Send email
              </Link>

              <a
                href="https://open.spotify.com/artist/tvuj-profil-id" // ← uprav na reálný link
                target="_blank"
                rel="noopener noreferrer"
                className="px-8 py-5 border border-white/30 hover:bg-white/5 text-white/90 rounded-2xl flex items-center justify-center gap-3 text-sm tracking-[0.5px] uppercase transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/60"
              >
                <IconSpotify className="w-5 h-5" />
                Play on Spotify
              </a>
            </div>

            {/* Navigation */}
            <nav className="mt-16 flex flex-wrap justify-center gap-x-8 gap-y-2 text-xs tracking-[0.125em] uppercase text-white/60">
              {FOOTER_NAV.map((i) => (
                <Link
                  key={i.label}
                  href={i.href}
                  aria-current={isActivePath(pathname, i.href) ? "page" : undefined}
                  className={`transition hover:text-white ${
                    isActivePath(pathname, i.href) ? "text-[var(--accent)]" : ""
                  }`}
                >
                  {i.label}
                </Link>
              ))}
            </nav>


            {/* Contact */}
            <div className="mt-12 text-sm text-white/70">
              
            </div>

            {/* Location */}
            <div className="mt-4 text-xs text-white/40 italic">
              Based in Amsterdam, The Netherlands • Available worldwide
            </div>
          </div>

          {/* Bottom line */}
          <div className="mt-16 pt-8 border-t border-white/10 flex flex-col md:flex-row justify-between items-center gap-6 text-xs text-white/30">
            <span>© 2026 Franky Fugazi – All rights reserved.</span>
            <div className="flex gap-6">
              <Link href="/privacy" className="hover:text-white/60 transition">
                Privacy
              </Link>
              <Link href="/terms" className="hover:text-white/60 transition">
                Terms
              </Link>
            </div>
            <span>Designed with intent.</span>
          </div>
        </div>
      </footer>

      {/* Back to Top button */}
      {showBackToTop && (
        <button
          onClick={scrollToTop}
          className="fixed bottom-8 right-8 z-50 p-4 bg-[var(--accent)] text-white rounded-2xl shadow-xl hover:bg-white hover:text-zinc-950 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          aria-label="Back to top"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7" />
          </svg>
        </button>
      )}
    </>
  );
}