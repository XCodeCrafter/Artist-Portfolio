import AdminV2Shell from "@/components/admin/v2/AdminV2Shell";
import { requireAdmin } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

export default async function AdminV2Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await requireAdmin();
  return <AdminV2Shell adminEmail={admin.email}>{children}</AdminV2Shell>;
}
