import { describe, expect, it } from "vitest";
import {
  getInquiryIntentLabel,
  getLegacyInquiryClassification,
  resolvePublicInquiryIntent,
} from "@/lib/inquiries";

describe("public inquiry intent", () => {
  it.each(["music", "acting", "general"] as const)(
    "preserves an explicit %s selection",
    (inquiryIntent) => {
      expect(
        resolvePublicInquiryIntent({
          inquiryIntent,
          inquiryType: "booking",
          portfolioType: "musician",
        })
      ).toBe(inquiryIntent);
    }
  );

  it("maps cached legacy forms without deriving new submissions from site mode", () => {
    expect(
      resolvePublicInquiryIntent({
        portfolioType: "actor",
        inquiryType: "collaboration",
      })
    ).toBe("acting");
    expect(
      resolvePublicInquiryIntent({
        portfolioType: "musician",
        inquiryType: "booking",
      })
    ).toBe("music");
    expect(resolvePublicInquiryIntent({ portfolioType: "actor" })).toBe(
      "general"
    );
  });

  it("keeps reversible legacy fields while treating intent as authoritative", () => {
    expect(getLegacyInquiryClassification("acting", "musician")).toEqual({
      portfolioType: "actor",
      inquiryType: "collaboration",
    });
    expect(getLegacyInquiryClassification("music", "actor")).toEqual({
      portfolioType: "musician",
      inquiryType: "booking",
    });
    expect(getLegacyInquiryClassification("general", "actor")).toEqual({
      portfolioType: "actor",
      inquiryType: "collaboration",
    });
    expect(getInquiryIntentLabel("general")).toBe("General");
  });
});
