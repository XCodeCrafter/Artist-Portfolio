import ContactPreviewRuntime from "@/components/admin/v2/ContactPreviewRuntime";
import { getAdminContactEditorData } from "@/lib/admin/contact";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Contact preview",
  robots: { index: false, follow: false },
};

export default async function AdminV2ContactPreviewPage() {
  const data = await getAdminContactEditorData();
  return <ContactPreviewRuntime initialSnapshot={data.snapshot} />;
}
