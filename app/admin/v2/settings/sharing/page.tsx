import Link from "next/link";
import SiteSharingEditor from "@/components/admin/v2/SiteSharingEditor";
import { requireAdmin } from "@/lib/admin/auth";
import { getMediaAssets } from "@/lib/admin/media";
import { getAdminSharingData } from "@/lib/admin/site-sharing";
import { getPortfolioContent } from "@/lib/content";
import { getSiteUrl } from "@/lib/site-url";

export const metadata = { title: "Sharing & SEO · Admin V2" };
export const dynamic = "force-dynamic";

export default async function AdminV2SharingPage() {
  await requireAdmin();
  const [data, media, content] = await Promise.all([getAdminSharingData(), getMediaAssets(), getPortfolioContent()]);
  return <div className="grid min-w-0 gap-4">
    <header className="rounded-[26px] border border-white/10 bg-[#0d0d0f] p-5 sm:p-7">
      <p className="text-[10px] uppercase tracking-[0.2em] text-[#ff806c]">Admin V2 · Site-wide</p>
      <h1 className="heading-ui mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Make a good first impression.</h1>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-white/45">Choose the words and cover people see when your website is shared on WhatsApp, Messenger and other apps. These settings do not change your Home page content.</p>
      <div className="mt-4 flex flex-wrap gap-4 text-xs text-white/60"><Link href="/admin/v2/settings" className="underline underline-offset-4">All settings</Link><Link href="/admin/v2/settings/appearance" className="underline underline-offset-4">Profile &amp; site description</Link><Link href="/admin/v2/navigation" className="underline underline-offset-4">Owner name</Link></div>
    </header>
    <SiteSharingEditor data={data} assets={media.assets} artistName={content.settings.artistName} description={content.settings.description} siteUrl={getSiteUrl()} mediaLoadError={media.loadError} />
  </div>;
}
