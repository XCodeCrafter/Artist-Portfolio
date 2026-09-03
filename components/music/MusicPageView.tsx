"use client";

import type { ReactNode } from "react";
import AdaptiveHero from "@/components/AdaptiveHero";
import MusicPlatformsExt from "@/components/MusicPlatforms_ext";
import NewsletterBlock from "@/components/NewsletterBlock";
import SoundcloudCarousel from "@/components/SoundcloudCarousel";
import SpotifyEmbed from "@/components/SpotifyEmbed";
import type {
  MusicPageViewData,
  MusicPreviewSection,
} from "@/lib/content/music";

export const MUSIC_PREVIEW_SELECTION_MESSAGE =
  "music-preview-section-select" as const;

export type MusicPreviewSelectionMessage = {
  type: typeof MUSIC_PREVIEW_SELECTION_MESSAGE;
  section: MusicPreviewSection;
};

type MusicPageViewProps = {
  data: MusicPageViewData;
  mode?: "public" | "preview";
  onSelectSection?: (section: MusicPreviewSection) => void;
  selectedSection?: MusicPreviewSection;
};

type PreviewSectionProps = {
  children: ReactNode;
  label: string;
  mode: "public" | "preview";
  onSelect: (section: MusicPreviewSection) => void;
  section: MusicPreviewSection;
  selected: boolean;
};

function PreviewSection({
  children,
  label,
  mode,
  onSelect,
  section,
  selected,
}: PreviewSectionProps) {
  if (mode === "public") return children;

  return (
    <div
      className="group/music-preview relative"
      data-music-preview-section={section}
    >
      <div aria-hidden="true" className="pointer-events-none" inert>
        {children}
      </div>

      <button
        type="button"
        aria-label={`Edit ${label}`}
        aria-pressed={selected}
        className={[
          "absolute inset-0 z-[80] cursor-pointer border-2 transition",
          "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#ff3b1f]/55 focus-visible:ring-inset",
          selected
            ? "border-[#ff3b1f] bg-[#ff3b1f]/[0.035]"
            : "border-transparent hover:border-white/55 hover:bg-white/[0.025]",
        ].join(" ")}
        onClick={() => onSelect(section)}
      >
        <span
          className={[
            "absolute right-3 top-3 rounded-full border px-3 py-1.5",
            "font-ui text-[10px] font-semibold uppercase tracking-[0.18em] backdrop-blur-md transition",
            selected
              ? "border-[#ff3b1f]/70 bg-[#ff3b1f] text-white opacity-100"
              : "border-white/20 bg-black/70 text-white opacity-0 group-hover/music-preview:opacity-100 group-focus-within/music-preview:opacity-100",
          ].join(" ")}
        >
          {label}
        </span>
      </button>
    </div>
  );
}

function PreviewOnlyInertContent({
  children,
  mode,
}: {
  children: ReactNode;
  mode: "public" | "preview";
}) {
  if (mode === "public") return children;

  return (
    <div aria-hidden="true" className="pointer-events-none" inert>
      {children}
    </div>
  );
}

export default function MusicPageView({
  data,
  mode = "public",
  onSelectSection,
  selectedSection,
}: MusicPageViewProps) {
  const selectSection = (section: MusicPreviewSection) => {
    if (onSelectSection) {
      onSelectSection(section);
      return;
    }

    if (mode === "preview" && window.parent !== window) {
      const message: MusicPreviewSelectionMessage = {
        type: MUSIC_PREVIEW_SELECTION_MESSAGE,
        section,
      };
      window.parent.postMessage(message, window.location.origin);
    }
  };

  return (
    <main>
      <PreviewSection
        label="Hero"
        mode={mode}
        onSelect={selectSection}
        section="hero"
        selected={selectedSection === "hero"}
      >
        <AdaptiveHero {...data.hero} />
      </PreviewSection>

      <div className="public-nav-anchor" id="music">
        <PreviewSection
          label="Platforms"
          mode={mode}
          onSelect={selectSection}
          section="platforms"
          selected={selectedSection === "platforms"}
        >
          <MusicPlatformsExt
            cards={data.platforms}
            interactionMode={mode}
          />
        </PreviewSection>

        <PreviewSection
          label="Spotify"
          mode={mode}
          onSelect={selectSection}
          section="spotify"
          selected={selectedSection === "spotify"}
        >
          <section
            className="public-nav-anchor mx-auto max-w-[1400px] px-5 py-14 sm:px-8 sm:py-18"
            id="spotify-releases"
          >
            <h2
              className="text-5xl sm:text-7xl font-semibold tracking-tight text-white"
              data-reveal="up"
            >
              {data.spotify.heading}
            </h2>

            <div className="mt-8" data-reveal="up" data-reveal-delay="140">
              <SpotifyEmbed
                embedUrl={data.spotify.embedUrl}
                openUrl={data.spotify.artistUrl}
                title="Spotify Releases"
                heightMobile={352}
                heightDesktop={520}
              />
            </div>
          </section>
        </PreviewSection>

        <PreviewSection
          label="SoundCloud"
          mode={mode}
          onSelect={selectSection}
          section="soundcloud"
          selected={selectedSection === "soundcloud"}
        >
          <section
            className="public-nav-anchor mx-auto max-w-[1400px] px-5 pb-18 sm:px-8"
            id="soundcloud-mixes"
          >
            <h2
              className="text-5xl sm:text-7xl font-semibold tracking-tight text-white"
              data-reveal="up"
            >
              {data.soundcloud.heading}
            </h2>

            <div className="mt-8">
              <SoundcloudCarousel
                items={data.soundcloud.tracks}
                showTitles={false}
                autoPlay={false}
                interactionMode={mode}
              />
            </div>
          </section>
        </PreviewSection>

        <PreviewOnlyInertContent mode={mode}>
          <div className="mt-16">
            <NewsletterBlock {...data.footer} />
          </div>
        </PreviewOnlyInertContent>
      </div>
    </main>
  );
}
