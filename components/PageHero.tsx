//artist-portfolio/components/PageHero.tsx
import Link from "next/link";

type Props = {
  title: string;
  subtitle?: string;
  ctaText?: string;
  ctaHref?: string;
};

export default function PageHero({ title, subtitle, ctaText, ctaHref }: Props) {
  return (
    <section className="mx-auto max-w-[1400px] px-5 sm:px-8 pt-14 sm:pt-18">
      <div className="max-w-[900px]">
        <h1
          className="text-6xl sm:text-8xl font-semibold tracking-tight accent"
          data-reveal="up"
        >
          {title}
        </h1>

        {subtitle ? (
          <p
            className="mt-5 text-white/70 text-base sm:text-lg leading-relaxed"
            data-reveal="up"
            data-reveal-delay="120"
          >
            {subtitle}
          </p>
        ) : null}

        {ctaText && ctaHref ? (
          <Link
            href={ctaHref}
            className="mt-8 inline-flex items-center gap-3 text-sm sm:text-base tracking-[0.28em] uppercase text-white/70 hover:text-white transition"
            data-reveal="right"
            data-reveal-delay="220"
          >
            <span className="relative">
              {ctaText}
              <span className="absolute left-0 -bottom-2 h-[2px] w-full bg-[var(--accent)]" />
            </span>
            <span className="translate-x-0 transition-transform duration-300 hover:translate-x-1">
              →
            </span>
          </Link>
        ) : null}
      </div>
    </section>
  );
}