import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPublishedHomeDraft } from "@/lib/content/home.server";
import { createHomeDraftFromContent } from "@/lib/admin/home-editor";
import { FALLBACK_CONTENT } from "@/lib/content/fallback";

const mocks = vi.hoisted(() => ({ createPublicContentClient: vi.fn<() => unknown>() }));
vi.mock("@/lib/content/supabase", () => ({ createPublicContentClient: mocks.createPublicContentClient }));

function clientResult(data: unknown, error: unknown = null) {
  const returns = vi.fn(async () => ({ data, error }));
  const limit = vi.fn(() => ({ returns }));
  const eq = vi.fn(() => ({ limit }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  mocks.createPublicContentClient.mockReturnValue({ from });
  return { from, select, eq };
}

beforeEach(() => vi.clearAllMocks());

describe("published HOME configuration", () => {
  it.each([[], null])("does not revive legacy sections when the singleton is missing or inaccessible (%j)", async (data) => {
    const client = clientResult(data);
    await expect(getPublishedHomeDraft(FALLBACK_CONTENT)).rejects.toThrow("Missing HOME configuration.");
    expect(client.from).toHaveBeenCalledWith("home_page_config");
    // '*' reads framing when present without requesting a missing 0046 column.
    expect(client.select).toHaveBeenCalledWith("*");
    expect(client.eq).toHaveBeenCalledWith("id", "main");
  });

  it.each(["42P01", "PGRST205"])("falls back only for missing HOME schema (%s)", async (code) => {
    clientResult(null, { code, message: 'relation "public.home_page_config" does not exist' });
    expect(await getPublishedHomeDraft(FALLBACK_CONTENT)).toEqual(createHomeDraftFromContent(FALLBACK_CONTENT));
  });

  it("preserves the saved order and disabled flags", async () => {
    const draft = createHomeDraftFromContent(FALLBACK_CONTENT);
    draft.layout.reverse();
    draft.layout[0].enabled = false;
    clientResult([{ draft }]);
    expect(await getPublishedHomeDraft(FALLBACK_CONTENT)).toEqual(draft);
  });

  it.each([
    { code: "42501", message: "permission denied" },
    { code: "08006", message: "database unavailable" },
    { code: "42P01", message: 'relation "other_table" does not exist' },
  ])("does not resurrect hidden sections after read errors ($code)", async (error) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    clientResult(null, error);
    await expect(getPublishedHomeDraft(FALLBACK_CONTENT)).rejects.toThrow("Unable to load HOME configuration.");
  });

  it("rejects malformed stored layouts instead of silently showing defaults", async () => {
    const draft = createHomeDraftFromContent(FALLBACK_CONTENT);
    clientResult([{ draft: { ...draft, layout: [{ id: "hero", enabled: true }] } }]);
    await expect(getPublishedHomeDraft(FALLBACK_CONTENT)).rejects.toThrow("Invalid HOME configuration.");
  });

  it("supports local fallback when Supabase is not configured", async () => {
    mocks.createPublicContentClient.mockReturnValue(null);
    expect(await getPublishedHomeDraft(FALLBACK_CONTENT)).toEqual(createHomeDraftFromContent(FALLBACK_CONTENT));
  });
});
