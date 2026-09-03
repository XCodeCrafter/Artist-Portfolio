"use client";

import Image from "next/image";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { motion, useReducedMotion } from "framer-motion";
import { FaExpand, FaPause, FaPlay, FaTimes } from "react-icons/fa";
import ClientPortal from "@/components/ClientPortal";
import type { VideoItem, VideoPresentation } from "@/lib/content";

const typeLabels: Record<VideoItem["videoType"], string> = {
  showreel: "Showreel",
  scene: "Scene",
  self_tape: "Self-tape",
  interview: "Interview",
  music_video: "Music video",
  behind_scenes: "Behind the scenes",
  other: "Other",
};

const revealEase = [0.16, 1, 0.3, 1] as const;

function isDirectVideo(item: VideoItem) {
  return (
    ["upload", "direct", "html5"].includes(item.platform.toLowerCase()) ||
    /\.(mp4|webm|mov)(?:$|\?)/i.test(item.embedUrl)
  );
}

function getEmbedUrl(value: string, autoplay: boolean) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    let youtubeId = "";

    if (host === "youtu.be") youtubeId = url.pathname.split("/")[1] || "";
    if (
      [
        "m.youtube.com",
        "music.youtube.com",
        "www.youtube.com",
        "youtube.com",
      ].includes(host)
    ) {
      youtubeId =
        url.searchParams.get("v") ||
        url.pathname.match(/\/(?:embed|shorts)\/([^/?]+)/)?.[1] ||
        "";
    }
    if (youtubeId) {
      const params = new URLSearchParams({
        autoplay: autoplay ? "1" : "0",
        controls: autoplay ? "0" : "1",
        loop: "1",
        mute: autoplay ? "1" : "0",
        playlist: youtubeId,
        playsinline: "1",
        rel: "0",
      });
      return `https://www.youtube-nocookie.com/embed/${youtubeId}?${params}`;
    }

    if (["player.vimeo.com", "vimeo.com", "www.vimeo.com"].includes(host)) {
      const id = url.pathname.match(/\/(?:video\/)?(\d+)/)?.[1];
      if (id) {
        return `https://player.vimeo.com/video/${id}?autoplay=${autoplay ? 1 : 0}&muted=${autoplay ? 1 : 0}&loop=1&background=${autoplay ? 1 : 0}`;
      }
    }
  } catch {
    return value;
  }
  return value;
}

function WorkPreview({
  active,
  interactive,
  item,
}: {
  active: boolean;
  interactive: boolean;
  item: VideoItem;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const direct = isDirectVideo(item);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (active) {
      void video.play().catch(() => {});
    } else {
      video.pause();
      video.currentTime = 0;
    }
  }, [active]);

  // The Studio preview is a visual editing surface, not a miniature media
  // player. Never mount a video or third-party iframe there; thumbnails keep
  // the preview representative without autoplay, tracking, or surprise audio.
  if (!interactive) {
    return item.thumbnailSrc ? (
      <Image
        alt={item.title}
        className="object-cover"
        fill
        sizes="(max-width: 1023px) 100vw, 50vw"
        src={item.thumbnailSrc}
      />
    ) : (
      <div className="grid h-full place-items-center bg-white/[0.04] text-white/35">
        <FaPlay />
      </div>
    );
  }

  if (direct) {
    return (
      <video
        className="h-full w-full object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-[1.025]"
        loop
        muted
        playsInline
        poster={item.thumbnailSrc}
        preload="metadata"
        ref={videoRef}
        src={item.embedUrl}
      />
    );
  }

  if (active) {
    return (
      <iframe
        allow="autoplay; encrypted-media; picture-in-picture"
        className="pointer-events-none h-full w-full scale-[1.01] transition-transform duration-[1200ms] ease-out group-hover:scale-[1.035]"
        referrerPolicy="strict-origin-when-cross-origin"
        src={getEmbedUrl(item.embedUrl, true)}
        title={`${item.title} preview`}
      />
    );
  }

  return item.thumbnailSrc ? (
    <Image
      alt={item.title}
      className="object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-[1.025]"
      fill
      sizes="(max-width: 1023px) 100vw, 50vw"
      src={item.thumbnailSrc}
    />
  ) : (
    <div className="grid h-full place-items-center bg-white/[0.04] text-white/35">
      <FaPlay />
    </div>
  );
}

