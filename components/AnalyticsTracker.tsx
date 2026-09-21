"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { usePrivacyConsent } from "@/components/privacy/PrivacyProvider";
import { readConsentCookie } from "@/lib/privacy/consent";
import { createAnalyticsSessionStore } from "@/lib/analytics-session";

const TRACKABLE_PATHS = new Set(["/", "/bio", "/booking", "/gallery", "/music", "/privacy", "/terms", "/video"]);
const ENGAGEMENT_ACTIONS = new Set(["cta_click", "gallery_open", "video_open", "video_play", "contact_open", "contact_start"]);
const sessions = createAnalyticsSessionStore();
type AnalyticsPayload = {
  eventName: "page_view" | "outbound_click" | "engagement";
  pagePath: string;
  targetLabel?: string;
  targetUrl?: string;
  metadata?: Record<string, unknown>;
};
function normalizePath(path: string) { return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path; }
function storage() { try { return sessionStorage; } catch { return null; } }
function isAllowed() {
  try {
    return process.env.NODE_ENV === "production" && readConsentCookie(document.cookie)?.analytics === true;
  } catch { return false; }
}
function sendAnalytics(payload: AnalyticsPayload) {
  // Recheck at collection time: pending events after withdrawal must not recreate an identifier.
  if (!isAllowed() || !TRACKABLE_PATHS.has(normalizePath(payload.pagePath))) return;
  const session = sessions.get(storage(), Date.now(), () => crypto.randomUUID(), document.referrer, window.location.href);
  const body = JSON.stringify({
    ...payload, pagePath: normalizePath(payload.pagePath), sessionId: session.id,
    metadata: payload.eventName === "page_view" ? {
      ...payload.metadata, landingReferrer: session.landingReferrer,
      ...(session.campaignSource ? { campaignSource: session.campaignSource } : {}),
    } : payload.metadata,
  });
  if (navigator.sendBeacon) {
    try { if (navigator.sendBeacon("/api/analytics", new Blob([body], { type: "application/json" }))) return; } catch { /* Fetch fallback. */ }
  }
  void fetch("/api/analytics", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => {});
}
function getTargetLabel(element: Element) {
  return (element.getAttribute("data-analytics-label") || element.getAttribute("aria-label") || element.getAttribute("title") || element.textContent?.trim() || "Interaction").slice(0, 220);
}

export default function AnalyticsTracker() {
  const pathname = usePathname() || "/";
  const { ready, analytics } = usePrivacyConsent();
  const lastPath = useRef("");
  const enabled = ready && analytics && process.env.NODE_ENV === "production";

  useEffect(() => {
    if (!ready) return;
    if (!enabled) {
      sessions.clear(storage());
      lastPath.current = "";
      return;
    }
    if (!TRACKABLE_PATHS.has(normalizePath(pathname))) { lastPath.current = ""; return; }
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    sendAnalytics({ eventName: "page_view", pagePath: pathname, metadata: { title: document.title } });
  }, [enabled, pathname, ready]);

  useEffect(() => {
    if (!enabled || !TRACKABLE_PATHS.has(normalizePath(pathname))) return;
    const startedForms = new WeakSet<Element>();
    const trackedDialogs = new WeakSet<Element>();
    const playedVideos = new WeakSet<Element>();
    function track(action: string, label: string) {
      if (ENGAGEMENT_ACTIONS.has(action)) sendAnalytics({ eventName: "engagement", pagePath: window.location.pathname, targetLabel: label, metadata: { action } });
    }
    function onClick(event: MouseEvent) {
      const target = event.target instanceof Element ? event.target : null;
      if (!target || target.closest("[inert], [data-analytics-ignore], [data-privacy-ui]")) return;
      const annotated = target.closest("[data-analytics-event]");
      const action = annotated?.getAttribute("data-analytics-event") || "";
      const anchor = target.closest("a[href]");
      if (anchor instanceof HTMLAnchorElement) {
        const url = new URL(anchor.href, window.location.href);
        if (url.origin !== window.location.origin) {
          if (url.protocol === "https:") sendAnalytics({ eventName: "outbound_click", pagePath: window.location.pathname, targetLabel: getTargetLabel(anchor), targetUrl: url.origin });
          return;
        }
        if (normalizePath(url.pathname) === "/booking") { track("contact_open", getTargetLabel(anchor)); return; }
      }
      if (annotated && ENGAGEMENT_ACTIONS.has(action)) track(action, getTargetLabel(annotated));
    }
    function onFocus(event: FocusEvent) {
      if (normalizePath(window.location.pathname) !== "/booking") return;
      const target = event.target;
      if (!(target instanceof Element) || target.closest("[inert], [data-analytics-ignore], [data-privacy-ui]")) return;
      const form = target.closest("form");
      if (!form || startedForms.has(form) || !form.querySelector("input[type='email']")) return;
      startedForms.add(form);
      track("contact_start", "Contact form started");
    }
    function onPlay(event: Event) {
      const video = event.target;
      if (!(video instanceof HTMLVideoElement) || playedVideos.has(video) || video.hasAttribute("data-analytics-preview") || video.getAttribute("data-analytics-play") !== "true") return;
      playedVideos.add(video);
      track("video_play", getTargetLabel(video));
    }
    function inspect(node: Element) {
      const dialogs = node.matches("[data-analytics-open]") ? [node] : [...node.querySelectorAll("[data-analytics-open]")];
      for (const dialog of dialogs) {
        if (dialog.closest("[inert], [data-analytics-ignore], [data-privacy-ui]")) continue;
        if (trackedDialogs.has(dialog)) continue;
        trackedDialogs.add(dialog);
        const action = dialog.getAttribute("data-analytics-open") || "";
        if (action === "gallery_open" || action === "video_open") track(action, getTargetLabel(dialog));
      }
    }
    const observer = new MutationObserver((records) => {
      for (const record of records) for (const node of record.addedNodes) if (node instanceof Element) inspect(node);
    });
    // Do not retroactively record dialogs or plays from before consent.
    document.addEventListener("click", onClick, true);
    document.addEventListener("focusin", onFocus, true);
    document.addEventListener("play", onPlay, true);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("focusin", onFocus, true);
      document.removeEventListener("play", onPlay, true);
      observer.disconnect();
    };
  }, [enabled, pathname]);
  return null;
}
