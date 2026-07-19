import Link from "next/link";
import type { ReactNode } from "react";
import {
  FaChartLine,
  FaChevronDown,
  FaEnvelope,
  FaExternalLinkAlt,
  FaFileAlt,
  FaHome,
  FaImages,
  FaMagic,
  FaShieldAlt,
  FaUpload,
  FaUserCircle,
} from "react-icons/fa";
import LogoutButton from "@/components/admin/LogoutButton";

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
  portfolioType?: string;
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
    label: "Dashboard",
    description: "Overview and health",
    icon: <FaHome />,
  },
  {
    key: "content",
    href: "/admin/content",
    label: "Content",
    description: "Pages and copy",
    icon: <FaFileAlt />,
  },
  {
    key: "media",
    href: "/admin/media",
    label: "Media",
    description: "Photos and video",
    icon: <FaImages />,
  },
  {
    key: "analytics",
    href: "/admin/analytics",
    label: "Analytics",
    description: "Traffic and inquiries",
    icon: <FaChartLine />,
  },
  {
    key: "security",
    href: "/admin/security",
    label: "Security",
    description: "Access and threats",
    icon: <FaShieldAlt />,
  },
];

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
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
        "group relative flex min-h-14 items-center gap-3 overflow-hidden rounded-2xl border px-3 py-3 text-left transition duration-300",
        isActive
          ? "border-white/20 bg-white/[0.14] text-white shadow-[0_18px_55px_rgba(255,59,31,0.13)]"
          : "border-transparent text-white/58 hover:border-white/12 hover:bg-white/[0.08] hover:text-white"
      )}
      href={item.href}
    >
      <span
        className={cx(
          "relative z-10 grid h-10 w-10 shrink-0 place-items-center rounded-2xl border text-base transition",
          isActive
            ? "border-white/20 bg-white text-black"
            : "border-white/10 bg-white/[0.06] text-white/60 group-hover:text-white"
        )}
      >
        {item.icon}
      </span>
      <span className="relative z-10 min-w-0">
        <span className="block text-sm font-semibold">{item.label}</span>
        <span className="mt-0.5 block truncate text-xs text-white/42">
          {item.description}
        </span>
      </span>
      {isActive ? (
        <span className="pointer-events-none absolute inset-y-2 right-2 w-1 rounded-full bg-[#ff3b1f] shadow-[0_0_28px_rgba(255,59,31,0.75)]" />
      ) : null}
    </Link>
  );
}

function AdminNav({ active }: { active: AdminSection }) {
  return (
    <nav aria-label="Admin navigation" className="grid gap-1.5">
      {navItems.map((item) => (
        <AdminNavLink active={active} item={item} key={item.key} />
      ))}
    </nav>
  );
}

