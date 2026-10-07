"use client";

import Link from "next/link";
import { useEffect, useRef, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { FiArrowUpRight } from "react-icons/fi";
import SocialPlatformIcon from "@/components/SocialPlatformIcon";
import { usePrivacyConsent } from "@/components/privacy/PrivacyProvider";
import { useFooterContent } from "@/components/FooterContentProvider";
import { getFooterContactLabel, isSafeFooterHref, type FooterContent } from "@/lib/content/footer";
import type { FooterEffect, SocialLink } from "@/lib/content";
import { detectSocialPlatform, getSocialPlatformDefinition } from "@/lib/content/social-platforms";
import styles from "./GalleryFooter.module.css";

type GalleryFooterProps = {
  artistName: string;
  // Retained for existing page callers; the compact footer does not show profile copy.
  contactBlurb?: string;
  location: string;
  footerEffect?: FooterEffect;
  socialLinks: SocialLink[];
  tagline?: string;
  /** Use the public renderer with inert links and optional editor selection. */
  preview?: boolean;
  content?: FooterContent;
  onSelectRegion?: (region: FooterPreviewRegion) => void;
  selectedRegion?: FooterPreviewRegion;
};

export type FooterPreviewRegion = "callout" | "social";

function EditableRegion({ children, region, selected, onSelect }: {
  children: ReactNode;
  region: FooterPreviewRegion;
  selected?: FooterPreviewRegion;
  onSelect?: (region: FooterPreviewRegion) => void;
}) {
  if (!onSelect) return children;
  const labels = { callout: "Footer contact link", social: "Footer platform links" };
  return <div className={styles.editable} data-footer-preview-region={region}>
    <div inert aria-hidden="true">{children}</div>
    <button type="button" aria-label={`Edit ${labels[region]}`} aria-pressed={selected === region}
      className={styles.selectRegion} onClick={() => onSelect(region)}>
      <span>{labels[region]}</span>
    </button>
  </div>;
}

type FooterPointerStyles = CSSProperties & {
  "--footer-pointer-x": string;
  "--footer-pointer-y": string;
};

export default function GalleryFooter({
  artistName, footerEffect = "soul", socialLinks, preview = false,
  content, onSelectRegion, selectedRegion,
}: GalleryFooterProps) {
  const savedContent = useFooterContent();
  const { openPreferences, registerFooterPrivacyControl } = usePrivacyConsent();
  const copy = content ?? savedContent;
  const contactLabel = getFooterContactLabel(copy);
  const hasContact = Boolean(contactLabel && copy.primaryHref && isSafeFooterHref(copy.primaryHref));
  const selectRegion = preview ? onSelectRegion : undefined;
  const socialItems = socialLinks.filter(link => {
    // Match Navbar's profile URL contract, including HTTPS on custom ports.
    try {
      const url = new URL(link.href);
      return url.protocol === "https:" && !url.username && !url.password;
    } catch { return false; }
  });
  const footerRef = useRef<HTMLElement>(null);
  const privacyControlRef = useRef<HTMLButtonElement>(null);
  const lightFrameRef = useRef<number | null>(null);
  const lightPositionRef = useRef({ currentX: null as number | null, currentY: null as number | null, targetX: 0, targetY: 0 });

  useEffect(() => () => {
    if (lightFrameRef.current !== null) cancelAnimationFrame(lightFrameRef.current);
  }, []);

  useEffect(() => {
    if (preview || !privacyControlRef.current) return;
    return registerFooterPrivacyControl(privacyControlRef.current);
  }, [preview, registerFooterPrivacyControl]);

  function animateLight() {
    const footer = footerRef.current;
    const light = lightPositionRef.current;
    if (!footer || light.currentX === null || light.currentY === null) {
      lightFrameRef.current = null;
      return;
    }
    light.currentX += (light.targetX - light.currentX) * 0.085;
    light.currentY += (light.targetY - light.currentY) * 0.085;
    footer.style.setProperty("--footer-pointer-x", `${light.currentX.toFixed(2)}px`);
    footer.style.setProperty("--footer-pointer-y", `${light.currentY.toFixed(2)}px`);
    if (Math.abs(light.targetX - light.currentX) + Math.abs(light.targetY - light.currentY) > 0.2) {
      lightFrameRef.current = requestAnimationFrame(animateLight);
    } else {
      light.currentX = light.targetX;
      light.currentY = light.targetY;
      lightFrameRef.current = null;
    }
  }

  function moveLight(event: PointerEvent<HTMLElement>) {
    const footer = footerRef.current;
    if (!footer || event.pointerType === "touch" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const bounds = footer.getBoundingClientRect();
    const light = lightPositionRef.current;
    // Keep pointer coordinates accurate when this component is transformed.
    light.targetX = (event.clientX - bounds.left) * (footer.offsetWidth / bounds.width || 1);
    light.targetY = (event.clientY - bounds.top) * (footer.offsetHeight / bounds.height || 1);
    if (light.currentX === null || light.currentY === null) {
      light.currentX = light.targetX;
      light.currentY = light.targetY;
    }
    if (lightFrameRef.current === null) lightFrameRef.current = requestAnimationFrame(animateLight);
  }

  return <footer id="site-footer" className={styles.footer} data-footer-effect={footerEffect} data-footer-preview={preview || undefined} ref={footerRef} onPointerMove={moveLight}
    style={{ "--footer-pointer-x": "24%", "--footer-pointer-y": "48%" } as FooterPointerStyles}>
    <div aria-hidden="true" className={`footer-pointer-glow ${styles.glow}`} />
    <div className={`footer-content ${styles.inner}`} inert={(preview && !selectRegion) || undefined} aria-hidden={(preview && !selectRegion) || undefined}>
      <div className={styles.main}>
        <div className={styles.identity} inert={preview || undefined} aria-hidden={preview || undefined}>
          <Link className={styles.name} href="/" aria-label={`${artistName} — home`}>
            {artistName}<span className={styles.dot} aria-hidden="true">.</span>
          </Link>
        </div>
        <EditableRegion region="callout" selected={selectedRegion} onSelect={selectRegion}>
          {hasContact ? <Link className={styles.contact} href={copy.primaryHref}>
            <span>{contactLabel}</span><FiArrowUpRight aria-hidden="true" />
          </Link> : preview ? <p className={styles.placeholder}>Add a contact link</p> : null}
        </EditableRegion>
      </div>

      {socialItems.length || preview ? <div className={styles.socialRegion}>
        <EditableRegion region="social" selected={selectedRegion} onSelect={selectRegion}>
          {socialItems.length ? <nav className={styles.social} aria-label="Music and social profiles">
            {socialItems.map(link => {
              const platform = detectSocialPlatform(link.iconKey, link.platform, link.href, link.label);
              const label = !link.label.trim() || link.label.trim().toLowerCase() === "website"
                ? getSocialPlatformDefinition(platform).label : link.label;
              return <a key={link.id} href={link.href} target="_blank" rel="noopener noreferrer"
                aria-label={`${label} — opens in a new tab`} title={label} data-platform={platform}>
                <SocialPlatformIcon platform={platform} href={link.href} label={label} aria-hidden="true" />
              </a>;
            })}
          </nav> : <p className={styles.placeholder}>Add platform links in Navbar</p>}
        </EditableRegion>
      </div> : null}

      <div className={styles.bottom} inert={preview || undefined} aria-hidden={preview || undefined}>
        <p className={styles.copyright}>© {new Date().getFullYear()} {artistName}</p>
        <nav className={styles.legal} aria-label="Legal">
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <button ref={privacyControlRef} type="button" onClick={openPreferences} data-privacy-ui="true">Privacy choices</button>
        </nav>
      </div>
    </div>
  </footer>;
}
