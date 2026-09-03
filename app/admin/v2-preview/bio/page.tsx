import BioPreviewRuntime from "@/components/admin/v2/BioPreviewRuntime";
import { getAdminBioEditorData } from "@/lib/admin/bio";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Bio preview",
  robots: { index: false, follow: false },
};

export default async function AdminV2BioPreviewPage() {
  const data = await getAdminBioEditorData();
  return <BioPreviewRuntime initialSnapshot={data.snapshot} />;
}
