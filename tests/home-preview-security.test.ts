import { NextRequest, NextResponse } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { proxy } from "@/proxy";

vi.mock("@/lib/supabase/proxy", () => ({
  updateSession: vi.fn(async () => NextResponse.next()),
}));

describe("HOME preview framing boundary", () => {
  it.each(["/admin/v2-preview/home", "/admin/v2-preview/home/"])(
    "permits the authenticated preview at %s in the same-origin editor",
    async (path) => {
      const response = await proxy(new NextRequest(`http://localhost:3000${path}`));
      expect(response.headers.get("X-Frame-Options")).toBe("SAMEORIGIN");
      expect(response.headers.get("Content-Security-Policy")).toContain("frame-ancestors 'self'");
    }
  );

  it.each(["/admin/v2/pages/home", "/admin/v2-preview/home/extra", "/admin/v2-preview/home-other"])(
    "keeps non-preview or lookalike route %s protected from framing",
    async (path) => {
      const response = await proxy(new NextRequest(`http://localhost:3000${path}`));
      expect(response.headers.get("X-Frame-Options")).toBe("DENY");
      expect(response.headers.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");
    }
  );
});
