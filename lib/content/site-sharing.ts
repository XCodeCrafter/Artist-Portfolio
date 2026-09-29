import { z } from "zod";
import { isConfiguredMediaLibrarySource } from "@/lib/media-source";

export const DEFAULT_SHARING_METADATA = { title: "", description: "", imageSrc: "", imageAlt: "" };
/** A custom image is an already composed public cover, not an arbitrary URL to fetch. */
export function isSafeSharingImageSource(value: string) {
  if (!value) return true;
  if (/[\\\s\u0000-\u001f\u007f]/.test(value)) return false;
  if (value.startsWith("/")) return /^\/images\/[A-Za-z0-9_./-]+\.(?:jpe?g|png|webp)$/i.test(value)
    && !/(?:^|\/)\.{1,2}(?:\/|$)|\/\//.test(value);
  return isConfiguredMediaLibrarySource(value);
}
export function isEligibleSharingImageAsset(asset: { mediaType: string; isPublished: boolean; deletedAt?: string | null; src: string; mimeType?: string | null }) {
  if (asset.mediaType !== "image" || !asset.isPublished || asset.deletedAt || !asset.src || !isSafeSharingImageSource(asset.src)) return false;
  if (asset.mimeType) return ["image/jpeg", "image/png", "image/webp"].includes(asset.mimeType);
  try { return /\.(?:jpe?g|png|webp)$/i.test(new URL(asset.src, "https://portfolio.invalid").pathname); }
  catch { return false; }
}
const singleLine = (max: number) => z.string().trim().max(max).refine(value => !/[\u0000-\u001f\u007f]/.test(value), "Use plain text on a single line.");
const sharingMetadataShapeSchema = z.object({
  title: singleLine(120), description: singleLine(320),
  imageSrc: z.string().trim().max(2048),
  imageAlt: singleLine(500),
}).strict();
export const sharingMetadataSchema = sharingMetadataShapeSchema.extend({
  imageSrc: z.string().trim().max(2048).refine(isSafeSharingImageSource, "Choose a public JPG, PNG or WebP image from this site's Media Library."),
});
export type SharingMetadata = z.infer<typeof sharingMetadataSchema>;
/** Read compatibility permits clearing an unavailable cover, never extra/private fields. */
export function parsePublicSharingMetadata(value: unknown): SharingMetadata | null {
  const parsed = sharingMetadataShapeSchema.safeParse(value);
  if (!parsed.success) return null;
  return isSafeSharingImageSource(parsed.data.imageSrc) ? parsed.data : { ...parsed.data, imageSrc: "", imageAlt: "" };
}
export function normalizeSharingMetadata(value: unknown): SharingMetadata {
  // A retired or reconfigured media origin must not erase valid owner copy.
  return parsePublicSharingMetadata(value) ?? { ...DEFAULT_SHARING_METADATA };
}
