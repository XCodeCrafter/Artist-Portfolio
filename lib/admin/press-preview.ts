import { z } from "zod";
import { createHomeEditorialDefaults, homeEditorialPreviewSchemas, sanitizeHomeEditorialPreview, type HomePress } from "@/lib/admin/home-editorial";

export const PRESS_PREVIEW_READY_MESSAGE = "press-preview-ready" as const;
export const PRESS_PREVIEW_UPDATE_MESSAGE = "press-preview-update" as const;
export type PressPreviewUpdateMessage = { type: typeof PRESS_PREVIEW_UPDATE_MESSAGE; draft: HomePress };
const previewMessageSchema = z.object({ type: z.literal(PRESS_PREVIEW_UPDATE_MESSAGE), draft: homeEditorialPreviewSchemas.press }).strict();

export function parsePressPreviewUpdateMessage(value: unknown): PressPreviewUpdateMessage | null {
  const parsed = previewMessageSchema.safeParse(value);
  if (!parsed.success) return null;
  const safe = sanitizeHomeEditorialPreview({ ...createHomeEditorialDefaults(), press: parsed.data.draft });
  return { type: PRESS_PREVIEW_UPDATE_MESSAGE, draft: safe.press };
}
