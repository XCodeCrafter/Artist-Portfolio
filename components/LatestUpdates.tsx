//artist-portfolio\components\LatestUpdates.tsx
import Image from "next/image";

type Update = {
  id: string;
  text: string;
  linkLabel?: string;
  href?: string;
  avatarSrc: string;
};

const UPDATES: Update[] = [
  {
    id: "u1",
    text: "My latest track is out now",
    linkLabel: "Listen here",
    href: "https://spotify.com",
    avatarSrc: "/images/avatar-1.jpg",
  },
  {
    id: "u2",
    text: "Known for atmospheric and melodic productions.",
    avatarSrc: "/images/avatar-2.jpg",
  },
  {
    id: "u3",
    text: "Blends indie, rock, and progressive sounds.",
    avatarSrc: "/images/avatar-3.jpg",
  },
  {
    id: "u4",
    text: "Plays at clubs and events worldwide.",
    avatarSrc: "/images/avatar-4.jpg",
  },
];

export default function LatestUpdates() {
  return (
    <section className="mx-auto max-w-[1400px] px-5 sm:px-8 py-14 sm:py-18">
      <div className="grid gap-8 lg:grid-cols-[520px,1fr] items-start">
        <div className="justify-self-center lg:justify-self-start">
          <div className="relative w-full max-w-[520px] overflow-hidden rounded-3xl border border-white/10 bg-black/40">
            <div className="relative aspect-[4/5]">
              <Image
                src="/images/updates.jpg"
                alt="Latest updates image"
                fill
                sizes="(max-width: 1024px) 100vw, 520px"
                className="object-cover opacity-95"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/10" />
            </div>
          </div>
        </div>

        <div>
          <h2 className="text-4xl sm:text-6xl font-semibold tracking-tight accent"
                    data-reveal="up"
                    data-reveal-delay="250">
            LATEST UPDATES
          </h2>

          <div className="mt-7 space-y-4">
            {UPDATES.map((u) => (
              <div
                key={u.id}
                className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/5 px-5 py-4 backdrop-blur"
              >
                <div className="relative h-12 w-12 overflow-hidden rounded-full border border-white/10">
                  <Image src={u.avatarSrc} alt="" fill className="object-cover" />
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

          <a
            href="/music"
            className="mt-8 inline-flex text-sm tracking-[0.22em] text-[var(--accent)] hover:text-white transition"
          >
            <span className="relative">
              LISTEN NOW
              <span className="absolute -bottom-2 left-0 h-px w-full bg-[rgba(255,59,31,0.75)]" />
            </span>
          </a>
        </div>
      </div>
    </section>
  );
}
