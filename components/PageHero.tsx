//artist-portfolio/components/PageHero.tsx
import Link from "next/link";
import Image from "next/image";

type Props = {
  title: string;

  /**
   * Preferred prop name (newer)
   */
  subtitle?: string;

  /**
   * Backward-compatible alias (older pages)
   */
  text?: string;

  /**
   * Preferred prop name (newer)
   */
  ctaText?: string;

  /**
   * Backward-compatible alias (older pages)
   */
  ctaLabel?: string;

  ctaHref?: string;

  /**
   * Optional hero image (used by booking)
   */
  imageSrc?: string;
  imageAlt?: string;
};

export default function PageHero({
  title,
  subtitle,
  text,
  ctaText,
  ctaLabel,
  ctaHref,
  imageSrc,
  imageAlt,
}: Props) {
  const bodyText = subtitle ?? text;
  const buttonText = ctaText ?? ctaLabel;

  return (
    <section className="mx-auto max-w-[1400px] px-5 sm:px-8 pt-14 sm:pt-18">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
        {/* Left / copy */}
        <div className="lg:col-span-7 max-w-[900px]">
          <h1
            className="text-6xl sm:text-8xl font-semibold tracking-tight accent"
            data-reveal="up"
          >
            {title}
          </h1>

          {bodyText ? (
            <p
              className="mt-5 text-white/70 text-base sm:text-lg leading-relaxed"
              data-reveal="up"
              data-reveal-delay="120"
            >
              {bodyText}
            </p>
          ) : null}

          {buttonText && ctaHref ? (
            <Link
              href={ctaHref}
              className="mt-8 inline-flex items-center gap-3 text-sm sm:text-base tracking-[0.28em] uppercase text-white/70 hover:text-white transition"
              data-reveal="right"
              data-reveal-delay="220"
            >
              <span className="relative">
                {buttonText}
                <span className="absolute left-0 -bottom-2 h-[2px] w-full bg-[var(--accent)]" />
              </span>
              <span className="translate-x-0 transition-transform duration-300 hover:translate-x-1">
                →
              </span>
            </Link>
          ) : null}
        </div>

        {/* Right / image */}
        {imageSrc ? (
          <div className="lg:col-span-5">
            <div
              className="relative w-full overflow-hidden rounded-2xl border border-white/10 bg-white/5"
              style={{ aspectRatio: "4 / 5" }}
              data-reveal="up"
              data-reveal-delay="180"
            >
              <Image
                src={imageSrc}
                alt={imageAlt || `${title} image`}
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 40vw"
                className="object-cover"
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}