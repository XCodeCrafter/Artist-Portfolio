import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const editor = readFileSync(
  new URL("../components/admin/v2/GalleryEditor.tsx", import.meta.url),
  "utf8"
);
const page = readFileSync(
  new URL("../app/admin/v2/pages/gallery/page.tsx", import.meta.url),
  "utf8"
);
const overview = readFileSync(
  new URL("../app/admin/v2/page.tsx", import.meta.url),
  "utf8"
);
const shell = readFileSync(
  new URL("../lib/admin/v2-shell.ts", import.meta.url),
  "utf8"
);
const classicMediaActions = readFileSync(
  new URL("../app/admin/media/actions.ts", import.meta.url),
  "utf8"
);
const classicMediaPage = readFileSync(
  new URL("../app/admin/media/page.tsx", import.meta.url),
  "utf8"
);

describe("Admin V2 Gallery editor UI contract", () => {
  it("is reachable from both the V2 overview and sidebar", () => {
    expect(overview).toContain('href="/admin/v2/pages/gallery"');
    expect(shell).toContain('href: "/admin/v2/pages/gallery"');
    expect(page).toContain("<GalleryEditor");
  });

  it("authenticates before loading the private snapshot and media", () => {
    expect(page.indexOf("await requireAdmin()"))
      .toBeLessThan(page.indexOf("getAdminGalleryEditorData()"));
    expect(page).toContain("getMediaAssets()");
    expect(page).toContain("gallery.migrationRequired");
  });

  it("keeps the accepted preview and inspector controls", () => {
    expect(editor).toContain("<GalleryPreviewFrame");
    expect(editor).toContain('setDevice("desktop")');
    expect(editor).toContain('setDevice("mobile")');
    expect(editor).toContain("<dialog");
    expect(editor).toContain("Open inspector");
    expect(editor).toContain("GALLERY_EDITOR_SECTIONS.map");
  });

  it("submits only the active section with its optimistic versions", () => {
    expect(editor).toContain("getGallerySectionPayload(draft, activeSection)");
    expect(editor).toContain("getGallerySectionVersions(versions, activeSection)");
    expect(editor).toContain("saveGallerySectionV2(previousState, formData)");
    expect(editor).toContain("requireExactCollectionVersions: true");
  });

  it("hides saved frames and discards only unsaved frame drafts", () => {
    expect(editor).toContain('isMosaic: !visible');
    expect(editor).toContain("if (id in versionsRef.current.frames.items) return;");
    expect(editor).toContain("Hidden saved frames remain recoverable");
    expect(editor).toContain("moveGalleryEditorItem");
    expect(editor).not.toContain("deleteGallery");
  });

  it("guards navigation while any Gallery section is dirty", () => {
    expect(editor).toContain("useUnsavedChangesGuard(");
    expect(editor).toContain("getDirtyGallerySections");
    expect(editor).toContain('data-unsaved-guard-bypass="true"');
  });

  it("locks classic Gallery writes after the V2 snapshot becomes available", () => {
    expect(classicMediaActions).toContain("handOffLegacyGalleryWrite");
    expect(classicMediaActions).toContain(
      'redirect("/admin/v2/pages/gallery?from=classic")'
    );
    expect(classicMediaPage).toContain("galleryV2Enabled=");
  });
});
