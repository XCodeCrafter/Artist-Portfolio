import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MediaLibraryEditor from "@/components/admin/v2/MediaLibraryEditor";
import MediaLibraryUpload from "@/components/admin/v2/MediaLibraryUpload";
import type { MediaAsset } from "@/lib/admin/media";
import type { MediaFilter, MediaUsage } from "@/lib/admin/media-library-editor";

const mocks = vi.hoisted(() => ({
  selected: null as MediaAsset | null, filter: "all" as MediaFilter,
  save: vi.fn(), mutate: vi.fn(), prepare: vi.fn(), finalize: vi.fn(),
  refresh: vi.fn(), createClient: vi.fn(), dirty: false,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/app/admin/v2/media/actions", () => ({ saveMediaDetailsV2: mocks.save, mutateMediaAssetV2: mocks.mutate }));
vi.mock("@/app/admin/media/actions", () => ({ prepareMediaUpload: mocks.prepare, finalizeMediaUpload: mocks.finalize }));
vi.mock("@/lib/supabase/client", () => ({ createClient: mocks.createClient }));
vi.mock("@/components/admin/useUnsavedChangesGuard", () => ({
  default: () => ({ markDirty: vi.fn(), clearDirty: vi.fn(), confirmDiscard: vi.fn(), hasUnsavedChanges: mocks.dirty }),
}));
vi.mock("react", async (original) => {
  const react = await original<typeof import("react")>();
  return {
    ...react,
    useState: (initial: unknown) => react.useState(
      initial === null && mocks.selected ? mocks.selected : initial === "all" ? mocks.filter : initial
    ),
  };
});
const photo: MediaAsset = {
  id: "portrait", label: "Studio portrait", src: "/media/portrait.jpg", alt: "Artist in studio",
  mediaType: "image", usageKey: "Press photo", sortOrder: 10, isPublished: true,
  storageBucket: "portfolio-media", storagePath: "image/portrait.jpg", fileSize: 1024, mimeType: "image/jpeg",
  metadata: {}, createdAt: "2026-09-20T10:00:00Z", updatedAt: "2026-09-20T10:00:00.123456Z", deletedAt: "", deletedBy: "",
};
const clip: MediaAsset = { ...photo, id: "clip", label: "Showreel clip", src: "/media/clip.mp4", mediaType: "video", mimeType: "video/mp4" };
const trashed: MediaAsset = { ...photo, id: "old", label: "Old portrait", deletedAt: "2026-09-20T11:00:00Z", isPublished: false };
function render(options: { assets?: MediaAsset[]; usage?: MediaUsage; usageError?: string; disabled?: boolean; loadError?: string } = {}) {
  return renderToStaticMarkup(<MediaLibraryEditor assets={options.assets ?? [photo, clip, trashed]} usage={options.usage ?? { portrait: [{ label: "Bio gallery", count: 1 }] }} disabled={options.disabled ?? false} usageError={options.usageError} loadError={options.loadError} />);
}
function buttonMarkup(html: string, label: string) {
  return [...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].find(([markup]) => markup.includes(label))?.[0] ?? "";
}
const read = (path: string) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
beforeEach(() => {
  vi.clearAllMocks(); mocks.selected = null; mocks.filter = "all"; mocks.dirty = false;
});

describe("Media library V2 rendering", () => {
  it("renders the media grid and clearly separates library files from public page placement", () => {
    const html = render();
    expect(html).toContain('aria-label="Edit Studio portrait"');
    expect(html).toContain('aria-label="Edit Showreel clip"');
    expect(html).not.toContain('aria-label="Edit Old portrait"');
    expect(html).toContain("Choose a file");
    expect(html).toContain("Recorded file sizes (including Trash)");
    expect(html).toContain("it does not place them on a public page");
    expect(html).toContain('href="/admin/v2/pages/gallery"');
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it("bounds the desktop inspector without trapping the mobile document scroll", () => {
    mocks.selected = photo;
    const html = render();
    const aside = html.match(/<aside\b[^>]*>/)?.[0];
    expect(aside).toContain('tabindex="0"');
    expect(aside).toContain('aria-describedby="media-inspector-help"');
    expect(aside).toContain("xl:max-h-[calc(100dvh-2.5rem)]");
    expect(aside).toContain("xl:overflow-y-auto");
    expect(aside).not.toMatch(/(?:^| )overflow-y-auto(?: |$)/);
    expect(html).toContain("use the arrow keys");
    expect(buttonMarkup(html, "Replace &amp; remove file")).not.toContain('disabled=""');
  });
  it("provides an upload route from an empty library without inventing content", () => {
    const html = render({ assets: [], usage: {} });
    expect(html).toContain("No matching files. Upload a file above or change the filter.");
    expect(html).toContain("Upload photos &amp; videos");
    expect(html).toContain('type="file"');
    expect(buttonMarkup(html, "Upload files")).toContain('disabled=""');
  });
  it("shows only Trash items and a non-destructive restore action", () => {
    mocks.filter = "trash"; mocks.selected = trashed;
    const html = render();
    expect(html).toContain('aria-label="Edit Old portrait"');
    expect(html).not.toContain('aria-label="Edit Studio portrait"');
    expect(buttonMarkup(html, "Restore to library")).not.toContain('disabled=""');
    expect(html).not.toContain("Save details");
    expect(html).toContain("It does not free storage space");
    expect(html).toContain("does not undo replacements");
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it("fails closed for unverified usage but preserves metadata and upload access", () => {
    mocks.selected = photo;
    const html = render({ usageError: "Media usage needs migration 0040." });
    expect(html).toContain("Usage unknown");
    expect(html).toContain("Usage is not verified. Removal is disabled.");
    expect(buttonMarkup(html, "Unused")).toContain('disabled=""');
    expect(buttonMarkup(html, "Replace &amp; remove file")).toContain('disabled=""');
    expect(html).not.toContain('<fieldset disabled=""');
    expect(html).toContain("Library note");
    expect(html).toContain("Do not put private information here");
  });
  it("also disables restoring Trash while usage cannot be verified", () => {
    mocks.selected = trashed; mocks.filter = "trash";
    const html = render({ usageError: "Usage unavailable" });
    expect(buttonMarkup(html, "Restore to library")).toContain('disabled=""');
  });
  it("makes all file edits read-only when media loading failed", () => {
    mocks.selected = photo;
    const html = render({ disabled: true, loadError: "Media is unavailable." });
    expect(html).toContain('role="alert"');
    expect(html).toContain("Media is unavailable.");
    expect(html.match(/<fieldset disabled=""/g)).toHaveLength(2);
    expect(buttonMarkup(html, "Replace &amp; remove file")).toContain('disabled=""');
  });
  it("preserves the original selected asset version across refreshed server props", () => {
    mocks.selected = photo;
    const newer = { ...photo, label: "Renamed elsewhere", updatedAt: "2026-09-20T12:00:00.000001Z" };
    const html = render({ assets: [newer] });
    expect(html).toContain("Studio portrait");
    expect(html).toContain("Your local draft has been kept");
    expect(html).toContain("Discard draft &amp; reload");
    expect(html).toContain('<fieldset disabled=""');
    expect(buttonMarkup(html, "Replace &amp; remove file")).toContain('disabled=""');
    const source = read("components/admin/v2/MediaLibraryEditor.tsx");
    expect(source.match(/expectedUpdatedAt: selected\.updatedAt/g)).toHaveLength(2);
    expect(source).not.toContain("expectedUpdatedAt: latest.updatedAt");
  });
  it("blocks file lifecycle changes while metadata has unsaved changes", () => {
    mocks.selected = photo; mocks.dirty = true;
    const html = render();
    expect(buttonMarkup(html, "Replace &amp; remove file")).toContain('disabled=""');
    expect(html).toContain("Discard changes");
    expect(html).toContain('<fieldset disabled=""');
  });
  it("offers non-publishing editor links that preserve the current draft in a separate tab", () => {
    mocks.selected = photo;
    const html = render();
    expect(html).toContain("Place this file on a page");
    expect(html).toContain("nothing is placed or published until you save");
    const bioLink = [...html.matchAll(/<a\b[^>]*>/g)].find(([markup]) => markup.includes('href="/admin/v2/pages/bio"'))?.[0];
    expect(bioLink).toContain('target="_blank"');
    expect(bioLink).toContain('rel="noopener noreferrer"');
    expect(html).toContain("Bio gallery");
    expect(html).toContain("saved records, not visitor views");
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it.each(["unavailable", "trash", "changed", "missing", "document", "audio"])("does not advertise new picker placement for %s assets", (reason) => {
    mocks.selected = reason === "unavailable" ? { ...photo, isPublished: false } : reason === "trash" ? trashed
      : reason === "document" || reason === "audio" ? { ...photo, mediaType: reason } : photo;
    const assets = reason === "missing" ? [] : reason === "changed" ? [{ ...photo, updatedAt: "2026-09-21T13:00:00Z" }] : [mocks.selected];
    expect(render({ assets })).not.toContain("Place this file on a page");
  });
});

describe("Media upload retry contract", () => {
  it("labels the actual provider and defers optimization instead of promising it", () => {
    const html = renderToStaticMarkup(<MediaLibraryUpload disabled={false} onBusyChange={vi.fn()} />);
    expect(html).toContain("These uploads currently use Supabase");
    expect(html).toContain("Optimization and ImageKit cutover are not enabled");
    expect(html).toContain("250 MB per batch");
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
  it("retains the signed ticket and never automatically creates or transfers another copy after an ambiguous attempt", () => {
    const source = read("components/admin/v2/MediaLibraryUpload.tsx");
    expect(source).toContain("if (!staged.ticket)");
    expect(source).toContain("staged = { ...item, ticket: prepared.ticket }");
    expect(source).toContain("if (!staged.verifyOnly)");
    expect(source).toContain("staged = { ...staged, verifyOnly: true }");
    expect(source.indexOf("staged = { ...staged, verifyOnly: true }")).toBeLessThan(source.indexOf("uploadToSignedUrl("));
    expect(source).toContain("const finalized = await finalizeMediaUpload(ticket)");
    expect(source).toContain("remaining.push({ ...staged");
    expect(source).toContain("Retry verifies the same upload without transferring it again");
    expect(source).toContain("disabled={Boolean(item.ticket)}");
    expect(source).toContain("useUnsavedChangesGuard(");
    expect(source).not.toContain(".remove(");
  });
});
