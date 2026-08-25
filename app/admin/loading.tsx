function SkeletonBlock({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-3xl border border-white/10 bg-white/[0.075] ${className}`}
    />
  );
}

export default function AdminLoading() {
  return (
    <main className="relative min-h-screen bg-[#050506] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_12%_10%,rgba(255,59,31,0.18),transparent_32%),radial-gradient(circle_at_76%_0%,rgba(255,255,255,0.12),transparent_28%)]" />
      <div className="relative mx-auto flex w-full max-w-[1920px] flex-col gap-3 px-3 py-3 sm:px-4 lg:flex-row lg:gap-4 lg:p-4">
        <aside className="hidden lg:block lg:w-[82px] lg:shrink-0">
          <div className="sticky top-4 h-[calc(100vh-2rem)] rounded-[26px] border border-white/12 bg-white/[0.075] p-3 backdrop-blur-2xl">
            <SkeletonBlock className="h-12 rounded-2xl" />
            <div className="mt-4 grid gap-2">
              {Array.from({ length: 5 }).map((_, index) => (
                <SkeletonBlock className="h-12 rounded-2xl" key={index} />
              ))}
            </div>
            <SkeletonBlock className="mt-5 h-12 rounded-2xl" />
          </div>
        </aside>

        <section className="min-w-0 flex-1">
          <SkeletonBlock className="h-72" />
          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <SkeletonBlock className="h-44" key={index} />
            ))}
          </div>
          <div className="mt-6 grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
            <SkeletonBlock className="h-80" />
            <SkeletonBlock className="h-80" />
          </div>
        </section>
      </div>
    </main>
  );
}
