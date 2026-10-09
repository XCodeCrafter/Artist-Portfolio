import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import AdaptiveHero from "@/components/AdaptiveHero";
import PageHero from "@/components/PageHero";
import HomePageView from "@/components/home/HomePageView";
import BioPageView from "@/components/bio/BioPageView";
import GalleryPageView from "@/components/gallery/GalleryPageView";
import MusicPageView from "@/components/music/MusicPageView";
import ShowreelPageView from "@/components/video/ShowreelPageView";
import ContactPageView from "@/components/contact/ContactPageView";
import { createHomeDraftFromContent, HOME_PREVIEW_UPDATE_MESSAGE, parseHomeEditorSnapshot, parseHomePreviewUpdateMessage } from "@/lib/admin/home-editor";
import { FALLBACK_CONTENT } from "@/lib/content/fallback";
import type { HeroContent, HeroPageSlug } from "@/lib/content/types";
import type { HeroFraming } from "@/lib/content/hero-framing";
import { selectMusicPageViewData } from "@/lib/content/music";
import { createBioJsonLd, createHomeJsonLd, createPageMetadata } from "@/lib/seo";

const pages: HeroPageSlug[] = ["home", "bio", "gallery", "music", "video", "booking"];
const framing: HeroFraming = {
  desktop: { fit: "contain", x: 22, y: 15, zoom: 1.2 },
  mobile: { fit: "cover", x: 64, y: 8, zoom: 1.5 },
};
const hero: HeroContent = {
  ...FALLBACK_CONTENT.heroes.gallery,
  title: "",
  subtitle: "Keep this independent subtitle",
  ctaLabel: "Keep this independent button",
  ctaHref: "#owner-destination",
};

function pageView(page: HeroPageSlug, title: string, mode: "public" | "preview"): ReactElement {
  const content = structuredClone(FALLBACK_CONTENT);
  const currentHero = { ...hero, title };
  content.heroes[page] = currentHero;
  const footer = { ...content.settings, socialLinks: [] };
  switch (page) {
    case "home": {
      const draft = createHomeDraftFromContent(content);
      draft.layout = draft.layout.map(item => ({ ...item, enabled: item.id === "hero" }));
      return <HomePageView data={draft} programs={[]} mode={mode} />;
    }
    case "bio": return <BioPageView data={{ hero: currentHero, bio: content.bio, resume: content.actorResume, hasResumeDetails: false, credits: [], footer }} mode={mode} />;
    case "gallery": return <GalleryPageView data={{ hero: currentHero, images: [], presentation: content.galleryPresentation, footer }} mode={mode} />;
    case "music": return <MusicPageView data={selectMusicPageViewData(content)} mode={mode} />;
    case "video": return <ShowreelPageView data={{ hero: currentHero, presentation: content.videoPresentation, videos: [], footer }} mode={mode} />;
    case "booking": return <ContactPageView data={{ hero: currentHero, details: content.settings, calendar: null }} mode={mode} />;
  }
}

