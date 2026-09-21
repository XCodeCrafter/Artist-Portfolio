import { z } from "zod";

/** Shared by the public footer, its live editor and the database contract. */
export const DEFAULT_FOOTER_CONTENT = {
  eyebrow: "Let's make something",
  heading: "Ready for the next story",
  primaryLabel: "Work together",
  primaryHref: "/booking",
  secondaryLabel: "Showreel",
  secondaryHref: "/video",
  socialEyebrow: "Elsewhere",
  socialHeading: "Watch, listen & connect",
};

export function isSafeFooterHref(value: string) {
  if (!value) return true;
  if (/[\\\u0000-\u0020\u007f]/.test(value)) return false;
  if (/^\/(?!\/)/.test(value) || /^#[A-Za-z][A-Za-z0-9_-]*$/.test(value)) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && (!url.port || url.port === "443");
  } catch { return false; }
}

const text = z.string().trim().max(220);
const href = z.string().trim().max(2048).refine(isSafeFooterHref, "Use a local path, an #anchor, or a safe https:// URL.");
export const footerContentSchema = z.object({
  eyebrow: text,
  heading: text.min(1, "Add a footer heading."),
  primaryLabel: text,
  primaryHref: href,
  secondaryLabel: text,
  secondaryHref: href,
  socialEyebrow: text,
  socialHeading: text,
}).strict().superRefine((value, context) => {
  for (const kind of ["primary", "secondary"] as const) {
    const label = `${kind}Label` as const;
    const target = `${kind}Href` as const;
    if (Boolean(value[label]) !== Boolean(value[target])) context.addIssue({
      code: "custom", path: [value[label] ? target : label], message: "Add both a button label and destination, or clear both to hide it.",
    });
  }
});
export type FooterContent = z.infer<typeof footerContentSchema>;

export function normalizeFooterContent(value: unknown): FooterContent {
  const parsed = footerContentSchema.safeParse(value);
  return parsed.success ? parsed.data : { ...DEFAULT_FOOTER_CONTENT };
}
