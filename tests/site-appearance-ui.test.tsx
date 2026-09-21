import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AppearanceEditor from "@/components/admin/v2/AppearanceEditor";
import NavbarNameEditor from "@/components/admin/v2/NavbarNameEditor";
import { NavbarUnsavedChangesProvider } from "@/components/admin/v2/NavbarUnsavedChangesProvider";
import GalleryFooter from "@/components/GalleryFooter";
import { createFallbackAppearanceEditorSnapshot, INITIAL_APPEARANCE_SAVE_STATE, type AppearanceSaveState } from "@/lib/admin/site-appearance-editor";
import type { AdminAppearanceData } from "@/lib/admin/site-appearance";
import { FALLBACK_CONTENT } from "@/lib/content/fallback";
import { BODY_FONT_OPTIONS, DISPLAY_FONT_OPTIONS, UI_FONT_OPTIONS } from "@/lib/content/fonts";

const mocks = vi.hoisted(() => ({ save: vi.fn(), guard: vi.fn(), state: null as AppearanceSaveState | null, pending: false }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/admin/v2/settings/appearance/actions", () => ({ saveSiteAppearanceV2: mocks.save }));
vi.mock("@/components/admin/useUnsavedChangesGuard", () => ({ default: mocks.guard }));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, useActionState: (_action: unknown, initial: AppearanceSaveState) => [mocks.state || initial, () => {}, mocks.pending] };
});

function read(path: string) { return readFileSync(new URL(`../${path}`, import.meta.url), "utf8"); }
const appearanceSource = read("components/admin/v2/AppearanceEditor.tsx");
const nameSource = read("components/admin/v2/NavbarNameEditor.tsx");
const providerSource = read("components/admin/v2/NavbarUnsavedChangesProvider.tsx");
const navbarPageSource = read("app/admin/v2/navigation/page.tsx");
const footerSource = read("components/GalleryFooter.tsx");
const data: AdminAppearanceData = { snapshot: createFallbackAppearanceEditorSnapshot(), isConfigured: true, migrationRequired: false };
function appearance(overrides: Partial<AdminAppearanceData> = {}) {
  return renderToStaticMarkup(<AppearanceEditor data={{ ...data, ...overrides }} settings={FALLBACK_CONTENT.settings} socialLinks={FALLBACK_CONTENT.socialLinks} />);
}
function name(overrides: Partial<AdminAppearanceData> = {}) {
  return renderToStaticMarkup(<NavbarUnsavedChangesProvider><NavbarNameEditor {...data} {...overrides} /></NavbarUnsavedChangesProvider>);
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.state = null; mocks.pending = false;
  mocks.guard.mockReturnValue({ markDirty: vi.fn(), clearDirty: vi.fn(), confirmDiscard: vi.fn() });
});