function WorkCard({
  index,
  interactive,
  item,
  onOpen,
  wide,
}: {
  index: number;
  interactive: boolean;
  item: VideoItem;
  onOpen: () => void;
  wide: boolean;
}) {
  const [active, setActive] = useState(false);
  const cardRef = useRef<HTMLElement | null>(null);
  const reduceMotion = useReducedMotion();
  const rowDelay = wide ? 0 : (index % 2) * 0.08;

  useEffect(() => {
    if (!interactive || reduceMotion) return;
    if (window.matchMedia("(hover: hover)").matches) return;
    const card = cardRef.current;
    if (!card) return;
    const observer = new IntersectionObserver(
      ([entry]) => setActive(entry.isIntersecting && entry.intersectionRatio > 0.55),
      { threshold: [0.25, 0.55, 0.8] }
    );
    observer.observe(card);
    return () => observer.disconnect();
  }, [interactive, reduceMotion]);

  return (
    <article
      className={wide ? "lg:col-span-2" : ""}
      onBlurCapture={() => setActive(false)}
      onFocusCapture={() => {
        if (interactive && !reduceMotion) setActive(true);
      }}
      onPointerEnter={() => {
        if (interactive && !reduceMotion) setActive(true);
      }}
      onPointerLeave={() => setActive(false)}
      ref={cardRef}
    >
      <button
        className="group block w-full text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/45"
        onClick={onOpen}
        type="button"
      >
        <motion.div
          className={`relative overflow-hidden rounded-lg border border-white/10 bg-black shadow-[0_28px_90px_rgba(0,0,0,0.38)] ${wide ? "aspect-[16/7] min-h-72" : "aspect-video"}`}
          data-showreel-reveal="media"
          initial={
            reduceMotion
              ? false
              : { opacity: 0, scale: 0.9, filter: "blur(48px)" }
          }
          style={{ willChange: "transform, opacity, filter" }}
          transition={{
            delay: rowDelay,
            duration: 1.05,
            ease: revealEase,
          }}
          viewport={{ amount: 0.42, once: true }}
          whileInView={
            reduceMotion
              ? undefined
              : { opacity: 1, scale: 1, filter: "blur(0px)" }
          }
        >
          <WorkPreview
            active={interactive && active}
            interactive={interactive}
            item={item}
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/76 via-transparent to-black/12" />
          <span className="absolute left-4 top-4 text-xs font-semibold tracking-[0.2em] text-white/65">
            {String(index + 1).padStart(2, "0")}
          </span>
          <span className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full border border-white/15 bg-black/35 text-white/70 opacity-0 backdrop-blur transition group-hover:opacity-100">
            <FaExpand />
          </span>
          <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-5 sm:p-6">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--accent)]">
                {typeLabels[item.videoType]}
              </p>
              <h3 className="heading-ui mt-2 text-2xl font-semibold text-white sm:text-3xl">
                {item.title}
              </h3>
            </div>
            <span className="hidden text-xs uppercase tracking-[0.18em] text-white/45 sm:block">
              {interactive
                ? active
                  ? "Playing preview"
                  : "Hover to play"
                : "Click to edit"}
            </span>
          </div>
        </motion.div>
        {item.description ? (
          <motion.p
            className="mt-3 max-w-2xl text-sm leading-6 text-white/50"
            initial={reduceMotion ? false : { opacity: 0, y: 12 }}
            transition={{
              delay: rowDelay + 0.12,
              duration: 0.72,
              ease: revealEase,
            }}
            viewport={{ amount: 0.6, once: true }}
            whileInView={
              reduceMotion ? undefined : { opacity: 1, y: 0 }
            }
          >
            {item.description}
          </motion.p>
        ) : null}
      </button>
    </article>
  );
}

