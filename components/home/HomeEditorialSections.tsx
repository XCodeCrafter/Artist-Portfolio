"use client";

import Image from "next/image";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import FramedImage from "@/components/FramedImage";
import ExternalMediaGate from "@/components/privacy/ExternalMediaGate";
import {
  getHomePlaybackEmbedUrl,
  isSafeEditorialHref,
  isSafeHomePlayback,
  type HomeEditorialImage,
  type HomePress,
  type HomePressItem,
  type HomeRelease,
  type HomeWork,
} from "@/lib/admin/home-editorial";
import styles from "./HomeEditorialSections.module.css";

function Arrow({ direction = "right" }: { direction?: "left" | "right" }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3">
    {direction === "right" ? <path d="M4 12h16m-6-6 6 6-6 6" /> : <path d="M20 12H4m6-6-6 6 6 6" />}
  </svg>;
}

function PlayIcon({ playing = false }: { playing?: boolean }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
    {playing ? <path d="M8 5v14M16 5v14" /> : <path d="m7 4 13 8-13 8z" />}
  </svg>;
}

/** A decorative track line, not a claimed analysis of the audio file. */
function TrackLine({ progress = 0 }: { progress?: number }) {
  const bars = [10, 22, 14, 30, 18, 25, 12, 19, 32, 27, 14, 22, 16, 9, 18, 13, 25, 34, 23, 16, 27, 20, 11, 17, 26, 31, 20, 13, 22, 28, 17, 10, 16, 25, 31, 21, 15, 27, 18, 11, 21, 29, 17, 24, 13, 21, 15, 9];
  return <svg className={styles.trackLine} aria-hidden="true" viewBox="0 0 240 36" preserveAspectRatio="none">
    {bars.map((height, index) => <line key={index} x1={index * 5 + 2} x2={index * 5 + 2} y1={(36 - height) / 2} y2={(36 + height) / 2}
      stroke={index / bars.length < progress ? "var(--editorial-red)" : "currentColor"} strokeWidth="2" />)}
  </svg>;
}

function EditorialPhoto({ image, sizes, className }: { image: HomeEditorialImage; sizes: string; className?: string }) {
  if (!image.src) return null;
  return <div className={className}>
    <FramedImage alt={image.alt} src={image.src} framing={image.framing} fill sizes={sizes} />
  </div>;
}

function EditorialBackdrop({ image }: { image: HomeEditorialImage }) {
  return <>
    <div aria-hidden="true" className={styles.backdrop}>
      {image.src ? <FramedImage alt="" src={image.src} framing={image.framing} fill sizes="100vw" /> : null}
    </div>
    <div className={styles.shade} />
  </>;
}

