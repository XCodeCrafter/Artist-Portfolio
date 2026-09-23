import type { ImageKitReconciliationOverviewData } from "@/lib/admin/imagekit-reconciliation-overview-types";
import { formatMediaBytes } from "@/lib/admin/media-library-editor";

type Overview = Extract<ImageKitReconciliationOverviewData, { status: "available" }>["overview"];
type Item = Overview["items"][number];

const stages: Record<Item["stage"], { label: string; tone: string }> = {
  attention: { label: "Needs review", tone: "border-amber-300/20 bg-amber-300/5 text-amber-100" },
  due: { label: "Ready for a check", tone: "border-white/20 bg-white/5 text-white" },
  checking: { label: "Check in progress", tone: "border-white/10 bg-white/[0.03] text-white/75" },
  waiting: { label: "Waiting to check", tone: "border-white/10 bg-white/[0.03] text-white/65" },
  uploading: { label: "Upload window open", tone: "border-white/10 bg-white/[0.03] text-white/65" },
};
const stageOrder: Item["stage"][] = ["attention", "due", "checking", "waiting", "uploading"];

const observations: Record<NonNullable<Item["lastObservation"]>, string> = {
  absent: "File not found at the last check. This does not confirm it was deleted.",
  retry: "The last check was inconclusive. A retry is needed.",
  unsafe: "The last check needs manual review. No files were deleted.",
  exhausted: "Check limit reached. Manual review is needed.",
};

const unavailableCopy: Record<Extract<ImageKitReconciliationOverviewData, { status: "unavailable" }>["reason"], { title: string; description: string }> = {
  "not-configured": {
    title: "Upload status is not configured",
    description: "The database connection for this status panel is not configured. No upload counts are available.",
  },
  "migration-required": {
    title: "Database update required · 0050",
    description: "Apply and verify database migration 0050 to make this read-only overview available. Upload counts are unknown until then.",
  },
  "not-ready": {
    title: "Upload status needs a setup check",
    description: "The database safety checks are not ready. Review the ImageKit database setup before relying on this overview. No upload counts are available.",
  },
  unavailable: {
    title: "Upload status is temporarily unavailable",
    description: "The database snapshot could not be loaded. This does not mean there are no unfinished uploads. Existing media library tools are unchanged.",
  },
};

function formatTime(value: string) {
  return `${new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium", timeStyle: "short", timeZone: "UTC",
  }).format(new Date(value))} UTC`;
}

function UploadItem({ item }: { item: Item }) {
  const stage = stages[item.stage];
  return <li className="grid min-w-0 gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
    <div className="min-w-0">
      <h3 className="break-words text-sm font-medium text-white [overflow-wrap:anywhere]">{item.label}</h3>
      <p className="mt-1 text-xs text-white/45">{item.mediaType === "image" ? "Image" : "Video"} · {formatMediaBytes(item.sizeBytes)}</p>
      <span className={`mt-3 inline-block rounded-full border px-3 py-1 text-xs ${stage.tone}`}>{stage.label}</span>
    </div>
    <div className="min-w-0 text-xs leading-5 text-white/55">
      <p>{item.lastObservation ? observations[item.lastObservation] : "No recorded check result."}</p>
      <p className="mt-2">Check attempts: {item.attempts}</p>
      {item.nextCheckAt && <p className="mt-1">Eligible for a check from <time dateTime={item.nextCheckAt}>{formatTime(item.nextCheckAt)}</time>. This is not a scheduled run.</p>}
      <p className="mt-1 text-white/50">Last updated <time dateTime={item.updatedAt}>{formatTime(item.updatedAt)}</time></p>
    </div>
  </li>;
}

export default function ImageKitReconciliationOverview({ data }: { data: ImageKitReconciliationOverviewData }) {
  const overview = data.status === "available" ? data.overview : null;
  const unavailable = data.status === "unavailable" ? unavailableCopy[data.reason] : null;
  return <section aria-labelledby="imagekit-checks-heading" className="min-w-0 rounded-[26px] border border-white/10 bg-[#0d0d0f] p-5 sm:p-6">
    <div className="flex flex-wrap items-center gap-3">
      <h2 id="imagekit-checks-heading" className="heading-ui text-lg font-semibold text-white">ImageKit upload checks</h2>
      <span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-white/45">Read-only</span>
    </div>
    <p className="mt-2 text-xs leading-6 text-white/55">Automatic checks are not enabled. Read-only status; no files are deleted.</p>
    <details open={Boolean(overview && (overview.counts.attention > 0 || overview.counts.due > 0))} className="mt-3 min-w-0">
      <summary className="cursor-pointer rounded-lg py-2 text-sm text-white/75 outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-4 focus-visible:ring-offset-[#0d0d0f]">
        {overview ? `View tracked uploads (${overview.total})` : unavailable?.title}
      </summary>
      {unavailable && <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">{unavailable.description}</p>}
      {overview && <div className="mt-4 grid min-w-0 gap-4">
        <p className="max-w-3xl text-xs leading-6 text-white/50">Tracks issued ImageKit uploads that have not been added to the media library. This is a database snapshot, not a scan of your ImageKit storage.</p>
        <dl className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
          {stageOrder.map((key) => <div key={key} className={`min-w-0 rounded-xl border p-3 ${stages[key].tone}`}>
            <dt className="text-xs leading-5">{stages[key].label}</dt>
            <dd className="mt-1 text-xl font-semibold tabular-nums">{overview.counts[key]}</dd>
          </div>)}
        </dl>
        {overview.total === 0 ? <p className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm leading-6 text-white/65">No issued, unfinished ImageKit uploads are tracked in this database. This does not describe all files in provider storage.</p> : <>
          <p className="text-xs leading-5 text-white/50">Showing {overview.items.length} of {overview.total}; highest-priority items first.{overview.hasMore ? " This preview is limited; other tracked uploads are not shown." : ""}</p>
          <p id="imagekit-upload-list-help" className="sr-only">Use the arrow keys to scroll the upload list when it is focused.</p>
          <ul aria-label="Tracked ImageKit uploads" aria-describedby="imagekit-upload-list-help" tabIndex={0}
            className="grid max-h-[28rem] min-w-0 gap-3 overflow-y-auto rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-white/60">
            {overview.items.map((item) => <UploadItem key={item.intentId} item={item} />)}
          </ul>
        </>}
        <p className="text-xs leading-5 text-white/50">Snapshot taken <time dateTime={overview.generatedAt}>{formatTime(overview.generatedAt)}</time>. Status does not refresh automatically.</p>
      </div>}
    </details>
  </section>;
}
