import { z } from "zod";
import { FALLBACK_CONTENT } from "@/lib/content/fallback";
import { BODY_FONT_KEYS, DISPLAY_FONT_KEYS, UI_FONT_KEYS } from "@/lib/content/fonts";
import { FOOTER_EFFECTS } from "@/lib/content/types";
import { DEFAULT_FOOTER_CONTENT, footerContentSchema } from "@/lib/content/footer";

export const APPEARANCE_EDITOR_SECTIONS = ["name", "appearance", "identity", "footer"] as const;
export type AppearanceEditorSection = (typeof APPEARANCE_EDITOR_SECTIONS)[number];

const nameSchema = z.object({
  artistName: z.string().trim().min(1, "Enter the owner's name.").max(220)
    .refine((value) => !/[\u0000-\u001f\u007f]/.test(value), "Use a single line for the owner's name."),
}).strict();
const appearanceSchema = z.object({
  displayFont: z.enum(DISPLAY_FONT_KEYS),
  bodyFont: z.enum(BODY_FONT_KEYS),
  uiFont: z.enum(UI_FONT_KEYS),
  footerEffect: z.enum(FOOTER_EFFECTS),
}).strict();
const identitySchema = z.object({
  tagline: z.string().trim().max(220),
  description: z.string().trim().max(1000),
  location: z.string().trim().max(220),
  contactBlurb: z.string().trim().max(1000),
}).strict();
const versionsSchema = z.object({
  updatedAt: z.string().max(64).refine(
    (value) => /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value)),
    "The saved version is invalid. Reload this editor."
  ),
}).strict();
const schemas = { name: nameSchema, appearance: appearanceSchema, identity: identitySchema, footer: footerContentSchema };
const draftSchema = z.object(schemas).strict();

export type AppearanceEditorDraft = z.infer<typeof draftSchema>;
export type AppearanceEditorVersions = z.infer<typeof versionsSchema>;
export type AppearanceEditorSnapshot = { draft: AppearanceEditorDraft; versions: AppearanceEditorVersions };
export type AppearanceSaveState = {
  status: "idle" | "saved" | "invalid" | "conflict" | "security-error" | "missing-service" | "migration-required" | "error";
  message: string;
  eventId: string;
  section?: AppearanceEditorSection;
  canonicalSection?: AppearanceEditorDraft[AppearanceEditorSection];
  versions?: AppearanceEditorVersions;
  fieldErrors?: Record<string, string[]>;
  savedAt?: string;
};
export const INITIAL_APPEARANCE_SAVE_STATE: AppearanceSaveState = { status: "idle", message: "", eventId: "" };

function issueMap(error: z.ZodError, prefix = "") {
  const errors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = `${prefix}${issue.path.join(".") || "form"}`;
    errors[key] = [...(errors[key] || []), issue.message];
  }
  return errors;
}

type AppearanceSubmission = {
  [Section in AppearanceEditorSection]: {
    section: Section;
    payload: AppearanceEditorDraft[Section];
    versions: AppearanceEditorVersions;
  }
}[AppearanceEditorSection];

export function parseAppearanceSubmission(section: unknown, payload: unknown, versions: unknown):
  | { success: true; data: AppearanceSubmission }
  | { success: false; fieldErrors: Record<string, string[]> } {
  const selected = z.enum(APPEARANCE_EDITOR_SECTIONS).safeParse(section);
  if (!selected.success) return { success: false, fieldErrors: { section: ["Choose a valid settings section."] } };
  const version = versionsSchema.safeParse(versions);
  const parsed = schemas[selected.data].safeParse(payload);
  if (!version.success || !parsed.success) return {
    success: false,
    fieldErrors: {
      ...(!parsed.success ? issueMap(parsed.error) : {}),
      ...(!version.success ? issueMap(version.error, "versions.") : {}),
    },
  };
  return {
    success: true,
    data: { section: selected.data, payload: parsed.data, versions: version.data } as AppearanceSubmission,
  };
}

export function parseAppearanceEditorSnapshot(value: unknown): AppearanceEditorSnapshot | null {
  const parsed = z.object({ draft: draftSchema, versions: versionsSchema }).strict().safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function createFallbackAppearanceEditorSnapshot(): AppearanceEditorSnapshot {
  const settings = FALLBACK_CONTENT.settings;
  return {
    draft: {
      name: { artistName: settings.artistName },
      appearance: {
        displayFont: settings.displayFont,
        bodyFont: settings.bodyFont,
        uiFont: settings.uiFont,
        footerEffect: settings.footerEffect,
      },
      identity: { tagline: settings.tagline, description: settings.description, location: settings.location, contactBlurb: settings.contactBlurb },
      footer: { ...DEFAULT_FOOTER_CONTENT },
    },
    versions: { updatedAt: new Date(0).toISOString() },
  };
}
