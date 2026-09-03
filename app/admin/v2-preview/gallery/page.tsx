import GalleryPreviewRuntime from "@/components/admin/v2/GalleryPreviewRuntime";
import { getAdminGalleryEditorData } from "@/lib/admin/gallery";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Gallery preview",
  robots: { index: false, follow: false },
};

export default async function AdminV2GalleryPreviewPage() {
  const data = await getAdminGalleryEditorData();
  return <GalleryPreviewRuntime initialSnapshot={data.snapshot} />;
}
