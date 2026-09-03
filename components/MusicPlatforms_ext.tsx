// artist-portfolio/components/MusicPlatforms_ext.tsx
import Image from "next/image";
import SocialPlatformIcon from "@/components/SocialPlatformIcon";
import type { MusicPlatformLink } from "@/lib/content";
import { FALLBACK_CONTENT } from "@/lib/content/fallback";

type Props = {
  cards?: MusicPlatformLink[];
  interactionMode?: "public" | "preview";
};

export default function MusicPlatformsExt({
  cards = FALLBACK_CONTENT.musicPlatforms,
  interactionMode = "public",
}: Props) {
  return (
    <section
      className="public-nav-anchor mx-auto max-w-[1400px] px-5 py-14 sm:px-8 sm:py-18"
      id="music-platforms"
    >
      <div className="grid gap-5 lg:grid-cols-4">
        {cards.map((c, idx) => {
          const cardContent = (
            <>
              <div className="absolute right-4 top-4 z-10 flex h-12 w-12 items-center justify-center rounded-xl border border-white/15 bg-black/40 text-white/80 backdrop-blur">
                <span className="text-[20px] leading-none transition-transform duration-300 group-hover:scale-110">
                  <SocialPlatformIcon
                    href={c.href}
                    iconKey={c.iconKey}
                    label={c.label || c.title}
                  />
                </span>
              </div>

              <div className="relative aspect-[4/3]">
                {c.imageSrc ? (
                  <Image
                    src={c.imageSrc}
                    alt={c.title}
                    fill
                    className="object-cover opacity-90 transition duration-500 group-hover:scale-[1.02] group-hover:opacity-100"
                  />
                ) : (
                  <div
                    aria-hidden="true"
                    className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,59,31,0.24),transparent_42%),linear-gradient(145deg,#171719,#080809)]"
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-black/10" />
              </div>

              <div className="absolute inset-x-0 bottom-0 p-6 text-center">
                <div className="text-white/75">{c.label}</div>
                <div className="mt-1 text-3xl font-semibold tracking-tight">
                  {c.title}
                </div>
              </div>
            </>
          );
          const cardClassName =
            "group relative overflow-hidden rounded-3xl border border-white/10 bg-white/5";
          const revealDelay = String(120 + idx * 90);

          if (interactionMode === "preview") {
            return (
              <div
                key={c.id}
                className={cardClassName}
                data-reveal="up"
                data-reveal-delay={revealDelay}
              >
                {cardContent}
              </div>
            );
          }

          return (
            <a
              key={c.id}
              href={c.href}
              target="_blank"
              rel="noreferrer"
              className={cardClassName}
              data-reveal="up"
              data-reveal-delay={revealDelay}
            >
              {cardContent}
            </a>
          );
        })}
      </div>
    </section>
  );
}
