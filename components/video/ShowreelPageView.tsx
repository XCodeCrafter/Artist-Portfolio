"use client";

import type { ReactNode } from "react";
import AdaptiveHero from "@/components/AdaptiveHero";
import NewsletterBlock from "@/components/NewsletterBlock";
import ShowreelWorks from "@/components/ShowreelWorks";
import type {
  FooterEffect,
  HeroContent,
  SocialLink,
  VideoItem,
  VideoPresentation,
} from "@/lib/content";

export const SHOWREEL_PREVIEW_SECTIONS = [
  "hero",
  "introduction",
  "works",
] as const;

export type ShowreelPreviewSection =
  (typeof SHOWREEL_PREVIEW_SECTIONS)[number];

export const SHOWREEL_PREVIEW_SELECTION_MESSAGE =
  "showreel-preview-section-select" as const;

export type ShowreelPreviewSelectionMessage = {
  type: typeof SHOWREEL_PREVIEW_SELECTION_MESSAGE;
  section: ShowreelPreviewSection;
  itemId?: string;
};

export type ShowreelPageViewData = {
  hero: HeroContent;
  presentation: VideoPresentation;
  videos: VideoItem[];
  footer: {
    artistName: string;
    contactBlurb: string;
    footerEffect: FooterEffect;
    location: string;
    socialLinks: SocialLink[];
    tagline: string;
  };
};

function HeroPreviewRegion({
  children,
  mode,
  onSelect,
  selected,
}: {
  children: ReactNode;
  mode: "public" | "preview";
  onSelect: () => void;
  selected: boolean;
}) {
  if (mode === "public") return children;
  return (
    <div
      className="group/showreel-hero-preview relative"
      data-showreel-preview-section="hero"
    >
      <div aria-hidden="true" className="pointer-events-none" inert>
        {children}
      </div>
      <button
        aria-label="Edit Hero"
        aria-pressed={selected}
        className={`absolute inset-0 z-[80] cursor-pointer border-2 transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#ff3b1f]/55 focus-visible:ring-inset ${
          selected
            ? "border-[#ff3b1f] bg-[#ff3b1f]/[0.035]"
            : "border-transparent hover:border-white/55 hover:bg-white/[0.025]"
        }`}
        onClick={onSelect}
        type="button"
      >
        <span
          className={`font-ui absolute right-3 top-3 rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] backdrop-blur-md transition ${
            selected
              ? "border-[#ff3b1f]/70 bg-[#ff3b1f] text-white opacity-100"
              : "border-white/20 bg-black/70 text-white opacity-0 group-hover/showreel-hero-preview:opacity-100 group-focus-within/showreel-hero-preview:opacity-100"
          }`}
        >
          Hero
        </span>
      </button>
    </div>
  );
}

export default function ShowreelPageView({
  data,
  mode = "public",
  onSelectSection,
  selectedSection,
}: {
  data: ShowreelPageViewData;
  mode?: "public" | "preview";
  onSelectSection?: (section: ShowreelPreviewSection, itemId?: string) => void;
  selectedSection?: ShowreelPreviewSection;
}) {
  function selectSection(section: ShowreelPreviewSection, itemId?: string) {
    if (onSelectSection) {
      onSelectSection(section, itemId);
      return;
    }
    if (mode === "preview" && window.parent !== window) {
      const message: ShowreelPreviewSelectionMessage = {
        type: SHOWREEL_PREVIEW_SELECTION_MESSAGE,
        section,
        ...(itemId ? { itemId } : {}),
      };
      window.parent.postMessage(message, window.location.origin);
    }
  }

  return (
    <main>
      <HeroPreviewRegion
        mode={mode}
        onSelect={() => selectSection("hero")}
        selected={selectedSection === "hero"}
      >
        <AdaptiveHero {...data.hero} staticPreview={mode === "preview"} />
      </HeroPreviewRegion>

      <ShowreelWorks
        mode={mode}
        onSelectSection={selectSection}
        presentation={data.presentation}
        selectedSection={selectedSection}
        videos={data.videos}
      />

      <div
        aria-hidden={mode === "preview" ? "true" : undefined}
        className={mode === "preview" ? "pointer-events-none" : undefined}
        inert={mode === "preview" ? true : undefined}
      >
        <NewsletterBlock {...data.footer} />
      </div>
    </main>
  );
}
