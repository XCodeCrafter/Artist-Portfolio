import type { Metadata } from "next";
import type { PageSlug, PortfolioContent, PortfolioType } from "@/lib/content";
import {
  getSiteUrl,
  isNonProductionVercelDeployment,
} from "@/lib/site-url";

export type PublicSeoPage = PageSlug | "privacy" | "terms";

const STALE_FALLBACK_NAME = "franky fugazi";

const PAGE_PATHS: Record<PublicSeoPage, string> = {
  home: "/",
  bio: "/bio",
  gallery: "/gallery",
  music: "/music",
  video: "/video",
  booking: "/booking",
  privacy: "/privacy",
  terms: "/terms",
};

const GENERIC_PROFILE_HOSTS = new Set([
  "apple.com",
  "bandcamp.com",
  "beatport.com",
  "facebook.com",
  "imdb.com",
  "instagram.com",
  "linkedin.com",
  "music.apple.com",
  "open.spotify.com",
  "soundcloud.com",
  "spotify.com",
  "tiktok.com",
  "twitter.com",
  "vimeo.com",
  "x.com",
  "youtube.com",
  "youtu.be",
]);

function cleanText(value?: string | null) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function normalizeIdentity(value: string) {
  return cleanText(value).normalize("NFKD").toLowerCase();
}

