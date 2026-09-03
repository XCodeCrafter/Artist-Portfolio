"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useEffect,
  useMemo,
  useState,
} from "react";
import SocialPlatformIcon from "@/components/SocialPlatformIcon";
import {
  getActiveNavigationKey,
  type NavigationItem,
} from "@/lib/content/navigation";
import type { SocialLink } from "@/lib/content";

type TopNavItem = Pick<
  NavigationItem,
  "defaultLabel" | "href" | "key" | "kind" | "sortOrder"
>;

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function currentValue(item: TopNavItem, active: boolean) {
  if (!active) return undefined;
  return item.kind === "section" ? ("location" as const) : ("page" as const);
}

function navLinkClass(active: boolean) {
  return cx(
    "whitespace-nowrap transition hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/45",
    active ? "text-[#ff3b1f]" : "text-white/60"
  );
}

function DesktopNavigation({
  className,
  currentHash,
  items,
  onNavigate,
  pathname,
}: {
  className: string;
  currentHash: string;
  items: TopNavItem[];
  onNavigate: () => void;
  pathname: string;
}) {
  const activeKey = getActiveNavigationKey(items, pathname, currentHash);

  return (
    <nav
      aria-label="Primary navigation"
      className={cx(
        className,
        "items-center text-[10px] font-medium tracking-[0.16em] 2xl:text-[11px] 2xl:tracking-[0.2em]"
      )}
    >
      {items.map((item) => {
        const active = item.key === activeKey;
        return (
          <Link
            aria-current={currentValue(item, active)}
            className={navLinkClass(active)}
            href={item.href}
            key={item.key}
            onClick={onNavigate}
          >
            {item.defaultLabel}
          </Link>
        );
      })}
    </nav>
  );
}

