"use client";

import type { ReactNode } from "react";
import AdaptiveHero from "@/components/AdaptiveHero";
import BookingForm from "@/components/BookingForm";
import type { HeroContent } from "@/lib/content/types";

export const CONTACT_PREVIEW_SECTIONS = ["hero", "details"] as const;

export type ContactPreviewSection =
  (typeof CONTACT_PREVIEW_SECTIONS)[number];

export const CONTACT_PREVIEW_SELECTION_MESSAGE =
  "contact-preview-section-select" as const;

export type ContactPreviewSelectionMessage = {
  type: typeof CONTACT_PREVIEW_SELECTION_MESSAGE;
  section: ContactPreviewSection;
};

export type ContactPageViewData = {
  hero: HeroContent;
  details: {
    contactBlurb: string;
    location: string;
  };
};

type PreviewMode = "public" | "preview";

function PreviewLabel({ label, selected }: { label: string; selected: boolean }) {
  return (
    <span
      className={[
        "absolute right-3 top-3 rounded-full border px-3 py-1.5",
        "font-ui text-[10px] font-semibold uppercase tracking-[0.18em] backdrop-blur-md transition",
        selected
          ? "border-[#ff3b1f]/70 bg-[#ff3b1f] text-white opacity-100"
          : "border-white/20 bg-black/70 text-white opacity-0 group-hover/contact-preview:opacity-100 group-focus-within/contact-preview:opacity-100",
      ].join(" ")}
    >
      {label}
    </span>
  );
}

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
  onSelect: (section: ContactPreviewSection) => void;
  section: ContactPreviewSection;
  selected: boolean;
}) {
  if (mode === "public") return children;

  return (
    <div
      className="group/contact-preview relative"
      data-contact-preview-section={section}
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

export default function ContactPageView({
  data,
  mode = "public",
  onSelectSection,
  selectedSection,
}: {
  data: ContactPageViewData;
  mode?: PreviewMode;
  onSelectSection?: (section: ContactPreviewSection) => void;
  selectedSection?: ContactPreviewSection;
}) {
  const selectSection = (section: ContactPreviewSection) => {
    if (onSelectSection) {
      onSelectSection(section);
      return;
    }

    if (mode === "preview" && window.parent !== window) {
      const message: ContactPreviewSelectionMessage = {
        type: CONTACT_PREVIEW_SELECTION_MESSAGE,
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
        <AdaptiveHero {...data.hero} staticPreview={mode === "preview"} />
      </PreviewSection>

      <PreviewSection
        label="Contact & form"
        mode={mode}
        onSelect={selectSection}
        section="details"
        selected={selectedSection === "details"}
      >
        <section className="public-nav-anchor py-24 md:py-32" id="form">
          <BookingForm
            contactBlurb={data.details.contactBlurb}
            location={data.details.location}
          />
        </section>
      </PreviewSection>
    </main>
  );
}