function joinUnique(parts: string[]) {
  const seen = new Set<string>();

  return parts
    .map(cleanText)
    .filter((part) => {
      const key = normalizeIdentity(part);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(" | ");
}

function neutralSiteDescription(type: PortfolioType, location: string) {
  const base =
    type === "actor"
      ? "Official actor portfolio featuring a biography, headshots, showreel, credits, and contact information."
      : "Official music portfolio featuring releases, videos, biography, and booking information.";

  return location ? `${base} Based in ${location}.` : base;
}

export function getSeoIdentity(content: PortfolioContent) {
  const brandName = cleanText(content.settings.artistName) || "Artist Portfolio";
  const personName = cleanText(content.heroes.home.title) || brandName;
  const location = cleanText(content.settings.location);
  const configuredDescription = cleanText(content.settings.description);
  const staleDescription =
    normalizeIdentity(configuredDescription).includes(STALE_FALLBACK_NAME) &&
    !normalizeIdentity(brandName).includes(STALE_FALLBACK_NAME) &&
    !normalizeIdentity(personName).includes(STALE_FALLBACK_NAME);
  const description =
    !configuredDescription || staleDescription
      ? neutralSiteDescription(content.settings.portfolioType, location)
      : configuredDescription;

  return {
    brandName,
    description,
    location,
    personName,
    staleDescription,
  };
}

function pageLabel(page: PublicSeoPage, type: PortfolioType) {
  switch (page) {
    case "home":
      return type === "actor" ? "Actor Portfolio" : "Music Portfolio";
    case "bio":
      return type === "actor" ? "Biography & Credits" : "Biography";
    case "gallery":
      return type === "actor" ? "Headshots & Gallery" : "Gallery";
    case "music":
      return "Music & Releases";
    case "video":
      return type === "actor" ? "Showreel" : "Videos";
    case "booking":
      return type === "actor" ? "Contact" : "Booking";
    case "privacy":
      return "Privacy";
    case "terms":
      return "Terms";
  }
}

function pageDescription(content: PortfolioContent, page: PublicSeoPage) {
  const { brandName, description, location, personName } = getSeoIdentity(content);
  const place = location ? ` Based in ${location}.` : "";

  switch (page) {
    case "home":
      return description;
    case "bio":
      return content.settings.portfolioType === "actor"
        ? `Biography, acting credits, experience, and professional profile for ${personName}.${place}`
        : `Biography, creative story, experience, and background of ${personName}.${place}`;
    case "gallery":
      return `Selected headshots, portraits, and visual portfolio work featuring ${personName}.`;
    case "music":
      return `Official releases, selected tracks, mixes, and listening links from ${personName}.`;
    case "video":
      return content.settings.portfolioType === "actor"
        ? `Showreel, selected scenes, self-tapes, and screen work featuring ${personName}.`
        : `Music videos and selected motion work from ${personName}.`;
    case "booking":
      return content.settings.portfolioType === "actor"
        ? `Contact ${personName} for casting, representation, productions, and creative collaborations.`
        : `Contact ${personName} for bookings, collaborations, releases, and projects.`;
    case "privacy":
      return `Privacy information for the official ${brandName} portfolio.`;
    case "terms":
      return `Terms for using the official ${brandName} portfolio.`;
  }
}

export function getPageSeo(content: PortfolioContent, page: PublicSeoPage) {
  const identity = getSeoIdentity(content);
  const label = pageLabel(page, content.settings.portfolioType);
  const legalPage = page === "privacy" || page === "terms";
  const title = legalPage
    ? joinUnique([label, identity.brandName])
    : page === "home"
      ? joinUnique([identity.personName, label, identity.brandName])
      : joinUnique([label, identity.personName, identity.brandName]);

  return {
    ...identity,
    description: pageDescription(content, page),
    label,
    path: PAGE_PATHS[page],
    title,
  };
}

export function createPageMetadata(
  content: PortfolioContent,
  page: PublicSeoPage
): Metadata {
  const seo = getPageSeo(content, page);

  return {
    title: { absolute: seo.title },
    description: seo.description,
    alternates: { canonical: seo.path },
    openGraph: {
      type: "website",
      siteName: seo.brandName,
      title: seo.title,
      description: seo.description,
      url: seo.path,
      images: [
        {
          url: "/opengraph-image",
          width: 1200,
          height: 630,
          alt: `${seo.title} portfolio preview`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: seo.title,
      description: seo.description,
      images: [
        {
          url: "/twitter-image",
          alt: `${seo.title} portfolio preview`,
        },
      ],
    },
  };
}

export function createRootMetadata(content: PortfolioContent): Metadata {
  const seo = getPageSeo(content, "home");
  const pageMetadata = createPageMetadata(content, "home");
  const googleVerification = cleanText(process.env.GOOGLE_SITE_VERIFICATION);
  const shouldIndex = !isNonProductionVercelDeployment();

  return {
    ...pageMetadata,
    metadataBase: new URL(getSiteUrl()),
    title: {
      default: seo.title,
      template: `%s | ${seo.brandName}`,
    },
    applicationName: seo.brandName,
    manifest: "/manifest.webmanifest",
    icons: { icon: [{ url: "/favicon.ico" }] },
    robots: {
      index: shouldIndex,
      follow: shouldIndex,
      googleBot: {
        index: shouldIndex,
        follow: shouldIndex,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
    ...(googleVerification
      ? { verification: { google: googleVerification } }
      : {}),
  };
}

function absolutePublicUrl(value: string, base = getSiteUrl()) {
  const source = cleanText(value);
  if (!source) return undefined;

  try {
    const url = new URL(source, `${base}/`);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

function isSpecificProfileUrl(value: string, siteUrl: string) {
  if (!value || value.includes("...") || /example\.(?:com|org|net)/i.test(value)) {
    return false;
  }

  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    if (url.username || url.password) return false;

    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    const siteHostname = new URL(siteUrl).hostname.toLowerCase().replace(/^www\./, "");
    if (hostname === siteHostname) return false;

    const path = url.pathname.replace(/\/+$/, "");
    if (GENERIC_PROFILE_HOSTS.has(hostname) && !path) return false;

    return true;
  } catch {
    return false;
  }
}

function personImage(content: PortfolioContent) {
  const source =
    content.bio.galleryImages.find((image) => cleanText(image.src))?.src ||
    (content.heroes.home.mediaType === "image"
      ? content.heroes.home.backgroundSrc
      : content.heroes.home.posterSrc) ||
    content.aboutHome.imageSrc;

  return absolutePublicUrl(source);
}

function specificProfiles(content: PortfolioContent) {
  const siteUrl = getSiteUrl();

  return [
    ...new Set(
      content.socialLinks
        .map((link) => cleanText(link.href))
        .filter((href) => isSpecificProfileUrl(href, siteUrl))
        .map((href) => absolutePublicUrl(href, siteUrl))
        .filter((href): href is string => Boolean(href))
    ),
  ];
}

function personNode(content: PortfolioContent) {
  const base = getSiteUrl();
  const seo = getPageSeo(content, "bio");
  const image = personImage(content);
  const sameAs = specificProfiles(content);

  return {
    "@type": "Person",
    "@id": `${base}/#person`,
    name: seo.personName,
    url: `${base}/bio`,
    description: seo.description,
    jobTitle: content.settings.portfolioType === "actor" ? "Actor" : "Musician",
    ...(image ? { image } : {}),
    ...(seo.location
      ? { homeLocation: { "@type": "Place", name: seo.location } }
      : {}),
    ...(sameAs.length ? { sameAs } : {}),
  };
}

export function createHomeJsonLd(content: PortfolioContent) {
  const base = getSiteUrl();
  const seo = getPageSeo(content, "home");
  const person = personNode(content);

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${base}/#website`,
        url: `${base}/`,
        name: seo.brandName,
        description: seo.description,
        inLanguage: "en",
        about: { "@id": person["@id"] },
      },
      person,
    ],
  };
}

export function createBioJsonLd(content: PortfolioContent) {
  const base = getSiteUrl();
  const seo = getPageSeo(content, "bio");
  const person = personNode(content);

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "ProfilePage",
        "@id": `${base}/bio#profile`,
        url: `${base}/bio`,
        name: seo.title,
        description: seo.description,
        inLanguage: "en",
        isPartOf: { "@id": `${base}/#website` },
        mainEntity: { "@id": person["@id"] },
      },
      person,
    ],
  };
}
