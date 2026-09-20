import Link from "next/link";
import AppearanceEditor from "@/components/admin/v2/AppearanceEditor";
import { getAdminAppearanceData } from "@/lib/admin/site-appearance";
import { getPortfolioContent } from "@/lib/content";

export const metadata = { title: "Appearance · Admin V2" };
export const dynamic = "force-dynamic";

export default async function AdminV2AppearancePage() {
  const data = await getAdminAppearanceData();
  const content = await getPortfolioContent();
  return <div className="grid min-w-0 gap-4">
    <header className="rounded-[26px] border border-white/10 bg-[#0d0d0f] p-5 sm:p-7">
      <p className="text-[10px] uppercase tracking-[0.2em] text-[#ff806c]">Admin V2 · Site-wide</p>
      <h1 className="heading-ui mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Appearance</h1>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-white/45">One place for typography and the interactive footer. Preview first, publish when ready. Your content and section layout stay intact.</p>
      <div className="mt-4 flex flex-wrap gap-4 text-xs text-white/60"><Link href="/admin/v2/navigation" className="underline underline-offset-4">Change owner name in Navbar</Link><Link href="/admin/content#settings" className="underline underline-offset-4">Advanced brand copy · Classic editor</Link></div>
    </header>
    <AppearanceEditor data={data} settings={content.settings} socialLinks={content.socialLinks} />
  </div>;
}
