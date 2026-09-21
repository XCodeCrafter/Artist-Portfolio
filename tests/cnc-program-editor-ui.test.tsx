import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CncProgramsEditor from "@/components/admin/v2/CncProgramsEditor";
import type { CncProgramsSnapshot, CncProgramsSaveState } from "@/lib/admin/cnc-program-editor";

const mocks = vi.hoisted(() => ({ save: vi.fn(), state: null as CncProgramsSaveState | null }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/admin/v2/pages/home/programs/actions", () => ({ saveCncProgramsV2: mocks.save }));
vi.mock("@/components/admin/useUnsavedChangesGuard", () => ({ default: () => ({ markDirty: vi.fn(), clearDirty: vi.fn(), confirmDiscard: vi.fn() }) }));
vi.mock("react", async (original) => {
  const react = await original<typeof import("react")>();
  return { ...react, useActionState: (_action: unknown, initial: CncProgramsSaveState) => [mocks.state || initial, () => {}, false] };
});
const snapshot: CncProgramsSnapshot = {
  programs: [{ id: "cnc-one", fileName: "PART.NC", title: "Sample", description: "Selected work", dialect: "iso", source: "; <script>alert(1)</script>\nG0 X0\nM30", previewLineCount: 6, isPublished: false }],
  expectedVersions: { "cnc-one": "2026-09-20T10:00:00.000001Z" },
};
function render(disabled = false, hidden = false, data = snapshot) {
  return renderToStaticMarkup(<CncProgramsEditor snapshot={data} disabled={disabled} loadError={disabled ? "Unavailable" : ""} homeSectionHidden={hidden} copy={{ eyebrow: "CODE", title: "Code in motion", body: "Selected programs" }} />);
}
beforeEach(() => { vi.clearAllMocks(); mocks.state = null; });
describe("CNC V2 workspace", () => {
  it("renders the real public code preview beside labelled edit controls", () => {
    const html = render();
    expect(html).toContain('aria-label="Live program preview"');
    expect(html).toContain('aria-label="Edit program Sample"');
    expect(html).toContain("cnc-token-comment");
    expect(html).toContain("Hidden draft");
    for (const id of ["cnc-program-title", "cnc-program-fileName", "cnc-program-description", "cnc-dialect", "cnc-preview-lines", "cnc-source"]) {
      expect(html).toContain('for="' + id + '"');
      expect(html).toContain('id="' + id + '"');
    }
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("makes unavailable data read-only and reports Home visibility separately", () => {
    const html = render(true, true);
    expect(html).toContain('<fieldset disabled=""');
    expect(html).toContain("Unavailable");
    expect(html).toContain("Code in motion is hidden");
    expect(html).toContain('disabled=""');
  });
  it("gives an empty collection a usable add action and describes deletion semantics", () => {
    const html = render(false, false, { programs: [], expectedVersions: snapshot.expectedVersions });
    expect(html).toContain("Add program");
    expect(html).toContain("No code programs");
    expect(html).toContain("Saving an empty collection removes the existing programs");
  });
  it("offers explicit recovery after an unconfirmed commit", () => {
    mocks.state = { status: "error", message: "Save result unavailable", eventId: "result", requiresReload: true };
    const html = render();
    expect(html).toContain("Reload saved programs");
    expect(html).toContain('<fieldset disabled=""');
  });
  it("routes HOME to V2 and preserves the versioned unsaved-draft contract", () => {
    const source = readFileSync(new URL("../components/admin/v2/CncProgramsEditor.tsx", import.meta.url), "utf8");
    const home = readFileSync(new URL("../components/admin/v2/HomeEditor.tsx", import.meta.url), "utf8");
    expect(home).toContain('href="/admin/v2/pages/home/programs"');
    expect(home).not.toContain('href="/admin/content#home-cnc"');
    expect(source).toContain("useUnsavedChangesGuard()");
    expect(source).toContain("expectedVersions: saved.expectedVersions");
    expect(source).toContain("onReset={(event) => event.preventDefault()}");
    expect(source).toContain("Confirm program removal");
    expect(source).toContain("confirmDiscard(() => { setPrograms(saved.programs)");
    expect(source).toContain('setRemoveId(""); setViewerId("");');
    expect(source).not.toContain("window.confirm(");
  });
});
