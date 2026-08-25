"use client";

import Image from "next/image";
import Link from "next/link";
import {
  createContext,
  useCallback,
  useEffect,
  useId,
  useContext,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  FaArrowDown,
  FaArrowUp,
  FaBars,
  FaCheck,
  FaEye,
  FaEyeSlash,
  FaExclamationTriangle,
  FaExternalLinkAlt,
  FaGlobe,
  FaImages,
  FaPalette,
  FaPlay,
  FaPlus,
  FaTrash,
} from "react-icons/fa";
import ActionButton from "@/components/admin/ActionButton";
import AdminDisclosure from "@/components/admin/AdminDisclosure";
import MediaAssetPicker from "@/components/admin/MediaAssetPicker";
import useUnsavedChangesGuard from "@/components/admin/useUnsavedChangesGuard";
import SocialPlatformIcon from "@/components/SocialPlatformIcon";
import {
  getProfilePublicModules,
  getVisibleNavigationModules,
  isModuleEnabled,
} from "@/lib/content/modules";
import {
  ACTOR_CREDIT_TYPES,
  type FooterEffect,
  type PageSlug,
  type PortfolioType,
} from "@/lib/content/types";
import {
  detectSocialPlatform,
  getSocialPlatformDefinition,
  getSocialPlatformOptions,
} from "@/lib/content/social-platforms";
import {
  BODY_FONT_OPTIONS,
  DISPLAY_FONT_OPTIONS,
  UI_FONT_OPTIONS,
} from "@/lib/content/fonts";
import type {
  EditableActorCredit,
  EditableBioGalleryImage,
  EditableBioParagraph,
  EditableMusicPlatformLink,
  EditablePortfolioContent,
  EditableSocialLink,
  EditableSoundcloudTrack,
} from "@/lib/admin/content";
import type { MediaAsset } from "@/lib/admin/media";
import {
  deleteActorCredit,
  deleteBioGalleryImage,
  deleteMusicPlatformLink,
  deleteSocialLink,
  deleteSoundcloudTrack,
  saveActorCredit,
  saveBioGalleryImage,
  saveBioParagraphs,
  saveMusicPlatformLink,
  saveSocialLink,
  saveSoundcloudTrack,
  updateActorResume,
  updateAboutHome,
  updateBioProfile,
  updateBrandIdentitySettings,
  updateContactSettings,
  updateFooterEffectSettings,
  updateHomePresentation,
  updateMusicSettings,
  updateNavigationSettings,
  updatePageHero,
  updateTypographySettings,
} from "@/app/admin/content/actions";

type ContentEditorProps = {
  assets: MediaAsset[];
  content: EditablePortfolioContent;
  isConfigured: boolean;
  loadError?: string;
  status?: string;
};

const statusCopy: Record<string, string> = {
  deleted: "Item deleted.",
  invalid:
    "Some fields need attention. Links must use https://, a local /path, or an #anchor.",
  "missing-service":
    "Server-side Supabase admin key is missing, so content cannot be saved.",
  "save-error": "Save failed. Check Supabase logs and environment variables.",
  "security-error": "Request origin was blocked. Refresh admin and try again.",
  "saved-actor-credit": "Actor credit saved.",
  "saved-actor-resume": "Actor resume saved.",
  "saved-bio": "Bio profile saved.",
  "saved-bio-gallery": "Bio image saved.",
  "saved-bio-paragraph": "Bio paragraph saved.",
  "saved-bio-paragraphs": "All biography paragraphs saved.",
  "saved-gallery-image": "Gallery image saved.",
  "saved-hero": "Hero saved.",
  "saved-home": "Homepage about block saved.",
  "saved-home-presentation": "Homepage section text and media saved.",
  "saved-music-link": "Music link saved.",
  "saved-navigation": "Navigation visibility saved.",
  "saved-brand-settings": "Brand identity and text saved.",
  "saved-contact-settings": "Contact details saved.",
  "saved-footer-effect-settings": "Footer interaction saved.",
  "saved-music-settings": "Spotify settings saved.",
  "saved-typography-settings": "Typography saved.",
  "saved-settings": "Site settings saved.",
  "saved-social": "Footer link saved.",
  "saved-track": "SoundCloud track saved.",
  "saved-update": "Homepage update saved.",
  "saved-video": "Video saved.",
  "invalid-navigation":
    "Keep at least one page visible in the navbar.",
  "invalid-brand-settings":
    "Brand settings were not saved. Artist name is required and text must stay within the field limits.",
  "invalid-contact-settings":
    "Contact details were not saved. Short text supports 220 characters and the introduction supports 1,000.",
  "invalid-music-settings":
    "Spotify settings were not saved. Use a complete https:// URL or leave the field empty.",
  "navigation-migration-required":
    "Navbar visibility needs the 0021_navbar_visibility database migration before it can be saved.",
  "navigation-settings-required":
    "Save Brand & style once before saving navigation on a new database.",
  "settings-required":
    "Save Brand & style once before editing this section on a new database.",
  "footer-effect-migration-required":
    "Identity and text can still be saved. Footer interaction needs the safe 0022_repair_footer_effect database migration.",
  "typography-migration-required":
    "Typography fields need the 0012_typography_settings database migration before they can be saved.",
};

const sectionClass =
  "scroll-mt-28 rounded-[28px] border border-white/12 bg-white/[0.07] p-5 shadow-[0_22px_80px_rgba(0,0,0,0.28)] backdrop-blur-2xl sm:p-6";
const itemClass =
  "rounded-[24px] border border-white/10 bg-black/24 p-4 shadow-[0_16px_55px_rgba(0,0,0,0.18)] transition duration-300 hover:border-white/18 hover:bg-white/[0.055]";
const labelClass = "text-xs font-medium uppercase tracking-[0.18em] text-white/45";
const inputClass =
  "mt-2 w-full rounded-2xl border border-white/10 bg-black/28 px-3.5 py-2.5 text-sm text-white outline-none transition duration-300 placeholder:text-white/25 focus:border-white/35 focus:bg-black/36 disabled:cursor-not-allowed disabled:opacity-50";
const textareaClass = `${inputClass} min-h-28 resize-y leading-6`;
const buttonClass =
  "inline-flex h-10 items-center justify-center gap-2 rounded-2xl bg-white px-4 text-sm font-semibold text-black transition duration-300 hover:bg-white/85 disabled:cursor-not-allowed disabled:opacity-45";
const dangerButtonClass =
  "inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-red-300/25 px-4 text-sm font-semibold text-red-100 transition duration-300 hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-45";
const actorCreditTypeLabels: Record<(typeof ACTOR_CREDIT_TYPES)[number], string> = {
  film: "Film",
  television: "Television",
  theatre: "Theatre",
  commercial: "Commercial",
  voiceover: "Voiceover",
  training: "Training",
  other: "Other",
};

function nextSort(items: Array<{ sortOrder: number }>) {
  if (!items.length) return 10;
  return Math.max(...items.map((item) => item.sortOrder)) + 10;
}

function Field({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={wide ? "sm:col-span-2" : ""}>
      <span className={labelClass}>{label}</span>
      {children}
    </label>
  );
}

function TextInput({
  name,
  defaultValue,
  list,
  maxLength,
  pattern,
  required = false,
  title,
  type = "text",
}: {
  name: string;
  defaultValue?: string | number;
  list?: string;
  maxLength?: number;
  pattern?: string;
  required?: boolean;
  title?: string;
  type?: "text" | "number" | "url";
}) {
  return (
    <input
      className={inputClass}
      defaultValue={defaultValue}
      list={list}
      maxLength={maxLength}
      name={name}
      pattern={pattern}
      required={required}
      title={title}
      type={type}
    />
  );
}

