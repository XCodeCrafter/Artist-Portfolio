import { describe, expect, it } from "vitest";
import { CONSENT_COOKIE_NAME, CONSENT_MAX_AGE_SECONDS, readConsentCookie, serializeConsentCookie } from "@/lib/privacy/consent";

const now = Date.UTC(2026, 8, 20);
const cookie = (value: unknown) => `${CONSENT_COOKIE_NAME}=${encodeURIComponent(JSON.stringify(value))}`;
const consent = { version: 1, analytics: true, externalMedia: false, updatedAt: now };

describe("Versioned privacy preference cookie", () => {
  it.each(["", "other=value", `${CONSENT_COOKIE_NAME}=broken`, `${CONSENT_COOKIE_NAME}=%broken`, cookie(null), cookie([]), cookie(true), cookie({}), cookie({ ...consent, version: 2 }), cookie({ ...consent, analytics: "true" }), cookie({ ...consent, externalMedia: 1 }), cookie({ ...consent, updatedAt: -1 }), cookie({ ...consent, updatedAt: now + 1 }), cookie({ ...consent, updatedAt: 1.5 })])("fails closed for missing / malformed / incompatible choice %s", (header) => {
    expect(readConsentCookie(header, now)).toBeNull();
  });
  it("round trips a granular choice with secure first-party attributes and no identifier", () => {
    const stored = serializeConsentCookie(consent, true, now);
    expect(readConsentCookie(`other=abc; ${stored.split(";")[0]}`, now)).toEqual(consent);
    expect(stored).toContain("Path=/; Max-Age=15552000; SameSite=Lax; Secure");
    expect(stored).not.toContain("Domain=");
    expect(Object.keys(readConsentCookie(stored, now)!)).toEqual(["version", "analytics", "externalMedia", "updatedAt"]);
  });
  it("remembers rejection without confusing it with no choice", () => {
    expect(readConsentCookie(serializeConsentCookie({ analytics: false, externalMedia: false }, false, now), now)).toEqual({ ...consent, analytics: false });
  });
  it("expires exactly at 180 days, without silently extending the choice on read", () => {
    expect(readConsentCookie(cookie(consent), now + CONSENT_MAX_AGE_SECONDS * 1000 - 1)).toEqual(consent);
    expect(readConsentCookie(cookie(consent), now + CONSENT_MAX_AGE_SECONDS * 1000)).toBeNull();
  });
  it("rejects conflicting path cookies and oversized payloads", () => {
    expect(readConsentCookie(`${cookie(consent)}; ${cookie({ ...consent, analytics: false })}`, now)).toBeNull();
    expect(readConsentCookie(cookie({ ...consent, extra: "x".repeat(600) }), now)).toBeNull();
  });
});
