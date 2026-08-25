"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

const TRACKABLE_PATHS = new Set([
  "/",
  "/bio",
  "/booking",
  "/gallery",
  "/music",
  "/privacy",
  "/terms",
  "/video",
]);
const ENGAGEMENT_ACTIONS = new Set([
  "cta_click",
  "gallery_open",
  "video_open",
  "video_play",
  "contact_start",
]);
const SESSION_STORAGE_KEY = "portfolio.analytics.session.v1";
const SESSION_TTL_MS = 30 * 60 * 1000;

type AnalyticsPayload = {
  eventName: "page_view" | "outbound_click" | "engagement" | "web_vital";
  pagePath: string;
  targetLabel?: string;
  targetUrl?: string;
  metadata?: Record<string, unknown>;
};

function normalizePath(path: string) {
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

function isTrackablePath(path: string) {
  return TRACKABLE_PATHS.has(normalizePath(path));
}

function getSessionId() {
  const now = Date.now();
  try {
    const parsed = JSON.parse(sessionStorage.getItem(SESSION_STORAGE_KEY) || "null") as {
      id?: unknown;
      touchedAt?: unknown;
    } | null;
    const id = typeof parsed?.id === "string" ? parsed.id : "";
    const touchedAt = typeof parsed?.touchedAt === "number" ? parsed.touchedAt : 0;
    const sessionId = id && now - touchedAt < SESSION_TTL_MS ? id : crypto.randomUUID();
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ id: sessionId, touchedAt: now }));
    return sessionId;
  } catch {
    return crypto.randomUUID();
  }
}

function sendAnalytics(payload: AnalyticsPayload) {
  if (!isTrackablePath(payload.pagePath)) return;
  const body = JSON.stringify({
    ...payload,
    pagePath: normalizePath(payload.pagePath),
    sessionId: getSessionId(),
  });

  if (navigator.sendBeacon) {
    const queued = navigator.sendBeacon(
      "/api/analytics",
      new Blob([body], { type: "application/json" })
    );
    if (queued) return;
  }

  fetch("/api/analytics", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {});
}

function getAnchorFromEvent(event: Event) {
  const target = event.target;
  if (!(target instanceof Element)) return null;
  const anchor = target.closest("a[href]");
  return anchor instanceof HTMLAnchorElement ? anchor : null;
}

function getTargetLabel(element: Element) {
  return (
    element.getAttribute("aria-label") ||
    element.getAttribute("title") ||
    element.textContent?.trim() ||
    "Interaction"
  ).slice(0, 220);
}

