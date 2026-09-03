"use client";

import type { ReactNode } from "react";
import AdaptiveHero from "@/components/AdaptiveHero";
import BioScrollGallery from "@/components/BioScrollGallery";
import NewsletterBlock from "@/components/NewsletterBlock";
import type {
  ActorCredit,
  ActorCreditType,
  ActorResume,
  FooterEffect,
  HeroContent,
  SocialLink,
} from "@/lib/content";
import type { BioContent } from "@/lib/content/types";

export const BIO_PREVIEW_SECTIONS = [
  "hero",
  "biography",
  "resume",
  "credits",
] as const;

export type BioPreviewSection = (typeof BIO_PREVIEW_SECTIONS)[number];

export type BioPageViewData = {
  hero: HeroContent;
  bio: BioContent;
  resume: ActorResume;
  hasResumeDetails: boolean;
  credits: ActorCredit[];
  footer: {
    artistName: string;
    contactBlurb: string;
    footerEffect: FooterEffect;
    location: string;
    socialLinks: SocialLink[];
    tagline: string;
  };
};

export const BIO_PREVIEW_SELECTION_MESSAGE =
  "bio-preview-section-select" as const;

export type BioPreviewSelectionMessage = {
  type: typeof BIO_PREVIEW_SELECTION_MESSAGE;
  section: BioPreviewSection;
};

