import AdminShell from "@/components/admin/AdminShell";
import ContentEditor from "@/components/admin/ContentEditor";
import { requireAdmin } from "@/lib/admin/auth";
import { getEditablePortfolioContent } from "@/lib/admin/content";
import { getMediaAssets } from "@/lib/admin/media";

export const metadata = {
  title: "Admin Content",
};

export const dynamic = "force-dynamic";

export default async function AdminContentPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const admin = await requireAdmin();
  const params = await searchParams;
  const [contentResult, mediaResult] = await Promise.all([
    getEditablePortfolioContent(),
    getMediaAssets(),
  ]);
  const { content, isConfigured, loadError } = contentResult;

  return (
    <AdminShell
      active="content"
      adminEmail={admin.email}
      description="Edit every public content area from a clear page map. Home and Bio live here; Gallery and Showreel link directly to their media studios."
      portfolioType={content.settings.portfolioType}
      title="Content Studio"
    >
      <ContentEditor
        content={content}
        assets={mediaResult.assets}
        isConfigured={isConfigured}
        loadError={loadError}
        status={params.status}
      />
    </AdminShell>
  );
}
