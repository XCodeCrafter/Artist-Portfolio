import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : /\.[cm]?[jt]sx?$/.test(path) ? [path] : [];
  });
}
function dependencies(file: string): string[] {
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const imports: string[] = [];
  function visit(node: ts.Node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) imports.push(node.moduleSpecifier.text);
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) imports.push(node.arguments[0].text);
    ts.forEachChild(node, visit);
  }
  visit(source);
  return imports.flatMap(specifier => {
    const base = specifier.startsWith("@/") ? resolve(root, specifier.slice(2)) : specifier.startsWith(".") ? resolve(dirname(file), specifier) : null;
    if (!base) return [];
    const target = [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]
      .find(path => /\.[cm]?[jt]sx?$/.test(path) && existsSync(path));
    return target ? [target] : [];
  });
}

describe("V2 is independent of Classic-only route modules", () => {
  it("has no direct or transitive imports from disposable Classic screens/actions", () => {
    const queue = [...sourceFiles(resolve(root, "app/admin/v2")), ...sourceFiles(resolve(root, "components/admin/v2"))];
    const visited = new Set<string>();
    const violations: string[] = [];
    for (let index = 0; index < queue.length; index++) {
      const file = queue[index];
      if (visited.has(file)) continue;
      visited.add(file);
      for (const dependency of dependencies(file)) {
        const path = relative(root, dependency).replaceAll("\\", "/");
        if (/^app\/admin\/(?:content|media|analytics|security)\//.test(path)) violations.push(`${relative(root, file)} -> ${path}`);
        else queue.push(dependency);
      }
    }
    expect(visited.size).toBeGreaterThan(80);
    expect(violations).toEqual([]);
  });

  it.each(["Home", "Bio", "Music", "Gallery", "Showreel", "Contact"])("keeps %s editing inside V2", name => {
    const editor = read(`components/admin/v2/${name}Editor.tsx`);
    expect(editor).not.toMatch(/Open classic|href=["']\/admin\/(?:content|media|analytics|security)(?:[?#"'])/i);
    expect(editor).toContain("HeroFramingControls");
  });

  it("retains explicit Classic rollback and shared auth routes until final approval", () => {
    expect(read("components/admin/v2/AdminV2Shell.tsx")).toContain('href="/admin"');
    for (const path of ["app/admin/page.tsx", "app/admin/content/page.tsx", "app/admin/media/page.tsx", "app/admin/analytics/page.tsx", "app/admin/security/page.tsx", "app/admin/auth/callback/route.ts", "app/admin/reset-password/page.tsx", "app/admin/forgot-password/page.tsx"]) expect(existsSync(resolve(root, path)), path).toBe(true);
    expect(read("app/admin/layout.tsx")).toMatch(/index: false/);
    expect(read("app/admin/v2/layout.tsx")).toContain("requireAdmin");
  });
});
