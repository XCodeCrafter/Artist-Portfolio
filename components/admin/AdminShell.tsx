import Link from "next/link";
import type { ReactNode } from "react";
import {
  FaChartLine,
  FaChevronDown,
  FaExternalLinkAlt,
  FaFileAlt,
  FaHome,
  FaEye,
  FaEyeSlash,
  FaImages,
  FaMagic,
  FaShieldAlt,
  FaUpload,
  FaUserCircle,
} from "react-icons/fa";
import LogoutButton from "@/components/admin/LogoutButton";
import { getProfilePublicModules } from "@/lib/content/modules";
import type { PageSlug, PortfolioType } from "@/lib/content/types";

export type AdminSection =
  | "dashboard"
  | "content"
  | "media"
  | "analytics"
  | "security";

type AdminShellProps = {
  active: AdminSection;
  adminEmail: string;
  children: ReactNode;
  description: string;
  eyebrow?: string;
  hiddenNavPageSlugs?: PageSlug[];
  portfolioType?: PortfolioType;
  title: string;
};

const navItems: Array<{
  key: AdminSection;
  href: string;
  label: string;
  description: string;
  icon: ReactNode;
}> = [
  {
    key: "dashboard",
    href: "/admin",
    label: "Overview",
    description: "Today at a glance",
    icon: <FaHome />,
  },
  {
    key: "content",
    href: "/admin/content",
    label: "Site editor",
    description: "Pages, copy and style",
    icon: <FaFileAlt />,
  },
  {
    key: "media",
    href: "/admin/media",
    label: "Media library",
    description: "Photos, video and gallery",
    icon: <FaImages />,
  },
  {
    key: "analytics",
    href: "/admin/analytics",
    label: "Insights",
    description: "Traffic and inquiries",
    icon: <FaChartLine />,
  },
  {
    key: "security",
    href: "/admin/security",
    label: "Security",
    description: "Protection and access",
    icon: <FaShieldAlt />,
  },
];

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function getPageEditorHref(
  key: string,
  pageSlug?: string
) {
  if (key === "gallery") return "/admin/media?view=studio";
  if (key === "video" || key === "showreel") {
    return "/admin/media?view=showreel";
  }
  if (key === "music") return "/admin/content#music-links";
  if (key === "contact") return "/admin/content#booking";
  return `/admin/content#${pageSlug || "home"}`;
}

