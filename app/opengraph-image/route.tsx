import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getPortfolioContent } from "@/lib/content";
import SocialPreviewCard from "@/components/seo/SocialPreviewCard";
import { resolveSiteSharing, SOCIAL_IMAGE_SIZE } from "@/lib/site-sharing-preview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// This is a normal route, deliberately not file-convention metadata: Next's
// generated file metadata must not override the owner's custom og:image.
export async function GET() {
  const content = await getPortfolioContent();
  const sharing = resolveSiteSharing(content.settings);
  // Only this bundled asset is read. Never fetch URLs supplied in query strings
  // or owner-authored content on the server (including same-origin /api paths).
  const background = await readFile(path.join(process.cwd(), "public/images/home-editorial/press-social.jpg"));
  return new ImageResponse(
    <SocialPreviewCard brandName={sharing.brandName} title={sharing.title} backgroundSrc={`data:image/jpeg;base64,${background.toString("base64")}`} />,
    {
      ...SOCIAL_IMAGE_SIZE,
      headers: {
        "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=60",
        "X-Content-Type-Options": "nosniff",
      },
    }
  );
}
