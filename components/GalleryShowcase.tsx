"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
} from "framer-motion";
import {
  FaChevronLeft,
  FaChevronRight,
  FaExpand,
  FaPause,
  FaPlay,
  FaTimes,
} from "react-icons/fa";
import ClientPortal from "@/components/ClientPortal";
import HomeSectionCta, {
  homeSectionHeadingClass,
} from "@/components/HomeSectionCta";
import type { GalleryImage, GalleryPresentation } from "@/lib/content";

type GalleryShowcaseProps = {
  images: GalleryImage[];
  interludePosterSrc?: string;
  interludeVideoSrc?: string;
  presentation: GalleryPresentation;
  mode?: "gallery" | "narrative";
  interludeCtaHref?: string;
  interludeCtaLabel?: string;
  interludeBody?: string;
  interludeTitle?: string;
  storyCtaHref?: string;
  storyCtaLabel?: string;
  storyBody?: string;
  storyTitle?: string;
};

type MosaicSlot = {
  frame: string;
  parallax: "soft" | "medium" | "deep";
};

const mosaicSlots: MosaicSlot[] = [
  {
    frame: "lg:col-span-5 lg:row-span-6",
    parallax: "deep",
  },
  {
    frame: "lg:col-span-7 lg:row-span-4",
    parallax: "medium",
  },
  {
    frame: "lg:col-span-4 lg:row-span-5",
    parallax: "medium",
  },
  {
    frame: "lg:col-span-3 lg:row-span-3",
    parallax: "soft",
  },
  {
    frame: "lg:col-span-5 lg:row-span-4",
    parallax: "medium",
  },
  {
    frame: "lg:col-span-3 lg:row-span-5",
    parallax: "soft",
  },
  {
    frame: "lg:col-span-6 lg:row-span-4",
    parallax: "medium",
  },
  {
    frame: "lg:col-span-3 lg:row-span-5",
    parallax: "soft",
  },
  {
    frame: "lg:col-span-4 lg:row-span-6",
    parallax: "deep",
  },
  {
    frame: "lg:col-span-5 lg:row-span-5",
    parallax: "medium",
  },
];

const STORY_FRAME_LIMIT = 4;

type FrameParallax = "soft" | "medium" | "deep";

const frameOffsets: Record<FrameParallax, [string, string]> = {
  soft: ["-3%", "3%"],
  medium: ["-5%", "5%"],
  deep: ["-8%", "8%"],
};

const revealEase = [0.16, 1, 0.3, 1] as const;

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function normalizeCategory(value: string) {
  return value.trim() || "Selected";
}

function formatIndex(value: number) {
  return String(value).padStart(2, "0");
}

function clampIndex(index: number, length: number) {
  return (index + length) % length;
}

function getChapterFade(index: number, total: number) {
  const fade = Math.min(0.075, 0.22 / Math.max(total, 1));
  const start = index / total;
  const end = (index + 1) / total;

  if (total === 1) {
    return { input: [0, 1], output: [1, 1] };
  }

  if (index === 0) {
    return {
      input: [0, Math.max(0.001, end - fade), Math.min(1, end + fade)],
      output: [1, 1, 0],
    };
  }

  if (index === total - 1) {
    return {
      input: [Math.max(0, start - fade), Math.min(1, start + fade), 1],
      output: [0, 1, 1],
    };
  }

  return {
    input: [
      Math.max(0, start - fade),
      Math.min(1, start + fade),
      Math.max(0, end - fade),
      Math.min(1, end + fade),
    ],
    output: [0, 1, 1, 0],
  };
}

function interpolateValue(
  input: number[],
  output: number[],
  value: number
) {
  if (value <= input[0]) return output[0];

  for (let index = 1; index < input.length; index += 1) {
    if (value <= input[index]) {
      const start = input[index - 1];
      const end = input[index];
      const amount = (value - start) / (end - start || 1);
      return output[index - 1] + (output[index] - output[index - 1]) * amount;
    }
  }

  return output[output.length - 1];
}

