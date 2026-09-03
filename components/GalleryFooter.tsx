"use client";

import Link from "next/link";
import {
  useEffect,
  useRef,
  type CSSProperties,
  type PointerEvent,
} from "react";
import {
  FaArrowRight,
  FaEnvelope,
  FaExternalLinkAlt,
  FaPlay,
} from "react-icons/fa";
import SocialPlatformIcon from "@/components/SocialPlatformIcon";
import type { FooterEffect, SocialLink } from "@/lib/content";
import { getMixedPublicCopy } from "@/lib/content/public-copy";
import {
  detectSocialPlatform,
  getSocialPlatformDefinition,
} from "@/lib/content/social-platforms";

type GalleryFooterProps = {
  artistName: string;
  contactBlurb?: string;
  location: string;
  footerEffect?: FooterEffect;
  socialLinks: SocialLink[];
  tagline?: string;
};

type FooterPointerStyles = CSSProperties & {
  "--footer-pointer-x": string;
  "--footer-pointer-y": string;
};

const primaryButtonClass =
  "group relative inline-flex min-h-[58px] items-center justify-center gap-3 overflow-hidden whitespace-nowrap rounded-[16px] border border-[#ff4937] bg-gradient-to-br from-[#ef321f] via-[#cf2517] to-[#96130c] px-7 text-sm font-semibold uppercase tracking-[0.13em] text-white shadow-[0_10px_36px_rgba(230,45,27,0.2)] transition-[transform,box-shadow,border-color] duration-500 ease-out hover:-translate-y-0.5 hover:border-[#ff6654] hover:shadow-[0_14px_44px_rgba(230,45,27,0.27)] active:translate-y-0 motion-reduce:transform-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#ff5a47]";

const secondaryButtonClass =
  "group inline-flex min-h-[58px] items-center justify-center gap-3 whitespace-nowrap rounded-[16px] border border-white/18 bg-white/[0.025] px-7 text-sm font-semibold uppercase tracking-[0.13em] text-white/82 transition-[transform,background-color,border-color,color,box-shadow] duration-500 ease-out hover:-translate-y-0.5 hover:border-[#ff4a36]/35 hover:bg-[#ff3d28]/[0.045] hover:text-white hover:shadow-[0_10px_34px_rgba(0,0,0,0.24)] active:translate-y-0 motion-reduce:transform-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/50";

