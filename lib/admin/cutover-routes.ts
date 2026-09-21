import { ANALYTICS_RANGE_DAYS } from "@/lib/admin/analytics-shared";
import { normalizeAdminInquiryPage } from "@/lib/admin/inquiry-routes";
import { ADMIN_ENTRY_PATH } from "@/lib/admin/entry-routes";

/**
 * Preparation only: no route or middleware calls this mapper yet.
 * A future authenticated client bridge must provide location.hash: fragments
 * never reach the server, so an unconditional SSR redirect would lose them.
 */
const CONTENT_DESTINATIONS: Readonly<Record<string, string>> = {
  home: "/admin/v2/pages/home",
  heroes: "/admin/v2/pages/home",
  updates: "/admin/v2/pages/home",
  "home-hero": "/admin/v2/pages/home",
  "home-about": "/admin/v2/pages/home",
  "home-interlude": "/admin/v2/pages/home",
  "home-freelancer-life": "/admin/v2/pages/home",
  "home-cnc": "/admin/v2/pages/home/programs",
  bio: "/admin/v2/pages/bio",
  "bio-hero": "/admin/v2/pages/bio",
  "bio-intro": "/admin/v2/pages/bio",
  "bio-gallery": "/admin/v2/pages/bio",
  "bio-paragraphs": "/admin/v2/pages/bio",
  "bio-paragraphs-panel": "/admin/v2/pages/bio",
  "actor-resume": "/admin/v2/pages/bio",
  "actor-credits": "/admin/v2/pages/bio",
  "music-links": "/admin/v2/pages/music",
  "music-links-hero": "/admin/v2/pages/music",
  "music-settings": "/admin/v2/pages/music",
  "music-platforms": "/admin/v2/pages/music",
  tracks: "/admin/v2/pages/music",
  booking: "/admin/v2/pages/contact",
  "booking-hero": "/admin/v2/pages/contact",
  "contact-settings": "/admin/v2/pages/contact",
  navigation: "/admin/v2/navigation",
  "navigation-settings": "/admin/v2/navigation",
  socials: "/admin/v2/navigation",
  "socials-links": "/admin/v2/navigation",
  settings: "/admin/v2/settings/appearance",
  "settings-identity": "/admin/v2/settings/appearance",
  "settings-typography": "/admin/v2/settings/appearance",
  "settings-footer-effect": "/admin/v2/settings/appearance",
};

const INSIGHTS_HASHES: Readonly<Record<string, string>> = {
  overview: "overview",
  acquisition: "visitors",
  content: "popular-pages",
  engagement: "interactions",
  events: "recent-activity",
  health: "data-health",
};

const SECURITY_HASHES: Readonly<Record<string, string>> = {
  overview: "overview", access: "access", "admin-profiles": "access",
  activity: "activity", threats: "activity", audit: "audit",
  configuration: "configuration", health: "configuration", allowlist: "configuration",
};

// Existing result tokens only; notices are fixed UI copy, never free-form URL text.
const SECURITY_STATUSES = new Set([
  "admin-not-found", "deleted", "deleted-audit-warning", "delete-error", "invalid",
  "last-owner-required", "missing-service", "auth-user-mismatch", "mfa-reset",
  "mfa-reset-audit-warning", "mfa-reset-error", "owner-required", "profile-check-error",
  "saved", "saved-audit-warning", "save-error", "security-error", "session-revoke-error",
  "sessions-revoked", "sessions-revoked-audit-warning", "self-protected",
]);
const INBOX_STATUSES = new Set([
  "deleted", "deleted-audit-warning", "delete-error", "invalid", "missing-service",
  "not-found", "write-conflict", "saved", "saved-audit-warning", "save-error", "security-error",
]);

function ownValue(map: Readonly<Record<string, string>>, key: string) {
  return Object.hasOwn(map, key) ? map[key] : undefined;
}

function singleParameter(params: URLSearchParams, key: string) {
  const values = params.getAll(key);
  return values.length === 1 ? values[0] : undefined;
}

/** Returns only an allowlisted V2 path; unknown/non-local inputs are not mapped. */
export function getPreparedClassicDestination(location: string): string | null {
  if (
    typeof location !== "string" || location.length > 2048 ||
    !location.startsWith("/admin") || location.startsWith("//") ||
    /[\\\u0000-\u0020\u007f]/.test(location)
  ) return null;

  // Reject encoded/normalized path tricks before URL parsing. The pathname must
  // match one of the literal Classic entry points, not an arbitrary return URL.
  const rawPath = location.split(/[?#]/, 1)[0];
  const allowedPaths = ["/admin", "/admin/content", "/admin/media", "/admin/security", "/admin/analytics", "/admin/settings"];
  const pathname = rawPath.endsWith("/") ? rawPath.slice(0, -1) : rawPath;
  if (!allowedPaths.includes(pathname)) return null;

  const url = new URL(location, "https://admin.invalid");
  let hash: string;
  try { hash = decodeURIComponent(url.hash.slice(1)); } catch { hash = ""; }
  if (pathname === "/admin") return ADMIN_ENTRY_PATH;
  if (pathname === "/admin/security") {
    const params = new URLSearchParams();
    const status = singleParameter(url.searchParams, "status");
    if (status && SECURITY_STATUSES.has(status)) params.set("status", status);
    const tab = ownValue(SECURITY_HASHES, hash);
    return `/admin/v2/security${params.size ? `?${params}` : ""}${tab ? `#${tab}` : ""}`;
  }
  if (pathname === "/admin/settings") return "/admin/v2/settings";
  if (pathname === "/admin/content") {
    return ownValue(CONTENT_DESTINATIONS, hash) || "/admin/v2/pages/home";
  }
  if (pathname === "/admin/media") {
    if (hash === "upload") return "/admin/v2/media#upload";
    const view = singleParameter(url.searchParams, "view");
    if (view === "showreel") return "/admin/v2/pages/showreel";
    // Classic defaults to Gallery studio, not the file library.
    if (view === "library") return "/admin/v2/media";
    return "/admin/v2/pages/gallery";
  }

  if (hash === "inquiries") {
    const page = singleParameter(url.searchParams, "inquiryPage");
    const params = new URLSearchParams();
    if (page !== undefined) params.set("page", String(normalizeAdminInquiryPage(page)));
    const status = singleParameter(url.searchParams, "status");
    if (status && INBOX_STATUSES.has(status)) params.set("status", status);
    return `/admin/v2/inbox${params.size ? `?${params}` : ""}#messages`;
  }
  const range = singleParameter(url.searchParams, "range");
  const params = new URLSearchParams();
  if (range !== undefined && ANALYTICS_RANGE_DAYS.some((days) => String(days) === range)) {
    params.set("range", range);
  }
  const tab = ownValue(INSIGHTS_HASHES, hash);
  return `/admin/v2/insights${params.size ? `?${params}` : ""}${tab ? `#${tab}` : ""}`;
}
