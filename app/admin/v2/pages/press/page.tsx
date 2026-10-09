import PressEditor from "@/components/admin/v2/PressEditor";
import { requireAdmin } from "@/lib/admin/auth";
import { getAdminPressEditorData } from "@/lib/admin/press";
import { getMediaAssets } from "@/lib/admin/media";

export const metadata = { title: "Press & reviews · Admin V2" };
export const dynamic = "force-dynamic";

export default async function AdminV2PressPage() {
  await requireAdmin();
  const [press, media] = await Promise.all([getAdminPressEditorData(), getMediaAssets()]);
  return <div className="grid gap-4">
    <header className="rounded-[26px] border border-white/9 bg-[#0d0d0f]/88 p-5 backdrop-blur-2xl sm:p-6">
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/40">Admin V2 · Visual page editor</p>
      <h1 className="heading-ui mt-3 text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl">Press &amp; reviews</h1>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-white/50">Manage the heading, introduction, and up to 20 reviews, interviews, articles, and radio features on your Press page. Select an item to edit it; the preview shows all visible items. Save when ready to publish.</p>
    </header>
    <PressEditor assets={media.assets} snapshot={press.snapshot} disabled={!press.isConfigured || press.migrationRequired || Boolean(press.loadError)}
      migrationRequired={press.migrationRequired} loadError={press.loadError} mediaLoadError={media.loadError} />
  </div>;
}
