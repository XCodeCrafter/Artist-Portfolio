import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import AdminV2PreviewLayout from "@/app/admin/v2-preview/layout";

const authMocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(async () => ({
    id: "11111111-1111-4111-8111-111111111111",
    email: "owner@example.com",
    role: "owner" as const,
  })),
}));

vi.mock("@/lib/admin/auth", () => ({
  requireAdmin: authMocks.requireAdmin,
}));

const previewLayoutSource = readFileSync(
  new URL("../app/admin/v2-preview/layout.tsx", import.meta.url),
  "utf8"
);

describe("Admin V2 preview authentication boundary", () => {
  it("authenticates before returning preview content", async () => {
    const children = "protected preview";

    await expect(AdminV2PreviewLayout({ children })).resolves.toBe(children);
    expect(authMocks.requireAdmin).toHaveBeenCalledOnce();
    expect(previewLayoutSource.indexOf("await requireAdmin()"))
      .toBeLessThan(previewLayoutSource.indexOf("return children"));
  });

  it.each(["bio", "gallery", "music", "showreel", "contact"])(
    "covers the %s preview route",
    (route) => {
      expect(
        existsSync(
          new URL(`../app/admin/v2-preview/${route}/page.tsx`, import.meta.url)
        )
      ).toBe(true);
    }
  );

  it("keeps the preview subtree dynamic", () => {
    expect(previewLayoutSource).toContain(
      'export const dynamic = "force-dynamic";'
    );
  });
});
