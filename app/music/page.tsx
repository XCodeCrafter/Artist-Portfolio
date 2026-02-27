//artist-portfolio/app/music/page.tsx
import HeroCinematic from "@/components/HeroCinematic";
import MusicPlatforms from "@/components/MusicPlatforms";
import NewsletterBlock from "@/components/NewsletterBlock";

type Mix = {
  title: string;
  embedUrl: string; // SoundCloud iframe src
};

const SPOTIFY_EMBED_URL =
  "https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M?utm_source=generator"; // TODO: replace

const SOUNDCLOUD_MIXES: Mix[] = [
  {
    title: "Live @ KaterBlau (Berlin) | Acid Bogen",
    embedUrl:
      "https://w.soundcloud.com/player/?url=https%3A//api.soundcloud.com/tracks/308020520&color=%23ff5500&auto_play=false&hide_related=false&show_comments=true&show_user=true&show_reposts=false&show_teaser=true&visual=true",
  },
  {
    title: "Fusion Festival 2024 | Palapa Stage",
    embedUrl:
      "https://w.soundcloud.com/player/?url=https%3A//api.soundcloud.com/tracks/308020520&color=%23ff5500&auto_play=false&hide_related=false&show_comments=true&show_user=true&show_reposts=false&show_teaser=true&visual=true",
  },
  {
    title: "47 Katzen tanzen auf’m Tisch",
    embedUrl:
      "https://w.soundcloud.com/player/?url=https%3A//api.soundcloud.com/tracks/308020520&color=%23ff5500&auto_play=false&hide_related=false&show_comments=true&show_user=true&show_reposts=false&show_teaser=true&visual=true",
  },
];

export default function MusicPage() {
  return (
    <main>
      <HeroCinematic
        title="MUSIC"
        subtitle="LISTEN"
        ctaLabel="SCROLL"
        ctaHref="#music"
        backgroundSrc="/images/music-hero.jpg"
      />

      {/* Platforms row */}
      <MusicPlatforms />

      {/* LATEST RELEASES */}
      <section className="mx-auto max-w-[1400px] px-5 sm:px-8 py-14 sm:py-18">
        <h2
          className="text-5xl sm:text-7xl font-semibold tracking-tight text-white"
          data-reveal="up"
        >
          LATEST RELEASES
        </h2>

        <div
          className="mt-8 overflow-hidden rounded-3xl border border-white/10 bg-white/5"
          data-reveal="up"
          data-reveal-delay="140"
        >
          <div className="relative h-[520px]">
            <iframe
              src={SPOTIFY_EMBED_URL}
              title="Spotify Releases"
              className="absolute inset-0 h-full w-full"
              allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
              loading="lazy"
            />
          </div>
        </div>
      </section>

      {/* LATEST MIXES */}
      <section className="mx-auto max-w-[1400px] px-5 sm:px-8 pb-18">
        <h2
          className="text-5xl sm:text-7xl font-semibold tracking-tight text-white"
          data-reveal="up"
        >
          LATEST MIXES
        </h2>

        <div className="mt-8 grid gap-5 lg:grid-cols-3">
          {SOUNDCLOUD_MIXES.map((m, idx) => (
            <div
              key={m.title}
              className="overflow-hidden rounded-3xl border border-white/10 bg-white/5"
              data-reveal="up"
              data-reveal-delay={String(120 + idx * 90)}
            >
              <div className="relative h-[340px]">
                <iframe
                  src={m.embedUrl}
                  title={m.title}
                  className="absolute inset-0 h-full w-full"
                  allow="autoplay"
                  loading="lazy"
                />
              </div>
              <div className="p-5 text-white/75 text-sm">{m.title}</div>
            </div>
          ))}
        </div>
      </section>

      {/* NEWSLETTER */}
      <div className="mt-16">
  <NewsletterBlock />
</div>
    </main>
  );
}