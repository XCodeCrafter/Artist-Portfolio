"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { FaArrowDown, FaArrowUp, FaPlus, FaTrash } from "react-icons/fa";
import ActionButton from "@/components/admin/ActionButton";
import MediaAssetPicker from "@/components/admin/MediaAssetPicker";
import SocialPlatformIcon from "@/components/SocialPlatformIcon";
import {
  getActivePageSlugs,
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
  updateHomePresentation,
  updatePageHero,
  updateSiteSettings,
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
    "Some fields need attention. Links must use http(s), a local /path, or an #anchor.",
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
  "saved-settings": "Site settings saved.",
  "saved-social": "Footer link saved.",
  "saved-track": "SoundCloud track saved.",
  "saved-update": "Homepage update saved.",
  "saved-video": "Video saved.",
  "footer-effect-migration-required":
    "Footer effects need the 0016_footer_effect database migration before they can be saved.",
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
  required = false,
  type = "text",
}: {
  name: string;
  defaultValue?: string | number;
  list?: string;
  required?: boolean;
  type?: "text" | "number" | "url";
}) {
  return (
    <input
      className={inputClass}
      defaultValue={defaultValue}
      list={list}
      name={name}
      required={required}
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
          <div className="relative min-h-72"><Image alt={content.aboutHome.imageAlt || "Home about preview"} className="object-cover" fill sizes="50vw" src={content.aboutHome.imageSrc} /></div>
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

function TextArea({
  name,
  defaultValue,
  rows = 5,
  required = false,
}: {
  name: string;
  defaultValue?: string;
  rows?: number;
  required?: boolean;
}) {
  return (
    <textarea
      className={textareaClass}
      defaultValue={defaultValue}
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
}: {
  kicker: string;
  title: string;
  count?: number;
}) {
  return (
    <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className={labelClass}>{kicker}</p>
        <h2 className="heading-ui mt-2 text-2xl text-white">{title}</h2>
      </div>
      {typeof count === "number" ? (
        <span className="text-sm text-white/45">{count} items</span>
      ) : null}
    </div>
  );
}

function SaveRow({ disabled }: { disabled: boolean }) {
  return (
    <div className="mt-5 flex justify-end">
      <ActionButton
        className={buttonClass}
        disabled={disabled}
        pendingLabel="Saving..."
      >
        Save
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
    <form action={action} className="mt-3 flex justify-end">
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

  if (!message && isConfigured && !loadError) return null;

  return (
    <div className="mt-8 space-y-3">
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
        <div className="rounded-lg border border-white/10 bg-white/10 px-4 py-3 text-sm leading-6 text-white/80">
          {message}
        </div>
      ) : null}
    </div>
  );
}

function SiteSettingsForm({
  content,
  disabled,
}: {
  content: EditablePortfolioContent;
  disabled: boolean;
}) {
  return (
    <form action={updateSiteSettings} className={sectionClass} id="settings">
      <SectionHeader kicker="Identity" title="Site Settings" />
      <fieldset disabled={disabled}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Artist name">
            <TextInput
              defaultValue={content.settings.artistName}
              name="artistName"
              required
            />
          </Field>
          <Field label="Profile type">
            <select
              className={inputClass}
              defaultValue={content.settings.portfolioType}
              name="portfolioType"
            >
              <option value="musician">musician</option>
              <option value="actor">actor</option>
            </select>
          </Field>
          <FooterEffectPicker
            defaultValue={content.settings.footerEffect}
          />
          <div className="sm:col-span-2 mt-3 border-t border-white/10 pt-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
              Typography
            </p>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">
              Display stays reserved for hero and section headings. Body keeps
              paragraphs readable, while UI covers navigation, buttons, and
              compact headings.
            </p>
          </div>
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
          <Field label="UI / navigation and buttons">
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
          <Field label="Footer tagline / discipline">
            <TextInput defaultValue={content.settings.tagline} name="tagline" />
          </Field>
          <Field label="Location">
            <TextInput
              defaultValue={content.settings.location}
              name="location"
            />
          </Field>
          <Field label="Spotify artist URL">
            <TextInput
              defaultValue={content.settings.spotifyArtistUrl}
              name="spotifyArtistUrl"
            />
          </Field>
          <Field label="Spotify embed URL" wide>
            <TextInput
              defaultValue={content.settings.spotifyEmbedUrl}
              name="spotifyEmbedUrl"
            />
          </Field>
          <Field label="Description" wide>
            <TextArea
              defaultValue={content.settings.description}
              name="description"
              rows={4}
            />
          </Field>
          <Field label="Contact & footer blurb" wide>
            <TextArea
              defaultValue={content.settings.contactBlurb}
              name="contactBlurb"
              rows={4}
            />
          </Field>
        </div>
        <SaveRow disabled={disabled} />
      </fieldset>
    </form>
  );
}

function HeroForms({
  assets,
  content,
  disabled,
  activePageSlugs,
}: {
  assets: MediaAsset[];
  content: EditablePortfolioContent;
  disabled: boolean;
  activePageSlugs: PageSlug[];
}) {
  const heroes = content.heroes.filter((hero) =>
    activePageSlugs.includes(hero.pageSlug)
  );

  return (
    <section className={sectionClass} id="heroes">
      <SectionHeader
        count={heroes.length}
        kicker="Page headers"
        title="Hero Blocks"
      />
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
    </section>
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
}: {
  assets: MediaAsset[];
  content: EditablePortfolioContent;
  disabled: boolean;
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
    <section className={sectionClass} id="home">
      <SectionHeader kicker="Homepage sequence" title="Public sections in page order" />

      <nav aria-label="Homepage section editors" className="mt-5 flex flex-wrap gap-2 rounded-2xl border border-white/10 bg-black/20 p-2">
        {[
          ["home-about", "01 About"],
          ["home-interlude", "02 The Interlude"],
          ["home-freelancer-life", "03 Freelancer Life"],
        ].map(([href, label]) => (
          <a className="rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white/58 transition hover:border-white/25 hover:bg-white/[0.07] hover:text-white" href={`#${href}`} key={href}>
            {label}
          </a>
        ))}
      </nav>

      <form action={updateAboutHome} className={`${itemClass} mt-6 scroll-mt-28`} id="home-about">
        <fieldset disabled={disabled}>
          <p className={labelClass}>01 / About</p>
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

      <form action={updateHomePresentation} className={`${itemClass} mt-6 scroll-mt-28`} id="home-interlude">
        <fieldset disabled={disabled}>
          <p className={labelClass}>02 / The Interlude</p>
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

      <form action={updateHomePresentation} className={`${itemClass} mt-6 scroll-mt-28`} id="home-freelancer-life">
        <fieldset disabled={disabled}>
          <p className={labelClass}>03 / Artist Freelancer Life</p>
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
    </section>
  );
}

function BioForms({
  assets,
  content,
  disabled,
  isActor,
}: {
  assets: MediaAsset[];
  content: EditablePortfolioContent;
  disabled: boolean;
  isActor: boolean;
}) {
  return (
    <section className={sectionClass} id="bio">
      <SectionHeader kicker="Biography" title="Bio Content" />
      <form action={updateBioProfile} className={itemClass}>
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

      <div className="mt-5 grid gap-4">
        <SectionHeader
          count={content.bio.galleryImages.length}
          kicker="Biography"
          title={isActor ? "Bio Portraits" : "Gallery Images"}
        />
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

      <BioParagraphsEditor disabled={disabled} items={content.bio.paragraphs} />
    </section>
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
    <section className={sectionClass} id="actor-resume">
      <SectionHeader kicker="Actor portfolio" title="Resume Profile" />
      <form action={updateActorResume} className={itemClass}>
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
    </section>
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
    <section className={sectionClass} id="actor-credits">
      <SectionHeader
        count={items.length}
        kicker="Actor portfolio"
        title="Credits"
      />
      <div className="grid gap-4">
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
    </section>
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
  return (
    <div className={itemClass}>
      <form action={saveActorCredit}>
        <fieldset disabled={disabled}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-white">
              {mode === "new" ? "New credit" : item.title}
            </h3>
            {mode === "edit" ? (
              <input name="id" type="hidden" value={item.id} />
            ) : null}
          </div>
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
    </div>
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
  return (
    <div className={itemClass}>
      <form action={saveBioGalleryImage}>
        <fieldset disabled={disabled}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-white">
              {mode === "new" ? "New image" : item.id}
            </h3>
            {mode === "edit" ? (
              <input name="id" type="hidden" value={item.id} />
            ) : null}
          </div>
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
    </div>
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
    <section className="mt-8 overflow-hidden rounded-[24px] border border-white/10 bg-black/24" id="bio-paragraphs">
      <div className="flex flex-col gap-3 border-b border-white/10 p-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className={labelClass}>Biography text editor</p>
          <h3 className="heading-ui mt-2 text-2xl font-semibold text-white">Paragraphs</h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/48">
            Each row is one public paragraph. Reorder the reading flow, adjust its reveal delay, then save the complete text once.
          </p>
        </div>
        <span className="text-sm text-white/45">{paragraphs.length} paragraphs</span>
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
                    <button aria-label="Move paragraph up" className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 text-white/55 hover:bg-white hover:text-black disabled:opacity-30" disabled={index === 0} onClick={() => moveParagraph(index, -1)} type="button"><FaArrowUp /></button>
                    <button aria-label="Move paragraph down" className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 text-white/55 hover:bg-white hover:text-black disabled:opacity-30" disabled={index === paragraphs.length - 1} onClick={() => moveParagraph(index, 1)} type="button"><FaArrowDown /></button>
                  </div>
                </div>

                <label>
                  <span className={labelClass}>Paragraph text</span>
                  <textarea className={`${textareaClass} min-h-36`} onChange={(event) => updateParagraph(item.clientKey, { body: event.target.value })} required value={item.body} />
                </label>

                <div className="grid content-start gap-3">
                  <label><span className={labelClass}>Reveal delay</span><input className={inputClass} min="0" max="5000" onChange={(event) => updateParagraph(item.clientKey, { revealDelay: Number(event.target.value) || 0 })} type="number" value={item.revealDelay} /></label>
                  <label className="flex h-11 items-center gap-3 rounded-xl border border-white/10 px-3 text-sm text-white/70"><input checked={item.isPublished} className="h-4 w-4 accent-white" onChange={(event) => updateParagraph(item.clientKey, { isPublished: event.target.checked })} type="checkbox" /> Published</label>
                  <button className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-red-300/20 text-sm font-semibold text-red-200 hover:bg-red-500/10" onClick={() => setParagraphs((current) => current.filter((entry) => entry.clientKey !== item.clientKey))} type="button"><FaTrash /> Remove</button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <button className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/12 px-4 text-sm font-semibold text-white/75 hover:bg-white hover:text-black" onClick={addParagraph} type="button"><FaPlus /> Add paragraph</button>
            <ActionButton className={buttonClass} disabled={disabled || paragraphs.some((item) => !item.body.trim())} pendingLabel="Saving all...">Save all paragraphs</ActionButton>
          </div>
        </fieldset>
      </form>
    </section>
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
    <section className={sectionClass} id="socials">
      <SectionHeader count={items.length} kicker="Public presence" title="Footer Links" />
      <div className="mb-5 grid gap-3 rounded-[22px] border border-white/10 bg-gradient-to-br from-white/[0.075] to-transparent p-4 sm:grid-cols-[auto_1fr] sm:items-center sm:p-5">
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
      <div className="grid gap-4">
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
    </section>
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
    <div className={itemClass}>
      <form action={saveSocialLink}>
        <fieldset disabled={disabled}>
          <div className="mb-5 flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <SocialPlatformIcon
                className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-white/12 bg-white text-lg text-black"
                href={item.href}
                label={label}
                platform={platform}
              />
              <div className="min-w-0">
                <h3 className="truncate text-lg font-semibold text-white">
                  {mode === "new" ? "Add footer link" : label}
                </h3>
                <p className="mt-0.5 text-xs text-white/38">
                  {platformDefinition.label} · automatic logo
                </p>
              </div>
            </div>
            <span
              className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${
                item.isPublished || mode === "new"
                  ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-200"
                  : "border-white/10 bg-white/5 text-white/38"
              }`}
            >
              {item.isPublished || mode === "new" ? "Visible" : "Hidden"}
            </span>
            {mode === "edit" ? (
              <input name="id" type="hidden" value={item.id} />
            ) : null}
          </div>
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
    </div>
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
    <section className={sectionClass} id="music-links">
      <SectionHeader count={items.length} kicker="Music" title="Platform Links" />
      <div className="grid gap-4">
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
    </section>
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
    <div className={itemClass}>
      <form action={saveMusicPlatformLink}>
        <fieldset disabled={disabled}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-white">
              {mode === "new" ? "New music link" : item.title}
            </h3>
            {mode === "edit" ? (
              <input name="id" type="hidden" value={item.id} />
            ) : null}
          </div>
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
    </div>
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
    <section className={sectionClass} id="tracks">
      <SectionHeader count={items.length} kicker="Music" title="SoundCloud Tracks" />
      <div className="grid gap-4">
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
    </section>
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
    <div className={itemClass}>
      <form action={saveSoundcloudTrack}>
        <fieldset disabled={disabled}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-white">
              {mode === "new" ? "New track" : item.id}
            </h3>
            {mode === "edit" ? (
              <input name="id" type="hidden" value={item.id} />
            ) : null}
          </div>
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
    </div>
  );
}

type ContentWorkspaceSection = {
  id: string;
  label: string;
  kicker: string;
  description: string;
  count?: number;
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
  const activePageSlugs = getActivePageSlugs(portfolioType);
  const musicEnabled = isModuleEnabled(portfolioType, "music");
  const actorEnabled = portfolioType === "actor";
  const supportPageSlugs = activePageSlugs.filter(
    (slug) => !["home", "bio", "gallery", "video"].includes(slug)
  );
  const sections = useMemo<ContentWorkspaceSection[]>(
    () => [
      {
        id: "home",
        label: "Home Studio",
        kicker: "Public page",
        description: "Hero, about, Interlude, Freelancer Life, images, and homepage copy.",
        count: 4,
        node: (
          <div className="grid gap-6">
            <HomeSnapshot content={content} />
            <HeroForms assets={assets} activePageSlugs={["home"]} content={content} disabled={disabled} />
            <HomePresentationForm assets={assets} content={content} disabled={disabled} />
          </div>
        ),
      },
      {
        id: "bio",
        label: "Bio Studio",
        kicker: "Public page",
        description: "Hero, portraits, biography, resume, and credits in page order.",
        count: content.bio.galleryImages.length + content.bio.paragraphs.length,
        node: (
          <div className="grid gap-6">
            <BioSnapshot content={content} />
            <HeroForms assets={assets} activePageSlugs={["bio"]} content={content} disabled={disabled} />
            <BioForms assets={assets} content={content} disabled={disabled} isActor={actorEnabled} />
            {actorEnabled ? <ActorResumeSection content={content} disabled={disabled} /> : null}
            {actorEnabled ? <ActorCreditsSection disabled={disabled} items={content.actorCredits} /> : null}
          </div>
        ),
      },
      {
        id: "settings",
        label: "Profile & Fonts",
        kicker: "Shared settings",
        description: "Identity, profile mode, typography, location, and contact page.",
        node: (
          <div className="grid gap-6">
            <SiteSettingsForm content={content} disabled={disabled} />
            {supportPageSlugs.length ? <HeroForms assets={assets} activePageSlugs={supportPageSlugs} content={content} disabled={disabled} /> : null}
          </div>
        ),
      },
      {
        id: "socials",
        label: "Footer Links",
        kicker: "Footer & navigation",
        description: "Choose platforms, profile URLs, visibility, and display order.",
        count: content.socialLinks.length,
        node: (
          <SocialLinksSection
            disabled={disabled}
            items={content.socialLinks}
            portfolioType={portfolioType}
          />
        ),
      },
      ...(musicEnabled ? [{
        id: "music-links",
        label: "Music",
        kicker: "Music page",
        description: "Streaming destinations, releases, and SoundCloud embeds.",
        count: content.musicPlatforms.length + content.soundcloudTracks.length,
        node: <div className="grid gap-6"><MusicLinksSection assets={assets} disabled={disabled} items={content.musicPlatforms} /><TracksSection disabled={disabled} items={content.soundcloudTracks} /></div>,
      }] : []),
    ],
    [
      actorEnabled,
      assets,
      content,
      disabled,
      musicEnabled,
      portfolioType,
      supportPageSlugs,
    ]
  );
  const [activeSectionId, setActiveSectionId] = useState("home");

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
    "home-about": "home",
    "home-interlude": "home",
    "home-freelancer-life": "home",
    "actor-resume": "bio",
    "actor-credits": "bio",
    "bio-gallery": "bio",
    "bio-paragraphs": "bio",
    updates: "home",
    tracks: "music-links",
  };
  const resolvedSectionId = sectionAliases[activeSectionId] || activeSectionId;
  const activeSection =
    sections.find((section) => section.id === resolvedSectionId) || sections[0];

  function openSection(id: string) {
    setActiveSectionId(id);
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}#${id}`
    );
    document
      .getElementById("content-workspace")
      ?.scrollIntoView({ block: "start" });
  }

  return (
    <div className="grid gap-6">
      <StatusNotice
        isConfigured={isConfigured}
        loadError={loadError}
        status={status}
      />

      <div>
        <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className={labelClass}>Workspace</p>
            <h2 className="heading-ui mt-2 text-2xl font-semibold tracking-tight text-white">
              Page Studios
            </h2>
          </div>
          <span className="text-sm text-white/45">
            {activeSection?.label || "Home Studio"}
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {sections.map((section) => {
            const active = section.id === activeSection?.id;

            return (
              <button
                aria-pressed={active}
                className={`min-h-[158px] rounded-[24px] border p-4 text-left shadow-[0_16px_55px_rgba(0,0,0,0.18)] backdrop-blur-2xl transition duration-300 hover:-translate-y-1 ${
                  active
                    ? "border-white/24 bg-white/[0.13] text-white"
                    : "border-white/10 bg-white/[0.055] text-white/70 hover:border-white/18 hover:bg-white/[0.09] hover:text-white"
                }`}
                key={section.id}
                onClick={() => openSection(section.id)}
                type="button"
              >
                <span className="block text-xs uppercase tracking-[0.18em] text-white/45">
                  {section.kicker}
                </span>
                <span className="mt-3 block text-lg font-semibold">
                  {section.label}
                </span>
                <span className="mt-2 block text-sm leading-6 text-white/50">
                  {section.description}
                </span>
                {typeof section.count === "number" ? (
                  <span className="mt-3 inline-flex rounded-md border border-white/10 px-2 py-1 text-xs text-white/45">
                    {section.count} items
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        <section className="mt-5 rounded-[24px] border border-white/10 bg-black/20 p-4 sm:p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className={labelClass}>Public content map</p>
              <h3 className="heading-ui mt-2 text-xl font-semibold text-white">Every public page has one clear editor</h3>
            </div>
            <span className="text-xs text-white/40">Page order → editor location</span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {[
              { href: "#home", label: "Home", detail: "Hero · About · Interlude · 4 Freelancer scenes" },
              { href: "#bio", label: "Bio", detail: "Hero · portraits · paragraphs · resume" },
              { href: "/admin/media?view=studio", label: "Gallery", detail: "Hero · introduction · mosaic images" },
              { href: "/admin/media?view=showreel", label: "Showreel", detail: "Hero · page copy · featured reel · clips" },
              { href: musicEnabled ? "#music-links" : "#settings", label: musicEnabled ? "Music" : "Contact", detail: musicEnabled ? "Hero · platform cards · releases · mixes" : "Hero · location · contact copy" },
              { href: "#socials", label: "Footer & navigation", detail: "Location · effect · social destinations" },
            ].map((entry) => (
              <Link className="group rounded-2xl border border-white/10 bg-white/[0.035] p-4 transition hover:border-white/22 hover:bg-white/[0.07]" href={entry.href} key={entry.label}>
                <span className="flex items-center justify-between gap-3 text-sm font-semibold text-white/85">
                  {entry.label}
                  <span aria-hidden="true" className="text-white/30 transition group-hover:translate-x-0.5 group-hover:text-white/70">→</span>
                </span>
                <span className="mt-2 block text-xs leading-5 text-white/42">{entry.detail}</span>
              </Link>
            ))}
          </div>
        </section>
      </div>

      <div className="mt-6 scroll-mt-28" id="content-workspace">
        {activeSection?.node}
      </div>
    </div>
  );
}
