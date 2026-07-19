import AdminShell from "@/components/admin/AdminShell";
import MediaManager, {
  type MediaMode,
} from "@/components/admin/MediaManager";
import { requireAdmin } from "@/lib/admin/auth";
import { getEditablePortfolioContent } from "@/lib/admin/content";
import { getMediaAssets } from "@/lib/admin/media";

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
  const initialMode: MediaMode = ["studio", "showreel", "library"].includes(
    params.view || ""
  )
    ? (params.view as MediaMode)
    : "studio";
  const [mediaResult, contentResult] = await Promise.all([
    getMediaAssets(),
    getEditablePortfolioContent(),
  ]);

  return (
    <AdminShell
      active="media"
      adminEmail={admin.email}
      description="Upload assets, manage storage metadata, and decide which photos appear in the public gallery from one place."
      portfolioType={contentResult.content.settings.portfolioType}
      title="Media Hub"
    >
      <MediaManager
        assets={mediaResult.assets}
        content={contentResult.content}
        contentIsConfigured={contentResult.isConfigured}
        contentLoadError={contentResult.loadError}
        isConfigured={mediaResult.isConfigured}
        initialMode={initialMode}
        loadError={mediaResult.loadError}
        portfolioType={contentResult.content.settings.portfolioType}
        status={params.status}
      />
    </AdminShell>
  );
}