export default function AnalyticsTracker() {
  const pathname = usePathname() || "/";
  const lastPathRef = useRef("");

  useEffect(() => {
    if (!isTrackablePath(pathname) || lastPathRef.current === pathname) return;
    lastPathRef.current = pathname;
    sendAnalytics({
      eventName: "page_view",
      pagePath: pathname,
      metadata: { title: document.title },
    });
  }, [pathname]);

  useEffect(() => {
    const startedForms = new WeakSet<Element>();
    const trackedDialogs = new WeakSet<Element>();
    const playedVideos = new WeakSet<Element>();

    function trackEngagement(action: string, label: string) {
      if (!ENGAGEMENT_ACTIONS.has(action)) return;
      sendAnalytics({
        eventName: "engagement",
        pagePath: window.location.pathname,
        targetLabel: label,
        metadata: { action },
      });
    }

    function onDocumentClick(event: MouseEvent) {
      if (!isTrackablePath(window.location.pathname)) return;
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;

      const annotated = target.closest("[data-analytics-event]");
      const action = annotated?.getAttribute("data-analytics-event") || "";
      if (annotated && ENGAGEMENT_ACTIONS.has(action)) {
        trackEngagement(action, getTargetLabel(annotated));
      }

      const anchor = getAnchorFromEvent(event);
      if (!anchor?.href) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin === window.location.origin) {
        if (normalizePath(url.pathname) === "/booking") {
          trackEngagement("contact_start", getTargetLabel(anchor));
        } else if (anchor.matches("[data-cta], .cta, [class*='cta']")) {
          trackEngagement("cta_click", getTargetLabel(anchor));
        }
        return;
      }

      sendAnalytics({
        eventName: "outbound_click",
        pagePath: window.location.pathname,
        targetLabel: getTargetLabel(anchor),
        targetUrl: url.origin,
      });
    }

    function onFocusIn(event: FocusEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const form = target.closest("form");
      if (!form || startedForms.has(form)) return;
      if (!form.querySelector("input[type='email'], input[name='email']")) return;
      startedForms.add(form);
      trackEngagement("contact_start", "Contact form started");
    }

    function onPlay(event: Event) {
      const video = event.target;
      if (!(video instanceof HTMLVideoElement) || playedVideos.has(video)) return;
      if (video.autoplay && video.muted) return;
      playedVideos.add(video);
      trackEngagement("video_play", video.getAttribute("aria-label") || "Video playback");
    }

    const dialogObserver = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof Element)) continue;
          const dialogs = node.matches("[role='dialog']")
            ? [node]
            : [...node.querySelectorAll("[role='dialog']")];
          for (const dialog of dialogs) {
            if (trackedDialogs.has(dialog)) continue;
            trackedDialogs.add(dialog);
            const label = getTargetLabel(dialog);
            trackEngagement(
              /gallery|image viewer/i.test(label) ? "gallery_open" : "video_open",
              label
            );
          }
        }
      }
    });

    document.addEventListener("click", onDocumentClick, { capture: true });
    document.addEventListener("focusin", onFocusIn, { capture: true });
    document.addEventListener("play", onPlay, { capture: true });
    dialogObserver.observe(document.body, { childList: true, subtree: true });
    return () => {
      document.removeEventListener("click", onDocumentClick, true);
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("play", onPlay, true);
      dialogObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!isTrackablePath(pathname) || typeof PerformanceObserver === "undefined") return;
    const trackedPath = normalizePath(pathname);
    const values: Partial<Record<"LCP" | "INP" | "CLS", number>> = {};
    const sent = new Set<string>();
    const observers: PerformanceObserver[] = [];

    function observe(type: string, callback: (entry: PerformanceEntry) => void) {
      try {
        const observer = new PerformanceObserver((list) => list.getEntries().forEach(callback));
        observer.observe({ type, buffered: true });
        observers.push(observer);
      } catch {
        // Unsupported performance entry type; the UI will show it as unavailable.
      }
    }

    observe("largest-contentful-paint", (entry) => {
      values.LCP = entry.startTime;
    });
    observe("layout-shift", (entry) => {
      const shift = entry as PerformanceEntry & { hadRecentInput?: boolean; value?: number };
      if (!shift.hadRecentInput) values.CLS = (values.CLS || 0) + (shift.value || 0);
    });
    observe("event", (entry) => {
      const interaction = entry as PerformanceEntry & { interactionId?: number; duration?: number };
      if (interaction.interactionId && (interaction.duration || 0) > (values.INP || 0)) {
        values.INP = interaction.duration || 0;
      }
    });

    function flush() {
      for (const [name, value] of Object.entries(values)) {
        if (sent.has(name) || typeof value !== "number") continue;
        sent.add(name);
        const rating = name === "CLS"
          ? value <= 0.1 ? "good" : value <= 0.25 ? "needs-improvement" : "poor"
          : name === "LCP"
            ? value <= 2500 ? "good" : value <= 4000 ? "needs-improvement" : "poor"
            : value <= 200 ? "good" : value <= 500 ? "needs-improvement" : "poor";
        sendAnalytics({
          eventName: "web_vital",
          pagePath: trackedPath,
          metadata: { name, value, rating },
        });
      }
    }

    const onVisibility = () => { if (document.visibilityState === "hidden") flush(); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    return () => {
      flush();
      observers.forEach((observer) => observer.disconnect());
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
    };
  }, [pathname]);

  return null;
}
