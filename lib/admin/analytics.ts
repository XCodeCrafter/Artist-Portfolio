import {
  createAdminServiceClient,
  hasAdminServiceEnv,
} from "@/lib/admin/service";
import {
  getAnalyticsPageLabel,
  type AnalyticsRangeDays,
} from "@/lib/admin/analytics-shared";

export {
  ANALYTICS_RANGE_DAYS,
  getAnalyticsPageLabel,
  type AnalyticsRangeDays,
} from "@/lib/admin/analytics-shared";

export type AnalyticsEvent = {
  id: string;
  eventName: string;
  pagePath: string;
  targetLabel: string;
  targetUrl: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

type PeriodTotals = {
  pageViews: number;
  outboundClicks: number;
  bookingSubmits: number;
};

export type AnalyticsSummary = {
  rangeDays: AnalyticsRangeDays;
  totalEvents: number;
  pageViews: number;
  outboundClicks: number;
  bookingSubmits: number;
  bookingPageViews: number;
  uniqueSessions: number;
  topPages: Array<{ label: string; value: number }>;
  topTargets: Array<{ label: string; value: number; href: string }>;
  topSources: Array<{ label: string; value: number }>;
  devices: Array<{ label: string; value: number }>;
  browsers: Array<{ label: string; value: number }>;
  engagements: Array<{ label: string; value: number }>;
  webVitals: Array<{
    name: "LCP" | "INP" | "CLS";
    value: number;
    rating: "good" | "needs-improvement" | "poor";
    samples: number;
  }>;
  daily: Array<{
    label: string;
    pageViews: number;
    outboundClicks: number;
    bookingSubmits: number;
  }>;
  currentPeriod: PeriodTotals;
  previousPeriod: PeriodTotals;
  current7Days: PeriodTotals;
  previous7Days: PeriodTotals;
  lastEventAt: string;
  isCapped: boolean;
  recentEvents: AnalyticsEvent[];
};

type AnalyticsEventRow = {
  id: string;
  event_name: string;
  page_path: string;
  target_label: string;
  target_url: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

const EMPTY_PERIOD: PeriodTotals = {
  pageViews: 0,
  outboundClicks: 0,
  bookingSubmits: 0,
};

function getRecentDayLabels(days: number, endOffset = 0) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  return Array.from({ length: days }, (_, index) => {
    const date = new Date(today);
    date.setUTCDate(today.getUTCDate() - endOffset - (days - index - 1));
    return date.toISOString().slice(0, 10);
  });
}

export function emptyAnalyticsSummary(
  rangeDays: AnalyticsRangeDays = 30
): AnalyticsSummary {
  return {
    rangeDays,
    totalEvents: 0,
    pageViews: 0,
    outboundClicks: 0,
    bookingSubmits: 0,
    bookingPageViews: 0,
    uniqueSessions: 0,
    topPages: [],
    topTargets: [],
    topSources: [],
    devices: [],
    browsers: [],
    engagements: [],
    webVitals: [],
    daily: getRecentDayLabels(rangeDays).map((label) => ({
      label,
      ...EMPTY_PERIOD,
    })),
    currentPeriod: { ...EMPTY_PERIOD },
    previousPeriod: { ...EMPTY_PERIOD },
    current7Days: { ...EMPTY_PERIOD },
    previous7Days: { ...EMPTY_PERIOD },
    lastEventAt: "",
    isCapped: false,
    recentEvents: [],
  };
}

function mapEvent(row: AnalyticsEventRow): AnalyticsEvent {
  return {
    id: row.id,
    eventName: row.event_name,
    pagePath: row.page_path,
    targetLabel: row.target_label,
    // Telemetry is deliberately never turned into a clickable admin URL.
    targetUrl: "",
    metadata: row.metadata || {},
    createdAt: row.created_at,
  };
}

function increment(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) || 0) + 1);
}

function topEntries(map: Map<string, number>, limit = 6) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, value]) => ({ label, value }));
}

function getDayLabel(iso: string) {
  return new Date(iso).toISOString().slice(0, 10);
}

