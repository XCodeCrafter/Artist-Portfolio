import AdminShell from "@/components/admin/AdminShell";
import ContentEditor from "@/components/admin/ContentEditor";
import { requireAdmin } from "@/lib/admin/auth";
import { getEditableCncPrograms } from "@/lib/admin/cnc-programs";
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
  const [contentResult, mediaResult, cncResult] = await Promise.all([
    getEditablePortfolioContent(),
    getMediaAssets(),
    getEditableCncPrograms(),
  ]);
  const { content, isConfigured, loadError } = contentResult;

  return (
    <AdminShell
      active="content"
      adminEmail={admin.email}
      description="Edit the portfolio the way visitors experience it: page by page, section by section, with a visual mirror beside every form."
      hiddenNavPageSlugs={content.settings.hiddenNavPageSlugs}
      portfolioType={content.settings.portfolioType}
      title="Site editor"
    >
      <ContentEditor
        content={content}
        assets={mediaResult.assets}
        cncIsConfigured={cncResult.isConfigured}
        cncLoadError={cncResult.loadError}
        cncMigrationRequired={cncResult.migrationRequired}
        cncPrograms={cncResult.programs}
        isConfigured={isConfigured}
        loadError={loadError}
        status={params.status}
      />
    </AdminShell>
  );
}
