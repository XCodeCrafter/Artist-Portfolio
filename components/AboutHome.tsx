// components/AboutHome.tsx
import Image from "next/image";
import type { AboutHomeContent } from "@/lib/content";
import { FALLBACK_CONTENT } from "@/lib/content/fallback";
import HomeSectionCta, {
  homeSectionHeadingClass,
} from "@/components/HomeSectionCta";
import ParallaxShards from "@/components/ParallaxBackdrop";

type Props = {
  content?: AboutHomeContent;
};

export default function AboutHome({
  content = FALLBACK_CONTENT.aboutHome,
}: Props) {
  return (
    <section
      id="home-about"
      className="public-nav-anchor relative w-full overflow-hidden py-16 sm:py-20 lg:py-24"
    >
      <ParallaxShards
        intensity={0.7}
        className="
          z-0 h-full
          opacity-[0.18] sm:opacity-[0.22]
          blur-[0.4px]
          mask-radial
        "
      />

      <div className="relative z-10 mx-auto max-w-[1400px] px-5 sm:px-8">
        <div
          className="
            grid min-h-[560px] items-center gap-10
            md:grid-cols-[1fr_480px] md:gap-16
            lg:min-h-[720px] lg:grid-cols-[1fr_620px]
          "
        >
          <div className="max-w-[720px]">
            <h2
              className={`${homeSectionHeadingClass} text-[var(--accent)]`}
              data-reveal="up"
              data-reveal-delay="250"
            >
              {content.heading}
            </h2>

            <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/75 sm:text-xl">
              {content.body}
            </p>

            <HomeSectionCta
              className="mt-9"
              href={content.ctaHref}
              label={content.ctaLabel}
            />
          </div>

          <div className="w-full max-w-[620px] justify-self-end">
            <div className="relative overflow-hidden rounded-3xl bg-black/40 ring-1 ring-white/10 backdrop-blur-[2px]">
              <div className="relative aspect-[3/4] lg:aspect-[4/5]">
                <Image
                  src={content.imageSrc || "/images/about.jpg"}
                  alt={content.imageAlt}
                  fill
                  priority
                  sizes="(max-width: 767px) calc(100vw - 40px), (max-width: 1023px) 480px, 620px"
                  className="object-cover brightness-[0.92] contrast-[1.04]"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
                <div className="absolute left-5 top-5 flex h-10 w-10 items-center justify-center rounded-xl border border-white/20 bg-black/40 text-xl font-light text-white/70 backdrop-blur-md">
                  *
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
