import { z } from "zod";
import {
  detectSocialPlatform,
  getSocialPlatformDefinition,
  type SocialPlatformKey,
} from "@/lib/content/social-platforms";

export type NavbarSocialLinkItem = {
  id: string;
  label: string;
  platform: SocialPlatformKey;
  href: string;
  iconKey: SocialPlatformKey;
  isPublished: boolean;
};

export type NavbarSocialLinksVersions = Record<string, string>;

export type NavbarSocialLinksSnapshot = {
  items: NavbarSocialLinkItem[];
  expectedVersions: NavbarSocialLinksVersions;
};

export type NavbarSocialLinksSaveState = {
  status:
    | "idle"
    | "saved"
    | "conflict"
    | "invalid"
    | "migration-required"
    | "missing-service"
    | "security-error"
    | "error";
  message: string;
  eventId: string;
  items?: NavbarSocialLinkItem[];
  expectedVersions?: NavbarSocialLinksVersions;
  savedAt?: string;
  fieldErrors?: Record<string, string[]>;
};

export const INITIAL_NAVBAR_SOCIAL_LINKS_SAVE_STATE: NavbarSocialLinksSaveState = {
  status: "idle",
  message: "",
  eventId: "",
};

const recordId = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
const timestamp = z.string().refine(
  (value) =>
    value.length <= 64 &&
    /^\d{4}-\d{2}-\d{2}T/.test(value) &&
    Number.isFinite(Date.parse(value)),
  "Invalid saved version. Reload this editor."
);
const externalHttpsUrl = z
  .string()
  .trim()
  .min(1, "Paste the public profile URL.")
  .max(2_048)
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password;
    } catch {
      return false;
    }
  }, "Use a complete https:// URL.");

const rawItemSchema = z
  .object({
    id: recordId,
    label: z.string().trim().min(1, "Add a short accessible label.").max(220),
    platform: z.string().trim().max(80),
    href: externalHttpsUrl,
    iconKey: z.string().trim().max(80),
    isPublished: z.boolean(),
  })
  .strict();

const rawSnapshotItemSchema = rawItemSchema
  .extend({ updatedAt: timestamp })
  .strict();

const rawItemsSchema = z.array(rawItemSchema).max(16).superRefine((items, ctx) => {
  const ids = new Set<string>();
  items.forEach((item, index) => {
    if (ids.has(item.id)) {
      ctx.addIssue({
        code: "custom",
        message: "Each quick link needs a unique identity.",
        path: [index, "id"],
      });
    }
    ids.add(item.id);
  });
});

const versionsSchema = z.record(recordId, timestamp);

function normalizeItem(
  item: z.infer<typeof rawItemSchema>
): NavbarSocialLinkItem {
  const platform = detectSocialPlatform(
    item.href,
    item.platform,
    item.iconKey,
    item.label
  );
  return {
    id: item.id,
    label: item.label,
    platform,
    href: item.href,
    iconKey: platform,
    isPublished: item.isPublished,
  };
}

function issueMap(error: z.ZodError) {
  const errors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    errors[key] = [...(errors[key] || []), issue.message];
  }
  return errors;
}

export function parseNavbarSocialLinksDraft(value: unknown) {
  const parsed = rawItemsSchema.safeParse(value);
  return parsed.success
    ? { success: true as const, data: parsed.data.map(normalizeItem) }
    : { success: false as const, fieldErrors: issueMap(parsed.error) };
}

export function parseNavbarSocialLinksVersions(
  value: unknown
): NavbarSocialLinksVersions | null {
  const parsed = versionsSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function parseNavbarSocialLinksSubmission(
  items: unknown,
  versions: unknown
):
  | {
      success: true;
      data: {
        items: NavbarSocialLinkItem[];
        expectedVersions: NavbarSocialLinksVersions;
      };
    }
  | { success: false; fieldErrors: Record<string, string[]> } {
  const parsedItems = parseNavbarSocialLinksDraft(items);
  const parsedVersions = versionsSchema.safeParse(versions);
  if (!parsedItems.success || !parsedVersions.success) {
    return {
      success: false,
      fieldErrors: {
        ...(!parsedItems.success ? parsedItems.fieldErrors : {}),
        ...(!parsedVersions.success
          ? Object.fromEntries(
              Object.entries(issueMap(parsedVersions.error)).map(
                ([key, messages]) => [`versions.${key}`, messages]
              )
            )
          : {}),
      },
    };
  }

  const submittedIds = new Set(parsedItems.data.map((item) => item.id));
  if (
    Object.keys(parsedVersions.data).some((id) => !submittedIds.has(id))
  ) {
    return {
      success: false,
      fieldErrors: {
        form: [
          "Saved links can be hidden, but are not deleted from this quick editor.",
        ],
      },
    };
  }

  return {
    success: true,
    data: {
      items: parsedItems.data,
      expectedVersions: parsedVersions.data,
    },
  };
}

export function parseNavbarSocialLinksSnapshot(
  value: unknown
): NavbarSocialLinksSnapshot | null {
  const parsed = z
    .object({ items: z.array(rawSnapshotItemSchema).max(16) })
    .strict()
    .safeParse(value);
  if (!parsed.success) return null;

  const items = parsed.data.items.map(normalizeItem);
  if (new Set(items.map((item) => item.id)).size !== items.length) return null;

  return {
    items,
    expectedVersions: Object.fromEntries(
      parsed.data.items.map((item) => [item.id, item.updatedAt])
    ),
  };
}

export function parseNavbarSocialLinksSaveResult(
  value: unknown
): NavbarSocialLinksSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const snapshot = parseNavbarSocialLinksSnapshot({ items: candidate.items });
  const expectedVersions = parseNavbarSocialLinksVersions(
    candidate.expectedVersions
  );
  if (!snapshot || !expectedVersions) return null;
  const snapshotIds = Object.keys(snapshot.expectedVersions).sort();
  const versionIds = Object.keys(expectedVersions).sort();
  if (
    snapshotIds.length !== versionIds.length ||
    snapshotIds.some((id, index) => id !== versionIds[index])
  ) {
    return null;
  }
  return { items: snapshot.items, expectedVersions };
}

export function createEmptyNavbarSocialLink(id: string): NavbarSocialLinkItem {
  return {
    id,
    label: "Website",
    platform: "website",
    href: "",
    iconKey: "website",
    isPublished: true,
  };
}

export function updateNavbarSocialLinkUrl(
  item: NavbarSocialLinkItem,
  href: string
): NavbarSocialLinkItem {
  const previousDefinition = getSocialPlatformDefinition(item.platform);
  const platform = detectSocialPlatform(href);
  const nextDefinition = getSocialPlatformDefinition(platform);
  const label =
    !item.label.trim() || item.label === previousDefinition.label
      ? nextDefinition.label
      : item.label;
  return { ...item, href, platform, iconKey: platform, label };
}

export function moveNavbarSocialLink(
  items: readonly NavbarSocialLinkItem[],
  from: number,
  to: number
) {
  if (
    from < 0 ||
    to < 0 ||
    from >= items.length ||
    to >= items.length ||
    from === to
  ) {
    return [...items];
  }
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function serializeNavbarSocialLinks(
  items: readonly NavbarSocialLinkItem[]
) {
  return items.map(({ id, label, platform, href, iconKey, isPublished }) => ({
    id,
    label,
    platform,
    href,
    iconKey,
    isPublished,
  }));
}
