import HomeEditor from "@/components/admin/v2/HomeEditor";
import { requireAdmin } from "@/lib/admin/auth";
import { getAdminHomeEditorData } from "@/lib/admin/home";
import { getMediaAssets } from "@/lib/admin/media";

export const metadata = { title: "Home page · Admin V2" };
export const dynamic = "force-dynamic";

export default async function AdminV2HomePage() {
  await requireAdmin();
  const [home, media] = await Promise.all([getAdminHomeEditorData(), getMediaAssets()]);
  return <div className="grid gap-4">
    <header className="rounded-[26px] border border-white/9 bg-[#0d0d0f]/88 p-5 backdrop-blur-2xl sm:p-6">
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/40">Admin V2 · Visual page editor</p>
      <h1 className="heading-ui mt-3 text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl">Your Home, your story.</h1>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-white/50">Choose the sections visitors see and their order. Click a section in the preview to edit its words, images, or video.</p>
    </header>
    <HomeEditor assets={media.assets} snapshot={home.snapshot}
      disabled={!home.isConfigured || home.migrationRequired || Boolean(home.loadError)}
      migrationRequired={home.migrationRequired} loadError={home.loadError} mediaLoadError={media.loadError} />
  </div>;
}
