import MusicEditor from "@/components/admin/v2/MusicEditor";
import { requireAdmin } from "@/lib/admin/auth";
import { getMediaAssets } from "@/lib/admin/media";
import { getAdminMusicEditorData } from "@/lib/admin/music";

export const metadata = { title: "Music page · Admin V2" };
export const dynamic = "force-dynamic";

export default async function AdminV2MusicPage() {
  // Authenticate before either service-role loader starts work.
  await requireAdmin();
  const [music, media] = await Promise.all([
    getAdminMusicEditorData(),
    getMediaAssets(),
  ]);

  return (
    <div className="grid gap-4">
      <header className="rounded-[26px] border border-white/9 bg-[#0d0d0f]/88 p-5 shadow-[0_22px_80px_rgba(0,0,0,0.34)] backdrop-blur-2xl sm:p-6 lg:p-7">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/34">
            Admin V2
          </span>
          <span className="h-1 w-1 rounded-full bg-[#ff3b1f]" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-200/55">
            Visual page editor
          </span>
        </div>
        <h1 className="heading-ui mt-3 text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl">
          Music page
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-white/46">
          Click a real section in the preview, edit it in the inspector, and
          save only that section. Desktop and mobile use the same presentation
          as the public page, so you always see what you are changing.
        </p>
      </header>

      <MusicEditor
        assets={media.assets}
        disabled={
          !music.isConfigured ||
          music.migrationRequired ||
          Boolean(music.loadError)
        }
        loadError={music.loadError}
        mediaLoadError={media.loadError}
        migrationRequired={music.migrationRequired}
        snapshot={music.snapshot}
      />
    </div>
  );
}
