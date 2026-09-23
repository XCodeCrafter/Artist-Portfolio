import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import ts from "typescript";

const read = (page: string) => readFileSync(new URL(`../components/admin/v2/${page}Editor.tsx`, import.meta.url), "utf8");

describe("Photo framing editor placement wiring", () => {
  it.each(["Home", "Bio", "Music", "Gallery", "Showreel"])("%s preserves the Hero editor while adding independent photo controls", page => {
    const source = read(page);
    expect(source).toContain("<HeroFramingControls");
    expect(source).toContain("<PhotoFramingControls");
    expect(source).toContain("onDeviceChange=");
    expect(source).not.toContain("MEDIA_UPLOAD_PROVIDER");
  });
  it("wires all three separate Home placements into their section drafts", () => {
    const source = read("Home");
    expect(source).toContain("value={draft.about.framing}");
    expect(source).toContain("onChange={framing => patch({ framing })}");
    expect(source).toContain("value={draft.feature.posterFraming}");
    expect(source).toContain("onChange={posterFraming => patch({ posterFraming })}");
    expect(source).toContain("value={image.framing}");
    expect(source).toContain("onChange={framing => changeImage({ framing })}");
  });
  it.each([
    ["Bio", "props.onPortraitChange(index, { framing })"],
    ["Music", "onPlatformChange(index, { framing })"],
    ["Gallery", "props.onFrameChange(index, { framing })"],
    ["Showreel", "props.onWorkChange(index, { framing })"],
  ])("%s updates the exact item and grants new-item controls only after capability confirmation", (page, change) => {
    const source = read(page);
    expect(source).toContain("value={item.framing}");
    expect(source).toContain(change);
    expect(source).toContain("...(snapshot.photoFramingAvailable ? { framing: null } : {})");
  });
});

describe("Client-safe media constants", () => {
  it.each(["components/admin/v2/ShowreelEditor.tsx", "components/admin/MediaManager.tsx"])("%s cannot pull the server-only photo loader through the content barrel", file => {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const imports = tree.statements.filter(ts.isImportDeclaration);
    const videoTypes = imports.filter(statement => {
      const clause = statement.importClause;
      return !clause?.isTypeOnly && clause?.namedBindings && ts.isNamedImports(clause.namedBindings) &&
        clause.namedBindings.elements.some(binding => !binding.isTypeOnly && (binding.propertyName ?? binding.name).text === "VIDEO_TYPES");
    });
    expect(videoTypes).toHaveLength(1);
    expect(videoTypes[0].moduleSpecifier.getText(tree)).toBe('"@/lib/content/types"');
    const runtimeImports = imports.filter(statement => {
      const clause = statement.importClause;
      if (!clause) return true;
      if (clause.isTypeOnly) return false;
      if (clause.name || !clause.namedBindings || ts.isNamespaceImport(clause.namedBindings)) return true;
      return clause.namedBindings.elements.some(binding => !binding.isTypeOnly);
    }).map(statement => ts.isStringLiteral(statement.moduleSpecifier) ? statement.moduleSpecifier.text : "");
    expect(runtimeImports).not.toContain("@/lib/content");
    expect(runtimeImports).not.toContain("@/lib/content/photo-framing.server");
  });
});
