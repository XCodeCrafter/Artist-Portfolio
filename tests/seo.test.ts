import { describe, expect, it } from "vitest";
import { FALLBACK_CONTENT } from "@/lib/content/fallback";
import {
  createBioJsonLd,
  getPageSeo,
  getSeoIdentity,
} from "@/lib/seo";

function contentFor(
  portfolioType: "actor" | "musician",
  description = FALLBACK_CONTENT.settings.description
) {
  return {
    ...FALLBACK_CONTENT,
    settings: {
      ...FALLBACK_CONTENT.settings,
      portfolioType,
      description,
    },
  };
}

describe("mixed public SEO", () => {
  it("does not change public labels or descriptions with the legacy profile", () => {
    const actor = contentFor("actor");
    const musician = contentFor("musician");

    for (const page of [
      "home",
      "bio",
      "gallery",
      "music",
      "video",
      "booking",
    ] as const) {
      expect(getPageSeo(actor, page)).toMatchObject({
        label: getPageSeo(musician, page).label,
        description: getPageSeo(musician, page).description,
      });
    }
  });

  it("replaces old single-discipline defaults but keeps mixed custom copy", () => {
    const legacy = contentFor(
      "musician",
      "Official music portfolio with releases and Spotify links."
    );
    const custom = contentFor(
      "actor",
      "A personal archive of acting, music, and collaborative experiments."
    );

    expect(getSeoIdentity(legacy).description).toContain(
      "actor and musician portfolio"
    );
    expect(getSeoIdentity(custom).description).toBe(
      custom.settings.description
    );
  });

  it("publishes both occupations in Person structured data", () => {
    const jsonLd = createBioJsonLd(contentFor("actor"));
    const person = jsonLd["@graph"].find(
      (node) => node["@type"] === "Person"
    );

    expect(person).toMatchObject({
      jobTitle: ["Actor", "Musician"],
      hasOccupation: [
        { "@type": "Occupation", name: "Actor" },
        { "@type": "Occupation", name: "Musician" },
      ],
    });
  });
});
