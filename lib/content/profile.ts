import type { PageSlug, PortfolioType } from "./types";
import { getVisibleNavigationModules } from "./modules";

export const PORTFOLIO_TYPES: PortfolioType[] = ["musician", "actor"];

export function normalizePortfolioType(value?: string | null): PortfolioType {
  return value === "actor" ? "actor" : "musician";
}

export function getProfileNav(
  type: PortfolioType,
  hiddenNavPageSlugs: readonly PageSlug[] = []
) {
  return getVisibleNavigationModules(type, hiddenNavPageSlugs).map((module) => ({
    label: module.label,
    href: module.href,
  }));
}

export function getProfileCopy(type: PortfolioType) {
  if (type === "actor") {
    return {
      footerBody:
        "Explore the gallery, showreel, credits, and send a note if you want to work together.",
      primaryCta: "Let's Work Together",
      secondaryCta: "Watch Showreel",
      secondaryHref: "/video",
      secondaryLabel: "Watch showreel",
      homeFeatureHeading: "SHOWREEL",
      homeFeatureHref: "/video",
      homeFeatureLabel: "View Showreel",
    };
  }

  return {
    footerBody:
      "Follow the journey. Explore releases. Send a booking inquiry or just say hi.",
    primaryCta: "Booking",
    secondaryCta: "Play on Spotify",
    secondaryHref: "",
    secondaryLabel: "Play on Spotify",
    homeFeatureHeading: "MUSIC",
    homeFeatureHref: "/music",
    homeFeatureLabel: "View All Music",
  };
}
