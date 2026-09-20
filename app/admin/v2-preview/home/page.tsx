import HomePreviewRuntime from "@/components/admin/v2/HomePreviewRuntime";
import { getAdminHomeEditorData } from "@/lib/admin/home";
import { getPublishedCncPrograms } from "@/lib/content/cnc-programs.server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Home preview", robots: { index: false, follow: false } };

export default async function AdminV2HomePreviewPage() {
  const [data, programs] = await Promise.all([getAdminHomeEditorData(), getPublishedCncPrograms()]);
  return <HomePreviewRuntime initialSnapshot={data.snapshot} programs={programs} />;
}