export default function TopNav({
  artistName = "Artist Portfolio",
  navigationItems = [],
  socialLinks = [],
}: {
  artistName?: string;
  navigationItems?: TopNavItem[];
  socialLinks?: SocialLink[];
}) {
  const [open, setOpen] = useState(false);
  const [currentHash, setCurrentHash] = useState("");
  const pathname = usePathname() || "/";
  const navItems = useMemo(
    () =>
      navigationItems
        .filter((item) => item.kind === "page")
        .sort((left, right) =>
          left.sortOrder === right.sortOrder
            ? left.key.localeCompare(right.key)
            : left.sortOrder - right.sortOrder
        ),
    [navigationItems]
  );
  const activeSocialLinks = socialLinks.filter((link) => link.href.trim());
  const activeKey = getActiveNavigationKey(navItems, pathname, currentHash);
  const hasDrawerContent = navItems.length > 0 || activeSocialLinks.length > 0;

  const close = () => setOpen(false);

  useEffect(() => {
    const syncHash = () => {
      setCurrentHash(window.location.hash);
      setOpen(false);
    };
    syncHash();
    window.addEventListener("hashchange", syncHash);
    window.addEventListener("popstate", syncHash);
    return () => {
      window.removeEventListener("hashchange", syncHash);
      window.removeEventListener("popstate", syncHash);
    };
  }, [pathname]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const wideViewport = window.matchMedia("(min-width: 1280px)");
    const closeWhenInlineNavigationTakesOver = () => {
      if (wideViewport.matches) setOpen(false);
    };
    closeWhenInlineNavigationTakesOver();
    wideViewport.addEventListener("change", closeWhenInlineNavigationTakesOver);
    return () => {
      wideViewport.removeEventListener(
        "change",
        closeWhenInlineNavigationTakesOver
      );
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const brandStyle = useMemo<React.CSSProperties>(
    () => ({
      fontFamily: "var(--font-display, ui-sans-serif, system-ui)",
    }),
    []
  );

  if (pathname.startsWith("/admin")) return null;

  return (
    <header className="fixed inset-x-0 top-0 z-40 border-b border-[#ff3b1f]/15 bg-[#070505]/88 backdrop-blur-xl">
      <div className="mx-auto max-w-[1800px] px-4 sm:px-7 lg:px-10">
        <div className="relative grid min-h-[72px] grid-cols-[2.5rem_minmax(0,1fr)_2.5rem] items-center xl:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] xl:gap-7 2xl:gap-10">
          <DesktopNavigation
            className="hidden min-w-0 justify-self-start gap-4 xl:flex 2xl:gap-7"
            currentHash={currentHash}
            items={navItems}
            onNavigate={close}
            pathname={pathname}
          />

          <Link
            aria-label={`${artistName} — go to homepage`}
            className="group col-start-2 inline-flex min-w-0 max-w-full items-center justify-self-center"
            href="/"
            onClick={close}
            title={artistName}
          >
            <span
              className="truncate text-center text-[12px] uppercase tracking-[0.22em] text-[#ff3b1f] transition group-hover:text-[#ff705a] sm:text-sm sm:tracking-[0.3em] xl:max-w-[18rem]"
              style={brandStyle}
            >
              {artistName}
            </span>
          </Link>

          <div className="hidden min-w-0 justify-self-stretch overflow-x-auto [scrollbar-width:none] xl:block [&::-webkit-scrollbar]:hidden">
            <div className="ml-auto flex w-max items-center gap-1.5 2xl:gap-2">
              {activeSocialLinks.map((link) => (
                <a
                  aria-label={link.label}
                  className="group flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#ff3b1f]/60 bg-black/25 text-[#ff5b43] transition hover:border-[#ff3b1f] hover:bg-[#ff3b1f] hover:text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#ff705a] 2xl:h-9 2xl:w-9"
                  href={link.href}
                  key={link.id}
                  rel="noreferrer"
                  target="_blank"
                  title={link.label}
                >
                  <SocialPlatformIcon
                    className="text-sm transition group-hover:scale-110 2xl:text-base"
                    href={link.href}
                    iconKey={link.iconKey}
                    label={link.label}
                    platform={link.platform}
                  />
                </a>
              ))}
            </div>
          </div>

          {hasDrawerContent ? (
            <button
              aria-controls="portfolio-navigation-drawer"
              aria-expanded={open}
              aria-label={open ? "Close menu" : "Open menu"}
              className="col-start-3 inline-flex h-10 w-10 shrink-0 items-center justify-center justify-self-end rounded-xl border border-white/15 bg-black/35 text-white/80 transition hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff705a] xl:hidden"
              onClick={() => setOpen((value) => !value)}
              type="button"
            >
              <span className="relative block h-4 w-5">
                <span
                  className={cx(
                    "absolute left-0 top-0 h-[2px] w-5 rounded-full bg-white/85 shadow-[0_0_14px_rgba(255,59,31,0.35)] transition-all duration-200",
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
                    "absolute left-0 top-[14px] h-[2px] w-5 rounded-full bg-white/85 shadow-[0_0_14px_rgba(255,59,31,0.35)] transition-all duration-200",
                    open && "top-[7px] -rotate-45 bg-white"
                  )}
                />
              </span>
            </button>
          ) : null}
        </div>

        <div
          aria-hidden={!open}
          className={cx(
            "overflow-hidden transition-[max-height,opacity] duration-300 xl:hidden",
            open
              ? "max-h-[calc(100dvh-4.5rem)] opacity-100"
              : "max-h-0 opacity-0"
          )}
          id="portfolio-navigation-drawer"
          inert={!open}
        >
          <div className="max-h-[calc(100dvh-4.5rem)] overflow-y-auto border-t border-white/10 pb-5 pt-2 overscroll-contain">
            <nav
              aria-label="Navigation menu"
              className="grid text-xs tracking-[0.22em] text-white/70 sm:grid-cols-2"
            >
              {navItems.map((item, index) => {
                const active = item.key === activeKey;
                return (
                  <Link
                    aria-current={currentValue(item, active)}
                    className={cx(
                      "border-b border-white/[0.07] px-2 py-3.5 text-left transition hover:text-white sm:px-4",
                      active ? "text-[#ff3b1f]" : "text-white/70",
                      open && "animate-[fadeInUp_240ms_ease-out_forwards]"
                    )}
                    href={item.href}
                    key={item.key}
                    onClick={close}
                    style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}
                  >
                    {item.defaultLabel}
                  </Link>
                );
              })}
            </nav>

            {activeSocialLinks.length > 0 ? (
              <div className="mt-5 flex flex-wrap items-center gap-2 px-2 sm:px-4">
                {activeSocialLinks.map((link) => (
                  <a
                    aria-label={link.label}
                    className="group flex h-10 w-10 items-center justify-center rounded-full border border-[#ff3b1f]/60 bg-black/35 text-[#ff5b43] transition hover:bg-[#ff3b1f] hover:text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#ff705a]"
                    href={link.href}
                    key={link.id}
                    onClick={close}
                    rel="noreferrer"
                    target="_blank"
                    title={link.label}
                  >
                    <SocialPlatformIcon
                      className="text-base transition group-hover:scale-110"
                      href={link.href}
                      iconKey={link.iconKey}
                      label={link.label}
                      platform={link.platform}
                    />
                  </a>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div
        aria-hidden="true"
        className={cx(
          "fixed inset-0 -z-10 transition xl:hidden",
          open ? "bg-black/65" : "pointer-events-none bg-transparent"
        )}
        onClick={close}
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