function useStoryProgress(
  storyRef: React.RefObject<HTMLDivElement | null>,
  reduceMotion: boolean | null
) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const story = storyRef.current;
    if (!story || reduceMotion) return;

    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = story.getBoundingClientRect();
      const distance = Math.max(story.offsetHeight - window.innerHeight, 1);
      const next = Math.min(1, Math.max(0, -rect.top / distance));

      setProgress((current) =>
        Math.abs(current - next) < 0.001 ? current : next
      );
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [reduceMotion, storyRef]);

  return progress;
}

type FrameButtonProps = {
  image: GalleryImage;
  label: string;
  parallax: FrameParallax;
  priority?: boolean;
  sizes: string;
  onOpen: (image: GalleryImage) => void;
};

function FrameButton({
  image,
  label,
  parallax,
  priority,
  sizes,
  onOpen,
}: FrameButtonProps) {
  const frameRef = useRef<HTMLButtonElement | null>(null);
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: frameRef,
    offset: ["start end", "end start"],
  });
  const mediaY = useTransform(
    scrollYProgress,
    [0, 1],
    reduceMotion ? ["0%", "0%"] : frameOffsets[parallax]
  );
  const mediaScale = useTransform(
    scrollYProgress,
    [0, 0.5, 1],
    reduceMotion ? [1, 1, 1] : [1.05, 1.015, 1.05]
  );

  return (
    <button
      className="group relative h-full min-h-[280px] w-full overflow-hidden rounded-lg border border-white/10 bg-white/[0.04] text-left shadow-[0_24px_80px_rgba(0,0,0,0.24)] transition duration-500 hover:border-white/24 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/40 lg:min-h-0"
      onClick={() => onOpen(image)}
      ref={frameRef}
      type="button"
    >
      <motion.div
        className="absolute -inset-y-8 inset-x-0"
        style={{
          position: "absolute",
          inset: "-2rem 0",
          scale: mediaScale,
          y: mediaY,
        }}
      >
        <Image
          alt={image.alt || image.title}
          className="gallery-mask-media object-cover transition duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.04]"
          fill
          loading={priority ? "eager" : "lazy"}
          preload={priority}
          sizes={sizes}
          src={image.src}
        />
      </motion.div>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-black/18 to-transparent" />
      <span className="absolute left-5 top-5 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/58">
        {label}
      </span>
      <span className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full border border-white/15 bg-black/35 text-sm text-white/65 opacity-0 backdrop-blur transition duration-300 group-hover:opacity-100 sm:right-5 sm:top-5">
        <FaExpand aria-hidden="true" />
      </span>
      <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">
          {normalizeCategory(image.category)}
        </p>
        <h3 className="heading-ui mt-2 text-xl font-semibold leading-tight text-white sm:text-2xl">
          {image.title}
        </h3>
      </div>
      <span className="sr-only">Open {image.title}</span>
    </button>
  );
}

type MosaicFrameProps = {
  image: GalleryImage;
  index: number;
  slot: MosaicSlot;
  onOpen: (image: GalleryImage) => void;
};

function MosaicFrame({ image, index, slot, onOpen }: MosaicFrameProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.article
      className={cx("relative", slot.frame)}
      data-gallery-reveal="media"
      initial={
        reduceMotion
          ? false
          : { opacity: 0, scale: 0.9, filter: "blur(48px)" }
      }
      style={{ willChange: "transform, opacity, filter" }}
      transition={{
        delay: (index % 3) * 0.06,
        duration: 1.05,
        ease: revealEase,
      }}
      viewport={{ amount: 0.38, once: true }}
      whileInView={
        reduceMotion
          ? undefined
          : { opacity: 1, scale: 1, filter: "blur(0px)" }
      }
    >
      <FrameButton
        image={image}
        label={formatIndex(index + 1)}
        onOpen={onOpen}
        parallax={slot.parallax}
        priority={index < 2}
        sizes={
          index === 0
            ? "(max-width: 639px) calc(100vw - 40px), (max-width: 1023px) calc(50vw - 28px), 42vw"
            : "(max-width: 639px) calc(100vw - 40px), (max-width: 1023px) calc(50vw - 28px), 35vw"
        }
      />
    </motion.article>
  );
}

