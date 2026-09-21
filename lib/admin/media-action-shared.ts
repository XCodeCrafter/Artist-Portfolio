import { revalidatePath } from "next/cache";
import { z } from "zod";

// Route-neutral shared contracts; Classic and V2 upload use the same validation
// and cache invalidation surfaces until the Classic removal is approved.
const REVALIDATE_PATHS = [
  "/",
  "/bio",
  "/gallery",
  "/music",
  "/video",
  "/booking",
  "/admin",
  "/admin/media",
  "/admin/content",
  "/admin/v2/media",
  "/admin/v2/pages/home",
  "/admin/v2/pages/bio",
  "/admin/v2/pages/gallery",
  "/admin/v2/pages/showreel",
  "/admin/v2/pages/music",
  "/admin/v2/pages/contact",
];

export const idValue = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9][a-z0-9_-]*$/i);

export const mediaMetadataSchema = z.object({
  id: idValue,
  label: z.string().trim().min(1).max(220),
  alt: z.string().trim().max(220),
  usageKey: z.string().trim().max(120),
  sortOrder: z.coerce.number().int().min(0).max(9999),
  isPublished: z.boolean(),
});

export function slugify(value: string, fallback: string) {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return slug || fallback;
}

export function revalidateMediaSurfaces() {
  for (const path of REVALIDATE_PATHS) {
    revalidatePath(path);
  }
}
