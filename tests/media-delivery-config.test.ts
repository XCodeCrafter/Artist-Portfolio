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
    vi.stubEnv("NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT", "");

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
    vi.stubEnv("NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT", "");
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
    vi.stubEnv("NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT", "");
    vi.stubEnv(
      "NEXT_PUBLIC_MEDIA_ORIGIN",
      "https://media.example.com/not-an-origin"
    );
    const { default: nextConfig } = await import("../next.config");

    expect(nextConfig.images?.remotePatterns).toEqual([]);
  });
});

describe("ImageKit delivery and upload allowlists", () => {
  it("allows a valid account CDN only for images/media and enables its upload origin", () => {
    vi.stubEnv("MEDIA_UPLOAD_PROVIDER", "imagekit");
    vi.stubEnv(
      "NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT",
      "https://ik.imagekit.io/artist_account-01"
    );

    const policy = createContentSecurityPolicy("test-nonce");
    expect(directive(policy, "img-src")).toContain(
      "https://ik.imagekit.io"
    );
    expect(directive(policy, "media-src")).toContain(
      "https://ik.imagekit.io"
    );
    expect(directive(policy, "connect-src")).toContain(
      "https://upload.imagekit.io"
    );
    expect(directive(policy, "connect-src")).not.toContain(
      "https://ik.imagekit.io"
    );
    expect(directive(policy, "img-src")).not.toContain(
      "https://upload.imagekit.io"
    );
    expect(directive(policy, "media-src")).not.toContain(
      "https://upload.imagekit.io"
    );
  });

  it("keeps ImageKit delivery available during migration without opening uploads", () => {
    vi.stubEnv("MEDIA_UPLOAD_PROVIDER", "supabase");
    vi.stubEnv(
      "NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT",
      "https://ik.imagekit.io/artist_account-01"
    );

    const policy = createContentSecurityPolicy("test-nonce");
    expect(directive(policy, "img-src")).toContain(
      "https://ik.imagekit.io"
    );
    expect(directive(policy, "media-src")).toContain(
      "https://ik.imagekit.io"
    );
    expect(directive(policy, "connect-src")).not.toContain(
      "https://upload.imagekit.io"
    );
  });

  it("adds one exact Next Image pattern below the configured account media folder", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_MEDIA_ORIGIN", "");
    vi.stubEnv(
      "NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT",
      "https://ik.imagekit.io/artist_account-01"
    );
    const { default: nextConfig } = await import("../next.config");

    expect(nextConfig.images?.remotePatterns).toEqual([
      {
        protocol: "https",
        hostname: "ik.imagekit.io",
        port: "",
        pathname: "/artist_account-01/media/**",
        search: "",
      },
    ]);
  });

  it("opens direct upload for an explicit pilot without switching the active provider", () => {
    vi.stubEnv("MEDIA_UPLOAD_PROVIDER", "supabase");
    vi.stubEnv("IMAGEKIT_PILOT_UPLOAD_ENABLED", "true");
    vi.stubEnv(
      "NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT",
      "https://ik.imagekit.io/artist_account-01"
    );

    const policy = createContentSecurityPolicy("test-nonce");
    expect(directive(policy, "connect-src")).toContain(
      "https://upload.imagekit.io"
    );
  });

  it.each([
    "",
    "http://ik.imagekit.io/artist-account",
    "https://ik.imagekit.io",
    "https://ik.imagekit.io/artist-account/extra",
    "https://ik.imagekit.io/artist-account?token=secret",
    "https://ik.imagekit.io/artist-account#fragment",
    "https://ik.imagekit.io:444/artist-account",
    "https://example.com/artist-account",
    "https://user:password@ik.imagekit.io/artist-account",
  ])("rejects an invalid ImageKit endpoint without enabling delivery or upload: %s", async (endpoint) => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_MEDIA_ORIGIN", "");
    vi.stubEnv("NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT", endpoint);

    const policy = createContentSecurityPolicy("test-nonce");
    expect(directive(policy, "img-src")).not.toContain(
      "https://ik.imagekit.io"
    );
    expect(directive(policy, "media-src")).not.toContain(
      "https://ik.imagekit.io"
    );
    expect(directive(policy, "connect-src")).not.toContain(
      "https://upload.imagekit.io"
    );

    const { default: nextConfig } = await import("../next.config");
    expect(nextConfig.images?.remotePatterns).toEqual([]);
    vi.resetModules();
  });
});