describe("optional public Hero heading", () => {
  it.each(pages)("omits only the cleared heading on %s, both public and admin preview", page => {
    for (const mode of ["public", "preview"] as const) {
      const empty = renderToStaticMarkup(pageView(page, "", mode));
      expect(empty).not.toMatch(/<h1\b/);
      expect(empty).toContain(hero.subtitle);
      expect(empty).toContain(hero.ctaLabel);
      // Music may repair an unavailable scroll target, but must retain the button.
      if (page !== "music") expect(empty).toContain('href="#owner-destination"');
      expect(empty).toContain("min-h-[60svh]");
      expect(empty).toContain("data-home-transition-media");
      const populated = renderToStaticMarkup(pageView(page, "Owner heading", mode));
      expect(populated.match(/<h1\b/g)).toHaveLength(1);
      expect(populated).toContain(hero.subtitle);
    }
  });

  it.each(["", " \t\n "])("treats blank and whitespace-only headings as absent (%j)", title => {
    for (const mediaType of ["image", "video"] as const) {
      for (const customFraming of [undefined, framing]) {
        for (const staticPreview of [false, true]) {
          const markup = renderToStaticMarkup(<AdaptiveHero {...hero} title={title} mediaType={mediaType}
            backgroundSrc={mediaType === "video" ? "/media/hero-loop.mp4" : "/images/hero.jpg"}
            posterSrc="/images/video-hero.jpg" framing={customFraming} staticPreview={staticPreview} />);
          expect(markup).not.toMatch(/<h1\b/);
          expect(markup).toContain(hero.subtitle);
          expect(markup).toContain('href="#owner-destination"');
          expect(markup).toContain('data-home-transition-media=""');
          expect(markup).toContain(mediaType === "image" ? "min-h-[60svh]" : "min-h-[50svh]");
          expect(markup).toContain("lg:min-h-[100svh]");
          if (customFraming) {
            expect(markup).toContain("--hero-position-mobile:64% 8%");
            expect(markup).toContain("--hero-position-desktop:22% 15%");
          }
          if (mediaType === "video" && !staticPreview) expect(markup).toContain('<video');
          else expect(markup).toContain('<img');
        }
      }
    }
  });

  it.each(["image", "video"] as const)("keeps %s media and its viewport height when every overlay text is empty", mediaType => {
    const markup = renderToStaticMarkup(<AdaptiveHero {...hero} title="" subtitle="" ctaLabel="" ctaHref="" mediaType={mediaType}
      backgroundSrc={mediaType === "video" ? "/media/hero-loop.mp4" : "/images/hero.jpg"} />);
    expect(markup).not.toMatch(/<h1\b|<a\b/);
    expect(markup).toContain("relative z-10 flex items-center justify-center px-5 sm:px-8");
    expect(markup).toContain(mediaType === "image" ? "min-h-[60svh]" : "min-h-[50svh]");
    expect(markup).toContain(mediaType === "image" ? '<img' : '<video');
  });

  it("does not fabricate a legacy PageHero heading or image alt from an empty title", () => {
    const markup = renderToStaticMarkup(<PageHero title={" \t "} subtitle="Independent description" ctaLabel="Continue" ctaHref="#next" imageSrc="/images/hero.jpg" />);
    expect(markup).not.toMatch(/<h1\b/);
    expect(markup).toContain("Independent description");
    expect(markup).toContain('href="#next"');
    expect(markup).toContain('alt=""');
  });

  it("keeps cleared Home title through saved snapshot and preview-message parsing", () => {
    const draft = createHomeDraftFromContent(FALLBACK_CONTENT);
    draft.hero.title = "";
    const saved = parseHomeEditorSnapshot({ draft, versions: { updatedAt: "2026-09-30T10:00:00.000000Z" } });
    expect(saved?.draft.hero.title).toBe("");
    expect(saved?.draft.hero.backgroundSrc).toBe(draft.hero.backgroundSrc);
    const message = parseHomePreviewUpdateMessage({ type: HOME_PREVIEW_UPDATE_MESSAGE, draft: saved?.draft, selectedSection: "hero", focusRequestId: 1 });
    expect(message?.draft.hero.title).toBe("");
    expect(message?.draft.layout).toEqual(draft.layout);
  });

  it("keeps browser titles, social previews and identity structured data independent of cleared Hero headings", () => {
    const original = structuredClone(FALLBACK_CONTENT);
    original.settings.sharingMetadata = { title: "Owner sharing title", description: "Owner sharing description", imageSrc: "", imageAlt: "" };
    const cleared = structuredClone(original);
    for (const page of pages) cleared.heroes[page].title = "";
    for (const page of pages) expect(createPageMetadata(cleared, page)).toEqual(createPageMetadata(original, page));
    expect(createHomeJsonLd(cleared)).toEqual(createHomeJsonLd(original));
    expect(createBioJsonLd(cleared)).toEqual(createBioJsonLd(original));
    expect(createPageMetadata(cleared, "home").title).toEqual({ absolute: "Owner sharing title" });
  });
});
