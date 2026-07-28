import {
  createAdminServiceClient,
  hasAdminServiceEnv,
} from "@/lib/admin/service";

export type AnalyticsEvent = {
  id: string;
  eventName: string;
  pagePath: string;
  targetLabel: string;
  targetUrl: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type AnalyticsSummary = {
  rangeDays: number;
  totalEvents: number;
  pageViews: number;
  outboundClicks: number;
  bookingSubmits: number;
  bookingPageViews: number;
  topPages: Array<{ label: string; value: number }>;
  topTargets: Array<{ label: string; value: number; href: string }>;
  daily: Array<{
    label: string;
    pageViews: number;
    outboundClicks: number;
    bookingSubmits: number;
  }>;
  current7Days: {
    pageViews: number;
    outboundClicks: number;
    bookingSubmits: number;
  };
  previous7Days: {
    pageViews: number;
    outboundClicks: number;
    bookingSubmits: number;
  };
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

const EMPTY_SUMMARY: AnalyticsSummary = {
  rangeDays: 30,
  totalEvents: 0,
  pageViews: 0,
  outboundClicks: 0,
  bookingSubmits: 0,
  bookingPageViews: 0,
  topPages: [],
  topTargets: [],
  daily: [],
  current7Days: {
    pageViews: 0,
    outboundClicks: 0,
    bookingSubmits: 0,
  },
  previous7Days: {
    pageViews: 0,
    outboundClicks: 0,
    bookingSubmits: 0,
  },
  lastEventAt: "",
  isCapped: false,
  recentEvents: [],
};

function mapEvent(row: AnalyticsEventRow): AnalyticsEvent {
  return {
    id: row.id,
    eventName: row.event_name,
    pagePath: row.page_path,
    targetLabel: row.target_label,
    // Public telemetry must never create a clickable destination in the admin
    // UI; even a syntactically valid HTTPS URL could be a phishing link.
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

function getRecentDayLabels(days: number) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  return Array.from({ length: days }, (_, index) => {
    const date = new Date(today);
    date.setUTCDate(today.getUTCDate() - (days - index - 1));
    return date.toISOString().slice(0, 10);
  });
}

function sumPeriod(
  days: AnalyticsSummary["daily"]
): AnalyticsSummary["current7Days"] {
  return days.reduce(
    (summary, day) => ({
      pageViews: summary.pageViews + day.pageViews,
      outboundClicks: summary.outboundClicks + day.outboundClicks,
      bookingSubmits: summary.bookingSubmits + day.bookingSubmits,
    }),
    { pageViews: 0, outboundClicks: 0, bookingSubmits: 0 }
  );
}

function buildSummary(
  rows: AnalyticsEventRow[],
  isCapped = false
): AnalyticsSummary {
  const events = rows.map(mapEvent);
  const pageMap = new Map<string, number>();
  const targetMap = new Map<string, { value: number; href: string }>();
  const dailyMap = new Map<
    string,
    {
      pageViews: number;
      outboundClicks: number;
      bookingSubmits: number;
    }
  >();

  let pageViews = 0;
  let outboundClicks = 0;
  let bookingSubmits = 0;
  let bookingPageViews = 0;

  for (const event of events) {
    const day = getDayLabel(event.createdAt);
    const daily = dailyMap.get(day) || {
      pageViews: 0,
      outboundClicks: 0,
      bookingSubmits: 0,
    };

    if (event.eventName === "page_view") {
      pageViews += 1;
      increment(pageMap, event.pagePath || "/");
      daily.pageViews += 1;
      if (event.pagePath === "/booking") bookingPageViews += 1;
    }

    if (event.eventName === "outbound_click") {
      outboundClicks += 1;
      const label = event.targetLabel || event.targetUrl || "External link";
      const existing = targetMap.get(label) || {
        value: 0,
        href: event.targetUrl,
      };
      existing.value += 1;
      if (!existing.href) existing.href = event.targetUrl;
      targetMap.set(label, existing);
      daily.outboundClicks += 1;
    }

    if (event.eventName === "booking_submit") {
      bookingSubmits += 1;
      daily.bookingSubmits += 1;
    }

    dailyMap.set(day, daily);
  }

  const topTargets = [...targetMap.entries()]
    .sort((a, b) => b[1].value - a[1].value)
    .slice(0, 6)
    .map(([label, item]) => ({
      label,
      value: item.value,
      href: item.href,
    }));

  const daily = getRecentDayLabels(30).map((label) => ({
    label,
    ...(dailyMap.get(label) || {
      pageViews: 0,
      outboundClicks: 0,
      bookingSubmits: 0,
    }),
  }));
  const current7Days = sumPeriod(daily.slice(-7));
  const previous7Days = sumPeriod(daily.slice(-14, -7));

  return {
    rangeDays: 30,
    totalEvents: events.length,
    pageViews,
    outboundClicks,
    bookingSubmits,
    bookingPageViews,
    topPages: topEntries(pageMap),
    topTargets,
    daily,
    current7Days,
    previous7Days,
    lastEventAt: events[0]?.createdAt || "",
    isCapped,
    recentEvents: events.slice(0, 20),
  };
}

export async function getAnalyticsSummary(): Promise<{
  summary: AnalyticsSummary;
  isConfigured: boolean;
  loadError?: string;
}> {
  if (!hasAdminServiceEnv()) {
    return {
      summary: EMPTY_SUMMARY,
      isConfigured: false,
    };
  }

  const supabase = createAdminServiceClient();
  if (!supabase) {
    return {
      summary: EMPTY_SUMMARY,
      isConfigured: false,
    };
  }

  const since = new Date();
  since.setDate(since.getDate() - 30);

  const { data, error } = await supabase
    .from("analytics_events")
    .select("*")
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: false })
    .limit(5000)
    .returns<AnalyticsEventRow[]>();

  if (error) {
    return {
      summary: EMPTY_SUMMARY,
      isConfigured: true,
      loadError: "Unable to load analytics events from Supabase.",
    };
  }

  return {
    summary: buildSummary(data || [], (data || []).length >= 5000),
    isConfigured: true,
  };
}
