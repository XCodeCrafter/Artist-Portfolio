"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

type AnalyticsPayload = {
  eventName: "page_view" | "outbound_click";
  pagePath: string;
  targetLabel?: string;
  targetUrl?: string;
  metadata?: Record<string, unknown>;
};

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

function isTrackablePath(path: string) {
  const normalized =
    path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
  return TRACKABLE_PATHS.has(normalized);
}

function sendAnalytics(payload: AnalyticsPayload) {
  if (!isTrackablePath(payload.pagePath)) return;

  const normalizedPath =
    payload.pagePath.length > 1 && payload.pagePath.endsWith("/")
      ? payload.pagePath.slice(0, -1)
      : payload.pagePath;
  const body = JSON.stringify({ ...payload, pagePath: normalizedPath });

  if (navigator.sendBeacon) {
    const blob = new Blob([body], { type: "application/json" });
    navigator.sendBeacon("/api/analytics", blob);
    return;
  }

  fetch("/api/analytics", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {});
}

function getAnchorFromEvent(event: MouseEvent) {
  const target = event.target;
  if (!(target instanceof Element)) return null;
  const anchor = target.closest("a[href]");
  return anchor instanceof HTMLAnchorElement ? anchor : null;
}

function getTargetLabel(anchor: HTMLAnchorElement) {
  return (
    anchor.getAttribute("aria-label") ||
    anchor.getAttribute("title") ||
    anchor.textContent?.trim() ||
    "External link"
  ).slice(0, 220);
}

export default function AnalyticsTracker() {
  const pathname = usePathname() || "/";
  const lastPathRef = useRef("");

  useEffect(() => {
    if (!isTrackablePath(pathname)) return;
    if (lastPathRef.current === pathname) return;

    lastPathRef.current = pathname;
    sendAnalytics({
      eventName: "page_view",
      pagePath: pathname,
      metadata: {
        title: document.title,
      },
    });
  }, [pathname]);

  useEffect(() => {
    function onDocumentClick(event: MouseEvent) {
      if (!isTrackablePath(window.location.pathname)) return;

      const anchor = getAnchorFromEvent(event);
      if (!anchor) return;

      const href = anchor.href;
      if (!href) return;

      const url = new URL(href, window.location.href);
      if (url.origin === window.location.origin) return;

      sendAnalytics({
        eventName: "outbound_click",
        pagePath: window.location.pathname,
        targetLabel: getTargetLabel(anchor),
        targetUrl: url.href,
      });
    }

    document.addEventListener("click", onDocumentClick, { capture: true });
    return () => {
      document.removeEventListener("click", onDocumentClick, { capture: true });
    };
  }, []);

  return null;
}
