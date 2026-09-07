import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const jsonLd = readFileSync(
  new URL("../components/JsonLd.tsx", import.meta.url),
  "utf8"
);

describe("JSON-LD rendering", () => {
  it("keeps the request nonce while suppressing only its browser-owned mismatch", () => {
    expect(jsonLd).toContain('type="application/ld+json"');
    expect(jsonLd).toContain("nonce={nonce}");
    expect(jsonLd).toContain("suppressHydrationWarning");
    expect(jsonLd).not.toContain("suppressHydrationWarning={false}");
  });

  it("retains script-safe JSON serialization", () => {
    for (const escapedValue of [
      '\\u0026',
      '\\u003c',
      '\\u003e',
      '\\u2028',
      '\\u2029',
    ]) {
      expect(jsonLd).toContain(escapedValue);
    }
  });
});
