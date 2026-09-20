import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  saveCncPrograms,
  updateAboutHome,
  updateHomePresentation,
  updatePageHero,
} from "@/app/admin/content/actions";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(async () => ({ id: "admin-id" })),
  verifyOrigin: vi.fn(async () => true),
  createClient: vi.fn<() => unknown>(),
  audit: vi.fn(async () => ({ ok: true })),
  parseSnapshot: vi.fn<(value: unknown) => unknown>(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/admin/auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/admin/action-security", () => ({
  verifyAdminActionOrigin: mocks.verifyOrigin,
}));
vi.mock("@/lib/admin/service", () => ({
  createAdminServiceClient: mocks.createClient,
}));
vi.mock("@/lib/admin/audit", () => ({ writeAuditLog: mocks.audit }));
vi.mock("@/lib/admin/home-editor", () => ({
  parseHomeEditorSnapshot: mocks.parseSnapshot,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({
  redirect: (url: string): never => { throw new Error(`redirect:${url}`); },
}));

function form(values: Record<string, string>) {
  const result = new FormData();
  for (const [key, value] of Object.entries(values)) result.set(key, value);
  return result;
}

const cases: Array<{
  label: string;
  action: (form: FormData) => Promise<void>;
  values: Record<string, string>;
  table: string;
  status: string;
}> = [
  {
    label: "Hero",
    action: updatePageHero,
    values: {
      pageSlug: "home", title: "HOME", subtitle: "Artist", mediaType: "image",
      backgroundSrc: "/images/hero.jpg", sortOrder: "0",
    },
    table: "page_heroes",
    status: "saved-hero",
  },
  {
    label: "About",
    action: updateAboutHome,
    values: { heading: "About", body: "An artist", imageSrc: "/images/about.jpg" },
    table: "about_home",
    status: "saved-home",
  },
  {
    label: "presentation",
    action: updateHomePresentation,
    values: { updatesHeading: "Code in motion", storyTitle: "Stories" },
    table: "media_assets",
    status: "saved-home-presentation",
  },
];

function clientWithSnapshot(result: { data?: unknown; error: unknown }) {
  const rpc = vi.fn(async () => result);
  const upsert = vi.fn(async () => ({ error: null }));
  const from = vi.fn(() => ({ upsert }));
  mocks.createClient.mockReturnValue({ rpc, from });
  return { rpc, from, upsert };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdmin.mockResolvedValue({ id: "admin-id" });
  mocks.verifyOrigin.mockResolvedValue(true);
  mocks.parseSnapshot.mockImplementation((value) => value === "valid" ? {} : null);
});

describe.each(cases)("classic Home $label handoff", ({ action, values, table, status }) => {
  it("hands valid migrated content to V2 without writing stale legacy fields", async () => {
    const client = clientWithSnapshot({ data: "valid", error: null });
    await expect(action(form(values))).rejects.toThrow(
      "redirect:/admin/v2/pages/home?from=classic"
    );
    expect(client.rpc).toHaveBeenCalledWith("get_home_page_v2_snapshot", { p_site_id: "main" });
    expect(mocks.parseSnapshot).toHaveBeenCalledWith("valid");
    expect(client.from).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it.each([
    { code: "PGRST202", message: "Snapshot RPC is missing" },
    { code: "42883", message: "function get_home_page_v2_snapshot does not exist" },
  ])("preserves pre-migration editing only for a missing RPC ($code)", async (error) => {
    const client = clientWithSnapshot({ error });
    await expect(action(form(values))).rejects.toThrow(`status=${status}`);
    expect(client.from).toHaveBeenCalledWith(table);
    expect(client.upsert).toHaveBeenCalledOnce();
  });

  it.each([
    { data: null, error: null },
    { data: {}, error: null },
    { error: { code: "42501", message: "permission denied" } },
    { error: { code: "42883", message: "unrelated_function does not exist" } },
  ])("blocks legacy writes when snapshot availability cannot be verified", async (result) => {
    const client = clientWithSnapshot(result);
    await expect(action(form(values))).rejects.toThrow("status=home-v2-unavailable");
    expect(client.from).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("checks origin before opening the service client or checking the migration", async () => {
    mocks.verifyOrigin.mockResolvedValue(false);
    await expect(action(form(values))).rejects.toThrow("status=security-error");
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});

describe("classic CNC manager alongside Home V2", () => {
  it("continues saving program sources without invoking the Home content handoff", async () => {
    const client = clientWithSnapshot({ error: null });
    await expect(saveCncPrograms(form({
      programsJson: JSON.stringify({ expectedVersions: {}, programs: [] }),
    }))).rejects.toThrow("status=saved-cnc-programs");
    expect(client.rpc).toHaveBeenCalledExactlyOnceWith("replace_cnc_programs", {
      p_expected_versions: {}, p_programs: [],
    });
    expect(mocks.parseSnapshot).not.toHaveBeenCalled();
    expect(mocks.audit).toHaveBeenCalledOnce();
  });
});
