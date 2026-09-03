"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import AdaptiveHero from "@/components/AdaptiveHero";
import GalleryFooter from "@/components/GalleryFooter";
import GalleryShowcase from "@/components/GalleryShowcase";
import type {
  FooterEffect,
  GalleryImage,
  GalleryPresentation,
  HeroContent,
  SocialLink,
} from "@/lib/content";

export const GALLERY_PREVIEW_SECTIONS = [
  "hero",
  "introduction",
  "frames",
] as const;

export type GalleryPreviewSection =
  (typeof GALLERY_PREVIEW_SECTIONS)[number];

export const GALLERY_PREVIEW_SELECTION_MESSAGE =
  "gallery-preview-section-select" as const;

export type GalleryPreviewSelectionMessage = {
  type: typeof GALLERY_PREVIEW_SELECTION_MESSAGE;
  section: GalleryPreviewSection;
};

export type GalleryPageViewData = {
  hero: HeroContent;
  presentation: GalleryPresentation;
  images: GalleryImage[];
  footer: {
    artistName: string;
    contactBlurb: string;
    footerEffect: FooterEffect;
    location: string;
    socialLinks: SocialLink[];
    tagline: string;
  };
};

type PreviewMode = "public" | "preview";

function PreviewSection({
  children,
  label,
  mode,
  onSelect,
  section,
  selected,
}: {
  children: ReactNode;
  label: string;
  mode: PreviewMode;
  onSelect: (section: GalleryPreviewSection) => void;
  section: GalleryPreviewSection;
  selected: boolean;
}) {
  if (mode === "public") return children;

  return (
    <div
      className="group/gallery-preview relative"
      data-gallery-preview-section={section}
    >
      <div aria-hidden="true" className="pointer-events-none" inert>
        {children}
      </div>
      <button
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
        type="button"
      >
        <PreviewLabel label={label} selected={selected} />
      </button>
    </div>
  );
}

function PreviewLabel({ label, selected }: { label: string; selected: boolean }) {
  return (
    <span
      className={[
        "absolute right-3 top-3 rounded-full border px-3 py-1.5",
        "font-ui text-[10px] font-semibold uppercase tracking-[0.18em] backdrop-blur-md transition",
        selected
          ? "border-[#ff3b1f]/70 bg-[#ff3b1f] text-white opacity-100"
          : "border-white/20 bg-black/70 text-white opacity-0 group-hover/gallery-preview:opacity-100 group-focus-within/gallery-preview:opacity-100",
      ].join(" ")}
    >
      {label}
    </span>
  );
}

function GalleryEmptyState() {
  return (
    <section
      className="public-nav-anchor mx-auto max-w-[1400px] px-5 py-14 sm:px-8 sm:py-18"
      data-gallery-preview-part="frames"
      id="gallery"
    >
      <div className="rounded-[28px] border border-white/10 bg-white/[0.055] p-10 text-center text-white/65">
        Gallery images are coming soon.
      </div>
    </section>
  );
}

function GalleryArchive({
  data,
  mode,
  onSelect,
  selectedSection,
}: {
  data: GalleryPageViewData;
  mode: PreviewMode;
  onSelect: (section: GalleryPreviewSection) => void;
  selectedSection?: GalleryPreviewSection;
}) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [regions, setRegions] = useState<
    Array<{
      height: number;
      section: "introduction" | "frames";
      top: number;
    }>
  >([]);
  const content = data.images.length ? (
    <GalleryShowcase
      images={data.images}
      presentation={data.presentation}
    />
  ) : (
    <GalleryEmptyState />
  );

  useEffect(() => {
    if (mode !== "preview") return;
    const root = contentRef.current;
    if (!root) return;

    const measure = () => {
      const rootRect = root.getBoundingClientRect();
      const next = (["introduction", "frames"] as const).flatMap(
        (section) => {
          const element = root.querySelector<HTMLElement>(
            `[data-gallery-preview-part="${section}"]`
          );
          if (!element) return [];
          const rect = element.getBoundingClientRect();
          return [
            {
              height: Math.max(1, rect.height),
              section,
              top: rect.top - rootRect.top,
            },
          ];
        }
      );
      setRegions((current) =>
        JSON.stringify(current) === JSON.stringify(next) ? current : next
      );
    };

    const frame = window.requestAnimationFrame(measure);
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    root
      .querySelectorAll<HTMLElement>("[data-gallery-preview-part]")
      .forEach((element) => observer.observe(element));
    window.addEventListener("resize", measure);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [data.images, data.presentation, mode]);

  if (mode === "public") return content;

  return (
    <div className="group/gallery-preview relative">
      <div
        aria-hidden="true"
        className="pointer-events-none"
        inert
        ref={contentRef}
      >
        {content}
      </div>
      {regions.map((region) => {
        const label = region.section === "introduction" ? "Introduction" : "Frames";
        const selected = selectedSection === region.section;
        return (
          <div
            className={[
              "pointer-events-none absolute inset-x-0 z-[80] border-2 transition",
              selected
                ? "border-[#ff3b1f] bg-[#ff3b1f]/[0.035]"
                : "border-transparent",
            ].join(" ")}
            data-gallery-preview-section={region.section}
            key={region.section}
            style={{ height: region.height, top: region.top }}
          >
            <button
              aria-label={`Edit ${label}`}
              aria-pressed={selected}
              className="pointer-events-auto absolute inset-0 cursor-pointer focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#ff3b1f]/55 focus-visible:ring-inset"
              onClick={() => onSelect(region.section)}
              type="button"
            >
              <PreviewLabel label={label} selected={selected} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function PreviewOnlyInertContent({
  children,
  mode,
}: {
  children: ReactNode;
  mode: PreviewMode;
}) {
  if (mode === "public") return children;

  return (
    <div aria-hidden="true" className="pointer-events-none" inert>
      {children}
    </div>
  );
}

export default function GalleryPageView({
  data,
  mode = "public",
  onSelectSection,
  selectedSection,
}: {
  data: GalleryPageViewData;
  mode?: PreviewMode;
  onSelectSection?: (section: GalleryPreviewSection) => void;
  selectedSection?: GalleryPreviewSection;
}) {
  const selectSection = (section: GalleryPreviewSection) => {
    if (onSelectSection) {
      onSelectSection(section);
      return;
    }

    if (mode === "preview" && window.parent !== window) {
      const message: GalleryPreviewSelectionMessage = {
        type: GALLERY_PREVIEW_SELECTION_MESSAGE,
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

      <GalleryArchive
        data={data}
        mode={mode}
        onSelect={selectSection}
        selectedSection={selectedSection}
      />

      <PreviewOnlyInertContent mode={mode}>
        <GalleryFooter {...data.footer} />
      </PreviewOnlyInertContent>
    </main>
  );
}
