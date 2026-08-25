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
  const [mediaResult, contentResult] = await Promise.all([
    getMediaAssets({ includeDeleted: true }),
    getEditablePortfolioContent(),
  ]);
  const portfolioType = contentResult.content.settings.portfolioType;
  const requestedMode = ["studio", "showreel", "library"].includes(
    params.view || ""
  )
    ? (params.view as MediaMode)
    : undefined;
  const initialMode: MediaMode =
    requestedMode === "studio" && portfolioType !== "actor"
      ? "showreel"
      : requestedMode || (portfolioType === "actor" ? "studio" : "showreel");

  return (
    <AdminShell
      active="media"
      adminEmail={admin.email}
      description={
        portfolioType === "actor"
          ? "Upload and organize photos and video, then shape the public Gallery or Showreel in a dedicated visual studio."
          : "Upload and organize artwork and video, then shape the public Video page in a dedicated visual studio."
      }
      hiddenNavPageSlugs={contentResult.content.settings.hiddenNavPageSlugs}
      portfolioType={portfolioType}
      title="Media library"
    >
      <MediaManager
        assets={mediaResult.assets}
        content={contentResult.content}
        contentIsConfigured={contentResult.isConfigured}
        contentLoadError={contentResult.loadError}
        isConfigured={mediaResult.isConfigured}
        initialMode={initialMode}
        loadError={mediaResult.loadError}
        portfolioType={portfolioType}
        status={params.status}
      />
    </AdminShell>
  );
}