function sumPeriod(days: AnalyticsSummary["daily"]): PeriodTotals {
  return days.reduce(
    (summary, day) => ({
      pageViews: summary.pageViews + day.pageViews,
      outboundClicks: summary.outboundClicks + day.outboundClicks,
      bookingSubmits: summary.bookingSubmits + day.bookingSubmits,
    }),
    { ...EMPTY_PERIOD }
  );
}

function metadataString(event: AnalyticsEvent, key: string) {
  const value = event.metadata[key];
  return typeof value === "string" ? value.trim() : "";
}

function getSourceLabel(event: AnalyticsEvent) {
  const coarse = metadataString(event, "referrerDomain");
  if (coarse) return coarse;

  const legacy = metadataString(event, "referrer");
  if (!legacy) return "Direct / unknown";
  try {
    return new URL(legacy).hostname.replace(/^www\./, "") || "Direct / unknown";
  } catch {
    return "Direct / unknown";
  }
}

function getDeviceLabel(event: AnalyticsEvent) {
  const coarse = metadataString(event, "deviceCategory");
  if (coarse) return coarse;
  const ua = metadataString(event, "userAgent");
  if (/tablet|ipad/i.test(ua)) return "Tablet";
  if (/mobile|iphone|android/i.test(ua)) return "Mobile";
  return ua ? "Desktop" : "Unknown";
}

