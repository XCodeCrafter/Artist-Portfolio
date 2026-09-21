"use client";

import type { ReactNode } from "react";
import { usePrivacyConsent } from "./PrivacyProvider";

export default function ExternalMediaGate({ provider, children }: { provider: string; children: ReactNode }) {
  const { ready, externalMedia, openPreferences, allowExternalMedia } = usePrivacyConsent();
  if (ready && externalMedia) return <>{children}</>;
  return (
    <div className="privacy-player-gate" data-privacy-ui="true">
      <span className="privacy-eyebrow">PLAYER ON STANDBY</span>
      <p>{provider}</p>
      <span>This player contacts {provider}, which may use cookies and receive your IP address. Allow external players, or keep browsing without them.</span>
      <div>
        <button type="button" disabled={!ready} className="privacy-button" onClick={allowExternalMedia}>Allow external players</button>
        <button type="button" disabled={!ready} className="privacy-player-details" onClick={openPreferences}>Privacy details</button>
      </div>
    </div>
  );
}
