import { z } from "zod";
import { heroFramingSchema, type HeroFraming } from "./hero-framing";
import type { PortfolioContent } from "./types";
import type { HomeEditorDraft } from "@/lib/admin/home-editor";

const publicMapSchema = z.record(z.string().min(1).max(550), z.object({
  src: z.string().max(2048), framing: heroFramingSchema,
// Legacy Showreel catalogs support up to 10,000 entries; leave bounded room
// for every other placement instead of dropping all framing on larger sites.
}).strict()).refine(value => Object.keys(value).length <= 20_000);
export type PublicPhotoFramings = z.infer<typeof publicMapSchema>;
export function parsePublicPhotoFramings(value: unknown): PublicPhotoFramings | null {
  const parsed = publicMapSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
/** Bind to the exact source again: content and framing reads can straddle a save. */
export function photoFramingFor(map: PublicPhotoFramings, key: string, src: string): HeroFraming | null {
  const item = Object.hasOwn(map, key) ? map[key] : undefined;
  return item?.src === src ? item.framing : null;
}
export function applyPublicPhotoFramings(content: PortfolioContent, map: PublicPhotoFramings): PortfolioContent {
  return { ...content, photoFramings: map,
    musicPlatforms: content.musicPlatforms.map(item => ({ ...item, framing: photoFramingFor(map, `music:platform:${item.id}`, item.imageSrc) })),
    bio: { ...content.bio, galleryImages: content.bio.galleryImages.map(item => ({ ...item, framing: photoFramingFor(map, `bio:image:${item.id}`, item.src) })) },
    galleryImages: content.galleryImages.map(item => ({ ...item, framing: photoFramingFor(map, `gallery:image:${item.id}`, item.src) })),
    videos: content.videos.map(item => ({ ...item, framing: photoFramingFor(map, `showreel:thumbnail:${item.id}`, item.thumbnailSrc) })),
  };
}
export function applyHomePhotoFramings(draft: HomeEditorDraft, map: PublicPhotoFramings): HomeEditorDraft {
  return { ...draft,
    about: { ...draft.about, framing: photoFramingFor(map, "home:about", draft.about.imageSrc) },
    feature: { ...draft.feature, posterFraming: photoFramingFor(map, "home:feature:poster", draft.feature.posterSrc) },
    stories: { ...draft.stories, images: draft.stories.images.map((item, index) => ({ ...item,
      framing: photoFramingFor(map, `home:story:${index}`, item.src),
    })) },
  };
}
