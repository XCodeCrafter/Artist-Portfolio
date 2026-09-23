import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ImageKitReconciliationOverview from "@/components/admin/v2/ImageKitReconciliationOverview";
import type { ImageKitReconciliationOverviewData } from "@/lib/admin/imagekit-reconciliation-overview-types";

type Available = Extract<ImageKitReconciliationOverviewData, { status: "available" }>;
type Item = Available["overview"]["items"][number];
const referenceTime = "2026-09-22T14:30:00.000Z";
function item(overrides: Partial<Item> = {}): Item {
  return {
    intentId: "00000000-0000-4000-8000-000000000001", label: "Press portrait", mediaType: "image",
    sizeBytes: 1024, stage: "waiting", attempts: 0, lastObservation: null,
    nextCheckAt: null, updatedAt: referenceTime, ...overrides,
  };
}
function available(items: Item[] = []): Available {
  return { status: "available", overview: {
    version: 1, generatedAt: referenceTime, total: items.length,
    counts: { uploading: 0, waiting: 0, due: 0, checking: 0, attention: 0 },
    items, hasMore: false,
  } };
}
function render(data: ImageKitReconciliationOverviewData) {
  return renderToStaticMarkup(<ImageKitReconciliationOverview data={data} />);
}
function detailsTag(html: string) { return html.match(/<details\b[^>]*>/)?.[0] ?? ""; }

