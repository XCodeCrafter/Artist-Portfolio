//artist-portfolio\components\SocialRail.tsx
"use client";

import {
  FaInstagram,
  FaSpotify,
  FaSoundcloud,
  FaYoutube,
  FaBandcamp,
  FaApple,
} from "react-icons/fa";

type Item = {
  label: string;
  href: string;
  icon: React.ReactNode;
};

const SOCIALS: Item[] = [
  { label: "Instagram", href: "https://instagram.com", icon: <FaInstagram /> },
  { label: "Spotify", href: "https://spotify.com", icon: <FaSpotify /> },
  { label: "SoundCloud", href: "https://soundcloud.com", icon: <FaSoundcloud /> },
  { label: "YouTube", href: "https://youtube.com", icon: <FaYoutube /> },
  { label: "Bandcamp", href: "https://bandcamp.com", icon: <FaBandcamp /> },
  { label: "Apple Music", href: "https://music.apple.com", icon: <FaApple /> },
];

export default function SocialRail() {
  return (
    <aside className="fixed left-4 sm:left-6 top-1/2 -translate-y-1/2 z-40">
      <div className="flex flex-col gap-3">
        {SOCIALS.map((s) => (
          <a
            key={s.label}
            href={s.href}
            target="_blank"
            rel="noreferrer"
            aria-label={s.label}
            title={s.label}
            className="group flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-black/40 text-white/70 backdrop-blur transition hover:bg-white/10 hover:text-white"
          >
            <span className="text-lg transition group-hover:scale-110">
              {s.icon}
            </span>
          </a>
        ))}
      </div>
    </aside>
  );
}
