//artist-portfolio/components/TopNav.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  FaInstagram,
  FaSpotify,
  FaSoundcloud,
  FaYoutube,
  FaBandcamp,
  FaApple,
} from "react-icons/fa";

type NavItem = { label: string; href: string };
type IconItem = { label: string; href: string; icon: React.ReactNode };

const NAV: NavItem[] = [
  { label: "HOME", href: "/" },
  { label: "BIO", href: "/bio" },
  { label: "MUSIC", href: "/music" },
  { label: "VIDEO", href: "/video" },
  { label: "BOOKING", href: "/booking" },
];

const ICONS: IconItem[] = [
  { label: "Spotify", href: "https://spotify.com", icon: <FaSpotify /> },
  { label: "SoundCloud", href: "https://soundcloud.com", icon: <FaSoundcloud /> },
  { label: "Instagram", href: "https://instagram.com", icon: <FaInstagram /> },
  { label: "YouTube", href: "https://youtube.com", icon: <FaYoutube /> },
  { label: "Bandcamp", href: "https://bandcamp.com", icon: <FaBandcamp /> },
  { label: "Apple Music", href: "https://music.apple.com", icon: <FaApple /> },
];

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function isActivePath(pathname: string, href: string) {
  const p = pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
  const h = href.length > 1 ? href.replace(/\/$/, "") : href;
  return p === h;
}

export default function TopNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname() || "/";

  const close = () => setOpen(false);

  // ESC to close
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Prevent background scroll while menu open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const brandStyle = useMemo<React.CSSProperties>(
    () => ({
      fontFamily: "var(--font-display, ui-sans-serif, system-ui)",
    }),
    []
  );

  return (
    <header className="fixed top-0 left-0 right-0 z-40">
      <div className="mx-auto max-w-[1400px] px-4 sm:px-8">
        <div className="mt-3 sm:mt-4 rounded-2xl border border-white/10 bg-black/55 backdrop-blur">
          <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3">
            {/* Brand */}
            <Link
              href="/"
              onClick={close}
              className="group inline-flex items-center gap-2"
              aria-label="Go to homepage"
              title="ARTIST PORTFOLIO"
            >
              <span
                style={brandStyle}
                className={cx(
                  "text-[11px] sm:text-xs",
                  "tracking-[0.35em]",
                  "uppercase",
                  "transition",
                  "bg-gradient-to-r from-white via-white to-[#ffffff]",
                  "bg-clip-text text-transparent",
                  "group-hover:opacity-90"
                )}
              >
                Franky Fugazi
              </span>
            </Link>

            {/* Desktop nav */}
            <nav className="hidden md:flex items-center gap-6 text-xs tracking-[0.25em] text-white/60">
              {NAV.map((i) => (
                <Link
                  key={i.label}
                  href={i.href}
                  onClick={close}
                  aria-current={isActivePath(pathname, i.href) ? "page" : undefined}
                  className={cx(
                    "transition hover:text-white",
                    isActivePath(pathname, i.href) ? "text-[#ff3b1f]" : "text-white/60"
                  )}
                >
                  {i.label}
                </Link>
              ))}
            </nav>

            {/* Desktop socials */}
            <div className="hidden lg:flex items-center gap-2">
              {ICONS.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={s.label}
                  title={s.label}
                  className="group flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-black/35 text-white/70 backdrop-blur transition hover:bg-white/10 hover:text-white"
                >
                  <span className="text-base transition group-hover:scale-110">
                    {s.icon}
                  </span>
                </a>
              ))}
            </div>

            {/* Mobile hamburger */}
            <button
              type="button"
              className="md:hidden inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-black/35 text-white/80 backdrop-blur transition hover:bg-white/10 hover:text-white"
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
            >
              <span className="relative block h-4 w-5">
                <span
                  className={cx(
                    "absolute left-0 top-0 h-[2px] w-5 rounded-full bg-white/85 transition-all duration-200",
                    "shadow-[0_0_14px_rgba(255,59,31,0.35)]",
                    open && "top-[7px] rotate-45 bg-white"
                  )}
                />
                <span
                  className={cx(
                    "absolute left-0 top-[7px] h-[2px] w-5 rounded-full bg-white/65 transition-all duration-200",
                    open && "opacity-0"
                  )}
                />
                <span
                  className={cx(
                    "absolute left-0 top-[14px] h-[2px] w-5 rounded-full bg-white/85 transition-all duration-200",
                    "shadow-[0_0_14px_rgba(255,59,31,0.35)]",
                    open && "top-[7px] -rotate-45 bg-white"
                  )}
                />
              </span>
            </button>
          </div>

          {/* Mobile panel */}
          <div
            className={cx(
              "md:hidden overflow-hidden transition-[max-height,opacity] duration-300",
              open ? "max-h-[520px] opacity-100" : "max-h-0 opacity-0"
            )}
          >
            <div className="border-t border-white/10 px-4 pb-4 pt-4">
              <nav className="grid gap-2 text-xs tracking-[0.28em] text-white/70">
                {NAV.map((i, idx) => (
                  <Link
                    key={i.label}
                    href={i.href}
                    onClick={close}
                    aria-current={isActivePath(pathname, i.href) ? "page" : undefined}
                    className={cx(
                      "text-left",
                      "rounded-xl border border-white/10 bg-white/5 px-4 py-3",
                      "transition hover:bg-white/10 hover:text-white",
                      isActivePath(pathname, i.href) ? "text-[#ff3b1f]" : "text-white/70",
                      open && "animate-[fadeInUp_240ms_ease-out_forwards]"
                    )}
                    style={{ animationDelay: `${idx * 40}ms` }}
                  >
                    {i.label}
                  </Link>
                ))}
              </nav>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                {ICONS.map((s) => (
                  <a
                    key={s.label}
                    href={s.href}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={s.label}
                    title={s.label}
                    className="group flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-black/35 text-white/70 backdrop-blur transition hover:bg-white/10 hover:text-white"
                  >
                    <span className="text-base transition group-hover:scale-110">
                      {s.icon}
                    </span>
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile backdrop */}
      <div
        className={cx(
          "md:hidden fixed inset-0 -z-10 transition",
          open ? "bg-black/60" : "pointer-events-none bg-transparent"
        )}
        onClick={close}
        aria-hidden="true"
      />

      <style jsx>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(6px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </header>
  );
}