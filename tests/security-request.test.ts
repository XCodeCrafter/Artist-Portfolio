import { afterEach, describe, expect, it, vi } from "vitest";
import { hasValidBearerToken } from "../lib/security/bearer";
import { hasAllowedRequestOrigin } from "../lib/security/origin";
import {
  getClientIp,
  getReferrerWithoutQuery,
} from "../lib/security/request";

function headers(values: Record<string, string> = {}) {
  const normalized = new Map(
    Object.entries(values).map(([key, value]) => [key.toLowerCase(), value])
  );
  return { get: (name: string) => normalized.get(name.toLowerCase()) || null };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("bearer token validation", () => {
  it("accepts only the exact configured bearer token", () => {
    expect(hasValidBearerToken("Bearer secret-value", "secret-value")).toBe(true);
    expect(hasValidBearerToken("Bearer secret-valuE", "secret-value")).toBe(false);
    expect(hasValidBearerToken("Basic secret-value", "secret-value")).toBe(false);
    expect(hasValidBearerToken(null, "secret-value")).toBe(false);
    expect(hasValidBearerToken("Bearer secret-value", undefined)).toBe(false);
  });
});

describe("request origin guard", () => {
  it("accepts only an exactly configured production origin", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SITE_URL", "https://portfolio.example");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://portfolio.example");

    expect(
      hasAllowedRequestOrigin(headers({ origin: "https://portfolio.example" }))
    ).toBe(true);
    expect(
      hasAllowedRequestOrigin(
        headers({ origin: "https://portfolio.example.attacker.test" })
      )
    ).toBe(false);
    expect(
      hasAllowedRequestOrigin(headers({ origin: "http://portfolio.example" }))
    ).toBe(false);
  });

  it("allows loopback development but rejects non-web origins", () => {
    vi.stubEnv("NODE_ENV", "development");

    expect(
      hasAllowedRequestOrigin(headers({ origin: "http://localhost:3000" }))
    ).toBe(true);
    expect(
      hasAllowedRequestOrigin(headers({ origin: "javascript:alert(1)" }))
    ).toBe(false);
  });

  it("allows an exactly configured loopback origin for a local production preview", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("SITE_URL", "http://localhost:3001");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3001");

    expect(
      hasAllowedRequestOrigin(
        headers({ origin: "http://localhost:3001", host: "localhost:3001" })
      )
    ).toBe(true);
    expect(
      hasAllowedRequestOrigin(
        headers({ origin: "http://localhost:3001", host: "localhost:3000" })
      )
    ).toBe(false);
    expect(
      hasAllowedRequestOrigin(headers({ origin: "http://localhost:3001" }))
    ).toBe(false);
  });

  it("never enables a loopback production origin on Vercel", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("SITE_URL", "http://localhost:3001");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3001");

    expect(
      hasAllowedRequestOrigin(
        headers({ origin: "http://localhost:3001", host: "localhost:3001" })
      )
    ).toBe(false);
  });
});

describe("privacy-safe request metadata", () => {
  it("ignores spoofable forwarding headers without a trusted platform", () => {
    vi.stubEnv("VERCEL", "0");
    vi.stubEnv("TRUSTED_PROXY", "false");

    expect(
      getClientIp(headers({ "x-forwarded-for": "203.0.113.15" }))
    ).toBe("unknown");
  });

  it("uses the first valid Vercel forwarded address", () => {
    vi.stubEnv("VERCEL", "1");

    expect(
      getClientIp(
        headers({ "x-vercel-forwarded-for": "203.0.113.15, 10.0.0.4" })
      )
    ).toBe("203.0.113.15");
  });

  it("strips query, fragment, and credentials from referrers", () => {
    expect(
      getReferrerWithoutQuery(
        headers({ referer: "https://user:pass@example.com/work?q=secret#part" })
      )
    ).toBe("https://example.com/work");
  });
});