describe("Appearance and navbar name V2 controls", () => {
  it("renders three independently labelled font catalogues and exactly two footer effects", () => {
    const html = appearance();
    for (const [id, options] of [["displayFont", DISPLAY_FONT_OPTIONS], ["bodyFont", BODY_FONT_OPTIONS], ["uiFont", UI_FONT_OPTIONS]] as const) {
      const select = html.match(new RegExp(`<select id="${id}"[^>]*>(.*?)</select>`))?.[1];
      expect(select).toBeTruthy();
      expect(select?.match(/<option /g)).toHaveLength(options.length);
      for (const option of options) expect(select).toContain(`value="${option.key}"`);
      expect(html).toContain(`<label for="${id}"`);
    }
    expect(html.match(/type="radio"/g)).toHaveLength(2);
    expect(html).toContain('value="soul"'); expect(html).toContain('value="red-light"');
    expect(html).toContain('data-footer-effect="soul"'); expect(html).toContain('inert=""');
    expect(html).toContain('name="section" value="appearance"');
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it.each([{ isConfigured: false }, { migrationRequired: true }, { loadError: "Service could not load settings" }])("keeps settings and name editing read-only for unavailable data %#", (overrides) => {
    const html = appearance(overrides);
    expect(html).toMatch(/<fieldset disabled=""/);
    expect(html).toContain('role="alert"');
    expect(html).toMatch(/<button type="submit" disabled=""[^>]*>Save appearance<\/button>/);
    const nameHtml = name(overrides);
    expect(nameHtml).toMatch(/<input id="navbar-owner-name"[^>]*disabled=""/);
    expect(nameHtml).toMatch(/<button type="submit" disabled=""[^>]*>Save owner name<\/button>/);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("keeps unchanged forms unpublished and name copy scoped to shared owner identity", () => {
    const html = name();
    expect(html).toContain('name="section" value="name"');
    expect(html).toContain('maxLength="220"');
    expect(html).toContain("page-specific headlines stay unchanged");
    expect(html).toMatch(/<button type="submit" disabled=""[^>]*>Save owner name<\/button>/);
    expect(appearance()).toMatch(/<button type="submit" disabled=""[^>]*>Save appearance<\/button>/);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("blocks re-submission after conflicts and offers an explicit guarded reload", () => {
    mocks.state = { ...INITIAL_APPEARANCE_SAVE_STATE, status: "conflict", message: "Site settings changed" };
    for (const html of [appearance(), name()]) {
      expect(html).toContain("Reload saved settings");
      expect(html).toMatch(/<button type="submit" disabled=""/);
      expect(html).toContain("Site settings changed");
    }
    for (const source of [appearanceSource, nameSource]) expect(source).toContain("confirmDiscard(() => window.location.reload())");
  });
  it("shares the Navbar dirty guard and bypasses only its own saved forms", () => {
    expect(nameSource).toContain('useNavbarUnsavedChanges("name")');
    expect(providerSource).toContain('"navigation" | "shortcuts" | "name"');
    expect(providerSource).toContain("dirtySourcesRef.current.delete(source)");
    expect(providerSource).toContain("if (!dirtySourcesRef.current.size)");
    expect(navbarPageSource).toMatch(/<NavbarUnsavedChangesProvider>[\s\S]*<NavbarNameEditor[\s\S]*<NavigationManager[\s\S]*<NavbarSocialLinksManager[\s\S]*<\/NavbarUnsavedChangesProvider>/);
    for (const source of [appearanceSource, nameSource]) {
      expect(source).toContain('data-unsaved-guard-bypass="true"');
      expect(source).not.toContain("data-unsaved-guard-ignore");
      expect(source).toContain("parseAppearanceSubmission(");
    }
    expect(nameSource).toContain("runEditorSave(previous");
    expect(nameSource).toContain("setSaved(confirmed.data.payload)");
    expect(nameSource).toContain("setVersions(confirmed.data.versions)");
    expect(nameSource).toContain("clearDirty(() => router.refresh())");
    expect(appearanceSource).toContain("[result.section]: confirmed.data.payload");
    expect(appearanceSource).toContain("setSaved(nextSaved)");
    expect(appearanceSource).toContain('result.status === "saved"');
    expect(appearanceSource).toContain("setVersions(result.versions)");
    expect(appearanceSource).toContain("JSON.stringify(nextSaved) === JSON.stringify(nextDraft)");
    appearance(); expect(mocks.guard).toHaveBeenCalledWith(undefined, true);
  });
  it("offers live footer regions and no longer sends profile copy to Classic", () => {
    const html = appearance();
    expect(html).toContain('aria-label="Edit Profile &amp; introduction"');
    expect(html).toContain('aria-label="Edit Footer invitation &amp; buttons"');
    expect(html).toContain('aria-label="Edit Footer social headings"');
    expect(html).toContain("Profile &amp; introduction");
    expect(html).toContain("Footer content");
    expect(read("app/admin/v2/settings/appearance/page.tsx")).not.toContain("/admin/content");
  });
  it("scopes a missing 0039 warning to the new footer section", () => {
    const html = appearance({ footerMigrationRequired: true });
    expect(html).toContain("Footer content requires migration 0039");
    expect(html).not.toMatch(/<fieldset disabled=""/);
  });
  it("keeps draft state and blocks blind retry after an uncertain save response", () => {
    expect(appearanceSource).toContain("setSaveUncertain(true)");
    expect(appearanceSource).toContain("The save response was lost. Your draft was kept.");
    expect(appearanceSource).toContain('state.status === "conflict" || saveUncertain');
    expect(appearanceSource).toContain('!sectionDirty || saveUncertain || state.status === "conflict"');
  });
  it("confirms a section discard through the shared guard while preserving other section drafts", () => {
    expect(appearanceSource).toContain("confirmDiscard(() => change(section, saved[section]))");
    expect(appearanceSource).toContain("JSON.stringify(nextDraft) === JSON.stringify(saved)");
    expect(appearanceSource).not.toContain("window.confirm(");
  });
  it("uses the public footer renderer for both effects while making preview links inert", () => {
    for (const footerEffect of ["soul", "red-light"] as const) {
      const props = { artistName: "Owner", location: "Prague", socialLinks: FALLBACK_CONTENT.socialLinks, footerEffect };
      const preview = renderToStaticMarkup(<GalleryFooter {...props} preview />);
      const live = renderToStaticMarkup(<GalleryFooter {...props} />);
      expect(preview).toContain(`data-footer-effect="${footerEffect}"`);
      expect(preview).toContain('inert=""'); expect(live).not.toContain('inert=""');
      expect(preview.includes("soul-orb__core")).toBe(footerEffect === "soul");
    }
    expect(footerSource).toContain('window.matchMedia("(prefers-reduced-motion: reduce)").matches');
    expect(footerSource).toContain('event.pointerType === "touch"');
  });
});
