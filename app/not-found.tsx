import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center px-5 py-28">
      <div className="max-w-2xl text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--accent)]">
          404 / Page not found
        </p>
        <h1 className="mt-5 text-5xl font-semibold text-white sm:text-7xl">
          This frame is not in the archive.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-white/58">
          The page may have moved or the link may be incomplete.
        </p>
        <Link
          className="mt-8 inline-flex h-11 items-center justify-center rounded-full border border-white/15 bg-white px-5 text-sm font-semibold text-black transition hover:bg-white/85"
          href="/"
        >
          Return home
        </Link>
      </div>
    </main>
  );
}
