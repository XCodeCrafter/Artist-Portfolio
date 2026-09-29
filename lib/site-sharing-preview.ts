import type { SiteSettings } from "@/lib/content/types";
import { normalizeSharingMetadata } from "@/lib/content/site-sharing";

export const SOCIAL_IMAGE_SIZE = { width: 1200, height: 630 } as const;
export const SOCIAL_CARD_BACKGROUND = "/images/home-editorial/press-social.jpg";

const cleanText = (value: string) => value.replace(/\s+/g, " ").trim();

/** A cache fingerprint, not a security token. Never include draft/private data in a URL. */
function fingerprint(value: string) {
  let left = 2166136261;
  let right = 5381;
  for (let index = 0; index < value.length; index++) {
    left = Math.imul(left ^ value.charCodeAt(index), 16777619);
    right = Math.imul(right, 33) ^ value.charCodeAt(index);
  }
  return `${(left >>> 0).toString(16)}${(right >>> 0).toString(16)}`;
}

export function resolveSiteSharing(settings: Pick<SiteSettings, "artistName" | "description" | "sharingMetadata">) {
  const saved = normalizeSharingMetadata(settings.sharingMetadata);
  const brandName = cleanText(settings.artistName) || "Artist Portfolio";
  const title = saved.title || brandName;
  const description = saved.description || cleanText(settings.description) || `Music, videos, live dates and contact information for ${brandName}.`;
  const imageAlt = saved.imageAlt || `${title} — official website`;
  const revision = fingerprint(JSON.stringify(["social-card-v1", brandName, title]));
  return {
    brandName,
    title,
    description,
    imageSrc: saved.imageSrc,
    imageAlt,
    generatedImagePath: `/opengraph-image?v=${revision}`,
  };
}
