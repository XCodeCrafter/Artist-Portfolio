//artist-portfolio/components/MusicPlatforms_ext.tsx
import Image from "next/image";
import { FaSpotify, FaSoundcloud, FaApple } from "react-icons/fa";
import { SiBeatport } from "react-icons/si";

type Card = {
  title: string;
  label: string;
  href: string;
  icon: React.ReactNode;
  image: string;
};

const CARDS: Card[] = [
  {
    title: "BEATPORT",
    label: "",
    href: "https://beatport.com",
    icon: <SiBeatport />,
    image: "/images/music-1.jpg",
  },
  {
    title: "SPOTIFY",
    label: "",
    href: "https://spotify.com",
    icon: <FaSpotify />,
    image: "/images/music-2.jpg",
  },
  {
    title: "SOUNDCLOUD",
    label: "",
    href: "https://soundcloud.com",
    icon: <FaSoundcloud />,
    image: "/images/music-3.jpg",
  },
  {
    title: "APPLE MUSIC",
    label: "",
    href: "https://music.apple.com",
    icon: <FaApple />,
    image: "/images/music-4.jpg",
  },
];

export default function MusicPlatforms() {
  return (
    <section className="mx-auto max-w-[1400px] px-5 sm:px-8 py-14 sm:py-18">
      <div className="grid gap-5 lg:grid-cols-4">
        {CARDS.map((c, idx) => (
          <a
            key={c.title}
            href={c.href}
            target="_blank"
            rel="noreferrer"
            className="group relative overflow-hidden rounded-3xl border border-white/10 bg-white/5"
            data-reveal="up"
            data-reveal-delay={String(120 + idx * 90)}
          >
            <div className="absolute right-4 top-4 z-10 flex h-12 w-12 items-center justify-center rounded-xl border border-white/15 bg-black/40 text-white/80 backdrop-blur">
              <span className="text-[20px] leading-none transition-transform duration-300 group-hover:scale-110">
                {c.icon}
              </span>
            </div>

            <div className="relative aspect-[4/3]">
              <Image
                src={c.image}
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