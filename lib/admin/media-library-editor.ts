import { z } from "zod";
import type { MediaAsset } from "./media";

const assetId = z.string().min(1).max(100).regex(/^[a-z0-9][a-z0-9_-]*$/i)
  .refine((id) => !["home-studio-settings", "gallery-studio-settings", "showreel-studio-settings"].includes(id));
const version = z.string().max(64).refine((value) => /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value)));
const base = z.object({ id: assetId, expectedUpdatedAt: version });
export const mediaDetailsSchema = base.extend({
  label: z.string().trim().min(1).max(220),
  alt: z.string().trim().max(220),
  usageKey: z.string().trim().max(120),
  isPublished: z.boolean(),
}).strict();
export const mediaMutationSchema = base.extend({
  operation: z.enum(["trash", "replace_and_trash", "restore"]),
  replacementId: assetId.optional(),
}).strict().superRefine((value, context) => {
  if (value.operation === "replace_and_trash" && (!value.replacementId || value.replacementId === value.id)) {
    context.addIssue({ code: "custom", path: ["replacementId"], message: "Choose another compatible file." });
  }
  if (value.operation !== "replace_and_trash" && value.replacementId) {
    context.addIssue({ code: "custom", path: ["replacementId"], message: "A replacement is only allowed when replacing a file." });
  }
});
export type MediaUsage = Record<string, { label: string; count: number }[]>;
export type MediaLibraryResult = { ok: boolean; message: string; conflict?: boolean };
export type MediaFilter = "all" | "image" | "video" | "unused" | "trash";
export type MediaAttentionFilter = "all" | "missing-alt" | "oversized" | "recent";
export type MediaAvailabilityFilter = "all" | "available" | "unavailable";
export type MediaLibrarySort = "newest" | "largest" | "name";
export type MediaLibraryBrowseOptions = {
  attention?: MediaAttentionFilter;
  availability?: MediaAvailabilityFilter;
  sort?: MediaLibrarySort;
  now?: number;
  usageVerified?: boolean;
};

// Advisory browsing thresholds, not upload limits or an optimization guarantee.
export const MEDIA_LARGE_IMAGE_BYTES = 2 * 1024 * 1024;
export const MEDIA_LARGE_VIDEO_BYTES = 20 * 1024 * 1024;
export const MEDIA_RECENT_DAYS = 7;

export function getMediaUsage(usage: MediaUsage, assetId: string) {
  return Object.hasOwn(usage, assetId) ? usage[assetId] : [];
}

export function filterMediaLibrary(assets: MediaAsset[], usage: MediaUsage, filter: MediaFilter, query: string, options: MediaLibraryBrowseOptions = {}) {
  const search = query.trim().toLocaleLowerCase();
  const now = options.now ?? Date.now();
  const recentCutoff = now - MEDIA_RECENT_DAYS * 24 * 60 * 60 * 1000;
  const filtered = assets.filter((asset) => {
    if (filter === "trash" ? !asset.deletedAt : Boolean(asset.deletedAt)) return false;
    if ((filter === "image" || filter === "video") && asset.mediaType !== filter) return false;
    if (filter === "unused" && (options.usageVerified === false || getMediaUsage(usage, asset.id).length)) return false;
    if (options.availability === "available" && !asset.isPublished) return false;
    if (options.availability === "unavailable" && asset.isPublished) return false;
    if (options.attention === "missing-alt" && (asset.mediaType !== "image" || asset.alt.trim())) return false;
    if (options.attention === "oversized" && !(
      Number.isFinite(asset.fileSize) &&
      ((asset.mediaType === "image" && asset.fileSize > MEDIA_LARGE_IMAGE_BYTES) ||
        (asset.mediaType === "video" && asset.fileSize > MEDIA_LARGE_VIDEO_BYTES))
    )) return false;
    if (options.attention === "recent") {
      const created = Date.parse(asset.createdAt);
      if (!Number.isFinite(created) || created < recentCutoff || created > now || !Number.isFinite(now)) return false;
    }
    return !search || [asset.label, asset.alt, asset.usageKey].some((value) => value.toLocaleLowerCase().includes(search));
  });
  if (!options.sort) return filtered; // Preserve the existing four-argument order.
  const sort = options.sort;
  return filtered.sort((a, b) => {
    if (sort === "newest") {
      const aCreated = Date.parse(a.createdAt);
      const bCreated = Date.parse(b.createdAt);
      if (Number.isFinite(aCreated) !== Number.isFinite(bCreated)) return Number.isFinite(aCreated) ? -1 : 1;
      if (Number.isFinite(aCreated) && aCreated !== bCreated) return bCreated - aCreated;
    } else if (sort === "largest") {
      const aSize = Number.isFinite(a.fileSize) && a.fileSize >= 0 ? a.fileSize : -1;
      const bSize = Number.isFinite(b.fileSize) && b.fileSize >= 0 ? b.fileSize : -1;
      if (aSize !== bSize) return bSize - aSize;
    }
    return a.label.localeCompare(b.label, "en", { numeric: true, sensitivity: "base" }) ||
      a.id.localeCompare(b.id, "en", { numeric: true, sensitivity: "variant" });
  });
}

export type MediaPlacementInfo = {
  title: string;
  description: string;
  links: { label: string; href: string }[];
};

