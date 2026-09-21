import MediaLibraryEditor from "@/components/admin/v2/MediaLibraryEditor";
import { requireAdmin } from "@/lib/admin/auth";
import { getMediaLibraryV2Data } from "@/lib/admin/media-library";

export const metadata = { title: "Media library · Admin V2" };
export const dynamic = "force-dynamic";

export default async function MediaLibraryPage() {
  await requireAdmin();
  const data = await getMediaLibraryV2Data();
  return <div className="grid gap-5">
    <header className="rounded-[26px] border border-white/10 bg-[#0d0d0f] p-6">
      <p className="text-[10px] uppercase tracking-[0.22em] text-white/40">Admin V2 · Media</p>
      <h1 className="heading-ui mt-3 text-3xl font-semibold text-white">Your media library</h1>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">Upload once, then choose files in any page editor. Select a thumbnail to see its details, where it is used, and safe removal options.</p>
    </header>
    <MediaLibraryEditor assets={data.assets} usage={data.usage} usageError={data.usageError} posters={data.posters} referenceTime={data.referenceTime}
      disabled={!data.isConfigured || Boolean(data.loadError)} loadError={data.loadError} />
  </div>;
}
