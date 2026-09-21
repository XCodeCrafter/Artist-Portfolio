import Link from "next/link";
import CncProgramsEditor from "@/components/admin/v2/CncProgramsEditor";
import { requireAdmin } from "@/lib/admin/auth";
import { getEditableCncPrograms } from "@/lib/admin/cnc-programs";
import { createCncProgramsSnapshot } from "@/lib/admin/cnc-program-editor";
import { getAdminHomeEditorData } from "@/lib/admin/home";

export const metadata = { title: "Code programs · Home · Admin V2" };
export const dynamic = "force-dynamic";

export default async function CncProgramsPage() {
  await requireAdmin();
  const [data, home] = await Promise.all([getEditableCncPrograms(), getAdminHomeEditorData()]);
  return <div className="grid min-w-0 gap-4">
    <header className="rounded-[26px] border border-white/10 bg-[#0d0d0f] p-5 sm:p-7">
      <Link href="/admin/v2/pages/home" className="text-xs text-white/60 underline underline-offset-4">← Home page editor</Link>
      <p className="mt-5 text-[10px] uppercase tracking-[0.2em] text-[#ff806c]">Home · Code in motion</p>
      <h1 className="heading-ui mt-2 text-3xl font-semibold">Code programs</h1>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-white/45">Select the program you recognize in the preview, then edit it on the right. Visibility, source, and order save together. This is a read-only portfolio showcase, not a machine controller.</p>
    </header>
    <CncProgramsEditor
      snapshot={createCncProgramsSnapshot(data.programs)}
      disabled={!data.isConfigured || data.migrationRequired || Boolean(data.loadError)}
      loadError={data.loadError || (data.migrationRequired ? "Apply migration 0024 to enable program editing." : !data.isConfigured ? "Supabase admin access is not configured." : "")}
      copy={home.snapshot.draft.cnc}
      homeSectionHidden={!home.snapshot.draft.layout.find((section) => section.id === "cnc")?.enabled}
    />
  </div>;
}