type PreviewSectionProps = {
  children: ReactNode;
  label: string;
  mode: "public" | "preview";
  onSelect: (section: BioPreviewSection) => void;
  section: BioPreviewSection;
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
      className="group/bio-preview relative"
      data-bio-preview-section={section}
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
              : "border-white/20 bg-black/70 text-white opacity-0 group-hover/bio-preview:opacity-100 group-focus-within/bio-preview:opacity-100",
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

const creditTypeLabels: Record<ActorCreditType, string> = {
  film: "Film",
  television: "Television",
  theatre: "Theatre",
  commercial: "Commercial",
  voiceover: "Voiceover",
  training: "Training",
  other: "Other",
};

const creditTypeOrder: ActorCreditType[] = [
  "film",
  "television",
  "theatre",
  "commercial",
  "voiceover",
  "training",
  "other",
];

function splitList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function Detail({ label, value }: { label: string; value: string }) {
  if (!value) return null;

  return (
    <div className="border-t border-white/10 py-4">
      <dt className="text-xs uppercase tracking-[0.24em] text-white/40">
        {label}
      </dt>
      <dd className="mt-2 text-sm text-white/75">{value}</dd>
    </div>
  );
}

function TagList({ label, value }: { label: string; value: string }) {
  const items = splitList(value);
  if (!items.length) return null;

  return (
    <div>
      <h3 className="text-xs uppercase tracking-[0.24em] text-white/40">
        {label}
      </h3>
      <div className="mt-3 flex flex-wrap gap-2">
        {items.map((item) => (
          <span
            className="rounded-md border border-white/10 px-3 py-2 text-sm text-white/70"
            key={item}
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

function ResumeDetails({
  hasResumeDetails,
  resume,
}: {
  hasResumeDetails: boolean;
  resume: ActorResume;
}) {
  if (!hasResumeDetails) {
    return (
      <div>
        <p className="text-xs uppercase tracking-[0.32em] text-white/45">
          Resume &amp; Credits
        </p>
        <h2 className="heading-ui mt-3 text-3xl text-white sm:text-4xl">
          Selected acting work
        </h2>
      </div>
    );
  }

  return (
    <div>
      <p className="text-xs uppercase tracking-[0.32em] text-white/45">
        Resume
      </p>
      <h2
        className="heading-ui mt-3 text-3xl text-white sm:text-4xl"
        data-reveal="up"
      >
        {resume.headline || "Actor Resume"}
      </h2>
      {resume.summary ? (
        <p
          className="mt-5 text-sm leading-7 text-white/65"
          data-reveal="up"
          data-reveal-delay="80"
        >
          {resume.summary}
        </p>
      ) : null}
      {resume.resumeUrl ? (
        <a
          className="mt-6 inline-flex h-11 items-center rounded-md bg-white px-4 text-sm font-semibold text-black transition hover:bg-white/85"
          href={resume.resumeUrl}
        >
          Download Resume
        </a>
      ) : null}

      <dl className="mt-8">
        <Detail label="Location" value={resume.location} />
        <Detail label="Playing age" value={resume.playingAge} />
        <Detail label="Height" value={resume.height} />
        <Detail label="Eyes" value={resume.eyes} />
        <Detail label="Hair" value={resume.hair} />
        <Detail label="Representation" value={resume.representation} />
      </dl>

      <div className="mt-8 grid gap-6">
        <TagList label="Languages" value={resume.languages} />
        <TagList label="Skills" value={resume.skills} />
      </div>
    </div>
  );
}

function CreditRow({ credit }: { credit: ActorCredit }) {
  const body = (
    <article
      className="grid gap-4 border-t border-white/10 py-5 sm:grid-cols-[1fr_0.8fr_0.6fr]"
      data-reveal="up"
    >
      <div>
        <h4 className="text-lg font-semibold text-white">{credit.title}</h4>
        {credit.production ? (
          <p className="mt-1 text-sm text-white/55">{credit.production}</p>
        ) : null}
      </div>
      <div className="text-sm leading-6 text-white/65">
        {credit.role ? <div>{credit.role}</div> : null}
        {credit.director ? <div>Dir. {credit.director}</div> : null}
      </div>
      <div className="text-sm text-white/45 sm:text-right">{credit.year}</div>
    </article>
  );

  if (!credit.href) return body;

  return (
    <a className="block transition hover:bg-white/[0.03]" href={credit.href}>
      {body}
    </a>
  );
}

function Credits({ credits }: { credits: ActorCredit[] }) {
  const groupedCredits = creditTypeOrder
    .map((type) => ({
      type,
      items: credits.filter((credit) => credit.creditType === type),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <div>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.32em] text-white/45">
            Credits
          </p>
          <h3 className="heading-ui mt-3 text-2xl text-white">Selected Work</h3>
        </div>
        <span className="text-sm text-white/45">{credits.length} items</span>
      </div>

      {groupedCredits.length ? (
        <div className="grid gap-8">
          {groupedCredits.map((group) => (
            <div key={group.type}>
              <h3 className="text-sm uppercase tracking-[0.28em] text-white/45">
                {creditTypeLabels[group.type]}
              </h3>
              <div className="mt-2">
                {group.items.map((credit) => (
                  <CreditRow credit={credit} key={credit.id} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-white/10 bg-white/5 p-8 text-center text-white/65">
          Credits are coming soon.
        </div>
      )}
    </div>
  );
}

function ResumeAndCredits({
  credits,
  hasResumeDetails,
  mode,
  onSelectSection,
  resume,
  selectedSection,
}: {
  credits: ActorCredit[];
  hasResumeDetails: boolean;
  mode: "public" | "preview";
  onSelectSection: (section: BioPreviewSection) => void;
  resume: ActorResume;
  selectedSection?: BioPreviewSection;
}) {
  return (
    <section
      className="public-nav-anchor mx-auto max-w-[1400px] px-5 py-14 sm:px-8 sm:py-18"
      id="resume"
    >
      <div className="grid gap-10 lg:grid-cols-[0.9fr_1.4fr]">
        <PreviewSection
          label="Resume"
          mode={mode}
          onSelect={onSelectSection}
          section="resume"
          selected={selectedSection === "resume"}
        >
          <ResumeDetails
            hasResumeDetails={hasResumeDetails || mode === "preview"}
            resume={resume}
          />
        </PreviewSection>

        <PreviewSection
          label="Credits"
          mode={mode}
          onSelect={onSelectSection}
          section="credits"
          selected={selectedSection === "credits"}
        >
          <Credits credits={credits} />
        </PreviewSection>
      </div>
    </section>
  );
}

export default function BioPageView({
  data,
  mode = "public",
  onSelectSection,
  selectedSection,
}: {
  data: BioPageViewData;
  mode?: "public" | "preview";
  onSelectSection?: (section: BioPreviewSection) => void;
  selectedSection?: BioPreviewSection;
}) {
  const selectSection = (section: BioPreviewSection) => {
    if (onSelectSection) {
      onSelectSection(section);
      return;
    }

    if (mode === "preview" && window.parent !== window) {
      const message: BioPreviewSelectionMessage = {
        type: BIO_PREVIEW_SELECTION_MESSAGE,
        section,
      };
      window.parent.postMessage(message, window.location.origin);
    }
  };
  const hasBiographyContent = Boolean(
    data.bio.topLabel.trim() ||
      data.bio.introText.trim() ||
      data.bio.caption.trim() ||
      data.bio.galleryImages.length ||
      data.bio.paragraphs.length
  );
  const hasResumeContent = data.hasResumeDetails || data.credits.length > 0;

  return (
    <>
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

        {hasBiographyContent || mode === "preview" ? (
          <PreviewSection
            label="Biography"
            mode={mode}
            onSelect={selectSection}
            section="biography"
            selected={selectedSection === "biography"}
          >
            <div className="public-nav-anchor" id="bio">
              <BioScrollGallery
                hasBody={data.bio.paragraphs.length > 0}
                images={data.bio.galleryImages
                  .filter((image) => image.src)
                  .map((image) => ({
                    src: image.src,
                    alt: image.alt,
                  }))}
                topLabel={data.bio.topLabel}
                introText={data.bio.introText}
                caption={data.bio.caption}
              >
                {data.bio.paragraphs.map((paragraph) => (
                  <p
                    key={paragraph.id}
                    data-reveal="up"
                    data-reveal-delay={String(paragraph.revealDelay)}
                  >
                    {paragraph.body}
                  </p>
                ))}
              </BioScrollGallery>
            </div>
          </PreviewSection>
        ) : null}

        {hasResumeContent || mode === "preview" ? (
          <ResumeAndCredits
            credits={data.credits}
            hasResumeDetails={data.hasResumeDetails}
            mode={mode}
            onSelectSection={selectSection}
            resume={data.resume}
            selectedSection={selectedSection}
          />
        ) : null}
      </main>

      <PreviewOnlyInertContent mode={mode}>
        <NewsletterBlock {...data.footer} />
      </PreviewOnlyInertContent>
    </>
  );
}