describe("Read-only ImageKit upload overview", () => {
  it("renders an accessible, closed native disclosure for an empty database snapshot", () => {
    const html = render(available());
    expect(html).toContain('aria-labelledby="imagekit-checks-heading"');
    expect(html).toContain('<h2 id="imagekit-checks-heading"');
    expect(html).toContain("ImageKit upload checks");
    expect(html).toContain("View tracked uploads (0)");
    expect(html).toContain("No issued, unfinished ImageKit uploads are tracked in this database.");
    expect(html).toContain("This does not describe all files in provider storage.");
    expect(detailsTag(html)).not.toContain("open");
    expect(html).not.toContain("Tracked ImageKit uploads");
    expect(html).not.toMatch(/all clear|storage is empty|no files in ImageKit/i);
  });

  it.each(["attention", "due"] as const)("opens the overview when the %s count needs attention", (stage) => {
    const data = available([item({ stage })]);
    data.overview.counts[stage] = 1;
    expect(detailsTag(render(data))).toContain('open=""');
  });

  it.each(["uploading", "waiting", "checking"] as const)("keeps the %s-only overview collapsed", (stage) => {
    const data = available([item({ stage })]);
    data.overview.counts[stage] = 1;
    expect(detailsTag(render(data))).not.toContain("open");
  });

  it.each([
    ["uploading", "Upload window open"], ["waiting", "Waiting to check"],
    ["due", "Ready for a check"], ["checking", "Check in progress"], ["attention", "Needs review"],
  ] as const)("describes %s without database lease terminology", (stage, label) => {
    const data = available([item({ stage })]);
    data.overview.counts[stage] = 1;
    const html = render(data);
    expect(html).toContain(label);
    expect(html).toContain("Press portrait");
    expect(html).toContain("Image · 1 KB");
    expect(html).toContain("Check attempts: 0");
    expect(html).not.toMatch(/lease|RPC|cleanup_state|physical_objects/);
  });

  it.each([
    ["absent", "File not found at the last check. This does not confirm it was deleted."],
    ["retry", "The last check was inconclusive. A retry is needed."],
    ["unsafe", "The last check needs manual review. No files were deleted."],
    ["exhausted", "Check limit reached. Manual review is needed."],
    [null, "No recorded check result."],
  ] as const)("reports the %s observation without promising deletion", (lastObservation, message) => {
    expect(render(available([item({ lastObservation })]))).toContain(message);
  });

  it.each([
    ["not-configured", "Upload status is not configured", "No upload counts are available."],
    ["migration-required", "Database update required · 0050", "Apply and verify database migration 0050"],
    ["not-ready", "Upload status needs a setup check", "The database safety checks are not ready."],
    ["unavailable", "Upload status is temporarily unavailable", "This does not mean there are no unfinished uploads."],
  ] as const)("does not invent empty results when %s", (reason, title, description) => {
    const html = render({ status: "unavailable", reason });
    expect(html).toContain(title);
    expect(html).toContain(description);
    expect(detailsTag(html)).not.toContain("open");
    expect(html).not.toContain("View tracked uploads (0)");
    expect(html).not.toContain("Snapshot taken");
    expect(html).not.toContain("No issued, unfinished");
  });

  it("always marks the worker dormant and exposes no writes or draft-discarding navigation", () => {
    for (const data of [available(), available([item({ stage: "attention" })]), { status: "unavailable", reason: "migration-required" } as const]) {
      const html = render(data);
      expect(html).toContain("Automatic checks are not enabled. Read-only status; no files are deleted.");
      expect(html).not.toMatch(/<(?:form|button|input|a)\b|href=|action=|onclick=/i);
    }
    const source = readFileSync(new URL("../components/admin/v2/ImageKitReconciliationOverview.tsx", import.meta.url), "utf8");
    expect(source).not.toMatch(/use client|useRouter|router\.|fetch\(|revalidate|setInterval|process\.env|createClient|from ["'][^"']*(?:actions|worker|workflow)/);
    expect(source).toContain('import type { ImageKitReconciliationOverviewData }');
  });

  it("identifies bounded results instead of presenting a partial list as all uploads", () => {
    const data = available([item({ label: "Needs a check", stage: "due" }), item({ intentId: "00000000-0000-4000-8000-000000000002" })]);
    data.overview.total = 38;
    data.overview.counts.due = 8;
    data.overview.counts.waiting = 30;
    data.overview.hasMore = true;
    const html = render(data);
    expect(html).toContain("View tracked uploads (38)");
    expect(html).toContain("Showing 2 of 38; highest-priority items first.");
    expect(html).toContain("This preview is limited; other tracked uploads are not shown.");
    expect(html).not.toMatch(/Next page|Previous page|Show more/);
    const list = html.match(/<ul\b[^>]*>/)?.[0] ?? "";
    expect(list).toContain("max-h-[28rem]");
    expect(list).toContain("overflow-y-auto");
    expect(list).toContain('tabindex="0"');
    expect(list).toContain('aria-describedby="imagekit-upload-list-help"');
    expect(html).toContain("Use the arrow keys to scroll the upload list");
  });

  it("does not describe a complete preview as truncated", () => {
    const html = render(available([item()]));
    expect(html).toContain("Showing 1 of 1; highest-priority items first.");
    expect(html).not.toContain("This preview is limited");
  });

  it("escapes user labels and does not expose provider paths, identities, or links", () => {
    const malicious = '<img src="x" onerror="alert(1)">';
    const row = item({ label: malicious });
    const html = render(available([row]));
    expect(html).toContain("&lt;img src=&quot;x&quot; onerror=&quot;alert(1)&quot;&gt;");
    expect(html).not.toContain("<img");
    expect(html).not.toContain(row.intentId);
    expect(html).not.toMatch(/https?:\/\/|fileId|objectKey|versionToken|privateKey/);
    expect(html).toContain("[overflow-wrap:anywhere]");
    expect(html).not.toContain("<table");
  });

  it("uses explicit UTC times and explains that check eligibility is not a schedule", () => {
    const html = render(available([item({ mediaType: "video", sizeBytes: 2 * 1024 * 1024, attempts: 3, nextCheckAt: "2026-09-23T01:15:00+02:00" })]));
    expect(html).toContain("Video · 2 MB");
    expect(html).toContain("Check attempts: 3");
    expect(html).toContain("22 Sept 2026, 23:15 UTC");
    expect(html).toContain("22 Sept 2026, 14:30 UTC");
    expect(html).toContain("This is not a scheduled run.");
    expect(html).toContain("Status does not refresh automatically.");
    expect(html).toContain('dateTime="2026-09-23T01:15:00+02:00"');
  });

  it("does not invent an eligible date for an upload without one", () => {
    const html = render(available([item()]));
    expect(html).not.toContain("Eligible for a check from");
    expect(html).toContain("Last updated");
  });

  it("keeps small timestamp text at the readable contrast token on the dark panel", () => {
    const html = render(available([item()]));
    expect(html).toContain('class="mt-1 text-white/50">Last updated');
    expect(html).toContain('class="text-xs leading-5 text-white/50">Snapshot taken');
    expect(html).not.toContain("text-white/40");
  });
});
