import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  getAdminSecurityPath,
  parseAdminSecuritySurface,
} from "@/lib/admin/security-routes";

const v2Page = readFileSync(
  new URL("../app/admin/v2/security/page.tsx", import.meta.url),
  "utf8"
);
const classicPage = readFileSync(
  new URL("../app/admin/security/page.tsx", import.meta.url),
  "utf8"
);
const overview = readFileSync(
  new URL("../app/admin/v2/page.tsx", import.meta.url),
  "utf8"
);
const shellCatalog = readFileSync(
  new URL("../lib/admin/v2-shell.ts", import.meta.url),
  "utf8"
);
const shell = readFileSync(
  new URL("../components/admin/v2/AdminV2Shell.tsx", import.meta.url),
  "utf8"
);
const securityCenter = readFileSync(
  new URL("../components/admin/SecurityCenter.tsx", import.meta.url),
  "utf8"
);

describe("Admin V2 Security routing", () => {
  it("accepts only the two fixed surfaces and defaults every forged value", () => {
    expect(parseAdminSecuritySurface("v2")).toBe("v2");
    expect(parseAdminSecuritySurface("classic")).toBe("classic");
    expect(parseAdminSecuritySurface("https://attacker.example")).toBe(
      "classic"
    );
    expect(parseAdminSecuritySurface("/admin/v2/security?next=evil")).toBe(
      "classic"
    );
    expect(parseAdminSecuritySurface(null)).toBe("classic");
    expect(getAdminSecurityPath("classic")).toBe("/admin/security");
    expect(getAdminSecurityPath("v2")).toBe("/admin/v2/security");
  });

  it("authenticates explicitly before the V2 service-role data load", () => {
    expect(v2Page.indexOf("await requireAdmin()"))
      .toBeGreaterThan(-1);
    expect(v2Page.indexOf("await requireAdmin()"))
      .toBeLessThan(v2Page.indexOf("await getSecurityCenterData(admin)"));
    expect(v2Page).toContain('surface="v2"');
    expect(classicPage).toContain("<SecurityCenter");
    expect(classicPage).not.toContain('surface="v2"');
  });

  it("is discoverable and active in the V2 overview and shell", () => {
    expect(overview).toContain('href="/admin/v2/security"');
    expect(shellCatalog).toContain('href: "/admin/v2/security"');
    expect(shellCatalog).toContain('key: "security"');
    expect(shell).toContain("security: <FaShieldAlt />");
  });
});

describe("Admin V2 Security workspace contract", () => {
  it("keeps all mutations on their originating allowlisted surface", () => {
    expect(
      securityCenter.match(
        /name="securitySurface" type="hidden" value=\{surface\}/g
      )
    ).toHaveLength(4);
  });

  it("puts access before activity and keeps technical checks under Advanced", () => {
    const accessSection = securityCenter.indexOf('id: "access"');
    const activitySection = securityCenter.indexOf('id: "activity"');

    expect(accessSection).toBeGreaterThan(-1);
    expect(activitySection).toBeGreaterThan(accessSection);
    expect(securityCenter).toContain(
      'label: surface === "v2" ? "Advanced" : "Configuration"'
    );
    expect(securityCenter).toContain('id: "configuration"');
    expect(securityCenter).toContain('surface === "v2"\n      ? surfaceSections');
  });

  it("avoids the V2 mobile header while preserving the classic sticky offset", () => {
    expect(securityCenter).toContain(
      'surface === "v2" ? "top-[76px] lg:top-3" : "top-3"'
    );
  });

  it("keeps the existing safety and accessibility affordances", () => {
    expect(securityCenter).toContain("useUnsavedChangesGuard(");
    expect(securityCenter).toContain('role="tablist"');
    expect(securityCenter).toContain(
      '["ArrowLeft", "ArrowRight", "Home", "End"]'
    );
    expect(securityCenter).toContain("Revoke all sessions");
    expect(securityCenter).toContain("Reset MFA");
    expect(securityCenter).toContain("Supabase Auth user ID · Advanced");
  });
});