function EditorialLink({ href, children, primary = false }: { href: string; children: ReactNode; primary?: boolean }) {
  if (!href || !isSafeEditorialHref(href)) return null;
  return <a href={href} className={`${styles.button}${primary ? ` ${styles.primary}` : ""}`}
    {...(href.startsWith("https://") ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
    {children}<Arrow />
  </a>;
}

export function formatHomeAudioTime(seconds: number) {
  const safe = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

function DirectAudioPlayer({ source, title }: { source: string; title: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const mounted = useRef(false);
  const attemptRef = useRef<{ timer: ReturnType<typeof setTimeout> | null } | null>(null);
  const [playing, setPlaying] = useState(false);
  const [pending, setPending] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    mounted.current = true;
    const audio = audioRef.current;
    return () => {
      mounted.current = false;
      if (attemptRef.current?.timer) clearTimeout(attemptRef.current.timer);
      attemptRef.current = null;
      if (audio) {
        audio.pause();
        // Abort the pending fetch/play promise as well as stopping audible playback.
        audio.removeAttribute("src");
        audio.load();
      }
    };
  }, []);

  function finishAttempt() {
    if (attemptRef.current?.timer) clearTimeout(attemptRef.current.timer);
    attemptRef.current = null;
    setPending(false);
  }

  function failPlayback(message: string) {
    finishAttempt();
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    setPlaying(false);
    setDuration(0);
    setCurrentTime(0);
    setError(message);
  }

  async function togglePlayback() {
    const audio = audioRef.current;
    if (!audio || attemptRef.current) return;
    if (!audio.paused) { audio.pause(); return; }
    setError("");
    setPending(true);
    const attempt = { timer: null as ReturnType<typeof setTimeout> | null };
    attemptRef.current = attempt;
    // A media host can leave play() unsettled indefinitely; keep the player retryable.
    attempt.timer = setTimeout(() => {
      if (mounted.current && attemptRef.current === attempt) {
        failPlayback("Audio is taking too long to load. Try again, or use a listening link below.");
      }
    }, 15000);
    // Even a metadata request to an external audio host waits for this deliberate click.
    if (!audio.getAttribute("src")) audio.src = source;
    try {
      await audio.play();
      if (mounted.current && attemptRef.current === attempt) {
        finishAttempt();
        setPlaying(!audio.paused);
      }
    }
    catch {
      if (mounted.current && attemptRef.current === attempt) {
        failPlayback("Playback could not start. Try again, or use a listening link below.");
      }
    }
  }

  return <>
    <audio ref={audioRef} preload="none"
      onDurationChange={event => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)}
      onTimeUpdate={event => setCurrentTime(Number.isFinite(event.currentTarget.currentTime) ? event.currentTarget.currentTime : 0)}
      onPlaying={() => { finishAttempt(); setPlaying(true); }} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
      onError={() => failPlayback("This audio could not be loaded. Please use a listening link below.")} />
    <TrackLine progress={duration ? currentTime / duration : 0} />
    <div className={styles.playback}>
      <button type="button" className={styles.playButton} disabled={pending} aria-label={`${playing ? "Pause" : "Play"} ${title || "latest release"}`} onClick={togglePlayback}>
        <PlayIcon playing={playing} />
      </button>
      <div className={styles.audioArea}>
        <input className={styles.seek} aria-label="Seek audio" type="range" min="0" max={duration || 1} step="0.1"
          value={Math.min(currentTime, duration || 0)} disabled={!duration}
          onChange={event => {
            const audio = audioRef.current;
            if (!audio || !duration) return;
            audio.currentTime = Number(event.currentTarget.value);
            setCurrentTime(audio.currentTime);
          }} />
        <div className={styles.times}><span>{pending ? "Loading…" : formatHomeAudioTime(currentTime)}</span><span>{formatHomeAudioTime(duration)}</span></div>
      </div>
    </div>
    {error ? <p className={styles.playerError} role="status">{error}</p> : null}
  </>;
}

function ReleaseRecord({ data, staticPreview }: { data: HomeRelease; staticPreview: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const { playback, releaseTitle: title } = data;
  const embedUrl = getHomePlaybackEmbedUrl(playback);
  const hasPlayback = isSafeHomePlayback(playback) && playback.kind !== "none";
  const provider = playback.kind === "spotify" ? "Spotify" : "YouTube";
  const player = !hasPlayback ? null : staticPreview ? <div className={styles.playback}>
    <button type="button" className={styles.playButton} disabled aria-label="Playback is disabled in the editing preview"><PlayIcon /></button>
    <span className={styles.playLabel}>Player preview</span>
  </div> : playback.kind === "audio" ? <DirectAudioPlayer key={playback.url} source={playback.url} title={title} /> : embedUrl ? <div className={styles.playback}>
    <button type="button" className={styles.playButton} aria-label={`${expanded ? "Close" : "Play using"} ${provider} player`}
      aria-expanded={expanded} onClick={() => setExpanded(value => !value)}><PlayIcon playing={expanded} /></button>
    <span className={styles.playLabel}>{expanded ? `${provider} player open` : `Play on ${provider}`}</span>
  </div> : null;
  return <>
    <div className={styles.record} data-has-cover={Boolean(data.cover.src)}>
      <EditorialPhoto image={data.cover} className={styles.cover} sizes="118px" />
      <div className={styles.recordInfo}>
        {title ? <h3 className={styles.recordTitle}>{title}</h3> : null}
        {data.artist ? <p className={styles.recordArtist}>{data.artist}</p> : null}
        {hasPlayback && (staticPreview || playback.kind !== "audio") ? <TrackLine /> : null}
        {player}
      </div>
    </div>
    {expanded && !staticPreview && embedUrl ? <div className={styles.embed}>
      <ExternalMediaGate provider={provider}>
        <iframe title={`${title || "Latest release"} — ${provider} player`} src={embedUrl}
          className={playback.kind === "youtube" ? styles.youtube : styles.spotify}
          allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
      </ExternalMediaGate>
      <p className={styles.embedNote}>Press play in {provider} to listen. Playback is subject to the service’s availability. <a href={playback.url} target="_blank" rel="noopener noreferrer">Open {provider} ↗</a></p>
    </div> : null}
  </>;
}

export function LatestReleaseSection({ data, staticPreview = false }: { data: HomeRelease; staticPreview?: boolean }) {
  const titleId = useId();
  return <section id="home-release" className={`${styles.section} ${styles.release}`} aria-labelledby={titleId}>
    <EditorialBackdrop image={data.background} />
    <div className={styles.inner}>
      <div className={styles.releaseCopy}>
        {data.eyebrow ? <p className={styles.eyebrow}>{data.eyebrow}</p> : null}
        <h2 className={styles.heading} id={titleId}>{data.title}</h2>
        {data.subtitle ? <p className={styles.subtitle}>{data.subtitle}</p> : null}
        {data.body ? <p className={styles.body}>{data.body}</p> : null}
        {data.releaseTitle || data.artist || data.playback.kind !== "none" ? <ReleaseRecord key={`${data.playback.kind}:${data.playback.url}`} data={data} staticPreview={staticPreview} /> : null}
        <div className={styles.actions}>
          {data.primaryLabel ? <EditorialLink href={data.primaryHref} primary>{data.primaryLabel}</EditorialLink> : null}
          {data.secondaryLabel ? <EditorialLink href={data.secondaryHref}>{data.secondaryLabel}</EditorialLink> : null}
        </div>
      </div>
      {data.note ? <p className={styles.releaseNote}>{data.note}</p> : null}
    </div>
  </section>;
}

export function SelectedWorkSection({ data }: { data: HomeWork; staticPreview?: boolean }) {
  const titleId = useId();
  return <section id="home-work" className={`${styles.section} ${styles.work}`} aria-labelledby={titleId}>
    <EditorialBackdrop image={data.background} />
    <div className={styles.inner}>
      <div className={styles.workCopy}>
        {data.eyebrow ? <p className={styles.eyebrow}>{data.eyebrow}</p> : null}
        <h2 className={styles.heading} id={titleId}>{data.title}</h2>
        {data.body ? <p className={styles.body}>{data.body}</p> : null}
        {data.note ? <p className={styles.workNote}>{data.note}</p> : null}
      </div>
      <div className={styles.workCards}>
        {data.cards.map(card => {
          const children = <>
            <EditorialPhoto image={card.image} className={styles.workPhoto} sizes="(max-width: 680px) 45vw, (max-width: 1050px) 24vw, 19vw" />
            <h3 className={styles.cardHeading}>{card.title}{card.href && isSafeEditorialHref(card.href) ? <Arrow /> : null}</h3>
            {card.body ? <p className={styles.cardBody}>{card.body}</p> : null}
          </>;
          return card.href && isSafeEditorialHref(card.href)
            ? <a key={card.id} className={styles.workCard} data-accent={card.tone} href={card.href}
              {...(card.href.startsWith("https://") ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{children}</a>
            : <div key={card.id} className={styles.workCard} data-accent={card.tone}>{children}</div>;
        })}
      </div>
    </div>
  </section>;
}

const PRESS_KIND_LABELS: Record<HomePressItem["kind"], string> = { review: "Review", interview: "Interview", radio: "Radio", feature: "Feature" };

function PressScan({ image }: { image: HomeEditorialImage }) {
  const [zoom, setZoom] = useState(100);
  const zoomId = useId();
  return <div className={styles.scanWrap}>
    <div className={styles.scanViewport} tabIndex={0} role="region" aria-label="Press clipping. Scroll to inspect the enlarged image.">
      {/* The reader sees the entire original clipping; card framing is intentionally not applied. */}
      <Image src={image.src} alt={image.alt || "Press clipping"} width={1200} height={1600} sizes="(max-width: 680px) 90vw, 550px" style={{ width: `${zoom}%`, height: "auto" }} />
    </div>
    <div className={styles.zoom}>
      <label htmlFor={zoomId}>Zoom</label>
      <input id={zoomId} type="range" min="100" max="250" step="10" value={zoom} onChange={event => setZoom(Number(event.currentTarget.value))} />
      <output htmlFor={zoomId}>{zoom}%</output>
    </div>
  </div>;
}

function PressReader({ items, initialId, onClose }: { items: HomePressItem[]; initialId: string; onClose: () => void }) {
  const [selectedId, setSelectedId] = useState(initialId);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const backdropPointerDown = useRef(false);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const titleId = useId();
  const index = Math.max(0, items.findIndex(item => item.id === selectedId));
  const item = items[index];

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";
    if (!dialog.open) dialog.showModal();
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      if (dialog.open) dialog.close();
      previousFocus?.focus({ preventScroll: true });
    };
  }, []);

  function navigate(direction: number) {
    setSelectedId(current => {
      const currentIndex = Math.max(0, items.findIndex(entry => entry.id === current));
      return items[Math.max(0, Math.min(items.length - 1, currentIndex + direction))]?.id ?? current;
    });
    dialogRef.current?.scrollTo({ top: 0, behavior: "instant" });
  }

  function isBackdrop(event: { currentTarget: HTMLDialogElement; target: EventTarget; clientX: number; clientY: number }) {
    if (event.currentTarget !== event.target) return false;
    const bounds = event.currentTarget.getBoundingClientRect();
    return event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom;
  }

  if (!item) return null;

  return <dialog ref={dialogRef} className={styles.dialog} aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onPointerDown={event => { backdropPointerDown.current = isBackdrop(event); }}
    onPointerCancel={() => { backdropPointerDown.current = false; }}
    onClick={event => {
      const startedOnBackdrop = backdropPointerDown.current;
      backdropPointerDown.current = false;
      if (startedOnBackdrop && isBackdrop(event)) onClose();
    }}
    onKeyDown={event => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable=true], [role=region]")) return;
      if (event.key === "ArrowLeft") { event.preventDefault(); navigate(-1); }
      if (event.key === "ArrowRight") { event.preventDefault(); navigate(1); }
    }}
    onTouchStart={event => {
      if (event.target instanceof Element && event.target.closest("a, button, input, textarea, select, [contenteditable=true], [role=region]")) { swipeStart.current = null; return; }
      const touch = event.touches[0];
      swipeStart.current = event.touches.length === 1 && touch ? { x: touch.clientX, y: touch.clientY } : null;
    }}
    onTouchMove={event => { if (event.touches.length !== 1) swipeStart.current = null; }}
    onTouchCancel={() => { swipeStart.current = null; }}
    onTouchEnd={event => {
      const start = swipeStart.current;
      swipeStart.current = null;
      const touch = event.changedTouches[0];
      if (!start || !touch) return;
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      if (Math.abs(dx) > 65 && Math.abs(dx) > Math.abs(dy) * 1.5) navigate(dx < 0 ? 1 : -1);
    }}>
    <header className={styles.dialogHeader}>
      <p>Press & reviews <span aria-hidden="true">/</span> {index + 1} of {items.length}</p>
      <button type="button" className={styles.iconButton} ref={closeRef} aria-label="Close press reader" onClick={onClose}>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="m6 6 12 12M18 6 6 18" /></svg>
      </button>
    </header>
    <article className={styles.pressEntry} data-has-image={Boolean(item.image.src)}>
      {item.image.src ? <PressScan key={`${item.id}:${item.image.src}`} image={item.image} /> : null}
      <div className={styles.entryText}>
        <p className={styles.eyebrow}>{PRESS_KIND_LABELS[item.kind]}</p>
        <h3 id={titleId}>{item.title}</h3>
        <p className={styles.entryMeta}><span>{item.publication}</span>{item.date ? <time dateTime={item.date}>{new Intl.DateTimeFormat("en", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${item.date}T00:00:00Z`))}</time> : null}</p>
        {item.quote ? <blockquote className={styles.entryQuote}>{item.quote}</blockquote> : null}
        {item.href ? <div className={styles.actions}><EditorialLink href={item.href}>Read original</EditorialLink></div> : null}
      </div>
    </article>
    <footer className={styles.dialogFooter}>
      <p role="status" aria-live="polite" aria-atomic="true">{index + 1} / {items.length} — {item.title}, {item.publication}</p>
      <div className={styles.dialogArrows}>
        <button type="button" className={styles.iconButton} aria-label="Previous press item" disabled={index === 0} onClick={() => navigate(-1)}><Arrow direction="left" /></button>
        <button type="button" className={styles.iconButton} aria-label="Next press item" disabled={index === items.length - 1} onClick={() => navigate(1)}><Arrow /></button>
      </div>
    </footer>
  </dialog>;
}

export function PressReviewsSection({ data, staticPreview = false }: { data: HomePress; staticPreview?: boolean }) {
  const titleId = useId();
  const [readerOpen, setReaderOpen] = useState(false);
  const items = data.items.filter(item => item.visible);
  if (!items.length) return null;
  const featured = items.find(item => item.id === data.featuredId) || items.find(item => Boolean(item.quote)) || items[0];
  const images = items.filter(item => Boolean(item.image.src)).slice(0, 3);
  return <section id="home-press" className={`${styles.section} ${styles.press}`} data-collage={Boolean(images.length)} aria-labelledby={titleId}>
    <EditorialBackdrop image={data.background} />
    <div className={styles.inner}>
      <div className={styles.pressCopy}>
        {data.eyebrow ? <p className={styles.eyebrow}>{data.eyebrow}</p> : null}
        <h2 className={styles.heading} id={titleId}>{data.title}</h2>
        {data.body ? <p className={styles.body}>{data.body}</p> : null}
        <div className={styles.actions}>
          <button type="button" className={styles.button} disabled={staticPreview} onClick={() => setReaderOpen(true)} aria-haspopup="dialog">{data.buttonLabel || "Explore all press"}<Arrow /></button>
        </div>
      </div>
      {images.length ? <div className={styles.collage} aria-hidden="true">
        {images.map(item => <EditorialPhoto key={item.id} image={{ ...item.image, alt: "" }} className={styles.clipping} sizes="(max-width: 680px) 65vw, 350px" />)}
      </div> : null}
      <figure className={styles.quote}>
        {featured.quote ? <blockquote>“{featured.quote}”</blockquote> : <blockquote>{featured.title}</blockquote>}
        <figcaption>— {featured.publication}</figcaption>
      </figure>
    </div>
    {readerOpen && !staticPreview ? <PressReader items={items} initialId={featured.id} onClose={() => setReaderOpen(false)} /> : null}
  </section>;
}
