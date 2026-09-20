import AdminShell from "@/components/admin/AdminShell";
import ContentEditor from "@/components/admin/ContentEditor";
import { requireAdmin } from "@/lib/admin/auth";
import { getEditableCncPrograms } from "@/lib/admin/cnc-programs";
import { getAdminContactEditorData } from "@/lib/admin/contact";
import { getEditablePortfolioContent } from "@/lib/admin/content";
import { getAdminHomeEditorData } from "@/lib/admin/home";
import { getAdminBioEditorData } from "@/lib/admin/bio";
import { getAdminMusicEditorData } from "@/lib/admin/music";
import { getAdminNavbarSocialLinksData } from "@/lib/admin/navbar-social-links";
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
  const [contentResult, mediaResult, cncResult, contactResult, homeResult, bioResult, musicResult, socialResult] = await Promise.all([
    getEditablePortfolioContent(),
    getMediaAssets(),
    getEditableCncPrograms(),
    getAdminContactEditorData(),
    getAdminHomeEditorData(),
    getAdminBioEditorData(),
    getAdminMusicEditorData(),
    getAdminNavbarSocialLinksData(),
  ]);
  const { content, isConfigured, loadError } = contentResult;

  return (
    <AdminShell
      active="content"
      adminEmail={admin.email}
      description="Edit the portfolio the way visitors experience it: page by page, section by section, with a visual mirror beside every form."
      hiddenNavPageSlugs={content.settings.hiddenNavPageSlugs}
      navigationConfigVersion={content.settings.navigationConfigVersion}
      navigationDestinationCount={content.navigation.items.length}
      portfolioType={content.settings.portfolioType}
      title="Site editor"
    >
      <ContentEditor
        content={content}
        contactV2Enabled={
          contactResult.isConfigured && !contactResult.migrationRequired
        }
        homeV2Enabled={homeResult.isConfigured && !homeResult.migrationRequired}
        bioV2Enabled={bioResult.isConfigured && !bioResult.migrationRequired}
        musicV2Enabled={musicResult.isConfigured && !musicResult.migrationRequired}
        socialV2Enabled={socialResult.isConfigured && !socialResult.migrationRequired}
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
