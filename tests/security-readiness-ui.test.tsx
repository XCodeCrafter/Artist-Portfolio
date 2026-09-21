import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SecurityCheckCard, SecurityPosture } from "@/components/admin/SecurityCenter";
import type { SecurityCheck, SecurityEventSummary } from "@/lib/admin/security";

vi.mock("@/lib/admin/security-actions", () => ({ deleteAdminProfile: vi.fn(), resetAdminMfa: vi.fn(), revokeAdminSessions: vi.fn(), saveAdminProfile: vi.fn() }));

describe("Honest readiness presentation", () => {
  it.each([
    ["pass", true, "Verified"], ["fail", false, "Needs attention"], ["unknown", false, "Not verified"],
  ] as const)("labels %s distinctly", (status, ok, label) => {
    const html = renderToStaticMarkup(<SecurityCheckCard check={{ label: "Public signup", status, ok, critical: true, detail: "A scoped read-only check.", verification: "runtime" }} />);
    expect(html).toContain(label);
    if (status === "unknown") expect(html).not.toContain("Needs attention");
    if (status !== "pass") expect(html).not.toContain(">Verified<");
  });

  it("separates optional configuration and implemented code from verified runtime", () => {
    const html = renderToStaticMarkup(<SecurityCheckCard check={{ label: "Optional control", status: "pass", ok: true, critical: false, detail: "Implemented, not runtime tested.", verification: "implemented" }} />);
    expect(html).toContain("Implemented");
    expect(html).toContain("Optional setup");
    expect(html).not.toContain(">Verified<");
  });

  it("counts unknown checks separately and never promises the portfolio is protected", () => {
    const checks: SecurityCheck[] = [
      { label: "Known good", status: "pass", ok: true, detail: "Available" },
      { label: "Known missing", status: "fail", ok: false, detail: "Missing" },
      { label: "Unavailable", status: "unknown", ok: false, detail: "Retry" },
      { label: "Built in", ok: true, detail: "Code", verification: "implemented" },
    ];
    const html = renderToStaticMarkup(<SecurityPosture checks={checks} profiles={[]} summary={{ total7d: 0 } as SecurityEventSummary} />);
    expect(html).toContain("1 need attention · 1 not verified.");
    expect(html).toContain("1/3");
    expect(html).toContain("not a security guarantee");
    expect(html).not.toContain("Portfolio protected");
  });
});