function PreviewRegion({
  allowChildSelection = false,
  children,
  label,
  mode,
  onSelect,
  section,
  selected,
}: {
  allowChildSelection?: boolean;
  children: ReactNode;
  label: string;
  mode: "public" | "preview";
  onSelect?: (section: "introduction" | "works", itemId?: string) => void;
  section: "introduction" | "works";
  selected: boolean;
}) {
  if (mode === "public") return children;

  return (
    <div
      className="group/showreel-preview relative"
      data-showreel-preview-section={section}
    >
      {allowChildSelection ? (
        children
      ) : (
        <div aria-hidden="true" className="pointer-events-none" inert>
          {children}
        </div>
      )}
      {allowChildSelection ? (
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 z-[70] border-2 transition ${
            selected ? "border-[#ff3b1f]" : "border-transparent"
          }`}
        >
          <span
            className={`font-ui absolute right-3 top-3 rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] backdrop-blur-md transition ${
              selected
                ? "border-[#ff3b1f]/70 bg-[#ff3b1f] text-white opacity-100"
                : "border-white/20 bg-black/70 text-white opacity-0 group-hover/showreel-preview:opacity-100"
            }`}
          >
            {label} · choose a card
          </span>
        </div>
      ) : (
        <button
          aria-label={`Edit ${label}`}
          aria-pressed={selected}
          className={`absolute inset-0 z-[80] cursor-pointer border-2 transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#ff3b1f]/55 focus-visible:ring-inset ${
            selected
              ? "border-[#ff3b1f] bg-[#ff3b1f]/[0.035]"
              : "border-transparent hover:border-white/55 hover:bg-white/[0.025]"
          }`}
          onClick={() => onSelect?.(section)}
          type="button"
        >
        <span
          className={`font-ui absolute right-3 top-3 rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] backdrop-blur-md transition ${
            selected
              ? "border-[#ff3b1f]/70 bg-[#ff3b1f] text-white opacity-100"
              : "border-white/20 bg-black/70 text-white opacity-0 group-hover/showreel-preview:opacity-100 group-focus-within/showreel-preview:opacity-100"
          }`}
        >
          {label}
        </span>
        </button>
      )}
    </div>
  );
}

export default function ShowreelWorks({
  mode = "public",
  onSelectSection,
  presentation,
  selectedSection,
  videos,
}: {
  mode?: "public" | "preview";
  onSelectSection?: (section: "introduction" | "works", itemId?: string) => void;
  presentation: VideoPresentation;
  selectedSection?: "hero" | "introduction" | "works";
  videos: VideoItem[];
}) {
  const categories = useMemo(
    () => ["all", ...Array.from(new Set(videos.map((item) => item.videoType)))],
    [videos]
  );
  const [filter, setFilter] = useState("all");
  const [activeItem, setActiveItem] = useState<VideoItem | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const activeFilter = categories.includes(filter) ? filter : "all";
  const visible =
    activeFilter === "all"
      ? videos
      : videos.filter((item) => item.videoType === activeFilter);

  useEffect(() => {
    if (!activeItem) return;
    const previous = document.body.style.overflow;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const focusRaf = window.requestAnimationFrame(() =>
      closeButtonRef.current?.focus()
    );
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActiveItem(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(focusRaf);
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus();
    };
  }, [activeItem]);

  return (
    <section className="public-nav-anchor mx-auto max-w-[1500px] px-5 py-16 sm:px-8 sm:py-24" id="videos">
      <PreviewRegion
        label="Introduction"
        mode={mode}
        onSelect={onSelectSection}
        section="introduction"
        selected={selectedSection === "introduction"}
      >
      <header className="border-b border-white/10 pb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.26em] text-white/42">
          {presentation.sectionEyebrow}
        </p>
        <h2 className="heading-ui mt-5 max-w-5xl text-5xl font-semibold leading-[0.95] text-white sm:text-7xl lg:text-8xl">
          {presentation.sectionTitle}
        </h2>
        <p className="mt-6 max-w-2xl text-base leading-7 text-white/58">
          {presentation.sectionBody}
        </p>
        <div className="mt-8 flex flex-wrap gap-2">
          {categories.map((category) => (
            <button
              aria-pressed={activeFilter === category}
              className={`rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition ${activeFilter === category ? "border-white bg-white text-black" : "border-white/12 text-white/55 hover:border-white/35 hover:text-white"}`}
              key={category}
              onClick={() => setFilter(category)}
              disabled={mode === "preview"}
              type="button"
            >
              {category === "all" ? "All works" : typeLabels[category as VideoItem["videoType"]]}
            </button>
          ))}
        </div>
      </header>
      </PreviewRegion>

      <PreviewRegion
        allowChildSelection={visible.length > 0}
        label="Videos"
        mode={mode}
        onSelect={onSelectSection}
        section="works"
        selected={selectedSection === "works"}
      >
      {visible.length ? (
        <div className="mt-10 grid gap-x-5 gap-y-12 lg:grid-cols-2">
          {visible.map((item, index) => (
            <WorkCard
              index={index}
              interactive={mode === "public"}
              item={item}
              key={item.id}
              onOpen={() => {
                if (mode === "public") setActiveItem(item);
                else onSelectSection?.("works", item.id);
              }}
              wide={index === 0 || index % 5 === 0}
            />
          ))}
        </div>
      ) : (
        <div className="py-24 text-center text-white/55">{presentation.emptyText}</div>
      )}
      </PreviewRegion>

      {mode === "public" && activeItem ? (
        <ClientPortal>
          <motion.div
            animate={{ opacity: 1 }}
            aria-labelledby="showreel-dialog-title"
            aria-modal="true"
            className="fixed inset-0 z-[120] overflow-y-auto bg-black/94 p-4 backdrop-blur-xl sm:p-6"
            initial={{ opacity: 0 }}
            role="dialog"
            transition={{ duration: 0.24, ease: revealEase }}
          >
          <button
            aria-hidden="true"
            className="absolute inset-0 cursor-default"
            onClick={() => setActiveItem(null)}
            tabIndex={-1}
            type="button"
          />
          <button aria-label="Close video" className="fixed right-5 top-5 z-20 grid h-11 w-11 place-items-center rounded-full border border-white/15 bg-black/40 text-white transition hover:bg-white hover:text-black" onClick={() => setActiveItem(null)} ref={closeButtonRef} type="button"><FaTimes /></button>
          <div className="relative z-10 grid min-h-full place-items-center py-12">
          <motion.div
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="w-full max-w-6xl"
            initial={{ opacity: 0, scale: 0.96, y: 18 }}
            transition={{ duration: 0.48, ease: revealEase }}
          >
            <div className="relative aspect-video overflow-hidden rounded-lg border border-white/12 bg-black">
              {isDirectVideo(activeItem) ? (
                <video autoPlay className="h-full w-full" controls loop playsInline src={activeItem.embedUrl} />
              ) : (
                <iframe allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen className="h-full w-full" referrerPolicy="strict-origin-when-cross-origin" src={getEmbedUrl(activeItem.embedUrl, true)} title={activeItem.title} />
              )}
            </div>
            <div className="mt-4 flex items-start justify-between gap-5"><div><p className="text-xs uppercase tracking-[0.2em] text-[var(--accent)]">{typeLabels[activeItem.videoType]}</p><h3 className="heading-ui mt-2 text-3xl text-white" id="showreel-dialog-title">{activeItem.title}</h3></div><span className="flex items-center gap-2 text-xs text-white/45"><FaPause /> Esc to close</span></div>
          </motion.div>
          </div>
          </motion.div>
        </ClientPortal>
      ) : null}
    </section>
  );
}