type StoryImageProps = {
  image: GalleryImage;
  index: number;
  isActive: boolean;
  total: number;
  progress: number;
  onOpen: (image: GalleryImage) => void;
};

function StoryImage({
  image,
  index,
  isActive,
  total,
  progress,
  onOpen,
}: StoryImageProps) {
  const reduceMotion = useReducedMotion();
  const fade = getChapterFade(index, total);
  const opacity = reduceMotion
    ? 1
    : interpolateValue(fade.input, fade.output, progress);
  const y = reduceMotion ? 0 : 18 - progress * 36;
  const scale = reduceMotion ? 1 : 1.045 - progress * 0.035;

  return (
    <motion.button
      aria-hidden={!isActive}
      className="absolute inset-0 h-full w-full overflow-hidden text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/40"
      animate={{ opacity, scale, y }}
      onClick={() => onOpen(image)}
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: isActive ? "auto" : "none",
      }}
      tabIndex={isActive ? 0 : -1}
      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      type="button"
    >
      <Image
        alt={image.alt || image.title}
        className="object-cover"
        fill
        loading="eager"
        sizes="(max-width: 1023px) calc(100vw - 40px), 55vw"
        src={image.src}
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/86 via-black/8 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-5 p-6 sm:p-8">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/52">
            {formatIndex(index + 1)} / {formatIndex(total)}
          </p>
          <p className="heading-ui mt-2 text-xl font-semibold text-white sm:text-2xl">
            {image.title}
          </p>
        </div>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/15 bg-black/30 text-sm text-white/75 backdrop-blur">
          <FaExpand aria-hidden="true" />
        </span>
      </div>
      <span className="sr-only">Open {image.title}</span>
    </motion.button>
  );
}

type FreelanceStoryProps = {
  ctaHref?: string;
  ctaLabel?: string;
  images: GalleryImage[];
  motto: string;
  onOpen: (image: GalleryImage) => void;
  sectionTitle: string;
};

function StoryIntro({
  className = "",
  ctaHref,
  ctaLabel,
  motto,
  title,
}: {
  className?: string;
  ctaHref?: string;
  ctaLabel?: string;
  motto: string;
  title: string;
}) {
  return (
    <div className={className}>
      <h2
        className={`${homeSectionHeadingClass} max-w-3xl text-[var(--accent)]`}
      >
        {title}
      </h2>
      {motto ? (
        <p className="mt-7 max-w-xl text-lg leading-8 text-white/62 sm:text-xl sm:leading-9">
          {motto}
        </p>
      ) : null}
      <HomeSectionCta
        className="mt-9"
        href={ctaHref}
        label={ctaLabel}
      />
    </div>
  );
}

function StaticStoryFrame({
  image,
  index,
  onOpen,
  total,
}: {
  image: GalleryImage;
  index: number;
  onOpen: (image: GalleryImage) => void;
  total: number;
}) {
  return (
    <button
      className="group relative aspect-[4/5] overflow-hidden rounded-lg border border-white/10 bg-white/[0.04] text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/40"
      onClick={() => onOpen(image)}
      type="button"
    >
      <Image
        alt={image.alt || image.title}
        className="object-cover transition duration-700 ease-out group-hover:scale-[1.025]"
        fill
        sizes="(max-width: 639px) calc(100vw - 40px), (max-width: 1023px) calc(50vw - 32px), 40vw"
        src={image.src}
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/72 via-transparent to-transparent" />
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-5 p-5 sm:p-6">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/48">
            {formatIndex(index + 1)} / {formatIndex(total)}
          </p>
          <p className="font-ui mt-2 text-base font-semibold text-white/90">
            {image.title}
          </p>
        </div>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/15 bg-black/30 text-sm text-white/75 backdrop-blur">
          <FaExpand aria-hidden="true" />
        </span>
      </div>
      <span className="sr-only">Open {image.title}</span>
    </button>
  );
}

