// artist-portfolio/components/LatestUpdates.tsx
import Image from "next/image";
import type { HomeUpdate } from "@/lib/content";
import { FALLBACK_CONTENT } from "@/lib/content/fallback";
import HomeSectionCta, {
  homeSectionHeadingClass,
} from "@/components/HomeSectionCta";

type Props = {
  updates?: HomeUpdate[];
  imageSrc?: string;
  ctaHref?: string;
  ctaLabel?: string;
  heading?: string;
  imageAlt?: string;
};

export default function LatestUpdates({
  updates = FALLBACK_CONTENT.homeUpdates,
  imageSrc = "/images/updates.jpg",
  ctaHref = "/music",
  ctaLabel = "LISTEN NOW",
  heading = "LATEST UPDATES",
  imageAlt = "Latest updates image",
}: Props) {
  return (
    <section className="mx-auto max-w-[1400px] px-5 sm:px-8 py-14 sm:py-18">
      <div className="grid gap-8 lg:grid-cols-[520px,1fr] items-start">
        <div className="justify-self-center lg:justify-self-start">
          <div className="relative w-full max-w-[520px] overflow-hidden rounded-3xl border border-white/10 bg-black/40">
            <div
              className="relative aspect-[4/5]"
              style={{ position: "relative", aspectRatio: "4 / 5" }}
            >
              <Image
                src={imageSrc}
                alt={imageAlt}
                fill
                sizes="(max-width: 1024px) 100vw, 520px"
                className="object-cover opacity-95"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/10" />
            </div>
          </div>
        </div>

        <div>
          <h2
            className={`${homeSectionHeadingClass} text-[var(--accent)]`}
            data-reveal="up"
            data-reveal-delay="250"
          >
            {heading}
          </h2>

          <div className="mt-7 space-y-4">
            {updates.map((u) => (
              <div
                key={u.id}
                className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/5 px-5 py-4 backdrop-blur"
              >
                <div className="relative h-12 w-12 overflow-hidden rounded-full border border-white/10">
                  <Image
                    alt=""
                    className="object-cover"
                    fill
                    sizes="48px"
                    src={u.avatarSrc}
                  />
                </div>

                <div className="text-white/80">
                  <span>{u.text}</span>
                  {u.href && u.linkLabel ? (
                    <>
                      {" "}
                      <a
                        className="underline underline-offset-4 text-white hover:text-[var(--accent)] transition"
                        href={u.href}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {u.linkLabel}
                      </a>
                    </>
                  ) : null}
                </div>
              </div>
            ))}
          </div>

          <HomeSectionCta
            className="mt-9"
            href={ctaHref}
            label={ctaLabel}
          />
        </div>
      </div>
    </section>
  );
}
