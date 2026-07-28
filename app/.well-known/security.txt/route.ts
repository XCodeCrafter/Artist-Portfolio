import { getSiteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

const EXPIRY_DAYS = 180;
const DEFAULT_SECURITY_CONTACT = "xcodecrafter@gmail.com";

function getSecurityContact() {
  const configured = (process.env.SECURITY_CONTACT_EMAIL || "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(configured)
    ? configured
    : DEFAULT_SECURITY_CONTACT;
}

export function GET() {
  const base = getSiteUrl();
  const contact = getSecurityContact();
  const expires = new Date(
    Date.now() + EXPIRY_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();
  const body = [
    `Contact: mailto:${contact}`,
    `Expires: ${expires}`,
    `Canonical: ${base}/.well-known/security.txt`,
    "Preferred-Languages: cs, en",
    "",
  ].join("\n");

  return new Response(body, {
    headers: {
      "Cache-Control": "public, max-age=86400",
      "Content-Type": "text/plain; charset=utf-8",
      "X-Robots-Tag": "noindex",
    },
  });
}
