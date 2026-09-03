import { getPortfolioContent } from "@/lib/content";
import { PUBLIC_PORTFOLIO_PAGE_DESTINATIONS } from "@/lib/content/navigation";
import { getMixedPublicCopy } from "@/lib/content/public-copy";
import { getSeoIdentity } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

function inlineText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export async function GET() {
  const base = getSiteUrl();
  const content = await getPortfolioContent();
  const seoIdentity = getSeoIdentity(content);
  const artistName = inlineText(seoIdentity.brandName);
  const personName = inlineText(seoIdentity.personName);
  const description = inlineText(seoIdentity.description);
  const tagline = inlineText(
    getMixedPublicCopy(
      content.settings.tagline,
      "Acting / Music / Creative Work"
    )
  );
  const location = inlineText(content.settings.location);
  const publicModules = [
    ...new Map(
      PUBLIC_PORTFOLIO_PAGE_DESTINATIONS.map((destination) => [
        destination.href,
        destination,
      ])
    ).values(),
  ];
  const lines = [
    `# ${artistName}`,
    "",
    `> ${description}`,
    "",
    personName !== artistName ? `Profile: ${personName}` : "",
    tagline ? `Focus: ${tagline}` : "",
    location ? `Location: ${location}` : "",
    "",
    "## Portfolio",
    "",
    ...publicModules.map(
      (module) =>
        `- [${module.defaultLabel}](${new URL(module.href, `${base}/`).href}): ${module.description}`
    ),
    "",
    "## Policies",
    "",
    `- [Privacy](${base}/privacy): Privacy information.`,
    `- [Terms](${base}/terms): Website terms.`,
  ].filter((line, index, all) => line || all[index - 1] !== "");

  return new Response(`${lines.join("\n")}\n`, {
    headers: {
      "Cache-Control": "public, max-age=300",
      "Content-Type": "text/plain; charset=utf-8",
      "X-Robots-Tag": "noindex",
    },
  });
}
