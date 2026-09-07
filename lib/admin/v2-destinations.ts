export type AdminV2DestinationGroup =
  | "Portfolio pages"
  | "Messages & reports"
  | "Site-wide settings";

export type AdminV2Destination = {
  id: string;
  label: string;
  description: string;
  href: string;
  group: AdminV2DestinationGroup;
  keywords: readonly string[];
  badge?: string;
};

/**
 * Application-owned destinations for the dashboard finder. URLs are never
 * accepted from a request or from saved portfolio content.
 */
export const ADMIN_V2_DESTINATIONS = [
  {
    id: "home",
    label: "Home page",
    description: "Hero, introduction, CNC, stories, and homepage sections.",
    href: "/admin/content#home",
    group: "Portfolio pages",
    badge: "Classic",
    keywords: [
      "home",
      "homepage",
      "hero",
      "landing",
      "about",
      "stories",
      "cnc",
      "uvod",
      "domu",
    ],
  },
  {
    id: "bio",
    label: "Bio page",
    description: "Biography, portraits, resume, and acting credits.",
    href: "/admin/v2/pages/bio",
    group: "Portfolio pages",
    keywords: [
      "bio",
      "biography",
      "about me",
      "portrait",
      "headshot",
      "resume",
      "cv",
      "credits",
      "role",
      "zivotopis",
    ],
  },
  {
    id: "gallery",
    label: "Gallery page",
    description: "Gallery opening, copy, image order, and visibility.",
    href: "/admin/v2/pages/gallery",
    group: "Portfolio pages",
    keywords: [
      "gallery",
      "photo",
      "photos",
      "picture",
      "image",
      "images",
      "frame",
      "hero",
      "fotky",
      "obrazky",
    ],
  },
  {
    id: "showreel",
    label: "Showreel page",
    description: "Showreels, scenes, clips, music videos, and video order.",
    href: "/admin/v2/pages/showreel",
    group: "Portfolio pages",
    keywords: [
      "showreel",
      "video",
      "videos",
      "scene",
      "clip",
      "film",
      "trailer",
      "music video",
      "reel",
      "hero",
    ],
  },
  {
    id: "music",
    label: "Music page",
    description: "Music hero, platforms, Spotify, and SoundCloud sections.",
    href: "/admin/v2/pages/music",
    group: "Portfolio pages",
    keywords: [
      "music",
      "spotify",
      "soundcloud",
      "apple music",
      "youtube",
      "beatport",
      "track",
      "release",
      "playlist",
      "hudba",
    ],
  },
  {
    id: "contact",
    label: "Contact page",
    description: "Booking form, contact details, location, and delivery setup.",
    href: "/admin/v2/pages/contact",
    group: "Portfolio pages",
    keywords: [
      "contact",
      "booking",
      "form",
      "email",
      "location",
      "address",
      "collaboration",
      "kontakt",
      "rezervace",
    ],
  },
  {
    id: "inbox",
    label: "Inbox",
    description: "New booking and collaboration messages, replies, and notes.",
    href: "/admin/v2/inbox#messages",
    group: "Messages & reports",
    keywords: [
      "inbox",
      "message",
      "messages",
      "booking",
      "inquiry",
      "reply",
      "note",
      "email",
      "zpravy",
      "odpoved",
    ],
  },
  {
    id: "insights",
    label: "Insights",
    description: "Visitors, popular pages, interactions, and data health.",
    href: "/admin/v2/insights",
    group: "Messages & reports",
    keywords: [
      "insights",
      "analytics",
      "traffic",
      "visitor",
      "visitors",
      "click",
      "performance",
      "statistics",
      "navstevy",
      "statistiky",
    ],
  },
  {
    id: "settings",
    label: "Settings",
    description: "Brand, admin access, security, audit, and technical health.",
    href: "/admin/v2/settings",
    group: "Site-wide settings",
    keywords: [
      "settings",
      "site-wide",
      "configuration home",
      "preferences",
      "nastaveni",
    ],
  },
  {
    id: "navbar",
    label: "Navbar",
    description: "Choose, order, and hide public pages and platform shortcuts.",
    href: "/admin/v2/navigation",
    group: "Site-wide settings",
    keywords: [
      "navbar",
      "navigation",
      "menu",
      "page visibility",
      "order",
      "platform icon",
      "shortcut",
      "spotify icon",
    ],
  },
  {
    id: "brand",
    label: "Brand & appearance",
    description: "Artist name, logo text, fonts, typography, and footer effect.",
    href: "/admin/content#settings",
    group: "Site-wide settings",
    badge: "Classic",
    keywords: [
      "brand",
      "artist name",
      "name",
      "logo",
      "font",
      "fonts",
      "typography",
      "color",
      "colours",
      "style",
      "footer",
      "pismo",
      "barvy",
    ],
  },
  {
    id: "access",
    label: "Admin access",
    description: "Dashboard users, roles, MFA, sessions, and access status.",
    href: "/admin/v2/security#access",
    group: "Site-wide settings",
    keywords: [
      "access",
      "admin",
      "user",
      "role",
      "password",
      "mfa",
      "2fa",
      "session",
      "login",
      "pristup",
      "heslo",
    ],
  },
  {
    id: "security",
    label: "Security",
    description: "Protection activity and the overall security posture.",
    href: "/admin/v2/security#overview",
    group: "Site-wide settings",
    keywords: [
      "security",
      "protection",
      "blocked",
      "attack",
      "bezpecnost",
    ],
  },
  {
    id: "audit",
    label: "Audit log",
    description: "Recent administrator actions and security event metadata.",
    href: "/admin/v2/security#audit",
    group: "Site-wide settings",
    keywords: [
      "audit",
      "audit log",
      "history",
      "admin actions",
      "event history",
      "historie",
    ],
  },
  {
    id: "technical-health",
    label: "Technical health",
    description: "Runtime configuration, database, storage, and delivery checks.",
    href: "/admin/v2/security#configuration",
    group: "Site-wide settings",
    keywords: [
      "technical",
      "health",
      "configuration",
      "database",
      "supabase",
      "storage",
      "migration",
      "environment",
      "resend",
      "webhook",
      "technicke",
    ],
  },
] as const satisfies readonly AdminV2Destination[];

function normalizeSearchTerm(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en")
    .trim();
}

export function filterAdminV2Destinations(query: string) {
  const normalized = normalizeSearchTerm(query);
  if (!normalized) return [];

  const terms = normalized.split(/\s+/).filter(Boolean);
  return ADMIN_V2_DESTINATIONS.filter((destination) => {
    const haystack = normalizeSearchTerm(
      [destination.label, destination.description, ...destination.keywords].join(
        " "
      )
    );
    return terms.every((term) => haystack.includes(term));
  }).sort((left, right) => {
    const relevance = (destination: AdminV2Destination) => {
      const label = normalizeSearchTerm(destination.label);
      const id = normalizeSearchTerm(destination.id);
      const keywords = destination.keywords.map(normalizeSearchTerm);

      if (label === normalized || id === normalized) return 0;
      if (keywords.includes(normalized)) return 1;
      if (label.startsWith(normalized)) return 2;
      return 3;
    };

    return relevance(left) - relevance(right);
  });
}