function FreelanceStory({
  ctaHref,
  ctaLabel,
  images,
  motto,
  onOpen,
  sectionTitle,
}: FreelanceStoryProps) {
  const storyRef = useRef<HTMLDivElement | null>(null);
  const reduceMotion = useReducedMotion();
  const storyImages = images.slice(0, STORY_FRAME_LIMIT);
  const total = storyImages.length;
  const storyProgress = useStoryProgress(storyRef, reduceMotion);
  const activeStoryIndex = Math.min(
    Math.max(Math.floor(storyProgress * total), 0),
    Math.max(total - 1, 0)
  );
  if (!total) return null;
  const activeStory = storyImages[activeStoryIndex];

  if (reduceMotion) {
    return (
      <section className="mt-20 border-t border-white/10 pt-16 sm:mt-28 sm:pt-24">
        <div className="grid gap-14">
          {storyImages.map((image, index) => (
            <article className="grid items-center gap-7 lg:grid-cols-[0.82fr_1.18fr] lg:gap-14" key={`${image.id}-reduced-story-frame`}>
              <StoryIntro
                motto={image.caption || motto}
                title={image.title || sectionTitle}
              />
              <StaticStoryFrame
                image={image}
                index={index}
                onOpen={onOpen}
                total={total}
              />
            </article>
          ))}
        </div>
        <HomeSectionCta className="mt-10" href={ctaHref} label={ctaLabel} />
      </section>
    );
  }

  return (
    <section className="mt-20 border-t border-white/10 pt-16 sm:mt-28 sm:pt-24">
      <div
        className="hidden lg:block"
        ref={storyRef}
        style={{ minHeight: `${Math.max(total, 2) * 80}vh` }}
      >
        <div className="sticky top-28 grid h-[calc(100svh-9rem)] grid-cols-[minmax(320px,0.82fr)_minmax(0,1.18fr)] gap-14">
          <div aria-live="polite" className="flex h-full items-center">
            <AnimatePresence initial={false} mode="wait">
              <motion.div
                animate={{ filter: "blur(0px)", opacity: 1, y: 0 }}
                className="w-full"
                exit={{ filter: "blur(7px)", opacity: 0, y: -12 }}
                initial={{ filter: "blur(7px)", opacity: 0, y: 12 }}
                key={activeStory.id}
                transition={{ duration: 0.42, ease: revealEase }}
              >
                <StoryIntro
                  ctaHref={ctaHref}
                  ctaLabel={ctaLabel}
                  motto={activeStory.caption || motto}
                  title={activeStory.title || sectionTitle}
                />
              </motion.div>
            </AnimatePresence>
          </div>
          <div className="relative h-full overflow-hidden rounded-lg border border-white/10 bg-white/[0.04] shadow-[0_30px_120px_rgba(0,0,0,0.32)]">
            {storyImages.map((image, index) => (
              <StoryImage
                image={image}
                index={index}
                isActive={index === activeStoryIndex}
                key={`${image.id}-story-frame`}
                onOpen={onOpen}
                progress={storyProgress}
                total={total}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="lg:hidden">
        <div className="grid gap-16">
          {storyImages.map((image, index) => (
            <article className="grid gap-7" key={`${image.id}-mobile-story-frame`}>
              <StoryIntro
                motto={image.caption || motto}
                title={image.title || sectionTitle}
              />
              <StaticStoryFrame
                image={image}
                index={index}
                onOpen={onOpen}
                total={total}
              />
            </article>
          ))}
        </div>
        <HomeSectionCta className="mt-10" href={ctaHref} label={ctaLabel} />
      </div>
    </section>
  );
}

function GalleryInterlude({
  body,
  ctaHref,
  ctaLabel,
  posterSrc,
  title,
  videoSrc,
  flushTop = false,
}: {
  body: string;
  ctaHref?: string;
  ctaLabel?: string;
  posterSrc: string;
  title: string;
  videoSrc: string;
  flushTop?: boolean;
}) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const reduceMotion = useReducedMotion();
  const [isPlaying, setIsPlaying] = useState(!reduceMotion);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "end start"],
  });
  const mediaY = useTransform(
    scrollYProgress,
    [0, 1],
    reduceMotion ? ["0%", "0%"] : ["-7%", "7%"]
  );
  const mediaScale = useTransform(
    scrollYProgress,
    [0, 0.5, 1],
    reduceMotion ? [1, 1, 1] : [1.08, 1.02, 1.08]
  );

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (reduceMotion) {
      video.pause();
      return;
    }

    void video.play().catch(() => setIsPlaying(false));
  }, [reduceMotion, videoSrc]);

  function togglePlayback() {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      void video.play().catch(() => setIsPlaying(false));
    } else {
      video.pause();
    }
  }

  return (
    <section
      className={cx(
        "relative left-1/2 h-[72svh] min-h-[560px] w-screen max-w-[1800px] -translate-x-1/2 overflow-hidden border-y border-white/10 bg-black lg:h-[78svh] lg:max-h-[860px] lg:min-h-[620px]",
        flushTop ? "mt-0" : "mt-24 sm:mt-32"
      )}
      ref={sectionRef}
    >
      <motion.div
        className="absolute -inset-y-[12%] inset-x-0"
        style={{ scale: mediaScale, y: mediaY }}
      >
        <video
          autoPlay={!reduceMotion}
          className="h-full w-full object-cover"
          loop
          muted
          onPause={() => setIsPlaying(false)}
          onPlay={() => setIsPlaying(true)}
          playsInline
          poster={posterSrc}
          preload="metadata"
          ref={videoRef}
          src={videoSrc}
        />
      </motion.div>

      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.5)_0%,rgba(0,0,0,0.08)_40%,rgba(0,0,0,0.78)_100%)]" />
      <div className="pointer-events-none absolute inset-0 bg-black/10" />

      <div className="relative z-10 mx-auto flex h-full max-w-[1500px] flex-col justify-end px-5 py-8 sm:px-8 sm:py-11 lg:px-12 lg:py-14">
        <div className="flex items-end justify-between gap-6">
          <div className="max-w-5xl">
            <h2
              className={`${homeSectionHeadingClass} text-[var(--accent)]`}
            >
              {title}
            </h2>
            {body ? (
              <p className="mt-6 max-w-2xl text-lg leading-8 text-white/76 sm:text-xl sm:leading-9">
                {body}
              </p>
            ) : null}
            <HomeSectionCta
              className="mt-8"
              href={ctaHref}
              label={ctaLabel}
            />
          </div>

          <button
            aria-label={isPlaying ? "Pause interlude" : "Play interlude"}
            className="mb-1 grid h-11 w-11 shrink-0 place-items-center rounded-full border border-white/20 bg-black/35 text-sm text-white backdrop-blur transition hover:border-white/45 hover:bg-white hover:text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/50"
            onClick={togglePlayback}
            title={isPlaying ? "Pause" : "Play"}
            type="button"
          >
            {isPlaying ? <FaPause aria-hidden="true" /> : <FaPlay aria-hidden="true" />}
          </button>
        </div>
      </div>
    </section>
  );
}