function getBrowserLabel(event: AnalyticsEvent) {
  const coarse = metadataString(event, "browserCategory");
  if (coarse) return coarse;
  const ua = metadataString(event, "userAgent");
  if (/edg\//i.test(ua)) return "Edge";
  if (/firefox\//i.test(ua)) return "Firefox";
  if (/chrome\//i.test(ua)) return "Chrome";
  if (/safari\//i.test(ua)) return "Safari";
  return "Other / unknown";
}

const ENGAGEMENT_LABELS: Record<string, string> = {
  cta_click: "CTA clicks",
  gallery_open: "Gallery opens",
  video_open: "Video opens",
  video_play: "Video plays",
  contact_start: "Contact starts",
};

function getVitalRating(
  name: "LCP" | "INP" | "CLS",
  value: number
): "good" | "needs-improvement" | "poor" {
  if (name === "CLS")
    return value <= 0.1
      ? "good"
      : value <= 0.25
        ? "needs-improvement"
        : "poor";
  if (name === "LCP")
    return value <= 2500
      ? "good"
      : value <= 4000
        ? "needs-improvement"
        : "poor";
  return value <= 200
    ? "good"
    : value <= 500
      ? "needs-improvement"
      : "poor";
}

function buildSummary(
  rows: AnalyticsEventRow[],
  rangeDays: AnalyticsRangeDays,
  isCapped = false
): AnalyticsSummary {
  const events = rows.map(mapEvent);
  const currentLabels = getRecentDayLabels(rangeDays);
  const previousLabels = getRecentDayLabels(rangeDays, rangeDays);
  const currentLabelSet = new Set(currentLabels);
  const previousLabelSet = new Set(previousLabels);
  const comparisonLabels = [...previousLabels, ...currentLabels];
  const pageMap = new Map<string, number>();
  const targetMap = new Map<string, { value: number; href: string }>();
  const sourceMap = new Map<string, number>();
  const deviceMap = new Map<string, number>();
  const browserMap = new Map<string, number>();
  const engagementMap = new Map<string, number>();
  const sessionIds = new Set<string>();
  const vitalValues = new Map<"LCP" | "INP" | "CLS", number[]>();
  const dailyMap = new Map<
    string,
    { pageViews: number; outboundClicks: number; bookingSubmits: number }
  >();

  let bookingPageViews = 0;
  const currentEvents: AnalyticsEvent[] = [];

  for (const event of events) {
    const day = getDayLabel(event.createdAt);
    if (!currentLabelSet.has(day) && !previousLabelSet.has(day)) continue;

    const daily = dailyMap.get(day) || { ...EMPTY_PERIOD };
    const isCurrent = currentLabelSet.has(day);

    if (isCurrent) {
      const sessionId = metadataString(event, "sessionId");
      if (sessionId) sessionIds.add(sessionId);
    }

    if (event.eventName === "page_view") {
      daily.pageViews += 1;
      if (isCurrent) {
        increment(pageMap, getAnalyticsPageLabel(event.pagePath));
        increment(sourceMap, getSourceLabel(event));
        increment(deviceMap, getDeviceLabel(event));
        increment(browserMap, getBrowserLabel(event));
        if (event.pagePath === "/booking") bookingPageViews += 1;
      }
    } else if (event.eventName === "outbound_click") {
      daily.outboundClicks += 1;
      if (isCurrent) {
        const label = event.targetLabel || "External link";
        const existing = targetMap.get(label) || { value: 0, href: "" };
        existing.value += 1;
        targetMap.set(label, existing);
      }
    } else if (event.eventName === "booking_submit") {
      daily.bookingSubmits += 1;
    } else if (isCurrent && event.eventName === "engagement") {
      const action = metadataString(event, "action");
      increment(engagementMap, ENGAGEMENT_LABELS[action] || action || "Other engagement");
    } else if (isCurrent && event.eventName === "web_vital") {
      const name = metadataString(event, "name");
      const value = event.metadata.value;
      if (
        (name === "LCP" || name === "INP" || name === "CLS") &&
        typeof value === "number" &&
        Number.isFinite(value)
      ) {
        const values = vitalValues.get(name) || [];
        values.push(value);
        vitalValues.set(name, values);
      }
    }

    if (isCurrent) currentEvents.push(event);
    dailyMap.set(day, daily);
  }

  const comparisonDaily = comparisonLabels.map((label) => ({
    label,
    ...(dailyMap.get(label) || { ...EMPTY_PERIOD }),
  }));
  const daily = comparisonDaily.slice(-rangeDays);
  const currentPeriod = sumPeriod(daily);
  const previousPeriod = sumPeriod(comparisonDaily.slice(0, rangeDays));
  const last14 = comparisonDaily.slice(-14);
  const current7Days = sumPeriod(last14.slice(-7));
  const previous7Days = sumPeriod(last14.slice(-14, -7));

  const topTargets = [...targetMap.entries()]
    .sort((a, b) => b[1].value - a[1].value)
    .slice(0, 6)
    .map(([label, item]) => ({ label, value: item.value, href: item.href }));
  const webVitals = [...vitalValues.entries()].map(([name, values]) => {
    const sorted = [...values].sort((a, b) => a - b);
    const value = sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.75) - 1)] || 0;
    return { name, value, rating: getVitalRating(name, value), samples: values.length };
  });

  return {
    rangeDays,
    totalEvents: currentEvents.length,
    pageViews: currentPeriod.pageViews,
    outboundClicks: currentPeriod.outboundClicks,
    bookingSubmits: currentPeriod.bookingSubmits,
    bookingPageViews,
    uniqueSessions: sessionIds.size,
    topPages: topEntries(pageMap),
    topTargets,
    topSources: topEntries(sourceMap),
    devices: topEntries(deviceMap),
    browsers: topEntries(browserMap),
    engagements: topEntries(engagementMap),
    webVitals,
    daily,
    currentPeriod,
    previousPeriod,
    current7Days,
    previous7Days,
    lastEventAt: currentEvents[0]?.createdAt || "",
    isCapped,
    recentEvents: currentEvents.slice(0, 20),
  };
}

export async function getAnalyticsSummary(
  options: { rangeDays?: AnalyticsRangeDays } = {}
): Promise<{
  summary: AnalyticsSummary;
  isConfigured: boolean;
  loadError?: string;
}> {
  const rangeDays = options.rangeDays || 30;
  if (!hasAdminServiceEnv()) {
    return { summary: emptyAnalyticsSummary(rangeDays), isConfigured: false };
  }

  const supabase = createAdminServiceClient();
  if (!supabase) {
    return { summary: emptyAnalyticsSummary(rangeDays), isConfigured: false };
  }

  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - rangeDays * 2 + 1);

  const { data, error } = await supabase
    .from("analytics_events")
    .select("*")
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: false })
    .limit(5000)
    .returns<AnalyticsEventRow[]>();

  if (error) {
    return {
      summary: emptyAnalyticsSummary(rangeDays),
      isConfigured: true,
      loadError: "Unable to load analytics events from Supabase.",
    };
  }

  return {
    summary: buildSummary(data || [], rangeDays, (data || []).length >= 5000),
    isConfigured: true,
  };
}