export default function AdminShell({
  active,
  adminEmail,
  children,
  description,
  eyebrow = "Admin Console",
  portfolioType,
  title,
}: AdminShellProps) {
  const activeItem = navItems.find((item) => item.key === active) || navItems[0];

  return (
    <main className="relative min-h-screen bg-[#050506] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_12%_10%,rgba(255,59,31,0.22),transparent_32%),radial-gradient(circle_at_76%_0%,rgba(255,255,255,0.14),transparent_28%),linear-gradient(135deg,rgba(255,255,255,0.06),transparent_38%)]" />
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:72px_72px] opacity-35" />

      <div className="relative mx-auto flex w-full max-w-[1800px] flex-col gap-5 px-4 py-4 sm:px-6 lg:flex-row lg:p-6">
        <aside className="hidden lg:sticky lg:top-6 lg:flex lg:h-[calc(100vh-3rem)] lg:w-[300px] lg:shrink-0 lg:flex-col">
          <div className="flex h-full flex-col rounded-[30px] border border-white/12 bg-white/[0.075] p-4 shadow-[0_28px_120px_rgba(0,0,0,0.55)] backdrop-blur-2xl">
            <Link
              className="group flex items-center gap-3 rounded-3xl border border-white/10 bg-black/25 p-3 transition hover:bg-white/[0.07]"
              href="/admin"
            >
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white text-black shadow-[0_14px_45px_rgba(255,255,255,0.18)]">
                <FaMagic />
              </span>
              <span className="min-w-0">
                <span className="block text-[11px] font-semibold uppercase tracking-[0.28em] text-white/45">
                  Portfolio
                </span>
                <span className="mt-1 block truncate text-lg font-semibold tracking-tight text-white">
                  Control
                </span>
              </span>
            </Link>

            <div className="mt-5 flex-1 overflow-y-auto pr-1">
              <AdminNav active={active} />
            </div>

            <details className="group mt-5 rounded-3xl border border-white/10 bg-black/25 p-3">
              <summary className="flex cursor-pointer list-none items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-2xl border border-white/10 bg-white/[0.07] text-white/70">
                  <FaUserCircle />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-white">
                    {adminEmail}
                  </span>
                  <span className="mt-0.5 block text-xs text-white/42">
                    {portfolioType || "admin session"}
                  </span>
                </span>
                <FaChevronDown className="text-xs text-white/45 transition group-open:rotate-180" />
              </summary>
              <div className="mt-3 border-t border-white/10 pt-3">
                <LogoutButton />
              </div>
            </details>
          </div>
        </aside>

        <div className="lg:hidden">
          <details className="group rounded-[26px] border border-white/12 bg-white/[0.08] p-3 shadow-[0_18px_70px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white text-black">
                  {activeItem.icon}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">
                    {activeItem.label}
                  </p>
                  <p className="truncate text-xs text-white/45">{adminEmail}</p>
                </div>
              </div>
              <FaChevronDown className="shrink-0 text-sm text-white/55 transition group-open:rotate-180" />
            </summary>
            <div className="mt-4 border-t border-white/10 pt-3">
              <AdminNav active={active} />
              <div className="mt-3">
                <LogoutButton />
              </div>
            </div>
          </details>
        </div>

        <section className="min-w-0 flex-1">
          <header className="rounded-[30px] border border-white/12 bg-white/[0.075] p-5 shadow-[0_28px_120px_rgba(0,0,0,0.45)] backdrop-blur-2xl sm:p-6 lg:p-7">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-white/12 bg-white/[0.06] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/48">
                    {eyebrow}
                  </span>
                  {portfolioType ? (
                    <span className="rounded-full border border-[#ff3b1f]/25 bg-[#ff3b1f]/12 px-3 py-1 text-xs font-semibold text-[#ffb3a6]">
                      {portfolioType}
                    </span>
                  ) : null}
                </div>
                <h1 className="heading-ui mt-4 text-4xl font-semibold tracking-tight text-white sm:text-5xl lg:text-6xl">
                  {title}
                </h1>
                <p className="mt-4 max-w-3xl text-sm leading-6 text-white/56 sm:text-base">
                  {description}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:min-w-[360px]">
                <div className="rounded-3xl border border-white/10 bg-black/22 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/38">
                    Signed in
                  </p>
                  <p className="mt-2 truncate text-sm font-semibold text-white">
                    {adminEmail}
                  </p>
                </div>
                <div className="rounded-3xl border border-emerald-300/15 bg-emerald-400/[0.08] p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-100/55">
                    Status
                  </p>
                  <p className="mt-2 text-sm font-semibold text-emerald-100">
                    Protected session
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 sm:col-span-2">
                  <Link
                    className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/12 bg-white/[0.06] px-3 text-sm font-semibold text-white/72 transition hover:bg-white hover:text-black"
                    href="/"
                    rel="noreferrer"
                    target="_blank"
                  >
                    <FaExternalLinkAlt className="text-xs" />
                    View site
                  </Link>
                  <Link
                    className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/12 bg-white/[0.06] px-3 text-sm font-semibold text-white/72 transition hover:bg-white hover:text-black"
                    href="/admin/media#upload"
                  >
                    <FaUpload className="text-xs" />
                    Upload media
                  </Link>
                  <Link
                    className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/12 bg-white/[0.06] px-3 text-sm font-semibold text-white/72 transition hover:bg-white hover:text-black"
                    href="/admin/analytics#inquiries"
                  >
                    <FaEnvelope className="text-xs" />
                    Inquiries
                  </Link>
                </div>
              </div>
            </div>
          </header>

          <div className="mt-6 pb-24">{children}</div>
        </section>
      </div>
    </main>
  );
}
