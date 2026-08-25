"use client";

import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { FaChevronLeft, FaChevronRight, FaMagic } from "react-icons/fa";

type DesktopAdminSidebarProps = {
  footer: ReactNode;
  navigation: ReactNode;
};

const PINNED_STORAGE_KEY = "artist-admin-sidebar-pinned";
const PINNED_CHANGE_EVENT = "artist-admin-sidebar-pinned-change";
const FINE_POINTER_QUERY = "(hover: hover) and (pointer: fine)";
let memoryPinned: boolean | undefined;

function readPinnedPreference() {
  if (typeof memoryPinned === "boolean") return memoryPinned;

  try {
    return window.localStorage.getItem(PINNED_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function subscribeToPinnedPreference(onChange: () => void) {
  const handleStorage = (event: StorageEvent) => {
    if (event.key && event.key !== PINNED_STORAGE_KEY) return;
    memoryPinned = undefined;
    onChange();
  };

  window.addEventListener(PINNED_CHANGE_EVENT, onChange);
  window.addEventListener("storage", handleStorage);
  return () => {
    window.removeEventListener(PINNED_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", handleStorage);
  };
}

function readFinePointer() {
  return window.matchMedia(FINE_POINTER_QUERY).matches;
}

function subscribeToFinePointer(onChange: () => void) {
  const query = window.matchMedia(FINE_POINTER_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

export default function DesktopAdminSidebar({
  footer,
  navigation,
}: DesktopAdminSidebarProps) {
  const pinned = useSyncExternalStore(
    subscribeToPinnedPreference,
    readPinnedPreference,
    () => false
  );
  const finePointer = useSyncExternalStore(
    subscribeToFinePointer,
    readFinePointer,
    () => true
  );
  const [pointerOpen, setPointerOpen] = useState(false);
  const [focusOpen, setFocusOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const expanded = pinned || pointerOpen || focusOpen || !finePointer;

  useEffect(() => {
    if (expanded) return;
    panelRef.current
      ?.querySelectorAll<HTMLDetailsElement>("details[open]")
      .forEach((details) => details.removeAttribute("open"));
  }, [expanded]);

  function togglePinned() {
    const next = !pinned;
    memoryPinned = next;
    try {
      window.localStorage.setItem(PINNED_STORAGE_KEY, String(next));
    } catch {
      // The pin still works for this session when persistence is blocked.
    }
    window.dispatchEvent(new Event(PINNED_CHANGE_EVENT));
  }

  return (
    <aside
      aria-label="Studio Admin"
      className={`relative z-40 hidden shrink-0 transition-[width] duration-200 ease-out motion-reduce:transition-none lg:sticky lg:top-4 lg:block lg:h-[calc(100vh-2rem)] ${
        pinned || !finePointer ? "lg:w-[276px]" : "lg:w-[82px]"
      }`}
    >
      <div
        className={`group/sidebar absolute inset-y-0 left-0 flex flex-col overflow-hidden rounded-[26px] border border-white/9 bg-[#0d0d0f]/96 p-3 shadow-[0_28px_100px_rgba(0,0,0,0.48)] backdrop-blur-2xl transition-[width] duration-200 ease-out motion-reduce:transition-none ${
          expanded ? "w-[276px]" : "w-[82px]"
        }`}
        data-expanded={expanded}
        id="studio-admin-sidebar-panel"
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) {
            setFocusOpen(false);
          }
        }}
        onFocusCapture={() => setFocusOpen(true)}
        onKeyDown={(event) => {
          if (event.key !== "Escape" || pinned) return;
          setFocusOpen(false);
          setPointerOpen(false);
          document.getElementById("admin-main-content")?.focus();
        }}
        onPointerEnter={() => {
          if (finePointer) setPointerOpen(true);
        }}
        onPointerLeave={() => setPointerOpen(false)}
        ref={panelRef}
      >
        <div className="flex min-h-12 items-center gap-1">
          <Link
            aria-label="Open Studio Admin overview"
            className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-2.5 py-1.5 outline-none transition hover:bg-white/[0.045] focus-visible:ring-2 focus-visible:ring-white/55"
            href="/admin"
          >
            <span className="relative grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-[#ff3b1f] text-white shadow-[0_12px_32px_rgba(255,59,31,0.24)]">
              <FaMagic className="relative z-10 text-sm" />
              <span className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.32),transparent_50%)]" />
            </span>
            <span className="sidebar-copy min-w-0 flex-1 whitespace-nowrap opacity-0 transition duration-150 group-data-[expanded=true]/sidebar:opacity-100">
              <span className="block text-[9px] font-semibold uppercase tracking-[0.28em] text-white/30">
                Artist portfolio
              </span>
              <span className="mt-1 block truncate text-base font-semibold tracking-tight text-white">
                Studio Admin
              </span>
            </span>
          </Link>
          {finePointer ? <button
            aria-label={pinned ? "Use auto-hide sidebar" : "Keep sidebar open"}
            aria-pressed={pinned}
            className="sidebar-copy grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/8 text-white/38 opacity-0 outline-none transition hover:bg-white/8 hover:text-white focus-visible:ring-2 focus-visible:ring-white/55 group-data-[expanded=true]/sidebar:opacity-100"
            onClick={togglePinned}
            title={pinned ? "Use auto-hide" : "Keep open"}
            type="button"
          >
            {pinned ? (
              <FaChevronLeft className="text-[10px] text-white/38" />
            ) : (
              <FaChevronRight className="text-[10px] text-white/38" />
            )}
          </button> : null}
        </div>

        <div className="admin-scrollbar-none mt-4 min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain pr-0.5">
          {navigation}
        </div>

        <div className="mt-3 grid gap-2">{footer}</div>
      </div>
    </aside>
  );
}
