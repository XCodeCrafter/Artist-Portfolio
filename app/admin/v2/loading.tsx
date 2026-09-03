export default function AdminV2Loading() {
  return (
    <div
      aria-label="Loading Admin V2"
      className="grid min-h-[55vh] animate-pulse place-items-center rounded-[26px] border border-white/9 bg-[#0f0f11]/86 p-8 motion-reduce:animate-none"
      role="status"
    >
      <div className="text-center">
        <span className="mx-auto block h-10 w-10 rounded-xl bg-[#ff3b1f]/70" />
        <span className="mt-4 block text-xs font-semibold uppercase tracking-[0.2em] text-white/35">
          Loading workspace
        </span>
      </div>
    </div>
  );
}
