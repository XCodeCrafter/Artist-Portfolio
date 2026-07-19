"use client";

import { useEffect } from "react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="grid min-h-[70svh] place-items-center px-5 py-28">
      <div className="max-w-xl text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--accent)]">
          Something went wrong
        </p>
        <h1 className="mt-5 text-4xl font-semibold text-white sm:text-6xl">
          The page could not be loaded.
        </h1>
        <p className="mt-5 text-base leading-7 text-white/58">
          Please try the request again. No changes were made by this screen.
        </p>
        <button
          className="mt-8 inline-flex h-11 items-center justify-center rounded-full bg-white px-5 text-sm font-semibold text-black transition hover:bg-white/85"
          onClick={reset}
          type="button"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
