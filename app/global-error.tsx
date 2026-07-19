"use client";

export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html lang="en">
      <body className="grid min-h-screen place-items-center bg-black px-5 text-white">
        <div className="max-w-xl text-center">
          <p>Something went wrong while loading the portfolio.</p>
          <button
            className="mt-6 rounded-full bg-white px-5 py-3 font-semibold text-black"
            onClick={reset}
            type="button"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
