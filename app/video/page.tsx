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
        poster=""
      />

     {/* Social promo block */}
<section
  id="videos"
  className="mx-auto max-w-[1400px] px-5 sm:px-8 pt-14 sm:pt-18"
>
  <div className="rounded-3xl border border-white/10 bg-white/5 p-6 sm:p-9">
    <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="font-sans">
        <div
          className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[11px] tracking-[0.28em] uppercase text-white/70"
          data-reveal="up"
        >
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[rgba(255,59,31,0.85)]" />
          SOCIAL
        </div>

       <h2
        className="heading-ui mt-3 text-2xl sm:text-3xl text-white"
        data-reveal="up"
        data-reveal-delay="80"
        >
          More videos — short & behind the scenes
        </h2>

        <p
          className="mt-2 max-w-[720px] text-sm sm:text-base text-white/65"
          data-reveal="up"
          data-reveal-delay="140"
        >
          Extra clips, live moments, studio experiments. If it’s moving, it ends up here.
        </p>
      </div>

      <div
        className="flex flex-wrap gap-2 sm:gap-3"
        data-reveal="up"
        data-reveal-delay="220"
      >
        <a
          href="https://www.instagram.com/"
          target="_blank"
          rel="noreferrer"
          className={[
            "group inline-flex items-center gap-2 rounded-2xl",
            "border border-white/10 bg-black/25 px-4 h-11",
            "text-sm font-sans text-white/80 hover:text-white",
            "hover:border-white/20 hover:bg-black/35 transition",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25",
          ].join(" ")}
        >
          {/* simple icon */}
          <span
            aria-hidden="true"
            className="grid h-7 w-7 place-items-center rounded-xl border border-white/10 bg-white/5"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              className="opacity-80 group-hover:opacity-100 transition"
            >
              <path
                d="M7 12a5 5 0 1 0 10 0 5 5 0 0 0-10 0Z"
                stroke="currentColor"
                strokeWidth="2"
              />
              <path
                d="M16.5 7.5h.01"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
              />
              <path
                d="M3 12c0-3.8 0-5.7 1.17-6.88C5.34 4 7.23 4 11 4h2c3.77 0 5.66 0 6.83 1.12C21 6.3 21 8.2 21 12c0 3.8 0 5.7-1.17 6.88C18.66 20 16.77 20 13 20h-2c-3.77 0-5.66 0-6.83-1.12C3 17.7 3 15.8 3 12Z"
                stroke="currentColor"
                strokeWidth="2"
              />
            </svg>
          </span>

          <span className="tracking-[0.14em] uppercase text-[12px]">
            Instagram
          </span>

          <span
            aria-hidden="true"
            className="ml-1 opacity-60 group-hover:opacity-90 transition"
          >
            ↗
          </span>
        </a>

        <a
          href="https://www.tiktok.com/"
          target="_blank"
          rel="noreferrer"
          className={[
            "group inline-flex items-center gap-2 rounded-2xl",
            "border border-white/10 bg-black/25 px-4 h-11",
            "text-sm font-sans text-white/80 hover:text-white",
            "hover:border-white/20 hover:bg-black/35 transition",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25",
          ].join(" ")}
        >
          <span
            aria-hidden="true"
            className="grid h-7 w-7 place-items-center rounded-xl border border-white/10 bg-white/5"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              className="opacity-80 group-hover:opacity-100 transition"
            >
              <path
                d="M14 8V15.5a3.5 3.5 0 1 1-2.5-3.35V6h8v2h-5Z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinejoin="round"
              />
            </svg>
          </span>

          <span className="tracking-[0.14em] uppercase text-[12px]">
            TikTok
          </span>

          <span
            aria-hidden="true"
            className="ml-1 opacity-60 group-hover:opacity-90 transition"
          >
            ↗
          </span>
        </a>
      </div>
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