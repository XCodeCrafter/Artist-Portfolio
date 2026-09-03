import type { PortfolioType } from "@/lib/content";

export const INQUIRY_INTENTS = ["music", "acting", "general"] as const;
export type InquiryIntent = (typeof INQUIRY_INTENTS)[number];
export type LegacyInquiryType = "booking" | "collaboration";

export function isInquiryIntent(value: unknown): value is InquiryIntent {
  return INQUIRY_INTENTS.includes(value as InquiryIntent);
}

export function resolvePublicInquiryIntent(input: {
  inquiryIntent?: unknown;
  inquiryType?: unknown;
  portfolioType?: unknown;
}): InquiryIntent {
  if (isInquiryIntent(input.inquiryIntent)) return input.inquiryIntent;

  // Compatibility for a cached pre-mixed contact form.
  if (
    input.portfolioType === "actor" &&
    input.inquiryType === "collaboration"
  ) {
    return "acting";
  }
  if (input.portfolioType === "musician" && input.inquiryType === "booking") {
    return "music";
  }

  return "general";
}

export function getLegacyInquiryClassification(
  intent: InquiryIntent,
  configuredPortfolioType: PortfolioType
): { portfolioType: PortfolioType; inquiryType: LegacyInquiryType } {
  if (intent === "acting") {
    return { portfolioType: "actor", inquiryType: "collaboration" };
  }
  if (intent === "music") {
    return { portfolioType: "musician", inquiryType: "booking" };
  }

  return {
    portfolioType: configuredPortfolioType,
    inquiryType:
      configuredPortfolioType === "actor" ? "collaboration" : "booking",
  };
}

export function getInquiryIntentLabel(intent: InquiryIntent) {
  if (intent === "acting") return "Acting";
  if (intent === "music") return "Music";
  return "General";
}

export function getStoredInquiryLabel(inquiry: {
  inquiryIntent: InquiryIntent | "unresolved" | null;
  inquiryType: LegacyInquiryType | "unresolved" | null;
}) {
  if (inquiry.inquiryIntent && inquiry.inquiryIntent !== "unresolved") {
    return getInquiryIntentLabel(inquiry.inquiryIntent);
  }
  if (inquiry.inquiryIntent === "unresolved") return "Unknown intent";
  if (inquiry.inquiryType === "collaboration") return "Legacy collaboration";
  if (inquiry.inquiryType === "booking") return "Legacy booking";
  return inquiry.inquiryType === "unresolved"
    ? "Unknown legacy type"
    : "Legacy";
}
