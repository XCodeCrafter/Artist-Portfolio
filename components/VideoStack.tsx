//artist-portfolio/components/VideoStack.tsx
type VideoItem = {
  title: string;
  url: string;
};

const VIDEOS: VideoItem[] = [
  { title: "Live @ Somewhere", url: "https://www.youtube.com/embed/dQw4w9WgXcQ" },
  { title: "Studio Session", url: "https://www.youtube.com/embed/dQw4w9WgXcQ" },
  { title: "Behind The Scenes", url: "https://www.youtube.com/embed/dQw4w9WgXcQ" },
];

export default function VideoStack() {
  return (
    <section className="mx-auto max-w-[1400px] px-5 sm:px-8 py-14 sm:py-18">
      <h2
        className="text-5xl sm:text-7xl font-semibold tracking-tight accent"
        data-reveal="up"
      >
        VIDEO
      </h2>

      <div className="mt-8 grid gap-5 lg:grid-cols-3">
        {VIDEOS.map((v, idx) => (
          <div
            key={v.title}
            className="overflow-hidden rounded-3xl border border-white/10 bg-white/5"
            data-reveal="up"
            data-reveal-delay={String(120 + idx * 90)}
          >
            <div className="relative aspect-video">
              <iframe
                src={v.url}
                title={v.title}
                className="absolute inset-0 h-full w-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
            <div className="p-5 text-white/80">{v.title}</div>
          </div>
        ))}
      </div>
    </section>
  );
}