function AdminNavLink({
  item,
  active,
}: {
  item: (typeof navItems)[number];
  active: AdminSection;
}) {
  const isActive = item.key === active;

  return (
    <Link
      aria-current={isActive ? "page" : undefined}
      className={cx(
        "group flex min-h-12 items-center gap-3 rounded-2xl border px-2.5 py-2 text-left transition duration-200",
        isActive
          ? "border-white/14 bg-white/[0.1] text-white"
          : "border-transparent text-white/56 hover:border-white/8 hover:bg-white/[0.055] hover:text-white"
      )}
      href={item.href}
    >
      <span
        className={cx(
          "grid h-9 w-9 shrink-0 place-items-center rounded-xl border text-sm transition",
          isActive
            ? "border-[#ff583f]/30 bg-[#ff3b1f] text-white shadow-[0_8px_24px_rgba(255,59,31,0.22)]"
            : "border-white/8 bg-white/[0.045] text-white/48 group-hover:text-white/80"
        )}
      >
        {item.icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{item.label}</span>
        <span className="mt-0.5 block truncate text-[11px] text-white/36">
          {item.description}
        </span>
      </span>
    </Link>
  );
}

function AdminNav({ active }: { active: AdminSection }) {
  return (
    <nav aria-label="Admin navigation" className="grid gap-1">
      {navItems.map((item) => (
        <AdminNavLink active={active} item={item} key={item.key} />
      ))}
    </nav>
  );
}

function PublicPageNav({
  hiddenNavPageSlugs = [],
  portfolioType,
}: {
  hiddenNavPageSlugs?: PageSlug[];
  portfolioType?: PortfolioType;
}) {
  if (!portfolioType) return null;

  const pages = getProfilePublicModules(portfolioType);
  const hiddenSet = new Set(hiddenNavPageSlugs);
  const visibleCount = pages.filter(
    (page) => !page.pageSlug || !hiddenSet.has(page.pageSlug)
  ).length;

  return (
    <div className="mt-6">
      <div className="mb-2 flex items-center justify-between px-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/28">
          Your website
        </p>
        <span className="text-[10px] tabular-nums text-white/24">
          {visibleCount}/{pages.length} in navbar
        </span>
      </div>
      <nav aria-label="Portfolio pages" className="grid gap-0.5">
        {pages.map((page, index) => {
          const isVisible =
            !page.pageSlug || !hiddenSet.has(page.pageSlug);

          return (
            <Link
              className={cx(
                "group flex min-h-10 items-center gap-3 rounded-xl px-2.5 py-2 text-sm transition hover:bg-white/[0.05] hover:text-white",
                "text-white/52"
              )}
              href={getPageEditorHref(page.key, page.pageSlug)}
              key={`${page.key}-${page.href}`}
            >
              <span className="w-5 font-mono text-[10px] text-white/22">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="min-w-0 flex-1 truncate">{page.label}</span>
              <span
                title={isVisible ? "Shown in navbar" : "Hidden from navbar"}
                className={cx(
                  "inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-1 text-[9px] font-semibold uppercase tracking-[0.08em]",
                  isVisible
                    ? "border-emerald-300/12 bg-emerald-300/[0.055] text-emerald-100/68"
                    : "border-amber-300/14 bg-amber-300/[0.065] text-amber-100/72"
                )}
              >
                {isVisible ? <FaEye /> : <FaEyeSlash />}
                {isVisible ? "Menu" : "Hidden"}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function AccountMenu({
  adminEmail,
  portfolioType,
}: {
  adminEmail: string;
  portfolioType?: PortfolioType;
}) {
  return (
    <details className="group rounded-2xl border border-white/8 bg-black/25 p-2.5">
      <summary className="flex cursor-pointer list-none items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-xl border border-white/8 bg-white/[0.05] text-white/55">
          <FaUserCircle />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-semibold text-white/78">
            {adminEmail}
          </span>
          <span className="mt-0.5 block text-[10px] uppercase tracking-[0.14em] text-white/30">
            {portfolioType || "admin session"}
          </span>
        </span>
        <FaChevronDown className="text-[10px] text-white/35 transition group-open:rotate-180" />
      </summary>
      <div className="mt-2 border-t border-white/8 pt-2">
        <LogoutButton />
      </div>
    </details>
  );
}

export default function AdminShell({
  active,
  adminEmail,
  children,
  description,
  eyebrow = "Portfolio admin",
  hiddenNavPageSlugs = [],
  portfolioType,
  title,
}: AdminShellProps) {
  const activeItem = navItems.find((item) => item.key === active) || navItems[0];

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#070708] font-ui text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_8%_0%,rgba(255,59,31,0.14),transparent_26%),radial-gradient(circle_at_88%_8%,rgba(255,255,255,0.07),transparent_24%)]" />
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(rgba(255,255,255,0.016)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.016)_1px,transparent_1px)] bg-[size:56px_56px] opacity-60" />

      <div className="relative mx-auto flex w-full max-w-[1920px] flex-col gap-3 px-3 py-3 sm:px-4 lg:flex-row lg:gap-4 lg:p-4">
        <aside className="hidden lg:sticky lg:top-4 lg:flex lg:h-[calc(100vh-2rem)] lg:w-[276px] lg:shrink-0 lg:flex-col">
          <div className="flex h-full flex-col rounded-[26px] border border-white/9 bg-[#0d0d0f]/92 p-3 shadow-[0_28px_100px_rgba(0,0,0,0.42)] backdrop-blur-2xl">
            <Link
              className="group flex items-center gap-3 rounded-2xl px-2.5 py-2.5 transition hover:bg-white/[0.045]"
              href="/admin"
            >
              <span className="relative grid h-10 w-10 place-items-center overflow-hidden rounded-xl bg-[#ff3b1f] text-white shadow-[0_12px_32px_rgba(255,59,31,0.24)]">
                <FaMagic className="relative z-10 text-sm" />
                <span className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.32),transparent_50%)]" />
              </span>
              <span className="min-w-0">
                <span className="block text-[9px] font-semibold uppercase tracking-[0.28em] text-white/30">
                  Artist portfolio
                </span>
                <span className="mt-1 block truncate text-base font-semibold tracking-tight text-white">
                  Studio Admin
                </span>
              </span>
            </Link>

            <div className="mt-4 flex-1 overflow-y-auto pr-0.5">
              <AdminNav active={active} />
              {active !== "content" ? (
                <PublicPageNav
                  hiddenNavPageSlugs={hiddenNavPageSlugs}
                  portfolioType={portfolioType}
                />
              ) : null}
            </div>

            <div className="mt-3 grid gap-2">
              <Link
                className="flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/9 bg-white/[0.045] px-3 text-xs font-semibold text-white/62 transition hover:bg-white hover:text-black"
                href="/"
                rel="noreferrer"
                target="_blank"
              >
                <FaExternalLinkAlt className="text-[10px]" />
                Open live site
              </Link>
              <AccountMenu
                adminEmail={adminEmail}
                portfolioType={portfolioType}
              />
            </div>
          </div>
        </aside>

        <div className="lg:hidden">
          <details className="group rounded-[22px] border border-white/10 bg-[#0d0d0f]/94 p-2.5 shadow-[0_18px_60px_rgba(0,0,0,0.38)] backdrop-blur-2xl">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#ff3b1f] text-sm text-white">
                  {activeItem.icon}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">
                    {activeItem.label}
                  </p>
                  <p className="truncate text-[11px] text-white/38">
                    {adminEmail}
                  </p>
                </div>
              </div>
              <FaChevronDown className="shrink-0 text-xs text-white/45 transition group-open:rotate-180" />
            </summary>
            <div className="mt-3 border-t border-white/8 pt-3">
              <AdminNav active={active} />
              {active !== "content" ? (
                <PublicPageNav
                  hiddenNavPageSlugs={hiddenNavPageSlugs}
                  portfolioType={portfolioType}
                />
              ) : null}
              <div className="mt-3">
                <AccountMenu
                  adminEmail={adminEmail}
                  portfolioType={portfolioType}
                />
              </div>
            </div>
          </details>
        </div>

        <section className="min-w-0 flex-1">
          <header className="relative z-20 rounded-[26px] border border-white/9 bg-[#0d0d0f]/86 px-5 py-4 shadow-[0_22px_80px_rgba(0,0,0,0.34)] backdrop-blur-2xl sm:px-6 sm:py-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/34">
                    {eyebrow}
                  </span>
                  <span className="h-1 w-1 rounded-full bg-[#ff3b1f]" />
                  <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-200/55">
                    Protected
                  </span>
                  {portfolioType ? (
                    <>
                      <span className="h-1 w-1 rounded-full bg-white/18" />
                      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/34">
                        {portfolioType}
                      </span>
                    </>
                  ) : null}
                </div>
                <h1 className="heading-ui mt-2 text-3xl font-semibold tracking-[-0.035em] text-white sm:text-4xl">
                  {title}
                </h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-white/48">
                  {description}
                </p>
              </div>

              <div className="flex shrink-0 flex-wrap gap-2">
                <Link
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.045] px-3.5 text-xs font-semibold text-white/68 transition hover:bg-white hover:text-black"
                  href="/admin/media#upload"
                >
                  <FaUpload className="text-[10px]" />
                  Add media
                </Link>
                <Link
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-white px-3.5 text-xs font-semibold text-black transition hover:bg-white/84"
                  href="/"
                  rel="noreferrer"
                  target="_blank"
                >
                  Preview site
                  <FaExternalLinkAlt className="text-[10px]" />
                </Link>
              </div>
            </div>
          </header>

          <div className="mt-4 pb-20">{children}</div>
        </section>
      </div>
    </main>
  );
}
