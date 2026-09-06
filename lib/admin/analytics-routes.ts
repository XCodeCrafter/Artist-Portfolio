export const ADMIN_ANALYTICS_SURFACE_PATHS = {
  classic: "/admin/analytics",
  v2: "/admin/v2/insights",
} as const;

export type AdminAnalyticsSurface = keyof typeof ADMIN_ANALYTICS_SURFACE_PATHS;

export function getAdminAnalyticsPath(surface: AdminAnalyticsSurface) {
  return ADMIN_ANALYTICS_SURFACE_PATHS[surface];
}
