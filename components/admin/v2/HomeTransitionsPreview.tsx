/** Shares the public Home media masks; the text remains outside each masked layer. */
export default function HomeTransitionsPreview({ enabled }: { enabled: boolean }) {
  return <div className="p-5 sm:p-6">
    <div className="mb-4 flex items-center justify-between gap-3 text-xs text-white/55">
      <span>Background edge preview</span>
      <span className="rounded-full border border-white/15 px-3 py-1 text-[10px] font-semibold tracking-[0.14em]">{enabled ? "ON" : "OFF"}</span>
    </div>
    <div className="home-sections overflow-hidden rounded-2xl border border-white/10" data-home-transitions={enabled ? "on" : "off"} aria-label={`Home background transitions preview: ${enabled ? "on" : "off"}`}>
      {[
        { title: "On stage", label: "Live", image: "/images/home-editorial/live.webp", position: "center 42%" },
        { title: "Behind the music", label: "Studio", image: "/images/home-editorial/studio.webp", position: "center 50%" },
      ].map((panel) => <div key={panel.label} data-home-preview-section>
        <section className="relative isolate flex min-h-52 items-center overflow-hidden border-y border-white/15 px-6 py-12" data-home-transition-frame>
          <div aria-hidden="true" className="absolute inset-0 bg-cover" data-home-transition-media style={{ backgroundImage: `linear-gradient(90deg, rgba(0,0,0,.68), rgba(0,0,0,.18)), url('${panel.image}')`, backgroundPosition: panel.position }} />
          <div className="relative z-10">
            <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-white/65">{panel.label}</p>
            <h3 className="mt-2 text-2xl text-white" style={{ fontFamily: "var(--font-display)" }}>{panel.title}</h3>
          </div>
        </section>
      </div>)}
    </div>
    <p className="mt-4 text-xs leading-6 text-white/45">Sample backgrounds use the same edge treatment as Home. Text and panel positions stay fixed when you switch the effect.</p>
  </div>;
}
