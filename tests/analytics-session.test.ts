import { describe, expect, it, vi } from "vitest";
import { ANALYTICS_SESSION_TTL_MS, createAnalyticsSessionStore, getLandingAttribution, getAcquisitionLabel } from "@/lib/analytics-session";

const uuid1 = "00000000-0000-4000-8000-000000000001";
const uuid2 = "00000000-0000-4000-8000-000000000002";
const blocked = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() { throw new Error("blocked"); } };
describe("consented analytics session state", () => {
  it("keeps one in-memory visit when sessionStorage is blocked and expires after inactivity", () => {
    const store = createAnalyticsSessionStore();
    const uuid = vi.fn().mockReturnValueOnce(uuid1).mockReturnValueOnce(uuid2);
    expect(store.get(blocked, 1, uuid, "https://instagram.com/user?secret=1", "https://portfolio.example").id).toBe(uuid1);
    expect(store.get(blocked, 100, uuid, "", "https://portfolio.example/bio")).toMatchObject({ id: uuid1, landingReferrer: "https://instagram.com", touchedAt: 100 });
    expect(store.get(blocked, 100 + ANALYTICS_SESSION_TTL_MS, uuid, "https://instagram.com", "https://portfolio.example")).toMatchObject({ id: uuid2, landingReferrer: "" });
    expect(uuid).toHaveBeenCalledTimes(2);
  });
  it("does not lose the memory touch when stale storage is readable but cannot be written", () => {
    const store = createAnalyticsSessionStore();
    const storage = { ...blocked, getItem: () => JSON.stringify({ id: uuid1, touchedAt: 1, landingReferrer: "https://google.com" }) };
    store.get(storage, 100, () => uuid2, "", "https://portfolio.example");
    expect(store.get(storage, ANALYTICS_SESSION_TTL_MS + 2, () => uuid2, "", "https://portfolio.example").id).toBe(uuid1);
  });
  it("clears the fallback on withdrawal", () => {
    const store = createAnalyticsSessionStore();
    store.get(blocked, 1, () => uuid1, "", "https://portfolio.example");
    store.clear(blocked);
    expect(store.get(blocked, 2, () => uuid2, "", "https://portfolio.example").id).toBe(uuid2);
  });
  it("rejects malformed or future session state", () => {
    for (const data of [{ id: "bad", touchedAt: 1 }, { id: uuid1, touchedAt: 10000, landingReferrer: "" }]) {
      const storage = { getItem: () => JSON.stringify(data), setItem: vi.fn(), removeItem: vi.fn() };
      expect(createAnalyticsSessionStore().get(storage, 10, () => uuid2, "", "https://portfolio.example").id).toBe(uuid2);
    }
  });
});
describe("landing-source minimization", () => {
  it("strips path/query/fragments and keeps only allowlisted utm_source", () => {
    expect(getLandingAttribution("https://www.instagram.com/private?email=secret#fragment", "https://portfolio.example/?utm_source=spotify&utm_campaign=secret")).toEqual({ landingReferrer: "https://www.instagram.com", campaignSource: "spotify" });
    expect(getLandingAttribution("", "https://portfolio.example/?utm_source=ada@example.com")).toEqual({ landingReferrer: "" });
  });
  it("does not attribute internal or unsafe referrers", () => {
    expect(getLandingAttribution("https://portfolio.example/music", "https://portfolio.example/bio")).toEqual({ landingReferrer: "" });
    expect(getLandingAttribution("https://name:password@example.com", "https://portfolio.example")).toEqual({ landingReferrer: "" });
    expect(getLandingAttribution("javascript:alert(1)", "https://portfolio.example")).toEqual({ landingReferrer: "" });
  });
  it("normalizes known platforms without grouping lookalike domains", () => {
    expect(getAcquisitionLabel("l.instagram.com")).toBe("Instagram");
    expect(getAcquisitionLabel("open.spotify.com")).toBe("Spotify");
    expect(getAcquisitionLabel("instagram.com.attacker.test")).toBe("instagram.com.attacker.test");
    expect(getAcquisitionLabel("")).toBe("Direct / unknown");
  });
});
