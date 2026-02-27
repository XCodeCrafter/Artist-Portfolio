// artist-portfolio/app/video/page.tsx
import VideoHero from "@/components/VideoHero";
import NewsletterBlock from "@/components/NewsletterBlock";

type VideoCardItem = {
  title: string;
  embedUrl: string; // YouTube/Vimeo embed URL
};

const VIDEO_SETS: VideoCardItem[] = [
  { title: "LIVE DJ SET 01", embedUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ" },
  { title: "LIVE DJ SET 02", embedUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ" },
  { title: "LIVE DJ SET 03", embedUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ" },
];

function VideoCard({ item, idx }: { item: VideoCardItem; idx: number }) {
  return (
    <div
      className="overflow-hidden rounded-3xl border border-white/10 bg-white/5"
      data-reveal="up"
      data-reveal-delay={String(120 + idx * 90)}
    >
      <div className="relative aspect-video">
        <iframe
          src={item.embedUrl}
          title={item.title}
          className="absolute inset-0 h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
      </div>

      <div className="p-5">
        <h3 className="text-lg sm:text-xl font-semibold tracking-tight">
          {item.title}
        </h3>
      </div>
    </div>
  );
}

export default function VideoPage() {
  return (
    <main>
      <VideoHero
        title="VIDEOS"
        subtitle="WATCH"
        ctaLabel="SCROLL"
        ctaHref="#videos"
        backgroundSrc="/media/hero-loop.mp4"
        poster="/images/hero.jpg"
      />

      {/* Social promo block */}
      <section
        id="videos"
        className="mx-auto max-w-[1400px] px-5 sm:px-8 pt-14 sm:pt-18"
      >
        <div className="rounded-3xl border border-white/10 bg-white/5 p-7 sm:p-10">
          <h2
            className="text-3xl sm:text-5xl font-semibold tracking-tight"
            data-reveal="up"
          >
            Watch More Videos on Instagram &amp; TikTok
          </h2>

          <p
            className="mt-3 text-white/65 max-w-[820px]"
            data-reveal="up"
            data-reveal-delay="120"
          >
            More sets, behind-the-scenes moments, and sonic experiments live on my
            social channels.
          </p>

          <div
            className="mt-7 flex flex-wrap gap-3"
            data-reveal="up"
            data-reveal-delay="220"
          >
            <a
              href="https://www.instagram.com/"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-black/30 px-5 h-12 text-sm tracking-[0.22em] uppercase text-white/80 hover:text-white hover:border-white/20 transition"
            >
              Instagram
            </a>
            <a
              href="https://www.tiktok.com/"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-black/30 px-5 h-12 text-sm tracking-[0.22em] uppercase text-white/80 hover:text-white hover:border-white/20 transition"
            >
              TikTok
            </a>
          </div>
        </div>
      </section>

      {/* Video sets */}
      <section className="mx-auto max-w-[1400px] px-5 sm:px-8 py-14 sm:py-18">
        <div className="grid gap-6 lg:grid-cols-3">
          {VIDEO_SETS.map((item, idx) => (
            <VideoCard key={item.title} item={item} idx={idx} />
          ))}
        </div>
      </section>

      <div className="mt-16">
        <NewsletterBlock />
      </div>
    </main>
  );
}