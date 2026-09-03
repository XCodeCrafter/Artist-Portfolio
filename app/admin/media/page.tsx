import AdminShell from "@/components/admin/AdminShell";
import MediaManager, {
  type MediaMode,
} from "@/components/admin/MediaManager";
import { requireAdmin } from "@/lib/admin/auth";
import { getEditablePortfolioContent } from "@/lib/admin/content";
import { getAdminGalleryEditorData } from "@/lib/admin/gallery";
import { getMediaAssets } from "@/lib/admin/media";
import { getAdminShowreelEditorData } from "@/lib/admin/showreel";

export const metadata = {
  title: "Admin Media",
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AdminMediaPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; view?: string }>;
}) {
  const admin = await requireAdmin();
  const params = await searchParams;
  const [mediaResult, contentResult, galleryV2, showreelV2] = await Promise.all([
    getMediaAssets({ includeDeleted: true }),
    getEditablePortfolioContent(),
    getAdminGalleryEditorData(),
    getAdminShowreelEditorData(),
  ]);
  const portfolioType = contentResult.content.settings.portfolioType;
  const requestedMode = ["studio", "showreel", "library"].includes(
    params.view || ""
  )
    ? (params.view as MediaMode)
    : undefined;
  const initialMode: MediaMode =
    requestedMode || "studio";

  return (
    <AdminShell
      active="media"
      adminEmail={admin.email}
      description="Upload and organize photos and video, then shape the public Gallery and Showreel in dedicated visual studios."
      hiddenNavPageSlugs={contentResult.content.settings.hiddenNavPageSlugs}
      navigationConfigVersion={
        contentResult.content.settings.navigationConfigVersion
      }
      navigationDestinationCount={contentResult.content.navigation.items.length}
      portfolioType={portfolioType}
      title="Media library"
    >
      <MediaManager
        assets={mediaResult.assets}
        content={contentResult.content}
        contentIsConfigured={contentResult.isConfigured}
        contentLoadError={contentResult.loadError}
        galleryV2Enabled={
          galleryV2.isConfigured &&
          !galleryV2.migrationRequired &&
          !galleryV2.loadError
        }
        isConfigured={mediaResult.isConfigured}
        initialMode={initialMode}
        loadError={mediaResult.loadError}
        portfolioType={portfolioType}
        showreelV2Enabled={
          showreelV2.isConfigured &&
          !showreelV2.migrationRequired &&
          !showreelV2.loadError
        }
        status={params.status}
      />
    </AdminShell>
  );
}
