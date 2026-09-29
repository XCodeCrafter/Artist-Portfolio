import HomePreviewRuntime from "@/components/admin/v2/HomePreviewRuntime";
import { getAdminHomeEditorData } from "@/lib/admin/home";
import { getPublishedCncPrograms } from "@/lib/content/cnc-programs.server";
import { getPortfolioContent } from "@/lib/content";

export const dynamic = "force-dynamic";
export const metadata = { title: "Home preview", robots: { index: false, follow: false } };

export default async function AdminV2HomePreviewPage() {
  const [data, programs, content] = await Promise.all([getAdminHomeEditorData(), getPublishedCncPrograms(), getPortfolioContent()]);
  return <HomePreviewRuntime initialSnapshot={data.snapshot} programs={programs} sectionTransitionsEnabled={content.settings.homeSectionTransitionsEnabled} />;
}