export default function GalleryFooter({
  artistName,
  contactBlurb,
  location,
  footerEffect = "soul",
  socialLinks,
  tagline,
}: GalleryFooterProps) {
  const footerRef = useRef<HTMLElement>(null);
  const lightFrameRef = useRef<number | null>(null);
  const lightPositionRef = useRef({
    currentX: null as number | null,
    currentY: null as number | null,
    targetX: 0,
    targetY: 0,
  });
  const socialItems = socialLinks.filter((link) => link.href.trim());
  const currentYear = new Date().getFullYear();
  const publicTagline = getMixedPublicCopy(
    tagline,
    "Film · performance · music · creative collaboration"
  );
  const publicContactBlurb = getMixedPublicCopy(
    contactBlurb,
    "For acting, music, productions, bookings, and creative collaborations."
  );
  const isSoulEffect = footerEffect === "soul";
  const touchAmbientBackground = isSoulEffect
    ? "radial-gradient(520px circle at 18% 32%, rgba(255, 243, 202, 0.11), transparent 68%), radial-gradient(460px circle at 84% 74%, rgba(255, 58, 37, 0.05), transparent 72%)"
    : "radial-gradient(520px circle at 18% 34%, rgba(255, 56, 37, 0.12), transparent 68%), radial-gradient(460px circle at 86% 72%, rgba(35, 57, 87, 0.075), transparent 72%)";

  useEffect(
    () => () => {
      if (lightFrameRef.current !== null) {
        cancelAnimationFrame(lightFrameRef.current);
      }
    },
    []
  );

  function animateLight() {
    const footer = footerRef.current;
    const light = lightPositionRef.current;

    if (!footer || light.currentX === null || light.currentY === null) {
      lightFrameRef.current = null;
      return;
    }

    const easing = 0.085;
    light.currentX += (light.targetX - light.currentX) * easing;
    light.currentY += (light.targetY - light.currentY) * easing;

    footer.style.setProperty(
      "--footer-pointer-x",
      `${light.currentX.toFixed(2)}px`
    );
    footer.style.setProperty(
      "--footer-pointer-y",
      `${light.currentY.toFixed(2)}px`
    );

    const distance =
      Math.abs(light.targetX - light.currentX) +
      Math.abs(light.targetY - light.currentY);

    if (distance > 0.2) {
      lightFrameRef.current = requestAnimationFrame(animateLight);
    } else {
      light.currentX = light.targetX;
      light.currentY = light.targetY;
      footer.style.setProperty("--footer-pointer-x", `${light.targetX}px`);
      footer.style.setProperty("--footer-pointer-y", `${light.targetY}px`);
      lightFrameRef.current = null;
    }
  }

  function moveLight(event: PointerEvent<HTMLElement>) {
    const footer = footerRef.current;
    if (!footer || event.pointerType === "touch") return;

    const bounds = footer.getBoundingClientRect();
    const light = lightPositionRef.current;
    light.targetX = event.clientX - bounds.left;
    light.targetY = event.clientY - bounds.top;

    if (light.currentX === null || light.currentY === null) {
      light.currentX = light.targetX;
      light.currentY = light.targetY;
      footer.style.setProperty("--footer-pointer-x", `${light.currentX}px`);
      footer.style.setProperty("--footer-pointer-y", `${light.currentY}px`);
    }

    if (lightFrameRef.current === null) {
      lightFrameRef.current = requestAnimationFrame(animateLight);
    }
  }

  return (
    <footer
      className="relative mt-8 overflow-hidden border-t border-white/10 bg-[#030508] px-5 pb-8 pt-0 sm:mt-12 sm:px-8 sm:pb-10"
      data-footer-effect={footerEffect}
      onPointerMove={moveLight}
      ref={footerRef}
      style={
        {
          "--footer-pointer-x": "24%",
          "--footer-pointer-y": "48%",
        } as FooterPointerStyles
      }
    >
      <div
        aria-hidden="true"
        className="footer-touch-ambient pointer-events-none absolute inset-0"
        style={{ background: touchAmbientBackground }}
      />
      {isSoulEffect ? (
        <>
          <div
            aria-hidden="true"
            className="footer-pointer-glow pointer-events-none absolute left-0 top-0 h-[620px] w-[620px] rounded-full opacity-100 transition-opacity duration-500 motion-reduce:opacity-0"
            style={{
              background:
                "radial-gradient(circle, rgba(255, 246, 215, 0.13), rgba(214, 171, 92, 0.055) 34%, transparent 70%)",
              transform:
                "translate3d(calc(var(--footer-pointer-x) - 50%), calc(var(--footer-pointer-y) - 50%), 0)",
              willChange: "transform",
            }}
          />
          <div
            aria-hidden="true"
            className="footer-pointer-entity pointer-events-none absolute left-0 top-0 h-10 w-10 motion-reduce:hidden"
            style={{
              transform:
                "translate3d(calc(var(--footer-pointer-x) - 50%), calc(var(--footer-pointer-y) - 50%), 0)",
              willChange: "transform",
            }}
          >
            <span className="soul-orb absolute inset-0">
              <span className="soul-orb__aura absolute -inset-8 rounded-full" />
              <span className="soul-orb__orbit soul-orb__orbit--one absolute inset-0 rounded-full" />
              <span className="soul-orb__orbit soul-orb__orbit--two absolute inset-1 rounded-full" />
              <span className="soul-orb__core absolute inset-[9px] overflow-hidden rounded-full">
                <span className="soul-orb__highlight absolute left-[22%] top-[18%] h-[34%] w-[34%] rounded-full" />
                <span className="soul-orb__ember absolute bottom-[8%] right-[4%] h-[45%] w-[45%] rounded-full" />
              </span>
            </span>
          </div>
        </>
      ) : (
        <>
          <div
            aria-hidden="true"
            className="footer-pointer-glow pointer-events-none absolute left-0 top-0 h-[680px] w-[680px] rounded-full opacity-100 transition-opacity duration-500 motion-reduce:opacity-0"
            style={{
              background:
                "radial-gradient(circle, rgba(255, 49, 29, 0.2), rgba(169, 25, 13, 0.075) 34%, transparent 70%)",
              transform:
                "translate3d(calc(var(--footer-pointer-x) - 50%), calc(var(--footer-pointer-y) - 50%), 0)",
              willChange: "transform",
            }}
          />
          <div
            aria-hidden="true"
            className="footer-pointer-entity pointer-events-none absolute left-0 top-0 h-1.5 w-1.5 rounded-full bg-[#ff4b36] opacity-65 shadow-[0_0_14px_4px_rgba(255,61,39,0.4)] motion-reduce:hidden"
            style={{
              transform:
                "translate3d(calc(var(--footer-pointer-x) - 50%), calc(var(--footer-pointer-y) - 50%), 0)",
              willChange: "transform",
            }}
          />
        </>
      )}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(700px circle at 92% 38%, rgba(18, 37, 63, 0.12), transparent 68%)",
        }}
      />

      <div className="relative mx-auto max-w-[1540px]">
        <div className="flex min-h-[96px] flex-col justify-center gap-5 border-b border-white/10 py-7 text-xs sm:flex-row sm:items-center sm:justify-between sm:py-0">
          <div className="flex items-center gap-4">
            <span className="h-2 w-2 rounded-full bg-[#ff3826] shadow-[0_0_18px_rgba(255,56,38,0.7)]" />
            <span className="font-semibold uppercase tracking-[0.2em] text-white/74">
              Based in {location || "available worldwide"}
            </span>
          </div>
          <span className="border-white/10 font-medium uppercase tracking-[0.17em] text-white/48 sm:border-l sm:pl-7">
            {publicTagline}
          </span>
        </div>

        <div className="grid gap-14 py-14 lg:grid-cols-[minmax(0,0.92fr)_minmax(500px,1.08fr)] lg:gap-0 lg:py-14 xl:py-16">
          <div className="relative flex flex-col items-start lg:pr-14 xl:pr-20">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#ff4431]">
              Let&apos;s make something
            </p>
            <h2 className="heading-ui mt-7 max-w-[670px] text-[3.45rem] font-medium leading-[0.98] tracking-[-0.045em] text-white sm:text-7xl xl:text-[5.5rem]">
              Ready for the next story
              <span className="text-[#ff3c28]">.</span>
            </h2>
            <p className="mt-8 max-w-[510px] text-base leading-7 text-white/52 sm:text-lg">
              {publicContactBlurb}
            </p>

            <div className="mt-11 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <Link className={primaryButtonClass} href="/booking">
                <span
                  aria-hidden="true"
                  className="absolute inset-y-[-70%] left-[-45%] w-1/3 rotate-12 bg-gradient-to-r from-transparent via-white/12 to-transparent transition-transform duration-1000 ease-out group-hover:translate-x-[440%] motion-reduce:hidden"
                />
                <FaEnvelope aria-hidden="true" className="relative shrink-0" />
                <span className="relative">Work together</span>
                <FaArrowRight
                  aria-hidden="true"
                  className="relative shrink-0 text-xs transition-transform duration-500 ease-out group-hover:translate-x-1 motion-reduce:transform-none"
                />
              </Link>

              <Link className={secondaryButtonClass} href="/video">
                <FaPlay
                  aria-hidden="true"
                  className="text-xs transition-transform duration-500 ease-out group-hover:scale-105 motion-reduce:transform-none"
                />
                Showreel
              </Link>
            </div>
          </div>

          <div className="border-white/10 lg:border-l lg:pl-14 xl:pl-20">
            <div className="mb-8 flex items-end justify-between gap-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/42">
                  Elsewhere
                </p>
                <span className="mt-3 block h-px w-8 bg-[#ff3f2c]" />
                <h3 className="heading-ui mt-6 text-3xl font-medium tracking-[-0.03em] text-white sm:text-4xl">
                  Watch, listen &amp; connect
                </h3>
              </div>
              {socialItems.length ? (
                <span className="pb-1 text-xs tabular-nums text-white/32">
                  {String(socialItems.length).padStart(2, "0")} profiles
                </span>
              ) : null}
            </div>

            {socialItems.length ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {socialItems.map((link, index) => {
                  const platform = detectSocialPlatform(
                    link.iconKey,
                    link.platform,
                    link.href,
                    link.label
                  );
                  const platformDefinition =
                    getSocialPlatformDefinition(platform);
                  const supportingLabel =
                    link.label.toLowerCase() ===
                    platformDefinition.label.toLowerCase()
                      ? "Official profile"
                      : platformDefinition.label;

                  return (
                    <a
                      aria-label={`${link.label} — opens in a new tab`}
                      className="group relative flex min-h-[94px] items-center gap-4 overflow-hidden rounded-[17px] border border-white/12 bg-gradient-to-br from-white/[0.055] to-white/[0.022] px-5 py-4 transition-[transform,border-color,background-color,box-shadow] duration-500 ease-out hover:-translate-y-0.5 hover:border-[#ff4b37]/25 hover:bg-white/[0.065] hover:shadow-[0_12px_36px_rgba(0,0,0,0.24)] active:translate-y-0 motion-reduce:transform-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff5947]"
                      data-platform={platform}
                      href={link.href}
                      key={link.id}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <span
                        aria-hidden="true"
                        className="absolute inset-x-0 bottom-0 h-px origin-left scale-x-0 bg-gradient-to-r from-[#ff402c]/70 to-transparent transition-transform duration-700 ease-out group-hover:scale-x-100 motion-reduce:transform-none"
                      />
                      <SocialPlatformIcon
                        className="grid h-14 w-14 shrink-0 place-items-center rounded-full border border-[#ff4b37]/30 bg-black/30 text-xl text-white transition-[transform,border-color,background-color] duration-500 ease-out group-hover:scale-[1.025] group-hover:border-[#ff5c48]/45 group-hover:bg-[#ff3e29]/[0.07] motion-reduce:transform-none"
                        href={link.href}
                        iconKey={link.iconKey}
                        label={link.label}
                        platform={link.platform}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-base font-semibold text-white">
                          {link.label}
                        </span>
                        <span className="mt-1 block text-sm text-white/38">
                          {supportingLabel}
                        </span>
                      </span>
                      <span className="grid h-8 w-8 shrink-0 place-items-center text-xs text-white/36 transition-[transform,color] duration-500 ease-out group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[#ff6a57] motion-reduce:transform-none">
                        <FaExternalLinkAlt aria-hidden="true" />
                      </span>
                      <span className="sr-only">Link {index + 1}</span>
                    </a>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-[20px] border border-dashed border-white/14 bg-white/[0.025] p-6 text-sm leading-6 text-white/42">
                Social profiles can be added from the Footer Links section in
                the admin panel.
              </div>
            )}
          </div>
        </div>

        <div className="relative h-px bg-white/10">
          <span className="absolute left-1/2 top-1/2 h-px w-56 -translate-x-1/2 -translate-y-1/2 bg-gradient-to-r from-transparent via-[#ff4a35] to-transparent" />
          <span className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-[#ff5a43] shadow-[0_0_16px_4px_rgba(255,75,53,0.42)]" />
        </div>

        <div className="flex flex-col gap-5 pb-2 pt-8 text-xs text-white/38 md:flex-row md:items-center md:justify-between">
          <span>
            © {currentYear} {artistName}. All rights reserved.
          </span>
          <nav aria-label="Legal" className="flex items-center gap-5">
            <Link className="transition-colors hover:text-white" href="/privacy">
              Privacy
            </Link>
            <Link className="transition-colors hover:text-white" href="/terms">
              Terms
            </Link>
          </nav>
          <Link
            className="group inline-flex items-center gap-5 font-display text-xs font-semibold uppercase tracking-[0.28em] text-white/76 transition-colors hover:text-white"
            href="/"
          >
            {artistName}
            <span
              aria-hidden="true"
              className="text-lg text-[#ff3f2c] transition-transform duration-700 ease-out group-hover:rotate-45 group-hover:scale-110 motion-reduce:transform-none"
            >
              ✦
            </span>
          </Link>
        </div>
      </div>
    </footer>
  );
}
