"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  FaBars,
  FaChevronLeft,
  FaChevronRight,
  FaExternalLinkAlt,
  FaEnvelope,
  FaImages,
  FaHome,
  FaListUl,
  FaMagic,
  FaMusic,
  FaUserAlt,
  FaTimes,
  FaVideo,
} from "react-icons/fa";
import LogoutButton from "@/components/admin/LogoutButton";
import {
  ADMIN_V2_NAVIGATION,
  ADMIN_V2_SIDEBAR_STORAGE_KEY,
  getAdminV2ActiveItem,
  parseAdminV2SidebarState,
  serializeAdminV2SidebarState,
  type AdminV2NavigationKey,
} from "@/lib/admin/v2-shell";

const SIDEBAR_CHANGE_EVENT = "artist-admin-v2-sidebar-state-change";
let memoryCollapsed: boolean | undefined;

function readCollapsedPreference() {
  if (typeof memoryCollapsed === "boolean") return memoryCollapsed;
  try {
    return parseAdminV2SidebarState(
      window.localStorage.getItem(ADMIN_V2_SIDEBAR_STORAGE_KEY)
    );
  } catch {
    return false;
  }
}

function subscribeToCollapsedPreference(onChange: () => void) {
  function handleStorage(event: StorageEvent) {
    if (event.key && event.key !== ADMIN_V2_SIDEBAR_STORAGE_KEY) return;
    memoryCollapsed = undefined;
    onChange();
  }

  window.addEventListener(SIDEBAR_CHANGE_EVENT, onChange);
  window.addEventListener("storage", handleStorage);
  return () => {
    window.removeEventListener(SIDEBAR_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", handleStorage);
  };
}

function iconFor(key: AdminV2NavigationKey) {
  const icons: Record<AdminV2NavigationKey, ReactNode> = {
    overview: <FaHome />,
    navigation: <FaListUl />,
    bio: <FaUserAlt />,
    gallery: <FaImages />,
    showreel: <FaVideo />,
    music: <FaMusic />,
    contact: <FaEnvelope />,
  };
  return icons[key];
}

function V2NavLinks({
  collapsed = false,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const active = getAdminV2ActiveItem(pathname);

  return (
    <nav aria-label="Admin V2 navigation" className="grid gap-1.5">
      {ADMIN_V2_NAVIGATION.map((item) => {
        const isActive = active.key === item.key;
        return (
          <Link
            aria-current={isActive ? "page" : undefined}
            aria-label={collapsed ? item.label : undefined}
            className={`group/nav relative flex min-h-12 items-center gap-3 rounded-2xl border px-2.5 py-2 outline-none transition focus-visible:ring-2 focus-visible:ring-white/60 ${
              isActive
                ? "border-white/14 bg-white/[0.1] text-white"
                : "border-transparent text-white/56 hover:border-white/8 hover:bg-white/[0.055] hover:text-white"
            }`}
            href={item.href}
            key={item.key}
            onClick={onNavigate}
            title={collapsed ? item.label : undefined}
          >
            <span
              className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl border text-sm transition ${
                isActive
                  ? "border-[#ff583f]/30 bg-[#ff3b1f] text-white shadow-[0_8px_24px_rgba(255,59,31,0.22)]"
                  : "border-white/8 bg-white/[0.045] text-white/48 group-hover/nav:text-white/80"
              }`}
            >
              {iconFor(item.key)}
            </span>
            <span className={collapsed ? "sr-only" : "min-w-0"}>
              <span className="block text-sm font-semibold">{item.label}</span>
              <span className="mt-0.5 block truncate text-[11px] text-white/36">
                {item.description}
              </span>
            </span>
            {collapsed ? (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 z-50 -translate-y-1/2 whitespace-nowrap rounded-lg border border-white/10 bg-[#171719] px-2.5 py-1.5 text-[11px] font-semibold text-white opacity-0 shadow-xl transition group-hover/nav:opacity-100 group-focus-visible/nav:opacity-100"
              >
                {item.label}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

function UtilityLink({
  children,
  collapsed,
  external = false,
  href,
  icon,
  onNavigate,
}: {
  children: string;
  collapsed?: boolean;
  external?: boolean;
  href: string;
  icon: ReactNode;
  onNavigate?: () => void;
}) {
  return (
    <Link
      aria-label={collapsed ? children : undefined}
      className="group/utility relative flex min-h-11 items-center justify-center gap-3 rounded-xl border border-white/9 bg-white/[0.04] px-3 text-xs font-semibold text-white/58 outline-none transition hover:bg-white hover:text-black focus-visible:ring-2 focus-visible:ring-white/60 data-[collapsed=false]:justify-start"
      data-collapsed={String(Boolean(collapsed))}
      href={href}
      onClick={onNavigate}
      rel={external ? "noreferrer" : undefined}
      target={external ? "_blank" : undefined}
    >
      <span className="grid h-5 w-5 shrink-0 place-items-center text-[11px]">
        {icon}
      </span>
      <span className={collapsed ? "sr-only" : "whitespace-nowrap"}>
        {children}
      </span>
      {collapsed ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 z-50 -translate-y-1/2 whitespace-nowrap rounded-lg border border-white/10 bg-[#171719] px-2.5 py-1.5 text-[11px] text-white opacity-0 shadow-xl transition group-hover/utility:opacity-100 group-focus-visible/utility:opacity-100"
        >
          {children}
        </span>
      ) : null}
    </Link>
  );
}

function MobileDrawer({
  adminEmail,
  open,
  onClose,
  triggerRef,
}: {
  adminEmail: string;
  open: boolean;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousBodyOverflowRef = useRef<string | null>(null);

  const lockBodyScroll = useCallback(() => {
    if (previousBodyOverflowRef.current === null) {
      previousBodyOverflowRef.current = document.body.style.overflow;
    }
    document.body.style.overflow = "hidden";
  }, []);

  const restoreBodyScroll = useCallback(() => {
    if (previousBodyOverflowRef.current === null) return;
    document.body.style.overflow = previousBodyOverflowRef.current;
    previousBodyOverflowRef.current = null;
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
      closeButtonRef.current?.focus();
      lockBodyScroll();
      return;
    }

    if (!open && dialog.open) {
      dialog.close();
      restoreBodyScroll();
      if (!window.matchMedia("(min-width: 1024px)").matches) {
        triggerRef.current?.focus();
      }
    }
  }, [lockBodyScroll, open, restoreBodyScroll, triggerRef]);

  useEffect(
    () => () => {
      restoreBodyScroll();
    },
    [restoreBodyScroll]
  );

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const closeAtDesktop = () => {
      if (desktop.matches && dialogRef.current?.open) onClose();
    };

    closeAtDesktop();
    desktop.addEventListener("change", closeAtDesktop);
    return () => desktop.removeEventListener("change", closeAtDesktop);
  }, [onClose]);

  return (
    <dialog
      aria-labelledby="admin-v2-mobile-drawer-title"
      className="m-0 h-dvh max-h-none w-full max-w-none bg-transparent p-0 text-white backdrop:bg-black/75 lg:hidden"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onClose={() => {
        restoreBodyScroll();
        if (open) onClose();
      }}
      id="admin-v2-mobile-drawer"
      ref={dialogRef}
    >
      <div className="flex h-dvh w-[min(88vw,340px)] flex-col border-r border-white/10 bg-[#0d0d0f] p-4 shadow-[30px_0_100px_rgba(0,0,0,0.55)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[0.26em] text-white/30">
              Artist portfolio
            </p>
            <h2
              className="mt-1 text-lg font-semibold text-white"
              id="admin-v2-mobile-drawer-title"
            >
              Studio Admin V2
            </h2>
          </div>
          <button
            aria-label="Close navigation"
            className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 text-white/56 outline-none transition hover:bg-white hover:text-black focus-visible:ring-2 focus-visible:ring-white/60"
            onClick={onClose}
            ref={closeButtonRef}
            type="button"
          >
            <FaTimes />
          </button>
        </div>

        <div className="mt-7 min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <V2NavLinks onNavigate={onClose} />
        </div>

        <div className="mt-4 grid gap-2 border-t border-white/8 pt-4">
          <UtilityLink href="/admin" icon={<FaChevronLeft />} onNavigate={onClose}>
            Classic V1
          </UtilityLink>
          <UtilityLink
            external
            href="/"
            icon={<FaExternalLinkAlt />}
            onNavigate={onClose}
          >
            Open live site
          </UtilityLink>
          <p className="truncate px-1 pt-2 text-[10px] text-white/34">
            {adminEmail}
          </p>
          <LogoutButton />
        </div>
      </div>
    </dialog>
  );
}

export default function AdminV2Shell({
  adminEmail,
  children,
}: {
  adminEmail: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const active = getAdminV2ActiveItem(pathname);
  const collapsed = useSyncExternalStore(
    subscribeToCollapsedPreference,
    readCollapsedPreference,
    () => false
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerTriggerRef = useRef<HTMLButtonElement | null>(null);
  const sidebarToggleRef = useRef<HTMLButtonElement | null>(null);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  function toggleCollapsed() {
    const next = !collapsed;
    memoryCollapsed = next;
    try {
      window.localStorage.setItem(
        ADMIN_V2_SIDEBAR_STORAGE_KEY,
        serializeAdminV2SidebarState(next)
      );
    } catch {
      // The explicit state still updates other subscribers in this tab.
    }
    window.dispatchEvent(new Event(SIDEBAR_CHANGE_EVENT));
    window.requestAnimationFrame(() => sidebarToggleRef.current?.focus());
  }

  return (
    <main className="relative min-h-screen overflow-x-clip bg-[#070708] font-ui text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_8%_0%,rgba(255,59,31,0.14),transparent_26%),radial-gradient(circle_at_88%_8%,rgba(255,255,255,0.07),transparent_24%)]" />
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(rgba(255,255,255,0.016)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.016)_1px,transparent_1px)] bg-[size:56px_56px] opacity-60" />

      <div className="relative mx-auto flex w-full max-w-[1920px] gap-4 p-3 sm:p-4">
        <aside
          aria-label="Studio Admin V2"
          className={`sticky top-4 z-40 hidden h-[calc(100vh-2rem)] shrink-0 overflow-visible rounded-[26px] border border-white/9 bg-[#0d0d0f]/96 p-3 shadow-[0_28px_100px_rgba(0,0,0,0.48)] backdrop-blur-2xl transition-[width] duration-200 motion-reduce:transition-none lg:flex lg:flex-col ${
            collapsed ? "w-[78px]" : "w-[276px]"
          }`}
          id="admin-v2-sidebar-panel"
        >
          <div className="flex min-h-12 items-center gap-1">
            <Link
              aria-label="Open Admin V2 overview"
              className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-2 py-1.5 outline-none transition hover:bg-white/[0.045] focus-visible:ring-2 focus-visible:ring-white/60"
              href="/admin/v2"
            >
              <span className="relative grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-[#ff3b1f] text-white shadow-[0_12px_32px_rgba(255,59,31,0.24)]">
                <FaMagic className="relative z-10 text-sm" />
                <span className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.32),transparent_50%)]" />
              </span>
              <span className={collapsed ? "sr-only" : "min-w-0 flex-1"}>
                <span className="block text-[9px] font-semibold uppercase tracking-[0.26em] text-white/30">
                  Artist portfolio
                </span>
                <span className="mt-1 block truncate text-base font-semibold tracking-tight text-white">
                  Studio Admin V2
                </span>
              </span>
            </Link>
            {!collapsed ? (
              <button
                aria-controls="admin-v2-sidebar-panel"
                aria-expanded="true"
                aria-label="Collapse sidebar"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/8 text-white/38 outline-none transition hover:bg-white/8 hover:text-white focus-visible:ring-2 focus-visible:ring-white/60"
                onClick={toggleCollapsed}
                ref={sidebarToggleRef}
                type="button"
              >
                <FaChevronLeft className="text-[10px]" />
              </button>
            ) : null}
          </div>

          {collapsed ? (
            <button
              aria-controls="admin-v2-sidebar-panel"
              aria-expanded="false"
              aria-label="Expand sidebar"
              className="mt-2 grid h-11 w-full place-items-center rounded-xl border border-white/8 text-white/42 outline-none transition hover:bg-white/8 hover:text-white focus-visible:ring-2 focus-visible:ring-white/60"
              onClick={toggleCollapsed}
              ref={sidebarToggleRef}
              type="button"
            >
              <FaChevronRight className="text-[10px]" />
            </button>
          ) : null}

          <div className="admin-scrollbar-none mt-5 min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-1">
            <V2NavLinks collapsed={collapsed} />
          </div>

          <div className="mt-4 grid gap-2 border-t border-white/8 pt-4">
            <UtilityLink
              collapsed={collapsed}
              href="/admin"
              icon={<FaChevronLeft />}
            >
              Classic V1
            </UtilityLink>
            <UtilityLink
              collapsed={collapsed}
              external
              href="/"
              icon={<FaExternalLinkAlt />}
            >
              Open live site
            </UtilityLink>
            {!collapsed ? (
              <div className="mt-1 rounded-2xl border border-white/8 bg-black/25 p-2.5">
                <p className="truncate px-1 pb-2 text-[10px] text-white/34">
                  {adminEmail}
                </p>
                <LogoutButton />
              </div>
            ) : null}
          </div>
        </aside>

        <section className="min-w-0 flex-1" id="admin-v2-main-content" tabIndex={-1}>
          <header className="sticky top-3 z-30 mb-3 flex items-center gap-3 rounded-[20px] border border-white/9 bg-[#0d0d0f]/94 p-2.5 shadow-[0_18px_60px_rgba(0,0,0,0.36)] backdrop-blur-2xl lg:hidden">
            <button
              aria-controls="admin-v2-mobile-drawer"
              aria-expanded={drawerOpen}
              aria-label="Open Admin V2 navigation"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#ff3b1f] text-white outline-none focus-visible:ring-2 focus-visible:ring-white/70"
              onClick={() => setDrawerOpen(true)}
              ref={drawerTriggerRef}
              type="button"
            >
              <FaBars />
            </button>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">
                {active.label}
              </p>
              <p className="truncate text-[11px] text-white/38">
                Studio Admin V2 · {active.description}
              </p>
            </div>
          </header>

          <div className="pb-24">{children}</div>
        </section>
      </div>

      <MobileDrawer
        adminEmail={adminEmail}
        onClose={closeDrawer}
        open={drawerOpen}
        triggerRef={drawerTriggerRef}
      />
    </main>
  );
}
