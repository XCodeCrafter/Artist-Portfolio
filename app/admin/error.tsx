"use client";

import Link from "next/link";
import { useEffect } from "react";
import { FaExclamationTriangle, FaRedo } from "react-icons/fa";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Admin route failed", error);
  }, [error]);

  return (
    <main className="grid min-h-screen place-items-center bg-[#050506] px-5 text-white">
      <section className="w-full max-w-xl rounded-[28px] border border-white/12 bg-white/[0.07] p-7 shadow-[0_28px_120px_rgba(0,0,0,0.55)]">
        <FaExclamationTriangle className="text-2xl text-amber-300" />
        <p className="mt-5 text-xs font-semibold uppercase tracking-[0.2em] text-white/42">
          Admin console
        </p>
        <h1 className="heading-ui mt-2 text-3xl font-semibold">
          This workspace could not load
        </h1>
        <p className="mt-3 text-sm leading-6 text-white/55">
          Your session is still protected. Retry the request or return to the
          dashboard and check production readiness.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-black transition hover:bg-white/85"
            onClick={reset}
            type="button"
          >
            <FaRedo className="text-xs" />
            Try again
          </button>
          <Link
            className="inline-flex min-h-11 items-center rounded-xl border border-white/15 px-4 text-sm font-semibold text-white transition hover:bg-white/10"
            href="/admin"
          >
            Dashboard
          </Link>
        </div>
      </section>
    </main>
  );
}
