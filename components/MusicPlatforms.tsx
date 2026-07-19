// artist-portfolio/components/MusicPlatforms.tsx
import Image from "next/image";
import Link from "next/link";
import { FaApple, FaSpotify, FaSoundcloud } from "react-icons/fa";
import { SiBeatport } from "react-icons/si";
import type { MusicPlatformLink } from "@/lib/content";
import { FALLBACK_CONTENT } from "@/lib/content/fallback";

type Props = {
  cards?: MusicPlatformLink[];
};

function PlatformIcon({ iconKey }: { iconKey: string }) {
  if (iconKey === "spotify") return <FaSpotify />;
  if (iconKey === "soundcloud") return <FaSoundcloud />;
  if (iconKey === "apple") return <FaApple />;
  if (iconKey === "beatport") return <SiBeatport />;
  return <FaSpotify />;
}

export default function MusicPlatforms({
  cards = FALLBACK_CONTENT.musicPlatforms,
}: Props) {
  return (
    <section className="mx-auto max-w-[1400px] px-5 sm:px-8 py-14 sm:py-18">
      <div className="flex items-end justify-between gap-6">
        <h2
          className="text-5xl sm:text-7xl font-semibold tracking-tight accent"
          data-reveal="up"
          data-reveal-delay="250"
        >
          MUSIC
        </h2>

        <Link
          href="/music"
          className="group inline-flex items-center gap-3 pb-2 text-sm sm:text-base tracking-[0.28em] uppercase text-white/70 hover:text-white transition"
          data-reveal="right"
          data-reveal-delay="120"
        >
          <span className="relative">
            View All Music
            <span className="absolute left-0 -bottom-2 h-[2px] w-0 bg-[var(--accent)] transition-all duration-300 group-hover:w-full" />
          </span>
          <span className="translate-x-0 transition-transform duration-300 group-hover:translate-x-1">
            -&gt;
          </span>
        </Link>
      </div>

      <div className="mt-8 grid gap-5 lg:grid-cols-4">
        {cards.map((c, idx) => (
          <a
            key={c.id}
            href={c.href}
            target="_blank"
            rel="noreferrer"
            className="group relative overflow-hidden rounded-3xl border border-white/10 bg-white/5"
            data-reveal="up"
            data-reveal-delay={String(120 + idx * 90)}
          >
            <div className="absolute right-4 top-4 z-10 flex h-12 w-12 items-center justify-center rounded-xl border border-white/15 bg-black/40 text-white/80 backdrop-blur">
              <span className="text-[20px] leading-none transition-transform duration-300 group-hover:scale-110">
                <PlatformIcon iconKey={c.iconKey} />
              </span>
            </div>

            <div className="relative aspect-[4/3]">
              <Image
                src={c.imageSrc}
                alt={c.title}
                fill
                className="object-cover opacity-90 transition duration-500 group-hover:scale-[1.02] group-hover:opacity-100"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-black/10" />
            </div>

            <div className="absolute inset-x-0 bottom-0 p-6 text-center">
              <div className="text-white/75">{c.label}</div>
              <div className="mt-1 text-3xl font-semibold tracking-tight">
                {c.title}
              </div>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}