function HeroSnapshot({
  content,
  pageSlug,
}: {
  content: EditablePortfolioContent;
  pageSlug: PageSlug;
}) {
  const hero = content.heroes.find((item) => item.pageSlug === pageSlug);
  if (!hero) return null;

  return (
    <div className="relative aspect-[16/7] min-h-72 overflow-hidden rounded-lg border border-white/10 bg-black">
      {hero.mediaType === "video" ? (
        <video autoPlay className="h-full w-full object-cover" loop muted playsInline poster={hero.posterSrc} src={hero.backgroundSrc} />
      ) : (
        <Image alt={`${pageSlug} hero preview`} className="object-cover" fill sizes="100vw" src={hero.backgroundSrc} />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-black/35" />
      <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.26em] text-white/60">{hero.subtitle}</p>
        <h2 className="heading-ui mt-3 text-4xl font-semibold text-white sm:text-6xl">{hero.title}</h2>
        {hero.ctaLabel ? <span className="mt-5 rounded-xl border border-white/25 px-4 py-2 text-xs font-semibold uppercase text-white">{hero.ctaLabel}</span> : null}
      </div>
    </div>
  );
}

function HomeSnapshot({ content }: { content: EditablePortfolioContent }) {
  const presentation = content.homePresentation;
  const legacyStoryImages = content.galleryImages
    .filter((image) => image.isFreelanceStory)
    .sort(
      (first, second) =>
        first.freelanceStoryOrder - second.freelanceStoryOrder ||
        first.title.localeCompare(second.title)
    )
    .slice(0, 4);
  const storyScenes = [
    { src: presentation.storyImage1Src || legacyStoryImages[0]?.src, title: presentation.storyImage1Title || presentation.storyTitle, body: presentation.storyImage1Body || presentation.storyBody },
    { src: presentation.storyImage2Src || legacyStoryImages[1]?.src, title: presentation.storyImage2Title || presentation.storyTitle, body: presentation.storyImage2Body || presentation.storyBody },
    { src: presentation.storyImage3Src || legacyStoryImages[2]?.src, title: presentation.storyImage3Title || presentation.storyTitle, body: presentation.storyImage3Body || presentation.storyBody },
    { src: presentation.storyImage4Src || legacyStoryImages[3]?.src, title: presentation.storyImage4Title || presentation.storyTitle, body: presentation.storyImage4Body || presentation.storyBody },
  ].filter((scene): scene is { src: string; title: string; body: string } => Boolean(scene.src));
  const interludeVideo =
    presentation.featureVideoSrc ||
    content.galleryPresentation.interludeVideoSrc;
  const interludePoster =
    presentation.featurePosterSrc ||
    content.galleryPresentation.interludePosterSrc;

  return (
    <section className={sectionClass}>
      <p className={labelClass}>Public page snapshot</p>
      <div className="mt-4 grid gap-4">
        <HeroSnapshot content={content} pageSlug="home" />
        <div className="grid overflow-hidden rounded-lg border border-white/10 bg-black/30 lg:grid-cols-2">
          <div className="relative min-h-72"><Image alt={content.aboutHome.imageAlt || "Home about preview"} className="object-cover" fill sizes="50vw" src={content.aboutHome.imageSrc || "/images/about.jpg"} /></div>
          <div className="flex flex-col justify-center p-6 sm:p-8"><p className={labelClass}>About</p><h3 className="heading-ui mt-3 text-3xl text-white">{content.aboutHome.heading}</h3><p className="mt-4 line-clamp-6 text-sm leading-6 text-white/60">{content.aboutHome.body}</p></div>
        </div>
        <div className="relative aspect-[16/7] min-h-72 overflow-hidden rounded-lg border border-white/10 bg-black">
          {interludeVideo ? (
            <video autoPlay className="h-full w-full object-cover" loop muted playsInline poster={interludePoster} src={interludeVideo} />
          ) : interludePoster ? (
            <Image alt="Interlude preview" className="object-cover" fill sizes="100vw" src={interludePoster} />
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-black/20" />
          <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8">
            <p className={labelClass}>Interlude</p>
            <h3 className="heading-ui mt-3 text-3xl text-white sm:text-4xl">{presentation.featureTitle}</h3>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/62">{presentation.featureBody}</p>
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">{presentation.featureCtaLabel}</p>
          </div>
        </div>
        <div className="grid gap-4 rounded-lg border border-white/10 bg-black/30 p-5 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="flex flex-col justify-center p-2 sm:p-5">
            <p className={labelClass}>Artist Freelancer Life</p>
            <h3 className="heading-ui mt-4 text-3xl leading-tight text-white sm:text-4xl">{storyScenes[0]?.title || presentation.storyTitle}</h3>
            <p className="mt-4 text-sm leading-6 text-white/58">{storyScenes[0]?.body || presentation.storyBody}</p>
            <p className="mt-5 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">{presentation.storyCtaLabel}</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {storyScenes.map((scene, index) => (
              <div className="group relative aspect-[4/5] overflow-hidden rounded-md" key={`${scene.src}-${index}`}>
                <Image alt={`Freelancer story ${index + 1}`} className="object-cover" fill sizes="25vw" src={scene.src} />
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/65 to-transparent px-3 pb-3 pt-10 text-xs font-semibold text-white/85">{scene.title}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function BioSnapshot({ content }: { content: EditablePortfolioContent }) {
  return (
    <section className={sectionClass}>
      <p className={labelClass}>Public page snapshot</p>
      <div className="mt-4 grid gap-4">
        <HeroSnapshot content={content} pageSlug="bio" />
        <div className="grid gap-4 rounded-lg border border-white/10 bg-black/30 p-5 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="grid grid-cols-2 gap-2">
            {content.bio.galleryImages.filter((item) => item.isPublished).slice(0, 4).map((image) => (
              <div className="relative aspect-[4/5] overflow-hidden rounded-md" key={image.id}><Image alt={image.alt} className="object-cover" fill sizes="25vw" src={image.src} /></div>
            ))}
          </div>
          <div className="flex flex-col justify-center p-2 sm:p-5"><p className={labelClass}>{content.bio.topLabel}</p><h3 className="heading-ui mt-4 text-3xl leading-tight text-white sm:text-4xl">{content.bio.introText}</h3><p className="mt-5 line-clamp-6 text-sm leading-6 text-white/58">{content.bio.paragraphs.filter((item) => item.isPublished).map((item) => item.body).join(" ")}</p></div>
        </div>
      </div>
    </section>
  );
}

function MusicSnapshot({ content }: { content: EditablePortfolioContent }) {
  const visiblePlatforms = content.musicPlatforms
    .filter((item) => item.isPublished)
    .slice(0, 4);

  return (
    <section className={sectionClass}>
      <p className={labelClass}>Public page snapshot</p>
      <div className="mt-4 grid gap-4">
        <HeroSnapshot content={content} pageSlug="music" />
        <div className="grid gap-3 rounded-lg border border-white/10 bg-black/30 p-4 sm:grid-cols-2">
          {visiblePlatforms.length ? (
            visiblePlatforms.map((platform) => (
              <div
                className="relative min-h-44 overflow-hidden rounded-lg border border-white/10 bg-[#131315]"
                key={platform.id}
              >
                {platform.imageSrc ? (
                  <Image
                    alt=""
                    className="object-cover opacity-60"
                    fill
                    sizes="240px"
                    src={platform.imageSrc}
                  />
                ) : null}
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/35 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-4">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-white/45">
                    {platform.label || "Listen"}
                  </p>
                  <p className="mt-1 text-base font-semibold text-white">
                    {platform.title}
                  </p>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-lg border border-dashed border-white/12 p-8 text-center text-sm text-white/40 sm:col-span-2">
              Music cards will appear here.
            </div>
          )}
        </div>
        <div className="rounded-lg border border-white/10 bg-black/30 p-5">
          <p className={labelClass}>SoundCloud sequence</p>
          <p className="mt-3 text-2xl font-semibold text-white">
            {content.soundcloudTracks.filter((item) => item.isPublished).length}{" "}
            published track
            {content.soundcloudTracks.filter((item) => item.isPublished)
              .length === 1
              ? ""
              : "s"}
          </p>
        </div>
      </div>
    </section>
  );
}

function BookingSnapshot({ content }: { content: EditablePortfolioContent }) {
  return (
    <section className={sectionClass}>
      <p className={labelClass}>Public page snapshot</p>
      <div className="mt-4 grid gap-4">
        <HeroSnapshot content={content} pageSlug="booking" />
        <div className="rounded-lg border border-white/10 bg-black/30 p-6 sm:p-8">
          <p className={labelClass}>
            {content.settings.portfolioType === "actor"
              ? "Casting & representation"
              : "Bookings & collaborations"}
          </p>
          <h3 className="heading-ui mt-3 text-3xl text-white">
            Start a conversation
          </h3>
          <p className="mt-4 max-w-xl text-sm leading-6 text-white/58">
            {content.settings.contactBlurb}
          </p>
          <div className="mt-6 flex flex-wrap gap-2 text-xs text-white/50">
            <span className="rounded-full border border-white/10 px-3 py-1.5">
              {content.settings.location || "Location not set"}
            </span>
            <span className="rounded-full border border-white/10 px-3 py-1.5">
              Contact form
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

function NavigationSnapshot({
  artistName,
  modules,
  visiblePageSlugs,
}: {
  artistName: string;
  modules: ReturnType<typeof getProfilePublicModules>;
  visiblePageSlugs: readonly PageSlug[];
}) {
  const visibleSet = new Set(visiblePageSlugs);
  const visibleModules = modules.filter(
    (module) => module.pageSlug && visibleSet.has(module.pageSlug)
  );

  return (
    <section className={sectionClass}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className={labelClass}>Live navigation preview</p>
          <p className="mt-1 text-xs text-white/38">
            Updates while you click. Save when the lineup feels right.
          </p>
        </div>
        <span className="inline-flex min-h-8 items-center gap-2 rounded-full border border-emerald-300/15 bg-emerald-300/[0.06] px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-100/68">
          <FaEye />
          {visibleModules.length} visible
        </span>
      </div>
      <div className="mt-4 overflow-hidden rounded-[18px] border border-white/10 bg-[#070708] shadow-[0_18px_55px_rgba(0,0,0,0.34)]">
        <div className="flex min-h-16 items-center justify-between gap-4 border-b border-white/8 px-4 py-3">
          <span className="truncate text-[10px] font-semibold uppercase tracking-[0.3em] text-white/78">
            {artistName}
          </span>
          <FaBars className="shrink-0 text-xs text-white/48 sm:hidden" />
          <div className="hidden flex-wrap justify-end gap-x-4 gap-y-2 sm:flex">
            {visibleModules.map((module) => (
              <span
                className="text-[9px] font-semibold uppercase tracking-[0.18em] text-white/62"
                key={`${module.key}-${module.href}`}
              >
                {module.label}
              </span>
            ))}
          </div>
        </div>
        <div className="bg-[radial-gradient(circle_at_78%_18%,rgba(255,59,31,0.18),transparent_34%)] p-5 sm:p-6">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#ff715b]">
            Primary navigation
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {visibleModules.map((module) => (
              <span
                className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-[10px] font-semibold tracking-[0.12em] text-white/68"
                key={`${module.key}-${module.href}`}
              >
                {module.label}
              </span>
            ))}
          </div>
          <p className="mt-5 text-xs leading-5 text-white/38">
            The artist name always links home, even when HOME is hidden from
            the text menu.
          </p>
        </div>
      </div>
    </section>
  );
}

function NavigationSettingsForm({
  content,
  disabled,
  modules,
  setVisiblePageSlugs,
  visiblePageSlugs,
}: {
  content: EditablePortfolioContent;
  disabled: boolean;
  modules: ReturnType<typeof getProfilePublicModules>;
  setVisiblePageSlugs: (
    value: PageSlug[] | ((current: PageSlug[]) => PageSlug[])
  ) => void;
  visiblePageSlugs: PageSlug[];
}) {
  const visibleSet = new Set(visiblePageSlugs);
  const publishedVideoCount = content.videos.filter(
    (video) => video.isPublished
  ).length;
  const noVisiblePages = visiblePageSlugs.length === 0;

  return (
    <form
      action={updateNavigationSettings}
      className={sectionClass}
      id="navigation-settings"
    >
      <SectionHeader
        count={visiblePageSlugs.length}
        countLabel="visible"
        kicker="Site-wide"
        title="Main navigation"
      />
      <p className="-mt-2 max-w-2xl text-sm leading-6 text-white/48">
        Choose which pages appear in the desktop and mobile navbar. Hidden
        pages stay editable and still work through their direct URL.
      </p>
      <div className="mt-4 flex items-start gap-3 rounded-[18px] border border-white/9 bg-black/22 p-3.5 text-xs leading-5 text-white/48">
        <FaBars className="mt-1 shrink-0 text-white/32" />
        <p>
          This controls the menu only — it does not delete content or
          unpublish a page. Much less drama, significantly fewer regrets.
        </p>
      </div>
      <fieldset className="mt-5" disabled={disabled}>
        <legend className="sr-only">
          Pages shown in the primary navigation
        </legend>
        <input
          name="portfolioType"
          type="hidden"
          value={content.settings.portfolioType}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          {modules.map((module) => {
            if (!module.pageSlug) return null;

            const pageSlug = module.pageSlug;
            const isVisible = visibleSet.has(pageSlug);
            const isVideoPage =
              module.key === "video" || module.key === "showreel";

            return (
              <div
                className={`overflow-hidden rounded-[20px] border transition duration-200 ${
                  isVisible
                    ? "border-emerald-300/20 bg-emerald-300/[0.055]"
                    : "border-white/9 bg-black/22"
                }`}
                key={`${module.key}-${module.href}`}
              >
                <label className="flex min-h-20 cursor-pointer items-center gap-3 p-4">
                  <input
                    aria-describedby={`nav-status-${pageSlug}`}
                    aria-label={`Show ${module.label} in navbar`}
                    checked={isVisible}
                    className="peer sr-only"
                    name="visibleNavPageSlugs"
                    onChange={(event) => {
                      const checked = event.target.checked;
                      setVisiblePageSlugs((current) =>
                        checked
                          ? [
                              ...current.filter((slug) => slug !== pageSlug),
                              pageSlug,
                            ]
                          : current.filter((slug) => slug !== pageSlug)
                      );
                    }}
                    type="checkbox"
                    value={pageSlug}
                  />
                  <span
                    aria-hidden="true"
                    className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border text-sm transition peer-focus-visible:ring-2 peer-focus-visible:ring-white/70 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-[#111] ${
                      isVisible
                        ? "border-emerald-300/24 bg-emerald-300/12 text-emerald-100"
                        : "border-white/10 bg-white/[0.035] text-white/28"
                    }`}
                  >
                    {isVisible ? <FaCheck /> : <FaEyeSlash />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-white">
                      {module.label}
                    </span>
                    <span
                      id={`nav-status-${pageSlug}`}
                      className={`mt-1 flex items-center gap-1.5 text-[11px] ${
                        isVisible ? "text-emerald-100/58" : "text-white/34"
                      }`}
                    >
                      {isVisible ? <FaEye /> : <FaEyeSlash />}
                      {isVisible ? "Shown in navbar" : "Hidden from navbar"}
                    </span>
                  </span>
                  <span
                    aria-hidden="true"
                    className={`relative h-6 w-11 shrink-0 rounded-full border transition ${
                      isVisible
                        ? "border-emerald-300/25 bg-emerald-300/18"
                        : "border-white/10 bg-black/35"
                    }`}
                  >
                    <span
                      className={`absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full transition ${
                        isVisible
                          ? "left-[22px] bg-emerald-200"
                          : "left-1 bg-white/30"
                      }`}
                    />
                  </span>
                </label>
                {isVideoPage && isVisible && publishedVideoCount === 0 ? (
                  <div className="flex items-start justify-between gap-3 border-t border-amber-300/12 bg-amber-400/[0.045] px-4 py-3">
                    <p className="flex min-w-0 items-start gap-2 text-[11px] leading-5 text-amber-100/62">
                      <FaExclamationTriangle className="mt-1 shrink-0" />
                      No published videos yet. You can hide this link until
                      Spielberg finally calls.
                    </p>
                    <Link
                      className="shrink-0 text-[10px] font-semibold text-amber-100/72 underline decoration-amber-200/25 underline-offset-4 hover:text-amber-50"
                      href="/admin/media?view=showreel"
                    >
                      Add video
                    </Link>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
        {noVisiblePages ? (
          <p
            className="mt-4 flex items-center gap-2 rounded-2xl border border-red-300/18 bg-red-400/[0.07] px-4 py-3 text-xs text-red-100/72"
            role="alert"
          >
            <FaExclamationTriangle />
            Keep at least one page in the navbar so the mobile menu is not an
            impressively empty hamburger.
          </p>
        ) : null}
        <SaveRow
          disabled={disabled || noVisiblePages}
          label="Save navigation"
          pendingLabel="Saving navigation..."
        />
      </fieldset>
    </form>
  );
}

function NavigationWorkspace({
  content,
  disabled,
}: {
  content: EditablePortfolioContent;
  disabled: boolean;
}) {
  const modules = useMemo(
    () => getProfilePublicModules(content.settings.portfolioType),
    [content.settings.portfolioType]
  );
  const [visiblePageSlugs, setVisiblePageSlugs] = useState<PageSlug[]>(() => {
    const hidden = new Set(content.settings.hiddenNavPageSlugs);
    return modules
      .map((module) => module.pageSlug)
      .filter(
        (pageSlug): pageSlug is PageSlug =>
          Boolean(pageSlug) && !hidden.has(pageSlug as PageSlug)
      );
  });

  return (
    <StudioWorkspace
      description="The same primary menu your visitors see"
      label="Main navigation"
      panels={[
        {
          description: "Choose the pages shown in the public navbar.",
          id: "navigation-settings",
          label: "Menu visibility",
          node: (
            <NavigationSettingsForm
              content={content}
              disabled={disabled}
              modules={modules}
              setVisiblePageSlugs={setVisiblePageSlugs}
              visiblePageSlugs={visiblePageSlugs}
            />
          ),
        },
      ]}
      preview={
        <NavigationSnapshot
          artistName={content.settings.artistName}
          modules={modules}
          visiblePageSlugs={visiblePageSlugs}
        />
      }
      publicHref="/"
      sectionId="navigation"
    />
  );
}

function BrandSnapshot({ content }: { content: EditablePortfolioContent }) {
  return (
    <section className={sectionClass}>
      <p className={labelClass}>Global identity preview</p>
      <div className="mt-4 overflow-hidden rounded-lg border border-white/10 bg-[#09090a]">
        <div className="border-b border-white/8 px-5 py-4">
          <p className="text-[10px] uppercase tracking-[0.32em] text-white/52">
            {content.settings.artistName}
          </p>
        </div>
        <div className="bg-[radial-gradient(circle_at_80%_20%,rgba(255,59,31,0.24),transparent_35%)] p-6 sm:p-8">
          <p className="text-xs uppercase tracking-[0.22em] text-[#ff715b]">
            {content.settings.tagline || content.settings.portfolioType}
          </p>
          <h3 className="mt-5 max-w-lg font-display text-4xl leading-[1.05] text-white sm:text-5xl">
            {content.settings.artistName}
          </h3>
          <p className="mt-5 max-w-xl font-body text-sm leading-6 text-white/58">
            {content.settings.description}
          </p>
          <button
            className="mt-7 min-h-10 rounded-xl bg-white px-4 font-ui text-xs font-semibold text-black"
            type="button"
          >
            Example action
          </button>
        </div>
      </div>
    </section>
  );
}

function FooterSnapshot({ content }: { content: EditablePortfolioContent }) {
  const visibleLinks = content.socialLinks.filter((item) => item.isPublished);

  return (
    <section className={sectionClass}>
      <p className={labelClass}>Shared footer preview</p>
      <div className="mt-4 rounded-lg border border-white/10 bg-[#09090a] p-6 sm:p-8">
        <p className="font-display text-4xl text-white">
          {content.settings.artistName}
        </p>
        <p className="mt-3 max-w-md text-sm leading-6 text-white/52">
          {content.settings.tagline}
          {content.settings.location
            ? ` · ${content.settings.location}`
            : ""}
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          {visibleLinks.map((link) => (
            <span
              className="inline-flex min-h-9 items-center gap-2 rounded-full border border-white/10 px-3 text-xs text-white/62"
              key={link.id}
            >
              <SocialPlatformIcon
                className="text-sm"
                href={link.href}
                iconKey={link.iconKey}
                label={link.label}
                platform={link.platform}
              />
              {link.label}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

type StudioPanel = {
  aliases?: string[];
  description: string;
  id: string;
  label: string;
  node: ReactNode;
};

const DirtyPanelsContext = createContext<ReadonlySet<string>>(new Set());
const EditorSectionNavigationContext = createContext<ReactNode>(null);

function useHorizontalOverflowCue<T extends HTMLElement>() {
  const [element, setElement] = useState<T | null>(null);
  const [showEndCue, setShowEndCue] = useState(false);
  const scrollRef = useCallback((node: T | null) => {
    setElement(node);
  }, []);

  useEffect(() => {
    if (!element) return;

    const updateCue = () => {
      setShowEndCue(
        element.scrollLeft + element.clientWidth < element.scrollWidth - 2
      );
    };
    const frame = window.requestAnimationFrame(updateCue);
    const observer = new ResizeObserver(updateCue);
    observer.observe(element);
    element.addEventListener("scroll", updateCue, { passive: true });

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      element.removeEventListener("scroll", updateCue);
    };
  }, [element]);

  return { scrollRef, showEndCue };
}

function StudioWorkspace({
  description,
  label,
  panels,
  preview,
  publicHref,
  sectionId,
}: {
  description: string;
  label: string;
  panels: StudioPanel[];
  preview: ReactNode;
  publicHref: string;
  sectionId: string;
}) {
  const workspaceId = useId().replace(/:/g, "");
  const dirtyPanelIds = useContext(DirtyPanelsContext);
  const sectionNavigation = useContext(EditorSectionNavigationContext);
  const [activePanelId, setActivePanelId] = useState("preview");
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const { scrollRef: tabScrollerRef, showEndCue: showTabEndCue } =
    useHorizontalOverflowCue<HTMLDivElement>();
  const hasWorkspaceDrafts = panels.some((panel) =>
    dirtyPanelIds.has(panel.id)
  );
  const tabs = [
    {
      description: "Latest saved version of the public page.",
      id: "preview",
      label: "Saved preview",
    },
    ...panels,
  ];

  useEffect(() => {
    function syncHash() {
      const hash = window.location.hash.replace(/^#/, "");
      if (!hash || hash === sectionId) {
        setActivePanelId("preview");
        return;
      }

      const target = panels.find(
        (panel) => panel.id === hash || panel.aliases?.includes(hash)
      );
      if (target) setActivePanelId(target.id);
    }

    const frame = window.requestAnimationFrame(syncHash);
    window.addEventListener("hashchange", syncHash);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("hashchange", syncHash);
    };
  }, [panels, sectionId]);

  function activatePanel(id: string) {
    setActivePanelId(id);
    const hash = id === "preview" ? sectionId : id;
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}${window.location.search}#${hash}`
    );
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex = index;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") {
      nextIndex = (index - 1 + tabs.length) % tabs.length;
    } else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = tabs.length - 1;
    else return;

    event.preventDefault();
    const nextTab = tabs[nextIndex];
    activatePanel(nextTab.id);
    tabRefs.current[nextIndex]?.focus();
    tabRefs.current[nextIndex]?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    });
  }

  return (
    <div className="min-w-0">
      <section
        aria-describedby={`${workspaceId}-description`}
        className="sticky top-3 z-40 overflow-hidden rounded-[24px] border border-white/10 bg-[#0d0d0f]/96 shadow-[0_22px_75px_rgba(0,0,0,0.38)] backdrop-blur-2xl"
      >
        <p className="sr-only" id={`${workspaceId}-description`}>
          {description}
        </p>
        {sectionNavigation}
        <div className="relative">
          <div
            aria-describedby={`${workspaceId}-scroll-help`}
            aria-label={`${label} editor sections`}
            className="admin-scrollbar-none flex snap-x gap-1.5 overflow-x-auto p-2.5 pr-14 sm:pr-28"
            ref={tabScrollerRef}
            role="tablist"
          >
            {tabs.map((tab, index) => {
              const active = tab.id === activePanelId;
              const dirty = tab.id !== "preview" && dirtyPanelIds.has(tab.id);
              const tabId = `${workspaceId}-tab-${tab.id}`;
              const panelId = `${workspaceId}-panel-${tab.id}`;
              return (
                <button
                  aria-label={`${String(index).padStart(2, "0")} ${tab.label}: ${tab.description}${dirty ? " — unsaved changes" : ""}`}
                  aria-controls={panelId}
                  aria-selected={active}
                  className={`group/tab flex min-h-11 min-w-max snap-start items-center gap-2.5 rounded-xl border px-3.5 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-white/60 ${
                    active
                      ? "border-[#ff7059]/28 bg-[#ff3b1f] text-white shadow-[0_10px_28px_rgba(255,59,31,0.18)]"
                      : "border-white/8 bg-white/[0.035] text-white/52 hover:border-white/14 hover:bg-white/[0.07] hover:text-white"
                  }`}
                  id={tabId}
                  key={tab.id}
                  onClick={() => activatePanel(tab.id)}
                  onKeyDown={(event) => handleTabKeyDown(event, index)}
                  ref={(element) => {
                    tabRefs.current[index] = element;
                  }}
                  role="tab"
                  tabIndex={active ? 0 : -1}
                  type="button"
                >
                  <span
                    className={`font-mono text-[10px] tabular-nums ${
                      active ? "text-white/72" : "text-white/28"
                    }`}
                  >
                    {String(index).padStart(2, "0")}
                  </span>
                  <span className="text-xs font-semibold">{tab.label}</span>
                  {dirty ? (
                    <span
                      aria-hidden="true"
                      className="h-1.5 w-1.5 rounded-full bg-amber-200 shadow-[0_0_10px_rgba(253,230,138,0.7)]"
                    />
                  ) : null}
                </button>
              );
            })}
          </div>
          <span className="sr-only" id={`${workspaceId}-scroll-help`}>
            Scroll horizontally to reveal more editor sections.
          </span>
          {showTabEndCue ? (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-[#0d0d0f] via-[#0d0d0f]/92 to-transparent sm:w-28"
            />
          ) : null}
          <Link
            aria-label={`Open ${label} on the public site`}
            className="absolute right-2 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center gap-2 rounded-xl border border-white/10 bg-[#171719] text-[11px] font-semibold text-white/60 shadow-[0_8px_24px_rgba(0,0,0,0.35)] transition hover:bg-white hover:text-black sm:w-auto sm:px-3"
            href={publicHref}
            rel="noreferrer"
            target="_blank"
            title={`Open ${label} on the public site`}
          >
            <span className="hidden sm:inline">View page</span>
            <FaExternalLinkAlt className="text-[9px]" />
          </Link>
        </div>
      </section>

      <div className="mt-4" id="site-editor-active-panel">
        <div
          aria-labelledby={`${workspaceId}-tab-preview`}
          data-editor-panel-id="preview"
          hidden={activePanelId !== "preview"}
          id={`${workspaceId}-panel-preview`}
          role="tabpanel"
        >
          {activePanelId === "preview" ? (
            <>
            <div
              className={`mb-3 flex items-center justify-between gap-3 rounded-2xl border px-4 py-2.5 ${
                hasWorkspaceDrafts
                  ? "border-amber-300/14 bg-amber-300/[0.05]"
                  : "border-emerald-300/10 bg-emerald-300/[0.045]"
              }`}
            >
              <span
                className={`inline-flex items-center gap-2 text-[11px] font-semibold ${
                  hasWorkspaceDrafts
                    ? "text-amber-100/70"
                    : "text-emerald-100/64"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    hasWorkspaceDrafts ? "bg-amber-300" : "bg-emerald-300"
                  }`}
                />
                Latest saved version
              </span>
              <span className="text-[10px] text-white/30">
                {hasWorkspaceDrafts
                  ? "Unsaved drafts are not shown"
                  : "Save a panel to refresh this view"}
              </span>
            </div>
            {preview}
            </>
          ) : null}
        </div>

        {panels.map((panel) => {
          const active = panel.id === activePanelId;
          return (
            <div
              aria-labelledby={`${workspaceId}-tab-${panel.id}`}
              data-editor-panel-id={panel.id}
              hidden={!active}
              id={`${workspaceId}-panel-${panel.id}`}
              key={panel.id}
              role="tabpanel"
            >
              {panel.node}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TextArea({
  name,
  defaultValue,
  maxLength,
  rows = 5,
  required = false,
}: {
  name: string;
  defaultValue?: string;
  maxLength?: number;
  rows?: number;
  required?: boolean;
}) {
  return (
    <textarea
      className={textareaClass}
      defaultValue={defaultValue}
      maxLength={maxLength}
      name={name}
      required={required}
      rows={rows}
    />
  );
}

function PublishControls({
  isPublished = true,
  sortOrder,
}: {
  isPublished?: boolean;
  sortOrder: number;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
      <label className="flex h-10 items-center gap-3 rounded-md border border-white/10 bg-black/25 px-3 text-sm text-white/75">
        <input
          className="h-4 w-4 accent-white"
          defaultChecked={isPublished}
          name="isPublished"
          type="checkbox"
        />
        Published
      </label>
      <Field label="Order">
        <TextInput defaultValue={sortOrder} name="sortOrder" type="number" />
      </Field>
    </div>
  );
}

function SectionHeader({
  kicker,
  title,
  count,
  countLabel = "items",
}: {
  kicker: string;
  title: string;
  count?: number;
  countLabel?: string;
}) {
  return (
    <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className={labelClass}>{kicker}</p>
        <h2 className="heading-ui mt-2 text-2xl text-white">{title}</h2>
      </div>
      {typeof count === "number" ? (
        <span className="text-sm text-white/45">
          {count} {countLabel}
        </span>
      ) : null}
    </div>
  );
}

function SaveRow({
  disabled,
  label = "Save",
  pendingLabel = "Saving...",
}: {
  disabled: boolean;
  label?: string;
  pendingLabel?: string;
}) {
  return (
    <div className="mt-5 flex justify-end">
      <ActionButton
        className={buttonClass}
        disabled={disabled}
        pendingLabel={pendingLabel}
      >
        {label}
      </ActionButton>
    </div>
  );
}

function FooterEffectPicker({ defaultValue }: { defaultValue: FooterEffect }) {
  const [selected, setSelected] = useState<FooterEffect>(defaultValue);
  const options: Array<{
    value: FooterEffect;
    title: string;
    description: string;
  }> = [
    {
      value: "soul",
      title: "Living Soul",
      description: "Warm, organic orb with a soft delayed movement.",
    },
    {
      value: "red-light",
      title: "Red Light",
      description: "Minimal red glow that follows the pointer smoothly.",
    },
  ];

  return (
    <div className="sm:col-span-2 mt-3 border-t border-white/10 pt-6">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
        Footer interaction
      </p>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">
        Choose the desktop pointer effect. Touch devices receive a subtle
        static ambient glow instead.
      </p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {options.map((option) => {
          const isSelected = selected === option.value;

          return (
            <label
              className={`group relative cursor-pointer overflow-hidden rounded-[22px] border p-4 transition duration-300 ${
                isSelected
                  ? "border-white/28 bg-white/[0.09] shadow-[0_14px_42px_rgba(0,0,0,0.24)]"
                  : "border-white/10 bg-black/22 hover:border-white/18 hover:bg-white/[0.045]"
              }`}
              key={option.value}
            >
              <input
                checked={isSelected}
                className="sr-only"
                name="footerEffect"
                onChange={() => setSelected(option.value)}
                type="radio"
                value={option.value}
              />
              <span className="flex items-center gap-4">
                <span className="relative grid h-16 w-20 shrink-0 place-items-center overflow-hidden rounded-2xl border border-white/10 bg-[#040608]">
                  {option.value === "soul" ? (
                    <>
                      <span className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,244,205,0.15),transparent_68%)]" />
                      <span className="relative h-10 w-10">
                        <span className="soul-orb absolute inset-0">
                          <span className="soul-orb__aura absolute -inset-8 rounded-full" />
                          <span className="soul-orb__orbit soul-orb__orbit--one absolute inset-0 rounded-full" />
                          <span className="soul-orb__orbit soul-orb__orbit--two absolute inset-1 rounded-full" />
                          <span className="soul-orb__core absolute inset-[9px] rounded-full" />
                        </span>
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,54,34,0.2),transparent_66%)]" />
                      <span className="relative h-2 w-2 rounded-full bg-[#ff4b36] shadow-[0_0_18px_6px_rgba(255,61,39,0.5)]" />
                    </>
                  )}
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-2 text-sm font-semibold text-white">
                    {option.title}
                    <span
                      className={`h-1.5 w-1.5 rounded-full transition ${
                        isSelected
                          ? "bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,0.6)]"
                          : "bg-white/18"
                      }`}
                    />
                  </span>
                  <span className="mt-1 block text-sm leading-5 text-white/45">
                    {option.description}
                  </span>
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

function DeleteForm({
  id,
  action,
  disabled,
}: {
  id: string;
  action: (formData: FormData) => Promise<void>;
  disabled: boolean;
}) {
  return (
    <form
      action={action}
      className="mt-3 flex justify-end"
      onSubmit={(event) => {
        if (
          !window.confirm(
            `Delete “${id}”? This removes it from the public portfolio and cannot be undone.`
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <input name="id" type="hidden" value={id} />
      <ActionButton
        className={dangerButtonClass}
        disabled={disabled}
        pendingLabel="Deleting..."
      >
        Delete
      </ActionButton>
    </form>
  );
}

function StatusNotice({
  status,
  isConfigured,
  loadError,
}: {
  status?: string;
  isConfigured: boolean;
  loadError?: string;
}) {
  const message = status ? statusCopy[status] : "";
  const success = Boolean(
    status && (status.startsWith("saved-") || status === "deleted")
  );

  if (!message && isConfigured && !loadError) return null;

  return (
    <div className="space-y-3">
      {!isConfigured ? (
        <div className="rounded-lg border border-amber-300/25 bg-amber-400/10 px-4 py-3 text-sm leading-6 text-amber-100">
          Supabase service role key is not configured. The editor is in
          read-only fallback mode.
        </div>
      ) : null}
      {loadError ? (
        <div className="rounded-lg border border-red-300/25 bg-red-500/10 px-4 py-3 text-sm leading-6 text-red-100">
          {loadError}
        </div>
      ) : null}
      {message ? (
        success ? (
          <div className="flex justify-end" role="status">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/14 bg-emerald-300/[0.065] px-3.5 py-2 text-xs text-emerald-100/72">
              <FaCheck className="text-[10px]" />
              {message}
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-white/10 bg-white/10 px-4 py-3 text-sm leading-6 text-white/80">
            {message}
          </div>
        )
      ) : null}
    </div>
  );
}

function SiteSettingsForm({
  brandPanel = "identity",
  content,
  disabled,
  mode = "brand",
}: {
  brandPanel?: "identity" | "typography" | "footer";
  content: EditablePortfolioContent;
  disabled: boolean;
  mode?: "brand" | "contact" | "music";
}) {
  if (mode === "brand") {
    return (
      <div className="grid gap-3">
        {brandPanel === "identity" ? (
          <AdminDisclosure
          collapsible={false}
          defaultOpen
          description="Artist name, portfolio mode, tagline, and public site description."
          eyebrow="01 · Identity"
          id="settings-identity"
          title="Brand identity & text"
        >
          <form action={updateBrandIdentitySettings}>
            <fieldset disabled={disabled}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Artist name">
                  <TextInput
                    defaultValue={content.settings.artistName}
                    maxLength={220}
                    name="artistName"
                    required
                  />
                </Field>
                <Field label="Portfolio mode">
                  <select
                    className={inputClass}
                    defaultValue={content.settings.portfolioType}
                    name="portfolioType"
                  >
                    <option value="musician">Musician</option>
                    <option value="actor">Actor</option>
                  </select>
                </Field>
                <Field label="Tagline / discipline" wide>
                  <TextInput
                    defaultValue={content.settings.tagline}
                    maxLength={220}
                    name="tagline"
                  />
                </Field>
                <Field label="Site description" wide>
                  <TextArea
                    defaultValue={content.settings.description}
                    maxLength={1000}
                    name="description"
                    rows={4}
                  />
                </Field>
              </div>
              <SaveRow disabled={disabled} label="Save identity" />
            </fieldset>
          </form>
          </AdminDisclosure>
        ) : null}

        {brandPanel === "typography" ? (
          <AdminDisclosure
          collapsible={false}
          description="Display, paragraph, and interface font families."
          eyebrow="02 · Type system"
          id="settings-typography"
          title="Typography"
        >
          <form action={updateTypographySettings}>
            <fieldset disabled={disabled}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Display / headings">
                  <select
                    className={inputClass}
                    defaultValue={content.settings.displayFont}
                    name="displayFont"
                  >
                    {DISPLAY_FONT_OPTIONS.map((font) => (
                      <option key={font.key} value={font.key}>
                        {font.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Body / paragraphs">
                  <select
                    className={inputClass}
                    defaultValue={content.settings.bodyFont}
                    name="bodyFont"
                  >
                    {BODY_FONT_OPTIONS.map((font) => (
                      <option key={font.key} value={font.key}>
                        {font.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="UI / navigation and buttons" wide>
                  <select
                    className={inputClass}
                    defaultValue={content.settings.uiFont}
                    name="uiFont"
                  >
                    {UI_FONT_OPTIONS.map((font) => (
                      <option key={font.key} value={font.key}>
                        {font.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <SaveRow disabled={disabled} label="Save typography" />
            </fieldset>
          </form>
          </AdminDisclosure>
        ) : null}

        {brandPanel === "footer" ? (
          <AdminDisclosure
          collapsible={false}
          description="Pointer effect used in the public footer on desktop."
          eyebrow="03 · Interaction"
          id="settings-footer-effect"
          title="Footer interaction"
        >
          <form action={updateFooterEffectSettings}>
            <fieldset disabled={disabled}>
              <FooterEffectPicker
                defaultValue={content.settings.footerEffect}
              />
              <SaveRow disabled={disabled} label="Save interaction" />
            </fieldset>
          </form>
          </AdminDisclosure>
        ) : null}
      </div>
    );
  }

  const isContact = mode === "contact";
  const action = isContact ? updateContactSettings : updateMusicSettings;
  const copy = isContact
    ? {
        eyebrow: "02 · Contact copy",
        title: "Contact details",
        description:
          "Location and supporting copy shown around the public inquiry form.",
      }
    : {
        eyebrow: "02 · Integrations",
        title: "Spotify profile",
        description:
          "Artist and embed links used by the music page and footer destinations.",
      };

  return (
    <AdminDisclosure
      collapsible={false}
      description={copy.description}
      eyebrow={copy.eyebrow}
      id={`${mode}-settings`}
      title={copy.title}
    >
      <form action={action}>
        <fieldset disabled={disabled}>
          <div className="grid gap-4 sm:grid-cols-2">
            {isContact ? (
            <>
              <Field label="Location">
                <TextInput
                  defaultValue={content.settings.location}
                  maxLength={220}
                  name="location"
                />
              </Field>
              <Field label="Contact introduction" wide>
                <TextArea
                  defaultValue={content.settings.contactBlurb}
                  maxLength={1000}
                  name="contactBlurb"
                  rows={5}
                />
              </Field>
            </>
            ) : (
            <>
              <Field label="Spotify artist URL" wide>
                <TextInput
                  defaultValue={content.settings.spotifyArtistUrl}
                  maxLength={1200}
                  name="spotifyArtistUrl"
                  pattern="https://.*"
                  title="Use a complete HTTPS URL, for example https://open.spotify.com/artist/..."
                  type="url"
                />
              </Field>
              <Field label="Spotify embed URL" wide>
                <TextInput
                  defaultValue={content.settings.spotifyEmbedUrl}
                  maxLength={1200}
                  name="spotifyEmbedUrl"
                  pattern="https://.*"
                  title="Use the HTTPS URL from the Spotify embed code, not the whole iframe."
                  type="url"
                />
              </Field>
            </>
            )}
          </div>
          <SaveRow disabled={disabled} />
        </fieldset>
      </form>
    </AdminDisclosure>
  );
}

function HeroForms({
  assets,
  content,
  disabled,
  activePageSlugs,
  returnSection = "home-hero",
}: {
  assets: MediaAsset[];
  content: EditablePortfolioContent;
  disabled: boolean;
  activePageSlugs: PageSlug[];
  returnSection?: string;
}) {
  const heroes = content.heroes.filter((hero) =>
    activePageSlugs.includes(hero.pageSlug)
  );

  return (
    <AdminDisclosure
      badge={
        <span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] text-white/45">
          {heroes[0]?.mediaType || "media"}
        </span>
      }
      collapsible={false}
      defaultOpen
      description="Opening title, supporting text, action, and background media."
      eyebrow="01 · Page opening"
      id={returnSection}
      title="Hero"
    >
      <div className="grid gap-4">
        {heroes.map((hero) => (
          <form action={updatePageHero} className={itemClass} key={hero.pageSlug}>
            <fieldset disabled={disabled}>
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className={labelClass}>Page</p>
                  <h3 className="mt-1 text-lg font-semibold capitalize text-white">
                    {hero.pageSlug}
                  </h3>
                </div>
                <span className="rounded-md border border-white/10 px-2 py-1 text-xs text-white/45">
                  {hero.mediaType}
                </span>
              </div>
              <input name="pageSlug" type="hidden" value={hero.pageSlug} />
              <input
                name="returnSection"
                type="hidden"
                value={returnSection}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Title">
                  <TextInput defaultValue={hero.title} name="title" required />
                </Field>
                <Field label="Subtitle">
                  <TextInput defaultValue={hero.subtitle} name="subtitle" />
                </Field>
                <Field label="CTA label">
                  <TextInput defaultValue={hero.ctaLabel} name="ctaLabel" />
                </Field>
                <Field label="CTA href">
                  <TextInput defaultValue={hero.ctaHref} name="ctaHref" />
                </Field>
                <MediaAssetPicker
                  assets={assets}
                  className="sm:col-span-2"
                  defaultMediaType={hero.mediaType}
                  defaultValue={hero.backgroundSrc}
                  kind="media"
                  label="Background image or video"
                  mediaTypeName="mediaType"
                  name="backgroundSrc"
                  required
                />
                <MediaAssetPicker
                  assets={assets}
                  className="sm:col-span-2"
                  defaultValue={hero.posterSrc}
                  kind="image"
                  label="Video poster / fallback image"
                  name="posterSrc"
                />
                <Field label="Order">
                  <TextInput
                    defaultValue={hero.sortOrder}
                    name="sortOrder"
                    type="number"
                  />
                </Field>
              </div>
              <SaveRow disabled={disabled} />
            </fieldset>
          </form>
        ))}
      </div>
    </AdminDisclosure>
  );
}

function HomePresentationHiddenFields({
  except,
  item,
}: {
  except: "interlude" | "story";
  item: EditablePortfolioContent["homePresentation"];
}) {
  const fields = {
    updatesHeading: item.updatesHeading,
    updatesImageSrc: item.updatesImageSrc,
    updatesImageAlt: item.updatesImageAlt,
    updatesCtaLabel: item.updatesCtaLabel,
    updatesCtaHref: item.updatesCtaHref,
    featureTitle: item.featureTitle,
    featureBody: item.featureBody,
    featureCtaLabel: item.featureCtaLabel,
    featureCtaHref: item.featureCtaHref,
    featureImageSrc: item.featureImageSrc,
    featureImageAlt: item.featureImageAlt,
    featureVideoSrc: item.featureVideoSrc,
    featurePosterSrc: item.featurePosterSrc,
    storyTitle: item.storyTitle,
    storyBody: item.storyBody,
    storyCtaLabel: item.storyCtaLabel,
    storyCtaHref: item.storyCtaHref,
    storyImage1Src: item.storyImage1Src,
    storyImage1Title: item.storyImage1Title,
    storyImage1Body: item.storyImage1Body,
    storyImage2Src: item.storyImage2Src,
    storyImage2Title: item.storyImage2Title,
    storyImage2Body: item.storyImage2Body,
    storyImage3Src: item.storyImage3Src,
    storyImage3Title: item.storyImage3Title,
    storyImage3Body: item.storyImage3Body,
    storyImage4Src: item.storyImage4Src,
    storyImage4Title: item.storyImage4Title,
    storyImage4Body: item.storyImage4Body,
  };
  const visible =
    except === "interlude"
      ? new Set([
          "featureTitle",
          "featureBody",
          "featureCtaLabel",
          "featureCtaHref",
          "featureVideoSrc",
          "featurePosterSrc",
        ])
      : new Set([
          "storyTitle",
          "storyBody",
          "storyCtaLabel",
          "storyCtaHref",
          "storyImage1Src",
          "storyImage1Title",
          "storyImage1Body",
          "storyImage2Src",
          "storyImage2Title",
          "storyImage2Body",
          "storyImage3Src",
          "storyImage3Title",
          "storyImage3Body",
          "storyImage4Src",
          "storyImage4Title",
          "storyImage4Body",
        ]);

  return Object.entries(fields)
    .filter(([name]) => !visible.has(name))
    .map(([name, value]) => (
      <input key={name} name={name} type="hidden" value={value} />
    ));
}

function HomePresentationForm({
  assets,
  content,
  disabled,
  panel,
}: {
  assets: MediaAsset[];
  content: EditablePortfolioContent;
  disabled: boolean;
  panel: "about" | "interlude" | "story";
}) {
  const legacyStoryImages = content.galleryImages
    .filter((image) => image.isFreelanceStory)
    .sort(
      (first, second) =>
        first.freelanceStoryOrder - second.freelanceStoryOrder ||
        first.title.localeCompare(second.title)
    )
    .slice(0, 4);
  const item = {
    ...content.homePresentation,
    featureVideoSrc:
      content.homePresentation.featureVideoSrc ||
      content.galleryPresentation.interludeVideoSrc,
    featurePosterSrc:
      content.homePresentation.featurePosterSrc ||
      content.galleryPresentation.interludePosterSrc,
    storyImage1Src:
      content.homePresentation.storyImage1Src || legacyStoryImages[0]?.src || "",
    storyImage1Title:
      content.homePresentation.storyImage1Title || content.homePresentation.storyTitle,
    storyImage1Body:
      content.homePresentation.storyImage1Body || content.homePresentation.storyBody,
    storyImage2Src:
      content.homePresentation.storyImage2Src || legacyStoryImages[1]?.src || "",
    storyImage2Title:
      content.homePresentation.storyImage2Title || content.homePresentation.storyTitle,
    storyImage2Body:
      content.homePresentation.storyImage2Body || content.homePresentation.storyBody,
    storyImage3Src:
      content.homePresentation.storyImage3Src || legacyStoryImages[2]?.src || "",
    storyImage3Title:
      content.homePresentation.storyImage3Title || content.homePresentation.storyTitle,
    storyImage3Body:
      content.homePresentation.storyImage3Body || content.homePresentation.storyBody,
    storyImage4Src:
      content.homePresentation.storyImage4Src || legacyStoryImages[3]?.src || "",
    storyImage4Title:
      content.homePresentation.storyImage4Title || content.homePresentation.storyTitle,
    storyImage4Body:
      content.homePresentation.storyImage4Body || content.homePresentation.storyBody,
  };
  const storyImageFields = [
    { bodyName: "storyImage1Body", bodyValue: item.storyImage1Body, name: "storyImage1Src", titleName: "storyImage1Title", titleValue: item.storyImage1Title, value: item.storyImage1Src },
    { bodyName: "storyImage2Body", bodyValue: item.storyImage2Body, name: "storyImage2Src", titleName: "storyImage2Title", titleValue: item.storyImage2Title, value: item.storyImage2Src },
    { bodyName: "storyImage3Body", bodyValue: item.storyImage3Body, name: "storyImage3Src", titleName: "storyImage3Title", titleValue: item.storyImage3Title, value: item.storyImage3Src },
    { bodyName: "storyImage4Body", bodyValue: item.storyImage4Body, name: "storyImage4Src", titleName: "storyImage4Title", titleValue: item.storyImage4Title, value: item.storyImage4Src },
  ];
  return (
    <div className="grid gap-3">
      {panel === "about" ? (
        <AdminDisclosure
        collapsible={false}
        description="Heading, portrait, introduction, and optional call to action."
        eyebrow="02 · About"
        id="home-about"
        title={content.aboutHome.heading || "About"}
      >
        <form action={updateAboutHome}>
          <fieldset disabled={disabled}>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Heading"><TextInput defaultValue={content.aboutHome.heading} name="heading" required /></Field>
            <Field label="Image alt"><TextInput defaultValue={content.aboutHome.imageAlt} name="imageAlt" /></Field>
            <Field label="Paragraph" wide><TextArea defaultValue={content.aboutHome.body} name="body" required rows={6} /></Field>
            <Field label="CTA text"><TextInput defaultValue={content.aboutHome.ctaLabel} name="ctaLabel" /></Field>
            <Field label="CTA link"><TextInput defaultValue={content.aboutHome.ctaHref} name="ctaHref" /></Field>
            <MediaAssetPicker assets={assets} className="sm:col-span-2" defaultValue={content.aboutHome.imageSrc} kind="image" label="Section image" name="imageSrc" />
          </div>
          <SaveRow disabled={disabled} />
          </fieldset>
        </form>
        </AdminDisclosure>
      ) : null}

      {panel === "interlude" ? (
        <AdminDisclosure
        collapsible={false}
        description="Full-width video transition between the opening story and gallery."
        eyebrow="03 · Feature"
        id="home-interlude"
        title={item.featureTitle || "The Interlude"}
      >
        <form action={updateHomePresentation}>
          <fieldset disabled={disabled}>
          <input name="returnSection" type="hidden" value="home-interlude" />
          <p className="mt-2 text-sm leading-6 text-white/48">Text, link, video, and poster for the full-width section directly below About.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Heading" wide><TextInput defaultValue={item.featureTitle} name="featureTitle" required /></Field>
            <Field label="Paragraph" wide><TextArea defaultValue={item.featureBody} name="featureBody" rows={4} /></Field>
            <Field label="CTA text"><TextInput defaultValue={item.featureCtaLabel} name="featureCtaLabel" /></Field>
            <Field label="CTA link"><TextInput defaultValue={item.featureCtaHref || "/video"} name="featureCtaHref" /></Field>
            <MediaAssetPicker assets={assets} className="sm:col-span-2" defaultValue={item.featureVideoSrc} kind="video" label="Background video" name="featureVideoSrc" />
            <MediaAssetPicker assets={assets} className="sm:col-span-2" defaultValue={item.featurePosterSrc} kind="image" label="Video poster / fallback image" name="featurePosterSrc" />
          </div>
          <HomePresentationHiddenFields except="interlude" item={item} />
          <SaveRow disabled={disabled} />
          </fieldset>
        </form>
        </AdminDisclosure>
      ) : null}

      {panel === "story" ? (
        <AdminDisclosure
        collapsible={false}
        badge={
          <span className="text-xs tabular-nums text-white/42">4 scenes</span>
        }
        description="Scroll-driven image and text sequence leading into the gallery."
        eyebrow="04 · Story sequence"
        id="home-freelancer-life"
        title="Artist Freelancer Life"
      >
        <form action={updateHomePresentation}>
          <fieldset disabled={disabled}>
          <input name="returnSection" type="hidden" value="home-freelancer-life" />
          <p className="mt-2 text-sm leading-6 text-white/48">Each scene has its own image, heading, and paragraph. Public text changes together with the active image while the visitor scrolls.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <input name="storyTitle" type="hidden" value={item.storyTitle} />
            <input name="storyBody" type="hidden" value={item.storyBody} />
            <Field label="CTA text"><TextInput defaultValue={item.storyCtaLabel || "VIEW GALLERY"} name="storyCtaLabel" /></Field>
            <Field label="CTA link"><TextInput defaultValue={item.storyCtaHref || "/gallery"} name="storyCtaHref" /></Field>
            {storyImageFields.map((field, index) => (
              <div className="grid gap-4 rounded-2xl border border-white/10 bg-white/[0.035] p-4 sm:col-span-2 sm:grid-cols-2" key={field.name}>
                <p className={`${labelClass} sm:col-span-2`}>Scene {String(index + 1).padStart(2, "0")}</p>
                <MediaAssetPicker assets={assets} className="sm:col-span-2" defaultValue={field.value} kind="image" label={`Scene ${index + 1} image`} name={field.name} />
                <Field label="Scene heading" wide><TextInput defaultValue={field.titleValue} name={field.titleName} required /></Field>
                <Field label="Scene paragraph" wide><TextArea defaultValue={field.bodyValue} name={field.bodyName} rows={4} /></Field>
              </div>
            ))}
          </div>
          <HomePresentationHiddenFields except="story" item={item} />
          <SaveRow disabled={disabled} />
          </fieldset>
        </form>
        </AdminDisclosure>
      ) : null}
    </div>
  );
}

function BioForms({
  assets,
  content,
  disabled,
  isActor,
  panel,
}: {
  assets: MediaAsset[];
  content: EditablePortfolioContent;
  disabled: boolean;
  isActor: boolean;
  panel: "intro" | "gallery" | "paragraphs";
}) {
  return (
    <div className="grid gap-3">
      {panel === "intro" ? (
        <AdminDisclosure
        collapsible={false}
        description="The opening biography label, caption, and introduction."
        eyebrow="02 · Biography"
        id="bio-intro"
        title="Bio introduction"
      >
        <form action={updateBioProfile}>
          <fieldset disabled={disabled}>
            <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Top label">
              <TextInput defaultValue={content.bio.topLabel} name="topLabel" />
            </Field>
            <Field label="Caption">
              <TextInput defaultValue={content.bio.caption} name="caption" />
            </Field>
            <Field label="Intro text" wide>
              <TextArea
                defaultValue={content.bio.introText}
                name="introText"
                rows={5}
              />
            </Field>
            </div>
            <SaveRow disabled={disabled} />
          </fieldset>
        </form>
        </AdminDisclosure>
      ) : null}

      {panel === "gallery" ? (
        <AdminDisclosure
        collapsible={false}
        badge={<span className="text-xs text-white/42">{content.bio.galleryImages.length} items</span>}
        description="Portraits shown alongside the biography. Open only the image you want to edit."
        eyebrow="03 · Visual story"
        id="bio-gallery"
        title={isActor ? "Bio portraits" : "Gallery images"}
      >
        <div className="grid gap-3">
          {content.bio.galleryImages.map((item) => (
            <BioGalleryForm assets={assets} disabled={disabled} item={item} key={item.id} />
          ))}
          <BioGalleryForm
            assets={assets}
            disabled={disabled}
            item={{
              id: "",
              src: "",
              alt: "",
              sortOrder: nextSort(content.bio.galleryImages),
              isPublished: true,
            }}
            mode="new"
          />
        </div>
        </AdminDisclosure>
      ) : null}

      {panel === "paragraphs" ? (
        <AdminDisclosure
        collapsible={false}
        badge={<span className="text-xs text-white/42">{content.bio.paragraphs.length} paragraphs</span>}
        description="Long-form biography paragraphs and their reveal order."
        eyebrow="04 · Story"
        id="bio-paragraphs-panel"
        title="Biography paragraphs"
      >
        <BioParagraphsEditor disabled={disabled} items={content.bio.paragraphs} />
        </AdminDisclosure>
      ) : null}
    </div>
  );
}

function ActorResumeSection({
  content,
  disabled,
}: {
  content: EditablePortfolioContent;
  disabled: boolean;
}) {
  return (
    <AdminDisclosure
      collapsible={false}
      description="Playing profile, representation, languages, skills, and resume link."
      eyebrow="05 · Actor profile"
      id="actor-resume"
      title="Resume profile"
    >
      <form action={updateActorResume}>
        <fieldset disabled={disabled}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Headline">
              <TextInput
                defaultValue={content.actorResume.headline}
                name="headline"
              />
            </Field>
            <Field label="Location">
              <TextInput
                defaultValue={content.actorResume.location}
                name="location"
              />
            </Field>
            <Field label="Playing age">
              <TextInput
                defaultValue={content.actorResume.playingAge}
                name="playingAge"
              />
            </Field>
            <Field label="Height">
              <TextInput
                defaultValue={content.actorResume.height}
                name="height"
              />
            </Field>
            <Field label="Eyes">
              <TextInput defaultValue={content.actorResume.eyes} name="eyes" />
            </Field>
            <Field label="Hair">
              <TextInput defaultValue={content.actorResume.hair} name="hair" />
            </Field>
            <Field label="Representation">
              <TextInput
                defaultValue={content.actorResume.representation}
                name="representation"
              />
            </Field>
            <Field label="Resume URL">
              <TextInput
                defaultValue={content.actorResume.resumeUrl}
                name="resumeUrl"
              />
            </Field>
            <Field label="Languages" wide>
              <TextArea
                defaultValue={content.actorResume.languages}
                name="languages"
                rows={3}
              />
            </Field>
            <Field label="Skills" wide>
              <TextArea
                defaultValue={content.actorResume.skills}
                name="skills"
                rows={3}
              />
            </Field>
            <Field label="Summary" wide>
              <TextArea
                defaultValue={content.actorResume.summary}
                name="summary"
                rows={5}
              />
            </Field>
          </div>
          <SaveRow disabled={disabled} />
        </fieldset>
      </form>
    </AdminDisclosure>
  );
}

function ActorCreditsSection({
  items,
  disabled,
}: {
  items: EditableActorCredit[];
  disabled: boolean;
}) {
  return (
    <AdminDisclosure
      collapsible={false}
      badge={<span className="text-xs text-white/42">{items.length} credits</span>}
      description="Film, television, theatre, training, and other selected work."
      eyebrow="06 · Experience"
      id="actor-credits"
      title="Credits"
    >
      <div className="grid gap-3">
        {items.map((item) => (
          <ActorCreditForm disabled={disabled} item={item} key={item.id} />
        ))}
        <ActorCreditForm
          disabled={disabled}
          item={{
            id: "",
            creditType: "film",
            title: "",
            role: "",
            production: "",
            director: "",
            year: "",
            href: "",
            sortOrder: nextSort(items),
            isPublished: true,
          }}
          mode="new"
        />
      </div>
    </AdminDisclosure>
  );
}

function ActorCreditForm({
  item,
  disabled,
  mode = "edit",
}: {
  item: EditableActorCredit;
  disabled: boolean;
  mode?: "edit" | "new";
}) {
  const visible = item.isPublished || mode === "new";
  return (
    <AdminDisclosure
      badge={
        <span className={`rounded-full border px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.1em] ${visible ? "border-emerald-300/15 text-emerald-100/65" : "border-white/10 text-white/35"}`}>
          {visible ? "Published" : "Hidden"}
        </span>
      }
      description={
        mode === "new"
          ? "Create another film, television, theatre, or training credit."
          : [actorCreditTypeLabels[item.creditType], item.role, item.year]
              .filter(Boolean)
              .join(" · ")
      }
      id={mode === "new" ? "actor-credit-new" : `actor-credit-${item.id}`}
      title={mode === "new" ? "+ Add credit" : item.title}
      variant="item"
    >
      <form action={saveActorCredit}>
        <fieldset disabled={disabled}>
          {mode === "edit" ? (
            <input name="id" type="hidden" value={item.id} />
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            {mode === "new" ? (
              <Field label="ID">
                <TextInput name="id" />
              </Field>
            ) : null}
            <Field label="Type">
              <select
                className={inputClass}
                defaultValue={item.creditType}
                name="creditType"
              >
                {ACTOR_CREDIT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {actorCreditTypeLabels[type]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Title">
              <TextInput defaultValue={item.title} name="title" required />
            </Field>
            <Field label="Role">
              <TextInput defaultValue={item.role} name="role" />
            </Field>
            <Field label="Production">
              <TextInput defaultValue={item.production} name="production" />
            </Field>
            <Field label="Director">
              <TextInput defaultValue={item.director} name="director" />
            </Field>
            <Field label="Year">
              <TextInput defaultValue={item.year} name="year" />
            </Field>
            <Field label="Href" wide>
              <TextInput defaultValue={item.href} name="href" />
            </Field>
          </div>
          <div className="mt-4">
            <PublishControls
              isPublished={item.isPublished}
              sortOrder={item.sortOrder}
            />
          </div>
          <SaveRow disabled={disabled} />
        </fieldset>
      </form>
      {mode === "edit" ? (
        <DeleteForm action={deleteActorCredit} disabled={disabled} id={item.id} />
      ) : null}
    </AdminDisclosure>
  );
}

function BioGalleryForm({
  assets,
  item,
  disabled,
  mode = "edit",
}: {
  assets: MediaAsset[];
  item: EditableBioGalleryImage;
  disabled: boolean;
  mode?: "edit" | "new";
}) {
  const visible = item.isPublished || mode === "new";
  return (
    <AdminDisclosure
      badge={
        <span className={`rounded-full border px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.1em] ${visible ? "border-emerald-300/15 text-emerald-100/65" : "border-white/10 text-white/35"}`}>
          {visible ? "Published" : "Hidden"}
        </span>
      }
      description={mode === "new" ? "Choose a portrait from the media library." : item.alt || "Biography image"}
      id={mode === "new" ? "bio-image-new" : `bio-image-${item.id}`}
      title={mode === "new" ? "+ Add portrait" : item.id}
      variant="item"
    >
      <form action={saveBioGalleryImage}>
        <fieldset disabled={disabled}>
          {mode === "edit" ? (
            <input name="id" type="hidden" value={item.id} />
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            {mode === "new" ? (
              <Field label="ID">
                <TextInput name="id" />
              </Field>
            ) : null}
            <MediaAssetPicker
              assets={assets}
              className="sm:col-span-2"
              defaultValue={item.src}
              kind="image"
              label="Biography image"
              name="src"
              required
            />
            <Field label="Alt text">
              <TextInput defaultValue={item.alt} name="alt" />
            </Field>
          </div>
          <div className="mt-4">
            <PublishControls
              isPublished={item.isPublished}
              sortOrder={item.sortOrder}
            />
          </div>
          <SaveRow disabled={disabled} />
        </fieldset>
      </form>
      {mode === "edit" ? (
        <DeleteForm
          action={deleteBioGalleryImage}
          disabled={disabled}
          id={item.id}
        />
      ) : null}
    </AdminDisclosure>
  );
}

type ParagraphDraft = EditableBioParagraph & { clientKey: string };

function BioParagraphsEditor({
  items,
  disabled,
}: {
  items: EditableBioParagraph[];
  disabled: boolean;
}) {
  const [paragraphs, setParagraphs] = useState<ParagraphDraft[]>(() =>
    [...items]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((item) => ({ ...item, clientKey: item.id }))
  );

  function updateParagraph(
    clientKey: string,
    patch: Partial<ParagraphDraft>
  ) {
    setParagraphs((current) =>
      current.map((item) =>
        item.clientKey === clientKey ? { ...item, ...patch } : item
      )
    );
  }

  function moveParagraph(index: number, direction: -1 | 1) {
    setParagraphs((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function addParagraph() {
    setParagraphs((current) => [
      ...current,
      {
        id: "",
        clientKey: `new-${crypto.randomUUID()}`,
        body: "",
        revealDelay: current.length
          ? current[current.length - 1].revealDelay + 60
          : 140,
        sortOrder: (current.length + 1) * 10,
        isPublished: true,
      },
    ]);
  }

  const payload = paragraphs.map((item, index) => ({
    id: item.id || undefined,
    body: item.body,
    revealDelay: item.revealDelay,
    sortOrder: (index + 1) * 10,
    isPublished: item.isPublished,
  }));

  return (
    <div className="overflow-hidden rounded-[18px] border border-white/9 bg-black/24" id="bio-paragraphs">
      <div className="border-b border-white/10 px-5 py-4">
        <p className="text-sm leading-6 text-white/48">
          Reorder the reading flow, adjust reveal timing, then save the complete biography once.
        </p>
      </div>

      <form action={saveBioParagraphs}>
        <input name="paragraphsJson" type="hidden" value={JSON.stringify(payload)} />
        <fieldset disabled={disabled}>
          <div>
            {paragraphs.map((item, index) => (
              <div className="grid gap-4 border-b border-white/10 p-5 lg:grid-cols-[72px_minmax(0,1fr)_150px]" key={item.clientKey}>
                <div className="flex items-start gap-2 lg:flex-col">
                  <span className="grid h-10 min-w-10 place-items-center rounded-xl border border-white/10 text-sm font-semibold text-white/55">{String(index + 1).padStart(2, "0")}</span>
                  <div className="flex gap-1">
                    <button aria-label="Move paragraph up" className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 text-white/55 hover:bg-white hover:text-black disabled:opacity-30" data-editor-dirty-action disabled={index === 0} onClick={() => moveParagraph(index, -1)} type="button"><FaArrowUp /></button>
                    <button aria-label="Move paragraph down" className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 text-white/55 hover:bg-white hover:text-black disabled:opacity-30" data-editor-dirty-action disabled={index === paragraphs.length - 1} onClick={() => moveParagraph(index, 1)} type="button"><FaArrowDown /></button>
                  </div>
                </div>

                <label>
                  <span className={labelClass}>Paragraph text</span>
                  <textarea className={`${textareaClass} min-h-36`} onChange={(event) => updateParagraph(item.clientKey, { body: event.target.value })} required value={item.body} />
                </label>

                <div className="grid content-start gap-3">
                  <label><span className={labelClass}>Reveal delay</span><input className={inputClass} min="0" max="5000" onChange={(event) => updateParagraph(item.clientKey, { revealDelay: Number(event.target.value) || 0 })} type="number" value={item.revealDelay} /></label>
                  <label className="flex h-11 items-center gap-3 rounded-xl border border-white/10 px-3 text-sm text-white/70"><input checked={item.isPublished} className="h-4 w-4 accent-white" onChange={(event) => updateParagraph(item.clientKey, { isPublished: event.target.checked })} type="checkbox" /> Published</label>
                  <button className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-red-300/20 text-sm font-semibold text-red-200 hover:bg-red-500/10" data-editor-dirty-action onClick={() => setParagraphs((current) => current.filter((entry) => entry.clientKey !== item.clientKey))} type="button"><FaTrash /> Remove</button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <button className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/12 px-4 text-sm font-semibold text-white/75 hover:bg-white hover:text-black" data-editor-dirty-action onClick={addParagraph} type="button"><FaPlus /> Add paragraph</button>
            <ActionButton className={buttonClass} disabled={disabled || paragraphs.some((item) => !item.body.trim())} pendingLabel="Saving all...">Save all paragraphs</ActionButton>
          </div>
        </fieldset>
      </form>
    </div>
  );
}

function SocialLinksSection({
  items,
  disabled,
  portfolioType,
}: {
  items: EditableSocialLink[];
  disabled: boolean;
  portfolioType: PortfolioType;
}) {
  return (
    <AdminDisclosure
      badge={<span className="text-xs text-white/42">{items.length} links</span>}
      collapsible={false}
      defaultOpen
      description="Social destinations shared by the public footer and navigation."
      eyebrow="Public presence"
      id="socials-links"
      title="Footer links"
    >
      <div className="mb-4 grid gap-3 rounded-[18px] border border-white/10 bg-gradient-to-br from-white/[0.075] to-transparent p-4 sm:grid-cols-[auto_1fr] sm:items-center">
        <div className="flex -space-x-2">
          {(portfolioType === "actor"
            ? ["vimeo", "youtube", "imdb", "instagram"]
            : ["spotify", "soundcloud", "instagram", "youtube"]
          ).map((platform) => (
            <SocialPlatformIcon
              className="grid h-10 w-10 place-items-center rounded-full border-2 border-[#171717] bg-white text-sm text-black"
              key={platform}
              platform={platform}
            />
          ))}
        </div>
        <div>
          <p className="text-sm font-semibold text-white">
            Logo is selected automatically
          </p>
          <p className="mt-1 text-sm leading-6 text-white/48">
            Add any profile, set its order, or hide it. Published links appear
            in both the public footer and social navigation.
          </p>
        </div>
      </div>
      <div className="grid gap-3">
        {items.map((item) => (
          <SocialLinkForm
            disabled={disabled}
            item={item}
            key={item.id}
            portfolioType={portfolioType}
          />
        ))}
        <SocialLinkForm
          disabled={disabled}
          item={{
            id: "",
            label: "",
            platform: "",
            href: "",
            iconKey: "",
            sortOrder: nextSort(items),
            isPublished: true,
          }}
          mode="new"
          portfolioType={portfolioType}
        />
      </div>
    </AdminDisclosure>
  );
}

function SocialLinkForm({
  item,
  disabled,
  mode = "edit",
  portfolioType,
}: {
  item: EditableSocialLink;
  disabled: boolean;
  mode?: "edit" | "new";
  portfolioType: PortfolioType;
}) {
  const platformOptions = getSocialPlatformOptions(portfolioType);
  const defaultPlatform = platformOptions[0].key;
  const [platform, setPlatform] = useState(item.platform || defaultPlatform);
  const [label, setLabel] = useState(
    item.label || getSocialPlatformDefinition(defaultPlatform).label
  );
  const detectedPlatform = detectSocialPlatform(
    platform,
    item.href,
    label
  );
  const platformDefinition = getSocialPlatformDefinition(detectedPlatform);
  const isKnownPlatform = platformOptions.some(
    (option) => option.key === platform
  );

  function updatePlatform(nextPlatform: string) {
    const previousDefinition = getSocialPlatformDefinition(
      detectSocialPlatform(platform)
    );
    const nextDefinition = getSocialPlatformDefinition(
      detectSocialPlatform(nextPlatform)
    );

    setPlatform(nextPlatform);
    if (!label.trim() || label === previousDefinition.label || mode === "new") {
      setLabel(nextDefinition.label);
    }
  }

  return (
    <AdminDisclosure
      badge={
        <span className={`rounded-full border px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.1em] ${item.isPublished || mode === "new" ? "border-emerald-300/15 text-emerald-100/65" : "border-white/10 text-white/35"}`}>
          {item.isPublished || mode === "new" ? "Visible" : "Hidden"}
        </span>
      }
      description={`${platformDefinition.label} · automatic logo`}
      icon={
        <SocialPlatformIcon
          className="grid h-8 w-8 place-items-center rounded-lg bg-white text-sm text-black"
          href={item.href}
          label={label}
          platform={platform}
        />
      }
      id={mode === "new" ? "social-link-new" : `social-link-${item.id}`}
      title={mode === "new" ? "+ Add footer link" : label}
      variant="item"
    >
      <form action={saveSocialLink}>
        <fieldset disabled={disabled}>
          {mode === "edit" ? (
            <input name="id" type="hidden" value={item.id} />
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Platform">
              <select
                className={inputClass}
                name="platform"
                onChange={(event) => updatePlatform(event.target.value)}
                required
                value={platform}
              >
                {!isKnownPlatform ? (
                  <option value={platform}>{platform}</option>
                ) : null}
                {platformOptions.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Public label">
              <input
                className={inputClass}
                name="label"
                onChange={(event) => setLabel(event.target.value)}
                required
                value={label}
              />
            </Field>
            <Field label="Profile URL" wide>
              <input
                className={inputClass}
                defaultValue={item.href}
                name="href"
                placeholder={platformDefinition.hrefPlaceholder}
                required
                type="url"
              />
            </Field>
            <input name="iconKey" type="hidden" value={detectedPlatform} />
          </div>
          <div className="mt-4">
            <PublishControls
              isPublished={item.isPublished}
              sortOrder={item.sortOrder}
            />
          </div>
          <SaveRow disabled={disabled} />
        </fieldset>
      </form>
      {mode === "edit" ? (
        <DeleteForm action={deleteSocialLink} disabled={disabled} id={item.id} />
      ) : null}
    </AdminDisclosure>
  );
}

function MusicLinksSection({
  assets,
  items,
  disabled,
}: {
  assets: MediaAsset[];
  items: EditableMusicPlatformLink[];
  disabled: boolean;
}) {
  return (
    <AdminDisclosure
      badge={<span className="text-xs text-white/42">{items.length} links</span>}
      collapsible={false}
      description="Streaming destinations and release cards."
      eyebrow="03 · Destinations"
      id="music-platforms"
      title="Platform links"
    >
      <div className="grid gap-3">
        {items.map((item) => (
          <MusicPlatformForm assets={assets} disabled={disabled} item={item} key={item.id} />
        ))}
        <MusicPlatformForm
          assets={assets}
          disabled={disabled}
          item={{
            id: "",
            title: "",
            label: "",
            href: "",
            iconKey: "",
            imageSrc: "",
            sortOrder: nextSort(items),
            isPublished: true,
          }}
          mode="new"
        />
      </div>
    </AdminDisclosure>
  );
}

function MusicPlatformForm({
  assets,
  item,
  disabled,
  mode = "edit",
}: {
  assets: MediaAsset[];
  item: EditableMusicPlatformLink;
  disabled: boolean;
  mode?: "edit" | "new";
}) {
  return (
    <AdminDisclosure
      badge={<span className="text-[10px] text-white/40">{item.isPublished || mode === "new" ? "Published" : "Hidden"}</span>}
      description={mode === "new" ? "Create a new streaming or release destination." : item.label || item.href}
      id={mode === "new" ? "music-platform-new" : `music-platform-${item.id}`}
      title={mode === "new" ? "+ Add music link" : item.title}
      variant="item"
    >
      <form action={saveMusicPlatformLink}>
        <fieldset disabled={disabled}>
          {mode === "edit" ? (
            <input name="id" type="hidden" value={item.id} />
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            {mode === "new" ? (
              <Field label="ID">
                <TextInput name="id" />
              </Field>
            ) : null}
            <Field label="Title">
              <TextInput defaultValue={item.title} name="title" required />
            </Field>
            <Field label="Label">
              <TextInput defaultValue={item.label} name="label" />
            </Field>
            <Field label="Icon key">
              <TextInput defaultValue={item.iconKey} name="iconKey" />
            </Field>
            <Field label="Href" wide>
              <TextInput defaultValue={item.href} name="href" required />
            </Field>
            <MediaAssetPicker
              assets={assets}
              className="sm:col-span-2"
              defaultValue={item.imageSrc}
              kind="image"
              label="Platform image"
              name="imageSrc"
            />
          </div>
          <div className="mt-4">
            <PublishControls
              isPublished={item.isPublished}
              sortOrder={item.sortOrder}
            />
          </div>
          <SaveRow disabled={disabled} />
        </fieldset>
      </form>
      {mode === "edit" ? (
        <DeleteForm
          action={deleteMusicPlatformLink}
          disabled={disabled}
          id={item.id}
        />
      ) : null}
    </AdminDisclosure>
  );
}

function TracksSection({
  items,
  disabled,
}: {
  items: EditableSoundcloudTrack[];
  disabled: boolean;
}) {
  return (
    <AdminDisclosure
      badge={<span className="text-xs text-white/42">{items.length} tracks</span>}
      collapsible={false}
      description="SoundCloud embeds and their public order."
      eyebrow="04 · Listening"
      id="tracks"
      title="SoundCloud tracks"
    >
      <div className="grid gap-3">
        {items.map((item) => (
          <TrackForm disabled={disabled} item={item} key={item.id} />
        ))}
        <TrackForm
          disabled={disabled}
          item={{
            id: "",
            title: "",
            embedUrl: "",
            sortOrder: nextSort(items),
            isPublished: true,
          }}
          mode="new"
        />
      </div>
    </AdminDisclosure>
  );
}

function TrackForm({
  item,
  disabled,
  mode = "edit",
}: {
  item: EditableSoundcloudTrack;
  disabled: boolean;
  mode?: "edit" | "new";
}) {
  return (
    <AdminDisclosure
      badge={<span className="text-[10px] text-white/40">{item.isPublished || mode === "new" ? "Published" : "Hidden"}</span>}
      description={mode === "new" ? "Add another SoundCloud embed." : item.embedUrl}
      id={mode === "new" ? "track-new" : `track-${item.id}`}
      title={mode === "new" ? "+ Add track" : item.title || item.id}
      variant="item"
    >
      <form action={saveSoundcloudTrack}>
        <fieldset disabled={disabled}>
          {mode === "edit" ? (
            <input name="id" type="hidden" value={item.id} />
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            {mode === "new" ? (
              <Field label="ID">
                <TextInput name="id" />
              </Field>
            ) : null}
            <Field label="Title">
              <TextInput defaultValue={item.title} name="title" />
            </Field>
            <Field label="Embed URL" wide>
              <TextInput defaultValue={item.embedUrl} name="embedUrl" required />
            </Field>
          </div>
          <div className="mt-4">
            <PublishControls
              isPublished={item.isPublished}
              sortOrder={item.sortOrder}
            />
          </div>
          <SaveRow disabled={disabled} />
        </fieldset>
      </form>
      {mode === "edit" ? (
        <DeleteForm
          action={deleteSoundcloudTrack}
          disabled={disabled}
          id={item.id}
        />
      ) : null}
    </AdminDisclosure>
  );
}

type ContentWorkspaceSection = {
  id: string;
  label: string;
  kicker: string;
  description: string;
  count?: number;
  countLabel?: string;
  node: ReactNode;
};

export default function ContentEditor({
  assets,
  content,
  isConfigured,
  loadError,
  status,
}: ContentEditorProps) {
  const disabled = !isConfigured || Boolean(loadError);
  const portfolioType = content.settings.portfolioType;
  const musicEnabled = isModuleEnabled(portfolioType, "music");
  const actorEnabled = portfolioType === "actor";
  const sections = useMemo<ContentWorkspaceSection[]>(
    () => [
      {
        id: "home",
        label: "Home",
        kicker: "Public page",
        description:
          "Hero, About, Interlude, and Freelancer Life in public page order.",
        count: 4,
        node: (
          <StudioWorkspace
            description="Live content, rendered as a compact page mirror"
            label="Home page"
            panels={[
              {
                description: "Opening title, action, and background media.",
                id: "home-hero",
                label: "Hero",
                node: (
                  <HeroForms
                    activePageSlugs={["home"]}
                    assets={assets}
                    content={content}
                    disabled={disabled}
                    returnSection="home-hero"
                  />
                ),
              },
              {
                description: "Portrait, introduction, and optional action.",
                id: "home-about",
                label: "About",
                node: (
                  <HomePresentationForm
                    assets={assets}
                    content={content}
                    disabled={disabled}
                    panel="about"
                  />
                ),
              },
              {
                description: "Video transition between story and gallery.",
                id: "home-interlude",
                label: "Interlude",
                node: (
                  <HomePresentationForm
                    assets={assets}
                    content={content}
                    disabled={disabled}
                    panel="interlude"
                  />
                ),
              },
              {
                description: "Four-scene scroll story.",
                id: "home-freelancer-life",
                label: "Freelancer life",
                node: (
                  <HomePresentationForm
                    assets={assets}
                    content={content}
                    disabled={disabled}
                    panel="story"
                  />
                ),
              },
            ]}
            preview={<HomeSnapshot content={content} />}
            publicHref="/"
            sectionId="home"
          />
        ),
      },
      {
        id: "bio",
        label: "Bio",
        kicker: "Public page",
        description: "Hero, portraits, biography, resume, and credits in page order.",
        count: content.bio.galleryImages.length + content.bio.paragraphs.length,
        node: (
          <StudioWorkspace
            description="Portraits and story, in the same order visitors see them"
            label="Bio page"
            panels={[
              {
                description: "Opening title, action, and background media.",
                id: "bio-hero",
                label: "Hero",
                node: (
                  <HeroForms
                    activePageSlugs={["bio"]}
                    assets={assets}
                    content={content}
                    disabled={disabled}
                    returnSection="bio-hero"
                  />
                ),
              },
              {
                description: "Opening biography label and introduction.",
                id: "bio-intro",
                label: "Introduction",
                node: (
                  <BioForms
                    assets={assets}
                    content={content}
                    disabled={disabled}
                    isActor={actorEnabled}
                    panel="intro"
                  />
                ),
              },
              {
                description: "Portraits shown throughout the biography.",
                id: "bio-gallery",
                label: "Portraits",
                node: (
                  <BioForms
                    assets={assets}
                    content={content}
                    disabled={disabled}
                    isActor={actorEnabled}
                    panel="gallery"
                  />
                ),
              },
              {
                aliases: ["bio-paragraphs"],
                description: "Long-form biography and reveal order.",
                id: "bio-paragraphs-panel",
                label: "Biography",
                node: (
                  <BioForms
                    assets={assets}
                    content={content}
                    disabled={disabled}
                    isActor={actorEnabled}
                    panel="paragraphs"
                  />
                ),
              },
              ...(actorEnabled
                ? [
                    {
                      description: "Playing profile, skills, and representation.",
                      id: "actor-resume",
                      label: "Resume",
                      node: (
                        <ActorResumeSection
                          content={content}
                          disabled={disabled}
                        />
                      ),
                    },
                    {
                      description: "Film, television, theatre, and training.",
                      id: "actor-credits",
                      label: "Credits",
                      node: (
                        <ActorCreditsSection
                          disabled={disabled}
                          items={content.actorCredits}
                        />
                      ),
                    },
                  ]
                : []),
            ]}
            preview={<BioSnapshot content={content} />}
            publicHref="/bio"
            sectionId="bio"
          />
        ),
      },
      ...(musicEnabled
        ? [
            {
              id: "music-links",
              label: "Music",
              kicker: "Public page",
              description:
                "Hero, Spotify, platform cards, releases, and SoundCloud mixes.",
              count:
                content.musicPlatforms.length +
                content.soundcloudTracks.length,
              node: (
                <StudioWorkspace
                  description="Music destinations, releases, and listening sequence"
                  label="Music page"
                  panels={[
                    {
                      description: "Opening title, action, and background media.",
                      id: "music-links-hero",
                      label: "Hero",
                      node: (
                        <HeroForms
                          activePageSlugs={["music"]}
                          assets={assets}
                          content={content}
                          disabled={disabled}
                          returnSection="music-links-hero"
                        />
                      ),
                    },
                    {
                      description: "Spotify artist and embed links.",
                      id: "music-settings",
                      label: "Spotify",
                      node: (
                        <SiteSettingsForm
                          content={content}
                          disabled={disabled}
                          mode="music"
                        />
                      ),
                    },
                    {
                      description: "Streaming destinations and release cards.",
                      id: "music-platforms",
                      label: "Platforms",
                      node: (
                        <MusicLinksSection
                          assets={assets}
                          disabled={disabled}
                          items={content.musicPlatforms}
                        />
                      ),
                    },
                    {
                      description: "SoundCloud embeds and public order.",
                      id: "tracks",
                      label: "SoundCloud",
                      node: (
                        <TracksSection
                          disabled={disabled}
                          items={content.soundcloudTracks}
                        />
                      ),
                    },
                  ]}
                  preview={<MusicSnapshot content={content} />}
                  publicHref="/music"
                  sectionId="music-links"
                />
              ),
            },
          ]
        : []),
      {
        id: "booking",
        label: portfolioType === "actor" ? "Contact" : "Booking",
        kicker: "Public page",
        description:
          "Hero, location, contact introduction, and inquiry form context.",
        node: (
          <StudioWorkspace
            description="Contact introduction and the public inquiry experience"
            label={portfolioType === "actor" ? "Contact page" : "Booking page"}
            panels={[
              {
                description: "Opening title, action, and background media.",
                id: "booking-hero",
                label: "Hero",
                node: (
                  <HeroForms
                    activePageSlugs={["booking"]}
                    assets={assets}
                    content={content}
                    disabled={disabled}
                    returnSection="booking-hero"
                  />
                ),
              },
              {
                description: "Location and inquiry introduction.",
                id: "contact-settings",
                label: "Contact details",
                node: (
                  <SiteSettingsForm
                    content={content}
                    disabled={disabled}
                    mode="contact"
                  />
                ),
              },
            ]}
            preview={<BookingSnapshot content={content} />}
            publicHref="/booking"
            sectionId="booking"
          />
        ),
      },
      {
        id: "navigation",
        label: "Navigation",
        kicker: "Site-wide",
        description:
          "Choose which portfolio pages appear in the desktop and mobile navbar.",
        count: getVisibleNavigationModules(
          portfolioType,
          content.settings.hiddenNavPageSlugs
        ).length,
        countLabel: "visible",
        node: (
          <NavigationWorkspace
            content={content}
            disabled={disabled}
            key={`${portfolioType}-${content.settings.hiddenNavPageSlugs.join(
              "-"
            )}`}
          />
        ),
      },
      {
        id: "settings",
        label: "Brand & style",
        kicker: "Site-wide",
        description:
          "Artist identity, portfolio mode, typography, description, and footer effect.",
        node: (
          <StudioWorkspace
            description="Global choices that shape every public page"
            label="Brand system"
            panels={[
              {
                description: "Artist name, portfolio mode, and public copy.",
                id: "settings-identity",
                label: "Identity",
                node: (
                  <SiteSettingsForm
                    brandPanel="identity"
                    content={content}
                    disabled={disabled}
                  />
                ),
              },
              {
                description: "Display, paragraph, and interface fonts.",
                id: "settings-typography",
                label: "Typography",
                node: (
                  <SiteSettingsForm
                    brandPanel="typography"
                    content={content}
                    disabled={disabled}
                  />
                ),
              },
              {
                description: "Desktop pointer behavior in the footer.",
                id: "settings-footer-effect",
                label: "Footer effect",
                node: (
                  <SiteSettingsForm
                    brandPanel="footer"
                    content={content}
                    disabled={disabled}
                  />
                ),
              },
            ]}
            preview={<BrandSnapshot content={content} />}
            publicHref="/"
            sectionId="settings"
          />
        ),
      },
      {
        id: "socials",
        label: "Footer & social",
        kicker: "Site-wide",
        description:
          "Social destinations, visibility, icons, and display order.",
        count: content.socialLinks.length,
        node: (
          <StudioWorkspace
            description="Shared across the bottom of every portfolio page"
            label="Shared footer"
            panels={[
              {
                description: "Destinations, icons, visibility, and order.",
                id: "socials-links",
                label: "Social links",
                node: (
                  <SocialLinksSection
                    disabled={disabled}
                    items={content.socialLinks}
                    portfolioType={portfolioType}
                  />
                ),
              },
            ]}
            preview={<FooterSnapshot content={content} />}
            publicHref="/"
            sectionId="socials"
          />
        ),
      },
    ],
    [
      actorEnabled,
      assets,
      content,
      disabled,
      musicEnabled,
      portfolioType,
    ]
  );
  const [activeSectionId, setActiveSectionId] = useState("home");
  const {
    clearDirty,
    confirmDiscard,
    hasUnsavedChanges,
    markDirty,
  } = useUnsavedChangesGuard();
  const [dirtyPanelIds, setDirtyPanelIds] = useState<Set<string>>(
    () => new Set()
  );
  const [dirtyForms, setDirtyForms] = useState<Set<HTMLFormElement>>(
    () => new Set()
  );

  useEffect(() => {
    const syncHash = () => {
      const hash = window.location.hash.replace(/^#/, "");
      if (hash) setActiveSectionId(hash);
    };
    const frame = window.requestAnimationFrame(syncHash);
    window.addEventListener("hashchange", syncHash);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("hashchange", syncHash);
    };
  }, []);

  const sectionAliases: Record<string, string> = {
    heroes: "home",
    "home-hero": "home",
    "home-about": "home",
    "home-interlude": "home",
    "home-freelancer-life": "home",
    "bio-hero": "bio",
    "bio-intro": "bio",
    "actor-resume": "bio",
    "actor-credits": "bio",
    "bio-gallery": "bio",
    "bio-paragraphs": "bio",
    "bio-paragraphs-panel": "bio",
    "music-links-hero": "music-links",
    "music-settings": "music-links",
    "music-platforms": "music-links",
    "booking-hero": "booking",
    "contact-settings": "booking",
    "navigation-settings": "navigation",
    "settings-identity": "settings",
    "settings-typography": "settings",
    "settings-footer-effect": "settings",
    "socials-links": "socials",
    updates: "home",
    tracks: "music-links",
  };
  const resolvedSectionId = sectionAliases[activeSectionId] || activeSectionId;
  const activeSection =
    sections.find((section) => section.id === resolvedSectionId) || sections[0];
  const sectionNavRef = useRef<HTMLElement | null>(null);
  const {
    scrollRef: sectionNavScrollerRef,
    showEndCue: showSectionNavEndCue,
  } = useHorizontalOverflowCue<HTMLDivElement>();

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      sectionNavRef.current
        ?.querySelector<HTMLElement>("[aria-pressed='true']")
        ?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
          inline: "nearest",
        });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeSection?.id]);

  function openSection(id: string) {
    if (id === activeSection?.id) return;
    if (!confirmDiscard()) return;
    setDirtyPanelIds(new Set());
    setDirtyForms(new Set());
    setActiveSectionId(id);
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}${window.location.search}#${id}`
    );
    document
      .getElementById("content-workspace")
      ?.scrollIntoView({ block: "start" });
  }

  function rememberDirtyDraft(target: EventTarget | null) {
    if (!(target instanceof Element)) return;
    const panelId = target
      .closest<HTMLElement>("[data-editor-panel-id]")
      ?.getAttribute("data-editor-panel-id");
    if (!panelId || panelId === "preview") return;
    setDirtyPanelIds((current) => {
      if (current.has(panelId)) return current;
      const next = new Set(current);
      next.add(panelId);
      return next;
    });

    const form = target.closest<HTMLFormElement>("form");
    if (!form) return;
    setDirtyForms((current) => {
      if (current.has(form)) return current;
      const next = new Set(current);
      next.add(form);
      return next;
    });
  }

  const hiddenNavPageSlugs = new Set(content.settings.hiddenNavPageSlugs);
  const publicPageItems = getProfilePublicModules(portfolioType).map((page) => {
    const sectionId =
      page.key === "home"
        ? "home"
        : page.key === "bio"
          ? "bio"
          : page.key === "music"
            ? "music-links"
            : page.key === "contact"
              ? "booking"
              : "";
    const editorHref =
      page.key === "gallery"
        ? "/admin/media?view=studio"
        : page.key === "video" || page.key === "showreel"
          ? "/admin/media?view=showreel"
          : "";
    const icon =
      page.key === "gallery" ? (
        <FaImages />
      ) : page.key === "video" || page.key === "showreel" ? (
        <FaPlay />
      ) : (
        <FaGlobe />
      );

    return {
      ...page,
      sectionId,
      editorHref,
      icon,
      isVisible:
        !page.pageSlug || !hiddenNavPageSlugs.has(page.pageSlug),
    };
  });
  const sharedSections = sections.filter((section) =>
    ["navigation", "settings", "socials"].includes(section.id)
  );
  const siteEditorNavigation = (
    <nav
      aria-label="Site editor sections"
      className="relative overflow-hidden border-b border-white/8"
      ref={sectionNavRef}
    >
      <div
        aria-describedby="site-editor-sections-scroll-help"
        className="admin-scrollbar-none flex items-center gap-2 overflow-x-auto p-2.5 pr-12"
        ref={sectionNavScrollerRef}
      >
        <span className="shrink-0 px-2 text-[9px] font-semibold uppercase tracking-[0.2em] text-white/26">
          Pages
        </span>
        {publicPageItems.map((page) => {
          const active = page.sectionId === activeSection?.id;
          const contentNode = (
            <>
              <span className="text-[11px]">{page.icon}</span>
              <span className="whitespace-nowrap text-xs font-semibold">
                {page.label}
              </span>
              <span
                aria-label={
                  page.isVisible ? "Shown in navbar" : "Hidden from navbar"
                }
                className={`h-1.5 w-1.5 rounded-full ${
                  page.isVisible ? "bg-emerald-300/70" : "bg-amber-300/65"
                }`}
                role="img"
              />
              {page.editorHref ? (
                <FaExternalLinkAlt className="text-[8px] text-white/32" />
              ) : null}
            </>
          );
          const className = `flex min-h-11 shrink-0 items-center gap-2 rounded-xl border px-3 transition ${
            active
              ? "border-[#ff7059]/28 bg-[#ff3b1f] text-white"
              : "border-white/7 bg-white/[0.025] text-white/48 hover:border-white/14 hover:bg-white/[0.065] hover:text-white"
          }`;

          return page.editorHref ? (
            <Link
              className={className}
              href={page.editorHref}
              key={`${page.key}-${page.href}`}
            >
              {contentNode}
            </Link>
          ) : (
            <button
              aria-controls="site-editor-active-panel"
              aria-pressed={active}
              className={className}
              id={`site-editor-section-${page.sectionId}`}
              key={`${page.key}-${page.href}`}
              onClick={() => openSection(page.sectionId)}
              type="button"
            >
              {contentNode}
            </button>
          );
        })}

        <span className="mx-1 h-7 w-px shrink-0 bg-white/10" />
        <span className="shrink-0 px-2 text-[9px] font-semibold uppercase tracking-[0.2em] text-white/26">
          Site-wide
        </span>
        {sharedSections.map((section) => {
          const active = section.id === activeSection?.id;
          const icon =
            section.id === "navigation" ? (
              <FaBars />
            ) : section.id === "settings" ? (
              <FaPalette />
            ) : (
              <FaGlobe />
            );

          return (
            <button
              aria-controls="site-editor-active-panel"
              aria-pressed={active}
              className={`flex min-h-11 shrink-0 items-center gap-2 rounded-xl border px-3 text-xs font-semibold transition ${
                active
                  ? "border-[#ff7059]/28 bg-[#ff3b1f] text-white"
                  : "border-white/7 bg-white/[0.025] text-white/48 hover:border-white/14 hover:bg-white/[0.065] hover:text-white"
              }`}
              id={`site-editor-section-${section.id}`}
              key={section.id}
              onClick={() => openSection(section.id)}
              type="button"
            >
              <span className="text-[11px]">{icon}</span>
              <span className="whitespace-nowrap">{section.label}</span>
            </button>
          );
        })}
      </div>
      <span className="sr-only" id="site-editor-sections-scroll-help">
        Scroll horizontally to reveal more pages and site-wide settings.
      </span>
      {showSectionNavEndCue ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 grid w-10 place-items-center bg-gradient-to-l from-[#0d0d0f] via-[#0d0d0f]/92 to-transparent text-xs text-white/36"
        >
          →
        </span>
      ) : null}
    </nav>
  );

  return (
    <div
      className="grid gap-4"
      onChangeCapture={(event) => {
        const target = event.target;
        if (
          !(
            target instanceof HTMLInputElement ||
            target instanceof HTMLSelectElement ||
            target instanceof HTMLTextAreaElement
          ) ||
          !target.name
        ) {
          return;
        }
        markDirty();
        rememberDirtyDraft(target);
      }}
      onClickCapture={(event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const button = target.closest("button");
        if (
          button instanceof HTMLButtonElement &&
          button.type === "button" &&
          button.closest("form") &&
          (button.hasAttribute("data-editor-dirty-action") ||
            button.getAttribute("aria-label")?.startsWith("Use "))
        ) {
          markDirty();
          rememberDirtyDraft(button);
        }
      }}
      onSubmit={(event) => {
        if (event.defaultPrevented) return;
        const form = event.target;
        const submittingPanelId =
          form instanceof HTMLFormElement
            ? form
                .closest<HTMLElement>("[data-editor-panel-id]")
                ?.getAttribute("data-editor-panel-id")
            : null;
        const otherDraftForms = [...dirtyForms].filter(
          (dirtyForm) => dirtyForm !== form && dirtyForm.isConnected
        );
        const otherDraftPanels = [...dirtyPanelIds].filter(
          (panelId) => panelId !== submittingPanelId
        );

        if (
          (otherDraftForms.length > 0 || otherDraftPanels.length > 0) &&
          !window.confirm(
            "You also have unsaved changes in another form. Saving now reloads the editor and discards those drafts. Continue?"
          )
        ) {
          event.preventDefault();
          return;
        }

        setDirtyPanelIds(new Set());
        setDirtyForms(new Set());
        clearDirty();
      }}
    >
      <StatusNotice
        isConfigured={isConfigured}
        loadError={loadError}
        status={status}
      />

      <div className="min-w-0">
        <div className="min-w-0">
          <div
            aria-labelledby={`site-editor-section-${activeSection?.id}`}
            className="scroll-mt-28"
            id="content-workspace"
            key={activeSection?.id}
            role="region"
            tabIndex={-1}
          >
            <EditorSectionNavigationContext.Provider value={siteEditorNavigation}>
              <DirtyPanelsContext.Provider value={dirtyPanelIds}>
                {activeSection?.node}
              </DirtyPanelsContext.Provider>
            </EditorSectionNavigationContext.Provider>
          </div>
        </div>
      </div>

      {hasUnsavedChanges ? (
        <div
          aria-live="polite"
          className="fixed bottom-4 right-4 z-50 inline-flex min-h-10 items-center gap-2 rounded-full border border-amber-300/18 bg-[#17130c]/94 px-4 text-xs font-semibold text-amber-100/76 shadow-[0_14px_44px_rgba(0,0,0,0.45)] backdrop-blur-xl"
          role="status"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-amber-300" />
          {dirtyPanelIds.size === 1
            ? "1 panel has unsaved changes"
            : `${dirtyPanelIds.size} panels have unsaved changes`}
        </div>
      ) : null}
    </div>
  );
}
