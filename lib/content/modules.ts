import type { PageSlug, PortfolioType } from "./types";

export type PublicModuleKey =
  | "home"
  | "bio"
  | "gallery"
  | "music"
  | "video"
  | "showreel"
  | "contact";

export type AdminModuleKey = "content" | "media" | "analytics" | "security";

export type ModuleKey = PublicModuleKey | AdminModuleKey;

export type PortfolioModule = {
  key: ModuleKey;
  label: string;
  href: string;
  pageSlug?: PageSlug;
  profiles: PortfolioType[];
  publicNav?: boolean;
  adminNav?: boolean;
  description: string;
};

export const PAGE_SLUGS: PageSlug[] = [
  "home",
  "bio",
  "gallery",
  "music",
  "video",
  "booking",
];

export const MODULE_REGISTRY: PortfolioModule[] = [
  {
    key: "home",
    label: "HOME",
    href: "/",
    pageSlug: "home",
    profiles: ["musician", "actor"],
    publicNav: true,
    description: "Landing page and primary profile intro.",
  },
  {
    key: "bio",
    label: "BIO",
    href: "/bio",
    pageSlug: "bio",
    profiles: ["musician", "actor"],
    publicNav: true,
    description: "Biography, portrait context, and profile story.",
  },
  {
    key: "gallery",
    label: "GALLERY",
    href: "/gallery",
    pageSlug: "gallery",
    profiles: ["actor"],
    publicNav: true,
    description: "Headshots, portraits, and visual portfolio images.",
  },
  {
    key: "music",
    label: "MUSIC",
    href: "/music",
    pageSlug: "music",
    profiles: ["musician"],
    publicNav: true,
    description: "Music platforms, releases, and mixes.",
  },
  {
    key: "video",
    label: "VIDEO",
    href: "/video",
    pageSlug: "video",
    profiles: ["musician"],
    publicNav: true,
    description: "Music videos, social clips, and behind the scenes.",
  },
  {
    key: "showreel",
    label: "SHOWREEL",
    href: "/video",
    pageSlug: "video",
    profiles: ["actor"],
    publicNav: true,
    description: "Showreel, scenes, self-tapes, and screen work.",
  },
  {
    key: "contact",
    label: "CONTACT",
    href: "/booking",
    pageSlug: "booking",
    profiles: ["actor"],
    publicNav: true,
    description: "Casting and representation contact.",
  },
  {
    key: "contact",
    label: "BOOKING",
    href: "/booking",
    pageSlug: "booking",
    profiles: ["musician"],
    publicNav: true,
    description: "Booking and general inquiries.",
  },
  {
    key: "content",
    label: "Content",
    href: "/admin/content",
    profiles: ["musician", "actor"],
    adminNav: true,
    description: "Text, links, embeds, and page heroes.",
  },
  {
    key: "media",
    label: "Media",
    href: "/admin/media",
    profiles: ["musician", "actor"],
    adminNav: true,
    description: "Uploads, previews, and public media URLs.",
  },
  {
    key: "analytics",
    label: "Analytics",
    href: "/admin/analytics",
    profiles: ["musician", "actor"],
    adminNav: true,
    description: "Traffic, clicks, and inquiry overview.",
  },
  {
    key: "security",
    label: "Security",
    href: "/admin/security",
    profiles: ["musician", "actor"],
    adminNav: true,
    description: "Access, audit logs, and health checks.",
  },
];

export function getEnabledModules(type: PortfolioType) {
  return MODULE_REGISTRY.filter((module) => module.profiles.includes(type));
}

export function getPublicModules(type: PortfolioType) {
  return getEnabledModules(type).filter((module) => module.publicNav);
}

export function getActivePageSlugs(type: PortfolioType): PageSlug[] {
  const slugs = getPublicModules(type)
    .map((module) => module.pageSlug)
    .filter(Boolean) as PageSlug[];

  return [...new Set(slugs)];
}

export function getAdminModules(type: PortfolioType) {
  return getEnabledModules(type).filter((module) => module.adminNav);
}

export function isModuleEnabled(type: PortfolioType, key: ModuleKey) {
  return getEnabledModules(type).some((module) => module.key === key);
}