export default function GalleryShowcase({
  images,
  interludeCtaHref,
  interludeCtaLabel,
  interludeBody,
  interludePosterSrc = "/images/video-hero.jpg",
  interludeTitle,
  interludeVideoSrc = "/media/hero-loop.mp4",
  mode = "gallery",
  presentation,
  storyCtaHref,
  storyCtaLabel,
  storyBody,
  storyTitle,
}: GalleryShowcaseProps) {
  const mosaicImages = useMemo(
    () => images.filter((image) => image.isMosaic),
    [images]
  );
  const storyImages = useMemo(
    () =>
      images
        .filter((image) => image.isFreelanceStory)
        .sort(
          (first, second) =>
            first.freelanceStoryOrder - second.freelanceStoryOrder ||
            first.title.localeCompare(second.title)
        )
        .slice(0, STORY_FRAME_LIMIT),
    [images]
  );
  const categoryOptions = useMemo(() => {
    const counts = new Map<string, number>();

    for (const image of mosaicImages) {
      const category = normalizeCategory(image.category);
      counts.set(category, (counts.get(category) || 0) + 1);
    }

    return [
      { label: "All", count: mosaicImages.length },
      ...Array.from(counts.entries()).map(([label, count]) => ({ label, count })),
    ];
  }, [mosaicImages]);

  const [activeCategory, setActiveCategory] = useState("All");
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [activeCollection, setActiveCollection] = useState<"mosaic" | "story">(
    "mosaic"
  );
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  const selectedCategory = categoryOptions.some(
    (category) => category.label === activeCategory
  )
    ? activeCategory
    : "All";
  const visibleImages = useMemo(() => {
    if (selectedCategory === "All") return mosaicImages;
    return mosaicImages.filter(
      (image) => normalizeCategory(image.category) === selectedCategory
    );
  }, [mosaicImages, selectedCategory]);
  const lightboxImages =
    activeCollection === "story" ? storyImages : visibleImages;
  const activeImage =
    activeIndex === null ? null : lightboxImages[activeIndex] || null;

  function openImage(image: GalleryImage, collection: "mosaic" | "story" = "mosaic") {
    const items = collection === "story" ? storyImages : visibleImages;
    const index = items.findIndex((item) => item.id === image.id);
    setActiveCollection(collection);
    setActiveIndex(index >= 0 ? index : 0);
  }

  function showNextImage() {
    setActiveIndex((index) =>
      index === null ? null : clampIndex(index + 1, lightboxImages.length)
    );
  }

  function showPreviousImage() {
    setActiveIndex((index) =>
      index === null ? null : clampIndex(index - 1, lightboxImages.length)
    );
  }

  useEffect(() => {
    if (!activeImage) return;

    const previousOverflow = document.body.style.overflow;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    let focusRaf = 0;

    document.body.style.overflow = "hidden";
    focusRaf = window.requestAnimationFrame(() => closeButtonRef.current?.focus());

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setActiveIndex(null);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        setActiveIndex((index) =>
          index === null ? null : clampIndex(index - 1, lightboxImages.length)
        );
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        setActiveIndex((index) =>
          index === null ? null : clampIndex(index + 1, lightboxImages.length)
        );
      }
    }

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.cancelAnimationFrame(focusRaf);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus();
    };
  }, [activeImage, lightboxImages.length]);

  return (
    <section
      className={cx(
        "public-nav-anchor relative overflow-x-clip px-5 sm:px-8",
        mode === "gallery" ? "py-16 sm:py-24" : "pb-16 sm:pb-24"
      )}
      id={mode === "gallery" ? "gallery" : "home-stories"}
    >
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.035),transparent_24%,rgba(255,59,31,0.045)_62%,transparent)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/10" />

      <div className="relative mx-auto max-w-[1500px]">
        {mode === "gallery" ? (
          <>
            <div data-gallery-preview-part="introduction">
            <header>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/42">
            {presentation.introEyebrow}
          </p>
          <h2 className="heading-ui mt-6 max-w-6xl text-5xl font-semibold leading-[0.95] text-white sm:text-7xl lg:text-8xl">
            {presentation.introTitle}
          </h2>
            </header>

            <div className="mt-10 flex flex-col gap-4 border-b border-white/10 lg:flex-row lg:items-end lg:justify-between">
          <div className="gallery-scrollbar-none flex gap-7 overflow-x-auto pb-4 sm:gap-8 lg:overflow-visible">
            {categoryOptions.map((category) => {
              const active = category.label === selectedCategory;

              return (
                <button
                  aria-pressed={active}
                  className={cx(
                    "shrink-0 border-b-2 px-0.5 pb-3 text-xs font-semibold uppercase tracking-[0.18em] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/40",
                    active
                      ? "border-[var(--accent)] text-white"
                      : "border-transparent text-white/45 hover:text-white"
                  )}
                  key={category.label}
                  onClick={() => {
                    setActiveCategory(category.label);
                    setActiveIndex(null);
                  }}
                  type="button"
                >
                  {category.label}
                  <span className="ml-2 text-[10px] text-white/35">{category.count}</span>
                </button>
              );
            })}
          </div>
          <p className="pb-4 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/35">
            {visibleImages.length} frames - selected archive
          </p>
            </div>
            </div>

            {visibleImages.length ? (
              <section className="mt-10" data-gallery-preview-part="frames">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:auto-rows-[88px] lg:grid-cols-12 lg:gap-5">
                  {visibleImages.map((image, index) => (
                    <MosaicFrame
                      image={image}
                      index={index}
                      key={image.id}
                      onOpen={openImage}
                      slot={mosaicSlots[index % mosaicSlots.length]}
                    />
                  ))}
                </div>
              </section>
            ) : (
              <div className="mt-10 border border-white/10 bg-white/[0.045] p-10 text-center text-white/62" data-gallery-preview-part="frames">
                No images in this collection yet.
              </div>
            )}
          </>
        ) : (
          <>
            <GalleryInterlude
              body={interludeBody || presentation.interludeEyebrow}
              ctaHref={interludeCtaHref}
              ctaLabel={interludeCtaLabel}
              flushTop
              posterSrc={interludePosterSrc}
              title={interludeTitle || presentation.interludeTitle}
              videoSrc={interludeVideoSrc}
            />

            <FreelanceStory
              ctaHref={storyCtaHref}
              ctaLabel={storyCtaLabel}
              images={storyImages}
              motto={storyBody || presentation.storyScrollLabel}
              onOpen={(image) => openImage(image, "story")}
              sectionTitle={storyTitle || presentation.storyLabel}
            />
          </>
        )}
      </div>

      {activeImage ? (
        <ClientPortal>
          <motion.div
            animate={{ opacity: 1 }}
            aria-label={`${activeImage.title} image viewer`}
            aria-modal="true"
            className="fixed inset-0 z-[120] overflow-hidden bg-black/92 p-4 backdrop-blur-2xl sm:p-6"
            initial={{ opacity: 0 }}
            ref={dialogRef}
            role="dialog"
            transition={{ duration: 0.24, ease: revealEase }}
          >
          <button
            aria-hidden="true"
            className="absolute inset-0 cursor-default"
            onClick={() => setActiveIndex(null)}
            tabIndex={-1}
            type="button"
          />
          <button
            aria-label="Close gallery image"
            className="absolute right-4 top-4 z-20 grid h-11 w-11 place-items-center rounded-full border border-white/12 bg-white/[0.08] text-white transition hover:bg-white hover:text-black sm:right-6 sm:top-6"
            onClick={() => setActiveIndex(null)}
            ref={closeButtonRef}
            type="button"
          >
            <FaTimes aria-hidden="true" />
          </button>

          {lightboxImages.length > 1 ? (
            <>
              <button
                aria-label="Previous image"
                className="absolute left-4 top-1/2 z-20 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-white/12 bg-white/[0.08] text-white transition hover:bg-white hover:text-black sm:left-6"
                onClick={showPreviousImage}
                type="button"
              >
                <FaChevronLeft aria-hidden="true" />
              </button>
              <button
                aria-label="Next image"
                className="absolute right-4 top-1/2 z-20 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-white/12 bg-white/[0.08] text-white transition hover:bg-white hover:text-black sm:right-6"
                onClick={showNextImage}
                type="button"
              >
                <FaChevronRight aria-hidden="true" />
              </button>
            </>
          ) : null}

          <motion.div
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="relative z-10 mx-auto grid h-full max-w-[1500px] grid-rows-[minmax(0,1fr)_auto] gap-4 pt-12 sm:gap-5 sm:pt-0"
            initial={{ opacity: 0, scale: 0.97, y: 16 }}
            transition={{ duration: 0.48, ease: revealEase }}
          >
            <div className="relative min-h-0 overflow-hidden rounded-lg border border-white/10 bg-white/[0.04]">
              <Image
                alt={activeImage.alt || activeImage.title}
                className="object-contain"
                fill
                priority
                sizes="100vw"
                src={activeImage.src}
              />
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.07] p-5 backdrop-blur-2xl">
              <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">
                    {normalizeCategory(activeImage.category)}
                  </p>
                  <h2 className="heading-ui mt-2 text-3xl font-semibold text-white">
                    {activeImage.title}
                  </h2>
                  {activeImage.caption ? (
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-white/62">
                      {activeImage.caption}
                    </p>
                  ) : null}
                </div>
                <div className="text-sm text-white/42">
                  {(activeIndex ?? 0) + 1} / {lightboxImages.length}
                </div>
              </div>
            </div>
          </motion.div>
          </motion.div>
        </ClientPortal>
      ) : null}
    </section>
  );
}
