"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ANALYTICS_SESSION_KEY, readConsentCookie, serializeConsentCookie, type PrivacyChoices, type PrivacyConsent } from "@/lib/privacy/consent";
import PrivacyPreferences from "./PrivacyPreferences";

type PrivacyContextValue = {
  ready: boolean;
  analytics: boolean;
  externalMedia: boolean;
  openPreferences: () => void;
  allowExternalMedia: () => void;
};

const PrivacyContext = createContext<PrivacyContextValue>({
  ready: false, analytics: false, externalMedia: false,
  openPreferences: () => {}, allowExternalMedia: () => {},
});

export function usePrivacyConsent() { return useContext(PrivacyContext); }

export default function PrivacyProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith("/admin") ?? false;
  const [consent, setConsent] = useState<PrivacyConsent | null>(null);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const channel = useRef<BroadcastChannel | null>(null);
  const failClosed = useRef(false);

  useEffect(() => {
    const sync = () => {
      if (failClosed.current) return;
      let next: PrivacyConsent | null = null;
      try { next = readConsentCookie(document.cookie); } catch { /* Blocked storage means no consent. */ }
      setConsent((previous) => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
      setReady(true);
      if (!next?.analytics) {
        try { sessionStorage.removeItem(ANALYTICS_SESSION_KEY); } catch { /* Storage may be disabled. */ }
      }
    };
    sync();
    // Re-check on expiry, returning to the tab, and choices made in another tab.
    const timer = window.setInterval(sync, 15000);
    window.addEventListener("focus", sync);
    window.addEventListener("pageshow", sync);
    document.addEventListener("visibilitychange", sync);
    try {
      channel.current = new BroadcastChannel("portfolio-privacy");
      channel.current.onmessage = sync;
    } catch { /* Focus + bounded polling also work without BroadcastChannel. */ }
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", sync);
      window.removeEventListener("pageshow", sync);
      document.removeEventListener("visibilitychange", sync);
      channel.current?.close();
      channel.current = null;
    };
  }, []);

  const save = useCallback((choices: PrivacyChoices) => {
    const now = Date.now();
    let stored: PrivacyConsent | null = null;
    try {
      document.cookie = serializeConsentCookie(choices, location.protocol === "https:", now);
      stored = readConsentCookie(document.cookie, now);
    } catch { /* Fail closed when the browser cannot store the preference. */ }
    const success = stored?.updatedAt === now && stored.analytics === choices.analytics && stored.externalMedia === choices.externalMedia;
    failClosed.current = !success;
    setConsent(success ? stored : null);
    setStorageError(!success);
    setReady(true);
    if (!success || !choices.analytics) {
      try { sessionStorage.removeItem(ANALYTICS_SESSION_KEY); } catch { /* Nothing to clear. */ }
    }
    try { channel.current?.postMessage("changed"); } catch { /* Other tabs also re-check on focus and periodically. */ }
    if (success) setOpen(false);
  }, []);

  const analytics = ready && consent?.analytics === true;
  const externalMedia = ready && consent?.externalMedia === true;
  const openPreferences = useCallback(() => setOpen(true), []);

  return (
    <PrivacyContext.Provider value={{ ready, analytics, externalMedia, openPreferences, allowExternalMedia: () => save({ analytics, externalMedia: true }) }}>
      {children}
      {!isAdmin && ready ? <>
        {!consent ? (
          <section aria-label="Privacy choices" className="privacy-banner" data-privacy-ui="true">
            <div className="privacy-banner-copy">
              <span className="privacy-eyebrow">BACKSTAGE / YOUR PRIVACY</span>
              <h2>Your visit. Your mix.</h2>
              <p>Optional analytics help us understand visits and clicks. External players can use their own cookies. Both stay off until you choose. Your choice is remembered for 180 days.</p>
            </div>
            <div className="privacy-banner-actions">
              <button className="privacy-button" onClick={() => save({ analytics: false, externalMedia: false })} type="button">Reject optional</button>
              <button className="privacy-button" onClick={() => save({ analytics: true, externalMedia: true })} type="button">Accept all</button>
              <button className="privacy-button privacy-button-detail" onClick={openPreferences} type="button">Read more / Choose</button>
            </div>
          </section>
        ) : null}
        {consent ? <button className="privacy-reopen" onClick={openPreferences} type="button" aria-label="Privacy settings" data-privacy-ui="true">Privacy choices <span aria-hidden="true">↗</span></button> : null}
        {storageError ? <p className="privacy-storage-error" role="alert">Your browser could not remember this choice. Optional features remain off. Allow this site to store its preference cookie and try again.</p> : null}
        {open ? <PrivacyPreferences analytics={analytics} externalMedia={externalMedia} onClose={() => setOpen(false)} onSave={save} /> : null}
      </> : null}
    </PrivacyContext.Provider>
  );
}
