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
    "w-7 h-7 shrink-0 transition text-white/60 hover:text-[var(--accent)] focus-visible:text-[var(--accent)]";

  const iconLinkClass =
    "inline-flex items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black/40";

  return (
    <>
      <footer className="mx-auto max-w-[1400px] px-5 sm:px-8 py-16 sm:py-20">
        <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/5 to-black/40 backdrop-blur-md p-8 sm:p-14 relative overflow-hidden">
          {/* Subtle accent glow */}
          <div className="absolute -top-40 -right-40 w-[400px] h-[400px] bg-[var(--accent)]/10 blur-[140px] rounded-full pointer-events-none" />

          <div className="relative z-10">
            {/* Big Title + CTA */}
            <h2 className="text-4xl sm:text-6xl font-semibold tracking-tight text-[var(--accent)]">
              LET&apos;S CONNECT
            </h2>
            <p className="mt-4 text-white/60 max-w-xl leading-relaxed">
              Follow the journey. Explore releases. Book a session or just say hi.
            </p>

            {/* Primary CTA buttons */}
            <div className="mt-8 flex flex-wrap gap-4">
              <Link
                href="/booking"
                className="px-8 py-4 bg-[var(--accent)] text-white font-medium rounded-full hover:bg-[var(--accent)]/80 transition uppercase tracking-wider text-sm sm:text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black/40"
              >
                Book Now
              </Link>

              <a
                href="https://open.spotify.com/artist/tvuj-profil-id" // ← uprav na reálný link
                target="_blank"
                rel="noopener noreferrer"
                className="px-6 py-4 border border-white/30 text-white/90 rounded-full hover:bg-white/10 transition flex items-center gap-3 uppercase tracking-wider text-sm sm:text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black/40"
              >
                <IconSpotify className="w-6 h-6" />
                Play on Spotify
              </a>
            </div>

            {/* Navigation */}
            <div className="mt-12 flex flex-wrap gap-6 sm:gap-10 text-white/50 text-xs sm:text-sm tracking-[0.35em] uppercase">
              {FOOTER_NAV.map((i) => (
                <Link
                  key={i.label}
                  href={i.href}
                  aria-current={isActivePath(pathname, i.href) ? "page" : undefined}
                  className={
                    isActivePath(pathname, i.href)
                      ? "text-[var(--accent)]"
                      : "hover:text-[var(--accent)] transition"
                  }
                >
                  {i.label}
                </Link>
              ))}
            </div>

            {/* Social icons */}
            <div className="mt-10 flex flex-wrap gap-6">
              <a
                href="https://open.spotify.com/artist/..."
                target="_blank"
                rel="noopener noreferrer"
                className={iconLinkClass}
                aria-label="Spotify"
              >
                <IconSpotify className={iconClass} />
              </a>

              <a
                href="https://youtube.com/..."
                target="_blank"
                rel="noopener noreferrer"
                className={iconLinkClass}
                aria-label="YouTube"
              >
                <IconYouTube className={iconClass} />
              </a>

              <a
                href="https://instagram.com/..."
                target="_blank"
                rel="noopener noreferrer"
                className={iconLinkClass}
                aria-label="Instagram"
              >
                <IconInstagram className={iconClass} />
              </a>

              {/* Přidej další – TikTok, Bandcamp atd. */}
            </div>

            {/* Contact */}
            <div className="mt-10 text-white/70 text-sm">
              <p>
                Booking & inquiries:{" "}
                <a
                  href="mailto:booking@tvujartist.cz"
                  className="hover:text-[var(--accent)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black/40 rounded"
                >
                  booking@tvujartist.cz
                </a>
              </p>
            </div>

            {/* Location */}
            <div className="mt-8 text-white/50 text-sm italic">
              Based in Amsterdam, The Netherlands • Available worldwide for sessions, gigs & collaborations
            </div>
          </div>

          {/* Bottom line */}
          <div className="relative z-10 mt-16 pt-8 border-t border-white/10 text-white/30 text-sm flex flex-col sm:flex-row justify-between items-center gap-4">
            <span>© 2026 Franky Fugazi – All rights reserved.</span>
            <div className="flex gap-6">
              <Link href="/privacy" className="hover:text-white/60 transition">
                Privacy Policy
              </Link>
              <Link href="/terms" className="hover:text-white/60 transition">
                Terms
              </Link>
            </div>
            <span className="text-white/20">Designed & Developed with intent.</span>
          </div>
        </div>
      </footer>

      {/* Back to Top button */}
      {showBackToTop && (
        <button
          onClick={scrollToTop}
          className="fixed bottom-8 right-8 z-50 p-4 bg-[var(--accent)] text-white rounded-full shadow-lg hover:bg-[var(--accent)]/80 transition opacity-90 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-black/40"
          aria-label="Back to top"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
          </svg>
        </button>
      )}
    </>
  );
}