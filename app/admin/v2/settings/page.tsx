import Link from "next/link";
import {
  FaArrowRight,
  FaCheckCircle,
  FaPalette,
  FaShieldAlt,
  FaTools,
  FaUserAlt,
} from "react-icons/fa";

export const metadata = { title: "Settings | Admin V2" };

const cardClass =
  "group rounded-[24px] border border-white/9 bg-[#101012]/94 p-5 outline-none transition hover:border-white/18 hover:bg-[#121214] focus-visible:ring-2 focus-visible:ring-white/70";

export default function AdminV2SettingsPage() {
  return (
    <div className="grid min-w-0 gap-4">
      <header className="relative overflow-hidden rounded-[26px] border border-white/9 bg-[radial-gradient(circle_at_88%_8%,rgba(255,59,31,0.17),transparent_34%),#0d0d0f] p-5 shadow-[0_22px_80px_rgba(0,0,0,0.34)] sm:p-6 lg:p-7">
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/34">
                Admin V2 · Site-wide
              </span>
              <span className="h-1 w-1 rounded-full bg-[#ff3b1f]" />
              <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-200/60">
                <FaCheckCircle /> One settings home
              </span>
            </div>
            <h1 className="heading-ui mt-3 text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl">
              Settings
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/46">
              Brand, dashboard access, protection, audit history, and technical
              checks now have one predictable home. Pick the subject; the
              implementation details can keep their dramatic monologues to
              themselves.
            </p>
          </div>
          <Link
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.045] px-4 text-xs font-semibold text-white/58 outline-none transition hover:bg-white hover:text-black focus-visible:ring-2 focus-visible:ring-white/70"
            href="/admin/v2/security"
          >
            <FaShieldAlt /> Open Security Center
          </Link>
        </div>
      </header>

      <section
        aria-labelledby="settings-destinations"
        className="rounded-[26px] border border-white/9 bg-[#0d0d0f]/88 p-4 shadow-[0_20px_70px_rgba(0,0,0,0.24)] sm:p-5"
      >
        <div className="px-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/28">
            Choose a subject
          </p>
          <h2
            className="heading-ui mt-1.5 text-xl font-semibold text-white"
            id="settings-destinations"
          >
            Site-wide settings
          </h2>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <Link className={cardClass} href="/admin/content#settings">
            <div className="flex items-start justify-between gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-2xl border border-violet-200/14 bg-violet-400/8 text-violet-100/70">
                <FaPalette />
              </span>
              <span className="rounded-full border border-white/9 px-2.5 py-1 text-[9px] uppercase tracking-[0.12em] text-white/36">
                Classic editor
              </span>
            </div>
            <h3 className="heading-ui mt-5 text-xl font-semibold text-white">
              Brand &amp; appearance
            </h3>
            <p className="mt-2 text-xs leading-5 text-white/38">
              Artist name, tagline, description, typography, and the footer
              interaction. This opens the existing editor until its V2 mirror
              is designed.
            </p>
            <span className="mt-5 inline-flex items-center gap-2 text-[11px] font-semibold text-white/48 transition group-hover:text-white">
              Edit brand <FaArrowRight className="text-[9px]" />
            </span>
          </Link>

          <Link className={cardClass} href="/admin/v2/security#access">
            <div className="flex items-start justify-between gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-2xl border border-blue-200/14 bg-blue-400/8 text-blue-100/70">
                <FaUserAlt />
              </span>
              <FaArrowRight className="mt-3 text-[10px] text-white/22 transition group-hover:translate-x-0.5 group-hover:text-white/64" />
            </div>
            <h3 className="heading-ui mt-5 text-xl font-semibold text-white">
              Admin access
            </h3>
            <p className="mt-2 text-xs leading-5 text-white/38">
              See who can enter the dashboard, review roles and MFA state, and
              manage sessions without hunting through technical checks.
            </p>
          </Link>

          <Link className={cardClass} href="/admin/v2/security#activity">
            <div className="flex items-start justify-between gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-2xl border border-[#ff674f]/18 bg-[#ff3b1f]/9 text-[#ff806c]">
                <FaShieldAlt />
              </span>
              <FaArrowRight className="mt-3 text-[10px] text-white/22 transition group-hover:translate-x-0.5 group-hover:text-white/64" />
            </div>
            <h3 className="heading-ui mt-5 text-xl font-semibold text-white">
              Protection &amp; audit
            </h3>
            <p className="mt-2 text-xs leading-5 text-white/38">
              Review blocked activity and authentication signals. The Audit Log
              remains one tab away in the same protected workspace.
            </p>
          </Link>

          <Link className={cardClass} href="/admin/v2/security#configuration">
            <div className="flex items-start justify-between gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-2xl border border-amber-200/14 bg-amber-400/8 text-amber-100/70">
                <FaTools />
              </span>
              <FaArrowRight className="mt-3 text-[10px] text-white/22 transition group-hover:translate-x-0.5 group-hover:text-white/64" />
            </div>
            <h3 className="heading-ui mt-5 text-xl font-semibold text-white">
              Technical health
            </h3>
            <p className="mt-2 text-xs leading-5 text-white/38">
              Database, storage, runtime, delivery, and protection checks live
              under Advanced. Healthy checks stay here instead of decorating
              the main dashboard like a server-room Christmas tree.
            </p>
          </Link>
        </div>
      </section>
    </div>
  );
}
