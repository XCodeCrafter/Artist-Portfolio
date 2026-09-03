import MusicPreviewRuntime from "@/components/admin/v2/MusicPreviewRuntime";
import { getAdminMusicEditorData } from "@/lib/admin/music";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Music preview",
  robots: { index: false, follow: false },
};

export default async function AdminV2MusicPreviewPage() {
  const data = await getAdminMusicEditorData();
  return <MusicPreviewRuntime initialSnapshot={data.snapshot} />;
}
