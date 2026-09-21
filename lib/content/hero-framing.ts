import type { CSSProperties } from "react";
import { z } from "zod";

export const heroFrameSchema = z.object({
  fit: z.enum(["cover", "contain"]),
  x: z.number().finite().min(0).max(100),
  y: z.number().finite().min(0).max(100),
  zoom: z.number().finite().min(1).max(3),
}).strict();
export const heroFramingSchema = z.object({
  desktop: heroFrameSchema,
  mobile: heroFrameSchema,
}).strict();

export type HeroFrame = z.infer<typeof heroFrameSchema>;
export type HeroFraming = z.infer<typeof heroFramingSchema>;
export type HeroFramingDevice = keyof HeroFraming;

/** Invalid public content safely retains the original, automatic framing. */
export function normalizeHeroFraming(value: unknown): HeroFraming | null {
  const parsed = heroFramingSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function getDefaultHeroFraming(mediaType: "image" | "video"): HeroFraming {
  return {
    desktop: { fit: "cover", x: 50, y: 50, zoom: mediaType === "video" ? 1.04 : 1 },
    mobile: { fit: "cover", x: 50, y: 20, zoom: 1 },
  };
}

export function getHeroMediaStyle(frame: HeroFrame): CSSProperties {
  const position = `${frame.x}% ${frame.y}%`;
  return {
    objectFit: frame.fit,
    objectPosition: position,
    transformOrigin: position,
    transform: `scale(${frame.zoom})`,
  };
}
