import PressPreviewRuntime from "@/components/admin/v2/PressPreviewRuntime";
import { requireAdmin } from "@/lib/admin/auth";
import { getAdminPressEditorData } from "@/lib/admin/press";

export const dynamic = "force-dynamic";
export const metadata = { title: "Press preview", robots: { index: false, follow: false } };

export default async function AdminV2PressPreviewPage() {
  await requireAdmin();
  const data = await getAdminPressEditorData();
  return <PressPreviewRuntime initialDraft={data.snapshot.draft} />;
}
