"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { FaChevronDown } from "react-icons/fa";

type AdminDisclosureProps = {
  badge?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  defaultOpen?: boolean;
  description?: string;
  eyebrow?: string;
  icon?: ReactNode;
  id?: string;
  title: string;
  variant?: "section" | "item" | "advanced";
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export default function AdminDisclosure({
  badge,
  children,
  className,
  contentClassName,
  defaultOpen = false,
  description,
  eyebrow,
  icon,
  id,
  title,
  variant = "section",
}: AdminDisclosureProps) {
  const generatedId = useId().replace(/:/g, "");
  const panelId = id || `admin-panel-${generatedId}`;
  const triggerId = `${panelId}-trigger`;
  const regionId = `${panelId}-content`;
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const regionRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function openHashTarget() {
      const hash = window.location.hash.replace(/^#/, "");
      if (!hash) return;

      const target = document.getElementById(hash);
      if (hash === panelId || (target && regionRef.current?.contains(target))) {
        setIsOpen(true);
      }
    }

    openHashTarget();
    window.addEventListener("hashchange", openHashTarget);
    return () => window.removeEventListener("hashchange", openHashTarget);
  }, [panelId]);

  function togglePanel() {
    if (isOpen && regionRef.current?.contains(document.activeElement)) {
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    }
    setIsOpen((open) => !open);
  }

  return (
    <section
      className={cx(
        "overflow-hidden border transition-colors",
        variant === "section" &&
          "rounded-[24px] border-white/10 bg-[#111113]/88 shadow-[0_16px_55px_rgba(0,0,0,0.2)]",
        variant === "item" &&
          "rounded-[18px] border-white/9 bg-black/22",
        variant === "advanced" &&
          "rounded-2xl border-dashed border-white/10 bg-white/[0.025]",
        isOpen && "border-white/16",
        className
      )}
      id={panelId}
    >
      <button
        aria-controls={regionId}
        aria-expanded={isOpen}
        className={cx(
          "group flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left outline-none transition hover:bg-white/[0.045] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/55 sm:px-5",
          variant === "item" && "min-h-14 py-2.5",
          variant === "advanced" && "min-h-12 py-2.5"
        )}
        id={triggerId}
        onClick={togglePanel}
        ref={triggerRef}
        type="button"
      >
        {icon ? (
          <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl border border-white/10 bg-white/[0.055] text-white/58">
            {icon}
          </span>
        ) : null}
        <span className="min-w-0 flex-1">
          {eyebrow ? (
            <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-white/34">
              {eyebrow}
            </span>
          ) : null}
          <span
            className={cx(
              "block font-semibold text-white/88",
              variant === "section" ? "mt-0.5 text-base" : "text-sm"
            )}
          >
            {title}
          </span>
          {description ? (
            <span className="mt-1 block truncate text-xs text-white/38">
              {description}
            </span>
          ) : null}
        </span>
        {badge ? <span className="shrink-0">{badge}</span> : null}
        <FaChevronDown
          aria-hidden="true"
          className={cx(
            "shrink-0 text-[11px] text-white/35 transition-transform duration-200",
            isOpen && "rotate-180"
          )}
        />
      </button>
      <div
        aria-labelledby={triggerId}
        className={cx(
          "border-t border-white/8 p-3 sm:p-4",
          variant === "advanced" && "p-3",
          contentClassName
        )}
        hidden={!isOpen}
        id={regionId}
        ref={regionRef}
        role="region"
      >
        {children}
      </div>
    </section>
  );
}
