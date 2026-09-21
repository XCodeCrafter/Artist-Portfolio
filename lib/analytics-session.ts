export const ANALYTICS_SESSION_KEY = "portfolio.analytics.session.v1";
export const ANALYTICS_SESSION_TTL_MS = 30 * 60 * 1000;
export const ANALYTICS_COLLECTION_VERSION = 2;
export const CAMPAIGN_SOURCES = ["google", "instagram", "tiktok", "youtube", "spotify", "facebook", "apple-music", "soundcloud"] as const;
export type CampaignSource = (typeof CAMPAIGN_SOURCES)[number];
export type AnalyticsSession = { id: string; touchedAt: number; landingReferrer: string; campaignSource?: CampaignSource };
type SessionStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function getLandingAttribution(referrer: string, locationHref: string) {
  let landingReferrer = "";
  let campaignSource: CampaignSource | undefined;
  try {
    const current = new URL(locationHref);
    const source = current.searchParams.get("utm_source")?.toLowerCase();
    if (CAMPAIGN_SOURCES.includes(source as CampaignSource)) campaignSource = source as CampaignSource;
    if (referrer) {
      const previous = new URL(referrer);
      if (["http:", "https:"].includes(previous.protocol) && previous.origin !== current.origin && !previous.username && !previous.password) landingReferrer = previous.origin;
    }
  } catch { /* Invalid or withheld referrers mean direct / unknown. */ }
  return { landingReferrer, ...(campaignSource ? { campaignSource } : {}) };
}

/** Tab-scoped visits; memory fallback avoids a new visit for every event when storage is blocked. */
export function createAnalyticsSessionStore() {
  let memory: AnalyticsSession | null = null;
  let landingConsumed = false;
  return {
    get(storage: SessionStorage | null, now: number, uuid: () => string, referrer: string, href: string): AnalyticsSession {
      let previous = memory;
      try {
        const candidate = JSON.parse(storage?.getItem(ANALYTICS_SESSION_KEY) || "null") as AnalyticsSession | null;
        if (candidate && UUID.test(candidate.id) && Number.isFinite(candidate.touchedAt) && typeof candidate.landingReferrer === "string" && (!previous || candidate.touchedAt > previous.touchedAt)) previous = candidate;
      } catch { /* Keep the in-memory visit. */ }
      const active = previous && previous.touchedAt <= now && now - previous.touchedAt < ANALYTICS_SESSION_TTL_MS;
      memory = active && previous ? { ...previous, touchedAt: now } : {
        id: uuid(), touchedAt: now,
        ...getLandingAttribution(landingConsumed ? "" : referrer, landingConsumed ? new URL(href).origin : href),
      };
      landingConsumed = true;
      try { storage?.setItem(ANALYTICS_SESSION_KEY, JSON.stringify(memory)); } catch { /* Memory remains valid. */ }
      return memory;
    },
    clear(storage: SessionStorage | null) {
      memory = null;
      landingConsumed = false;
      try { storage?.removeItem(ANALYTICS_SESSION_KEY); } catch { /* Storage may be blocked. */ }
    },
  };
}

export function getAcquisitionLabel(source: string) {
  const domain = source.toLowerCase().replace(/^www\./, "");
  const matches = (host: string) => domain === host || domain.endsWith(`.${host}`);
  if (domain === "google" || /^([a-z0-9-]+\.)?google\.[a-z.]+$/.test(domain)) return "Google";
  if (domain === "instagram" || matches("instagram.com")) return "Instagram";
  if (domain === "tiktok" || matches("tiktok.com")) return "TikTok";
  if (domain === "youtube" || matches("youtube.com") || matches("youtu.be")) return "YouTube";
  if (domain === "spotify" || matches("spotify.com")) return "Spotify";
  if (domain === "facebook" || matches("facebook.com") || matches("fb.com")) return "Facebook";
  if (domain === "apple-music" || matches("music.apple.com")) return "Apple Music";
  if (domain === "soundcloud" || matches("soundcloud.com")) return "SoundCloud";
  return domain || "Direct / unknown";
}
