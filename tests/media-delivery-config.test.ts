import { afterEach, describe, expect, it, vi } from "vitest";
import { createContentSecurityPolicy } from "@/lib/security/csp";

function directive(policy: string, name: string) {
  return policy
    .split("; ")
    .find((value) => value.startsWith(`${name} `));
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("R2 delivery allowlists", () => {
  it("allows the configured origin only for image and media delivery", () => {
    vi.stubEnv("NEXT_PUBLIC_MEDIA_ORIGIN", "https://media.example.com");

    const policy = createContentSecurityPolicy("test-nonce");
    expect(directive(policy, "img-src")).toContain(
      "https://media.example.com"
    );
    expect(directive(policy, "media-src")).toContain(
      "https://media.example.com"
    );
    expect(directive(policy, "connect-src")).not.toContain(
      "https://media.example.com"
    );
  });

  it("adds one exact Next Image pattern for the managed R2 path", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_MEDIA_ORIGIN", "https://media.example.com");
    const { default: nextConfig } = await import("../next.config");

    expect(nextConfig.images?.remotePatterns).toEqual([
      {
        protocol: "https",
        hostname: "media.example.com",
        port: "",
        pathname: "/media/**",
      },
    ]);
  });

  it("does not widen Next Image access for an invalid configured origin", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv(
      "NEXT_PUBLIC_MEDIA_ORIGIN",
      "https://media.example.com/not-an-origin"
    );
    const { default: nextConfig } = await import("../next.config");

    expect(nextConfig.images?.remotePatterns).toEqual([]);
  });
});
