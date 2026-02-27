// artist-portfolio/app/music/page.tsx
import HeroCinematic from "@/components/HeroCinematic";
import MusicPlatforms_ext from "@/components/MusicPlatforms_ext";
import NewsletterBlock from "@/components/NewsletterBlock";
import SoundcloudCarousel from "@/components/SoundcloudCarousel";

type Mix = {
  title?: string;
  embedUrl: string;
};

const SPOTIFY_EMBED_URL =
  "https://open.spotify.com/embed/artist/3j6ZTLub4b9G6huqfRDIIM?theme=0";

const SOUNDCLOUD_MIXES: Mix[] = [
  {
    title: "",
    embedUrl:
      "https://api.soundcloud.com/tracks/soundcloud:tracks:247188263",
  },
  {
    title: "",
    embedUrl:
      "https://api.soundcloud.com/tracks/soundcloud:tracks:2114365833",
  },
  {
    title: "",
    embedUrl:
      "https://api.soundcloud.com/tracks/soundcloud:tracks:2189419043",
  },
  {
    title: "",
    embedUrl:
      "https://api.soundcloud.com/tracks/soundcloud:tracks:2159226369",
  },
  {
    title: "",
    embedUrl:
      "https://api.soundcloud.com/tracks/soundcloud:tracks:2120089767",
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

      <div id="music">
        <MusicPlatforms_ext />

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

          <div className="mt-8">
            <SoundcloudCarousel
              items={SOUNDCLOUD_MIXES}
              showTitles={false}   // ✅ žádný “Untitled Mix”
              autoPlay={false}     // ✅ žádný autoplay
            />
          </div>
        </section>

        <div className="mt-16">
          <NewsletterBlock />
        </div>
      </div>
    </main>
  );
}