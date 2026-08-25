export const ANALYTICS_RANGE_DAYS = [7, 30, 90, 180] as const;
export type AnalyticsRangeDays = (typeof ANALYTICS_RANGE_DAYS)[number];

const PAGE_LABELS: Record<string, string> = {
  "/": "Home",
  "/bio": "Bio",
  "/booking": "Contact / Booking",
  "/gallery": "Gallery",
  "/music": "Music",
  "/privacy": "Privacy",
  "/terms": "Terms",
  "/video": "Video / Showreel",
};

export function getAnalyticsPageLabel(path: string) {
  return PAGE_LABELS[path] || path || "Home";
}
