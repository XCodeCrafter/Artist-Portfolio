// components/AboutHome.tsx
import Image from "next/image";
import Link from "next/link";
import ParallaxShards from "@/components/ParallaxBackdrop";

export default function AboutHome() {
  return (
    <section id="about" className="relative w-full py-16 sm:py-20 lg:py-24 overflow-hidden">
      {/* Parallax – velmi jemný, low opacity, mask */}
      <ParallaxShards
        intensity={0.7}           // 0.4–0.9 → čím nižší, tím subtilnější (zkoušej 0.5–0.7)
        className={`
          z-0 h-full
          opacity-[0.18] sm:opacity-[0.22]    // velmi jemně – jako na Niki Sadeki
          blur-[0.4px]                        // maličko soft
          mask-radial                         // mizí u krajů → klíčové pro čistý look
        `}
      />

      {/* Obsah */}
      <div className="relative z-10 mx-auto max-w-[1400px] px-5 sm:px-8">
        <div
          className={`
            grid items-center gap-10 md:gap-16
            md:grid-cols-[1fr_480px]
            lg:grid-cols-[1fr_620px]
            min-h-[560px] lg:min-h-[720px]
          `}
        >
          {/* LEFT – text */}
          <div className="max-w-[720px]">
            <h2 className="text-6xl sm:text-7xl lg:text-8xl font-semibold tracking-tight leading-[0.92] text-[var(--accent)]"
                      data-reveal="up"
                      data-reveal-delay="250"
>
              ABOUT
            </h2>

            <p className="mt-6 text-white/75 leading-relaxed max-w-xl text-lg sm:text-xl">
              {/* sem dáš svoje 2–3 věty */}
              DJ & producent z Brna. Tvořím temné, ale taneční zvuky – techno s nádechem melancholie a broken beatů. 
              Přijď na set a dostaneš filmový trip bez zbytečných slov.
            </p>

            <Link
              href="/bio"
              className="mt-8 inline-flex items-center gap-2 text-sm uppercase tracking-[0.24em] text-[var(--accent)] hover:text-white transition"
            >
              Find Out More
              <span className="h-px w-16 bg-[var(--accent)]/60" />
            </Link>
          </div>

          {/* RIGHT – fotka */}
          <div className="justify-self-end w-full max-w-[620px]">
            <div className="relative overflow-hidden rounded-3xl ring-1 ring-white/10 bg-black/40 backdrop-blur-[2px]">
              <div className="relative aspect-[3/4] lg:aspect-[4/5]">
                <Image
                  src="/images/about.jpg"   // nebo tvůj reálný obrázek
                  alt="Tvůj portrét na pódiu"
                  fill
                  priority
                  className="object-cover brightness-[0.92] contrast-[1.04]"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
                {/* malý indikátor v rohu jako na Niki */}
                <div className="absolute left-5 top-5 h-10 w-10 rounded-xl border border-white/20 bg-black/40 backdrop-blur-md flex items-center justify-center text-white/70 text-xl font-light">
                  ●
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}