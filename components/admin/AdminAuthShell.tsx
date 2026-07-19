import Image from "next/image";
import Link from "next/link";
import { FaArrowLeft, FaLock, FaShieldAlt } from "react-icons/fa";

type AdminAuthShellProps = {
  brandName: string;
  imageSrc: string;
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
};

export default function AdminAuthShell({
  brandName,
  imageSrc,
  eyebrow,
  title,
  description,
  children,
}: AdminAuthShellProps) {
  return (
    <main className="relative min-h-[100svh] overflow-hidden bg-[#090909] text-white">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_76%_16%,rgba(255,59,31,0.11),transparent_24%),radial-gradient(circle_at_100%_100%,rgba(255,255,255,0.05),transparent_30%)]"
      />

      <div className="relative mx-auto grid min-h-[100svh] max-w-[1600px] lg:grid-cols-[minmax(0,1.12fr)_minmax(500px,0.88fr)]">
        <aside className="relative hidden min-h-[100svh] overflow-hidden border-r border-white/10 lg:flex lg:flex-col lg:justify-between">
          <Image
            alt=""
            aria-hidden="true"
            className="object-cover object-center grayscale"
            fill
            priority
            sizes="(min-width: 1024px) 60vw, 0px"
            src={imageSrc}
          />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,5,5,0.3)_0%,rgba(5,5,5,0.12)_32%,rgba(5,5,5,0.86)_100%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,5,5,0.1),rgba(5,5,5,0.48))]" />
          <div className="absolute inset-0 opacity-25 [background-image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:96px_96px] [mask-image:linear-gradient(to_bottom,black,transparent_72%)]" />

          <div className="relative z-10 flex items-center gap-3 p-8 xl:p-12">
            <span className="grid h-11 w-11 place-items-center rounded-full border border-white/20 bg-black/30 text-sm font-semibold backdrop-blur-md">
              {brandName.trim().charAt(0).toUpperCase() || "A"}
            </span>
            <div>
              <p className="heading-ui text-sm font-semibold tracking-tight">
                {brandName}
              </p>
              <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.24em] text-white/48">
                Private studio
              </p>
            </div>
          </div>

          <div className="relative z-10 max-w-3xl p-8 xl:p-12 xl:pb-14">
            <p className="mb-6 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/58">
              <span className="h-px w-9 bg-[var(--accent)]" />
              Your creative control room
            </p>
            <p className="heading-ui max-w-2xl text-5xl font-semibold leading-[0.94] tracking-[-0.045em] text-white xl:text-7xl">
              Shape the work.
              <br />
              <span className="text-white/55">Own the story.</span>
            </p>

            <div className="mt-10 flex max-w-md items-center gap-4 border-t border-white/16 pt-5 text-xs leading-5 text-white/52">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/15 bg-black/25 backdrop-blur-md">
                <FaShieldAlt aria-hidden="true" className="text-[11px] text-white/75" />
              </span>
              Secure access for managing content, media, inquiries and analytics.
            </div>
          </div>
        </aside>

        <section className="relative flex min-h-[100svh] flex-col px-5 py-5 sm:px-9 sm:py-7 lg:px-12 xl:px-20">
          <header className="flex items-center justify-between gap-5">
            <div className="flex items-center gap-3 lg:hidden">
              <span className="grid h-10 w-10 place-items-center rounded-full border border-white/14 bg-white/[0.06] text-sm font-semibold">
                {brandName.trim().charAt(0).toUpperCase() || "A"}
              </span>
              <div>
                <p className="heading-ui max-w-[160px] truncate text-sm font-semibold">
                  {brandName}
                </p>
                <p className="text-[9px] uppercase tracking-[0.22em] text-white/38">
                  Private studio
                </p>
              </div>
            </div>

            <Link
              className="group ml-auto inline-flex min-h-11 items-center gap-2 rounded-full border border-white/10 px-4 text-xs font-semibold text-white/58 transition duration-300 hover:border-white/20 hover:bg-white/[0.05] hover:text-white"
              href="/"
            >
              <FaArrowLeft
                aria-hidden="true"
                className="text-[10px] transition-transform duration-300 group-hover:-translate-x-0.5"
              />
              View portfolio
            </Link>
          </header>

          <div className="flex flex-1 items-center justify-center py-12 sm:py-16">
            <div className="w-full max-w-[470px]">
              <span className="relative grid h-12 w-12 place-items-center rounded-2xl border border-white/12 bg-white/[0.07] shadow-[0_18px_50px_rgba(0,0,0,0.28)]">
                <FaLock aria-hidden="true" className="text-sm text-white/82" />
                <span className="absolute right-0 top-0 h-2.5 w-2.5 -translate-y-1/4 translate-x-1/4 rounded-full border-2 border-[#090909] bg-emerald-400" />
              </span>

              <p className="mt-7 text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--accent)]">
                {eyebrow}
              </p>
              <h1 className="heading-ui mt-3 text-[2.6rem] font-semibold leading-[1.02] tracking-[-0.04em] text-white sm:text-[3.4rem]">
                {title}
              </h1>
              <p className="mt-4 max-w-md text-sm leading-6 text-white/52">
                {description}
              </p>

              {children}
            </div>
          </div>

          <footer className="flex items-center justify-center gap-2 text-[10px] font-medium uppercase tracking-[0.18em] text-white/28 sm:justify-start">
            <FaShieldAlt aria-hidden="true" className="text-[9px]" />
            Protected admin workspace
          </footer>
        </section>
      </div>
    </main>
  );
}
