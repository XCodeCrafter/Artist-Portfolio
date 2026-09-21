"use client";

import { useEffect, useRef, useState } from "react";
import type { PrivacyChoices } from "@/lib/privacy/consent";

export default function PrivacyPreferences({ analytics, externalMedia, onClose, onSave }: PrivacyChoices & {
  onClose: () => void;
  onSave: (choices: PrivacyChoices) => void;
}) {
  const [choices, setChoices] = useState({ analytics, externalMedia });
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const element = dialog.current;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    element?.showModal();
    title.current?.focus();
    document.body.style.overflow = "hidden";
    return () => {
      element?.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  return (
    <dialog ref={dialog} className="privacy-dialog" aria-labelledby="privacy-title" aria-describedby="privacy-description" data-privacy-ui="true" onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <div className="privacy-dialog-scroll">
        <header className="privacy-cover">
          <div className="privacy-record" aria-hidden="true"><span>YOUR<br />CHOICE<br /><small>SIDE A · 01</small></span></div>
          <button className="privacy-close" aria-label="Close privacy settings" onClick={onClose} type="button">×</button>
          <p className="privacy-eyebrow">THE BACKSTAGE NOTES / PRIVACY EP</p>
          <h2 id="privacy-title" ref={title} tabIndex={-1}>You set<br /><em>the levels.</em></h2>
          <p id="privacy-description">The music is personal. Your privacy should be, too. Choose what plays in the background — the portfolio is yours to explore either way.</p>
        </header>
        <div className="privacy-tracklist">
          <p className="privacy-eyebrow">THE TRACKLIST <span>03 PURPOSES / NO ADS FROM US</span></p>
          <div className="privacy-track">
            <span className="privacy-track-number" aria-hidden="true">01</span>
            <div><h3>The essentials</h3><p>Page delivery, security and your privacy preference. This first-party cookie stores your choices, not a visitor ID, for 180 days. Contact forms and our own videos work without optional consent.</p></div>
            <span className="privacy-always">Always on</span>
          </div>
          <label className="privacy-track">
            <span className="privacy-track-number" aria-hidden="true">02</span>
            <div><h3>Audience insights</h3><p>Page views, broad traffic sources, device/browser categories and actions such as opening a reel or following a music link. A temporary browser-tab ID groups activity into sessions; it does not identify unique people. No advertising profiles.</p></div>
            <span className="privacy-switch"><input type="checkbox" aria-label="Audience insights" checked={choices.analytics} onChange={(event) => setChoices({ ...choices, analytics: event.target.checked })} /><span aria-hidden="true" /></span>
          </label>
          <label className="privacy-track">
            <span className="privacy-track-number" aria-hidden="true">03</span>
            <div><h3>External players</h3><p>Spotify, SoundCloud, YouTube and Vimeo embeds contact their providers, which receive your IP address and browser information and may use cookies under their own policies. Hosted Showreel previews do not need this permission.</p></div>
            <span className="privacy-switch"><input type="checkbox" aria-label="External players" checked={choices.externalMedia} onChange={(event) => setChoices({ ...choices, externalMedia: event.target.checked })} /><span aria-hidden="true" /></span>
          </label>
          <div className="privacy-liner-notes">
            <p>Change your mind anytime via <strong>Privacy choices</strong>. Turning a category off stops future optional collection or unloads its players. Cookies already set by external providers must be managed through your browser or those providers.</p>
            <p>Basic hosting, media delivery and Google Fonts still receive technical connection information to serve this site. Contact messages are handled separately to answer your enquiry.</p>
            <a href="/privacy">Full privacy notice & provider policies <span aria-hidden="true">↗</span></a>
          </div>
        </div>
      </div>
      <footer className="privacy-dialog-actions">
        <button className="privacy-button" onClick={() => onSave({ analytics: false, externalMedia: false })} type="button">Reject optional</button>
        <button className="privacy-button" onClick={() => onSave({ analytics: true, externalMedia: true })} type="button">Accept all</button>
        <button className="privacy-button privacy-button-save" onClick={() => onSave(choices)} type="button">Save my choices</button>
      </footer>
    </dialog>
  );
}