// These labels are the exact registry values in migrations 0040/0041. A registry label
// identifies a source table, not necessarily a visible page or a particular block.
const mediaPlacements: Record<string, MediaPlacementInfo> = {
  "Archived content": {
    title: "Archived content",
    description: "Recoverable archived content still references this file. The file is preserved for restoration; replacing it also updates its archived reference. Check the archives in Navbar, Music, Bio, Gallery or Showreel; this label does not identify the individual collection.",
    links: [
      { label: "Open shortcut archive", href: "/admin/v2/navigation#shortcut-archive" },
      { label: "Open Music editor", href: "/admin/v2/pages/music" },
      { label: "Open Bio editor", href: "/admin/v2/pages/bio" },
      { label: "Open Gallery editor", href: "/admin/v2/pages/gallery" },
      { label: "Open Showreel editor", href: "/admin/v2/pages/showreel" },
    ],
  },
  "Home about (Classic)": {
    title: "Home about (Classic)",
    description: "A saved Classic Home image or button still references this file. This legacy content is separate from the Home V2 draft.",
    links: [],
  },
  "Bio credit link": {
    title: "Bio credits",
    description: "A Bio credit links to this file. Check the credits in the Bio editor.",
    links: [{ label: "Open Bio editor", href: "/admin/v2/pages/bio" }],
  },
  "Bio resume download": {
    title: "Bio résumé download",
    description: "The Bio résumé download links to this file.",
    links: [{ label: "Open Bio editor", href: "/admin/v2/pages/bio" }],
  },
  "Bio gallery": {
    title: "Bio gallery",
    description: "A Bio gallery entry references this file, including entries that may be hidden.",
    links: [{ label: "Open Bio editor", href: "/admin/v2/pages/bio" }],
  },
  Gallery: {
    title: "Gallery images",
    description: "A Gallery image entry references this file, including entries that may be hidden.",
    links: [{ label: "Open Gallery editor", href: "/admin/v2/pages/gallery" }],
  },
  "Gallery presentation": {
    title: "Gallery interlude",
    description: "The Gallery presentation references this file as its interlude video or poster.",
    links: [{ label: "Open Gallery editor", href: "/admin/v2/pages/gallery" }],
  },
  "Home V2 (including hidden sections)": {
    title: "Home V2",
    description: "The Home draft references this file. Hidden sections and saved blocks are included; this does not prove it is visible on the public page.",
    links: [{ label: "Open Home editor", href: "/admin/v2/pages/home" }],
  },
  "Home update (Classic)": {
    title: "Home update (Classic)",
    description: "A saved Classic Home update references this file as an avatar or link. This legacy content is separate from the Home V2 draft.",
    links: [],
  },
  "Saved media presentation": {
    title: "Saved media presentation",
    description: "Saved media metadata references this file. This can include Classic presentation settings; the usage registry does not identify an exact page or editable block.",
    links: [],
  },
  "Music platform": {
    title: "Music platforms",
    description: "A music platform card references this file as an image or destination link.",
    links: [{ label: "Open Music editor", href: "/admin/v2/pages/music" }],
  },
  "Page hero / button": {
    title: "Page hero or button",
    description: "A saved page hero references this file as a background, poster, or button link. The registry does not identify which page; choose its editor from Overview.",
    links: [{ label: "Choose a page editor", href: "/admin/v2" }],
  },
  "Site music / footer link": {
    title: "Site music or footer",
    description: "A saved Spotify setting or footer link references this file. Check both areas; the registry does not distinguish them.",
    links: [
      { label: "Open Music editor", href: "/admin/v2/pages/music" },
      { label: "Open profile & footer", href: "/admin/v2/settings/appearance" },
    ],
  },
  "Navbar / social link": {
    title: "Navbar social link",
    description: "A saved social link references this file, including links that may be hidden from the navbar.",
    links: [{ label: "Open Navbar editor", href: "/admin/v2/navigation" }],
  },
  "SoundCloud track": {
    title: "SoundCloud track",
    description: "A saved SoundCloud track references this file in its embed URL.",
    links: [{ label: "Open Music editor", href: "/admin/v2/pages/music" }],
  },
  "Showreel / video": {
    title: "Showreel or video",
    description: "A saved video references this file as its thumbnail or embed URL. This includes the legacy video collection and does not prove the video is visible in Showreel.",
    links: [{ label: "Open Showreel editor", href: "/admin/v2/pages/showreel" }],
  },
};

export function getMediaPlacementInfo(label: string): MediaPlacementInfo {
  if (!Object.hasOwn(mediaPlacements, label)) return {
    title: label || "Saved content",
    description: "Saved content references this file. Its exact editor could not be identified, so no destination is guessed.",
    links: [],
  };
  const info = mediaPlacements[label];
  return { ...info, links: info.links.map((link) => ({ ...link })) };
}

export function mediaReplacementOptions(asset: MediaAsset, assets: MediaAsset[]) {
  return assets.filter((item) => item.id !== asset.id && item.src !== asset.src &&
    item.mediaType === asset.mediaType && item.isPublished && !item.deletedAt);
}

export function formatMediaBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(3, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${Number((bytes / 1024 ** index).toFixed(1))} ${units[index]}`;
}

export function validateMediaUploadFiles(files: Pick<File, "type" | "size" | "name">[]) {
  if (!files.length || files.length > 10) return "Choose between 1 and 10 files.";
  const types = ["image/avif", "image/gif", "image/jpeg", "image/png", "image/webp", "video/mp4", "video/quicktime", "video/webm"];
  for (const file of files) {
    if (!types.includes(file.type)) return `${file.name}: unsupported file type.`;
    const max = (file.type.startsWith("video/") ? 100 : 10) * 1024 * 1024;
    if (file.size <= 0 || file.size > max) return `${file.name}: file must be between 1 byte and ${formatMediaBytes(max)}.`;
  }
  if (files.reduce((sum, file) => sum + file.size, 0) > 250 * 1024 * 1024) return "Choose a batch smaller than 250 MB.";
  return null;
}
