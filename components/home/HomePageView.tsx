"use client";

import type { ReactNode } from "react";
import AboutHome from "@/components/AboutHome";
import AdaptiveHero from "@/components/AdaptiveHero";
import CncCodeShowcase from "@/components/CncCodeShowcase";
import GalleryShowcase from "@/components/GalleryShowcase";
import type { HomeEditorDraft, HomeEditorSection } from "@/lib/admin/home-editor";
import type { CncProgramDefinition } from "@/lib/cnc-code";
import type { GalleryImage, GalleryPresentation } from "@/lib/content/types";

export const HOME_PREVIEW_SELECTION_MESSAGE = "home-preview-section-select" as const;

type HomeContentSection = HomeEditorDraft["layout"][number]["id"];
type ViewMode = "public" | "preview";

const sectionLabels: Record<HomeContentSection, string> = {
  hero: "Hero",
  about: "About",
  cnc: "Code in motion",
  feature: "Featured video",
  stories: "Stories",
};

export type HomePreviewSelectionMessage = {
  type: typeof HOME_PREVIEW_SELECTION_MESSAGE;
  section: HomeContentSection;
};

function PreviewSection({ children, section, selected, onSelect, placeholder }: {
  children?: ReactNode;
  section: HomeContentSection;
  selected: boolean;
  onSelect: (section: HomeContentSection) => void;
  placeholder?: string;
}) {
  const label = sectionLabels[section];

  return (
    <div className="group/home-preview relative" data-home-preview-section={section}>
      <div aria-hidden="true" className="pointer-events-none" inert>
        {placeholder ? (
          <div className="flex min-h-32 items-center justify-between gap-4 border-y border-dashed border-white/15 bg-white/[0.025] px-8 py-10">
            <span className="font-ui text-sm font-semibold text-white/75">{label}</span>
            <span className="text-sm text-white/45">{placeholder}</span>
          </div>
        ) : children}
      </div>
      <button
        aria-label={`Edit ${label}${placeholder ? ` — ${placeholder}` : ""}`}
        aria-pressed={selected}
        className={[
          "absolute inset-0 z-[80] cursor-pointer border-2 transition",
          "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#ff3b1f]/55 focus-visible:ring-inset",
          selected ? "border-[#ff3b1f] bg-[#ff3b1f]/[0.035]" : "border-transparent hover:border-white/55 hover:bg-white/[0.025]",
        ].join(" ")}
        onClick={() => onSelect(section)}
        type="button"
      >
        <span className={[
          "absolute right-3 top-3 rounded-full border px-3 py-1.5 font-ui text-[10px] font-semibold uppercase tracking-[0.18em] backdrop-blur-md transition",
          selected ? "border-[#ff3b1f]/70 bg-[#ff3b1f] text-white" : "border-white/20 bg-black/70 text-white opacity-0 group-hover/home-preview:opacity-100 group-focus-within/home-preview:opacity-100",
        ].join(" ")}>{label}</span>
      </button>
    </div>
  );
}

export default function HomePageView({
  data,
  programs,
  mode = "public",
  onSelectSection,
  selectedSection,
}: {
  data: HomeEditorDraft;
  programs: CncProgramDefinition[];
  mode?: ViewMode;
  onSelectSection?: (section: HomeEditorSection) => void;
  selectedSection?: HomeEditorSection;
}) {
  const storyImages: GalleryImage[] = data.stories.images
    .map((image, index) => ({
      id: `home-story-${index + 1}`,
      src: image.src,
      framing: image.framing,
      title: image.title,
      caption: image.body,
      alt: image.alt,
      category: "Story",
      isMosaic: false,
      isFreelanceStory: true,
      freelanceStoryOrder: index,
    }))
    .filter((image) => Boolean(image.src));
  const presentation: GalleryPresentation = {
    introEyebrow: "",
    introTitle: "",
    interludeLabel: data.feature.label,
    interludeMeta: data.feature.meta,
    interludeEyebrow: data.feature.eyebrow,
    interludeTitle: data.feature.title,
    interludeVideoSrc: data.feature.videoSrc,
    interludePosterSrc: data.feature.posterSrc,
    storyLabel: data.stories.label,
    storyScrollLabel: data.stories.scrollLabel,
  };

  function selectSection(section: HomeContentSection) {
    if (onSelectSection) {
      onSelectSection(section);
    } else if (mode === "preview" && window.parent !== window) {
      const message: HomePreviewSelectionMessage = { type: HOME_PREVIEW_SELECTION_MESSAGE, section };
      window.parent.postMessage(message, window.location.origin);
    }
  }

  function renderSection(section: HomeContentSection) {
    switch (section) {
      case "hero":
        return <AdaptiveHero {...data.hero} staticPreview={mode === "preview"} />;
      case "about":
        return <AboutHome content={data.about} />;
      case "cnc":
        return <CncCodeShowcase copy={data.cnc} programs={programs} />;
      case "feature":
        return (
          <GalleryShowcase
            images={[]}
            interludeBody={data.feature.body}
            interludeCtaHref={data.feature.ctaHref}
            interludeCtaLabel={data.feature.ctaLabel}
            interludePosterSrc={data.feature.posterSrc}
            interludePosterFraming={data.feature.posterFraming}
            interludeTitle={data.feature.title}
            interludeVideoSrc={data.feature.videoSrc}
            mode="narrative"
            narrativeSection="feature"
            presentation={presentation}
            staticPreview={mode === "preview"}
          />
        );
      case "stories":
        return (
          <GalleryShowcase
            images={storyImages}
            mode="narrative"
            narrativeSection="stories"
            presentation={presentation}
            storyBody={data.stories.body}
            storyCtaHref={data.stories.ctaHref}
            storyCtaLabel={data.stories.ctaLabel}
            storyTitle={data.stories.title}
          />
        );
    }
  }

  return (
    <main>
      {data.layout.map(({ id, enabled }) => {
        const placeholder = !enabled
          ? "Hidden on the website"
          : id === "cnc" && !programs.length
            ? "No published CNC programs yet"
            : id === "stories" && !storyImages.length
              ? "Add a story image to display this section"
              : undefined;

        if (mode === "public") {
          return placeholder ? null : <div data-home-section={id} key={id}>{renderSection(id)}</div>;
        }

        return (
          <PreviewSection key={id} onSelect={selectSection} placeholder={placeholder} section={id} selected={selectedSection === id}>
            {placeholder ? null : renderSection(id)}
          </PreviewSection>
        );
      })}
    </main>
  );
}
