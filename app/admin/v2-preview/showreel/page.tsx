import ShowreelPreviewRuntime from "@/components/admin/v2/ShowreelPreviewRuntime";
import { getAdminShowreelEditorData } from "@/lib/admin/showreel";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Showreel preview",
  robots: { index: false, follow: false },
};

export default async function AdminV2ShowreelPreviewPage() {
  const data = await getAdminShowreelEditorData();
  return <ShowreelPreviewRuntime initialSnapshot={data.snapshot} />;
}
