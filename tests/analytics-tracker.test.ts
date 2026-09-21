import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { serializeConsentCookie } from "@/lib/privacy/consent";

const hooks = vi.hoisted(() => ({ effects: [] as Array<() => void | (() => void)>, refs: [] as Array<{ current: unknown }>, index: 0, pathname: "/", consent: { ready: true, analytics: true } }));
vi.mock("react", () => ({
  useEffect: (effect: () => void | (() => void)) => hooks.effects.push(effect),
  useRef: (value: unknown) => { const index = hooks.index++; return hooks.refs[index] || (hooks.refs[index] = { current: value }); },
}));
vi.mock("next/navigation", () => ({ usePathname: () => hooks.pathname }));
vi.mock("@/components/privacy/PrivacyProvider", () => ({ usePrivacyConsent: () => hooks.consent }));

// Small event surface, not a browser substitute. Exercises the actual tracker
// callbacks and permission boundaries without adding a DOM runtime dependency.
class ElementStub {
  textContent = "";
  attributes: Record<string, string> = {};
  constructor(attributes: Record<string, string> = {}) { this.attributes = attributes; }
  getAttribute(name: string) { return this.attributes[name] ?? null; }
  hasAttribute(name: string) { return name in this.attributes; }
  matches(selector: string) { return selector === "[data-analytics-open]" && this.hasAttribute("data-analytics-open"); }
  querySelectorAll() { return []; }
  closest(selector: string): ElementStub | null {
    if (selector === "[data-analytics-event]" && this.hasAttribute("data-analytics-event")) return this;
    if (selector === "[inert], [data-analytics-ignore], [data-privacy-ui]" && (this.hasAttribute("data-analytics-ignore") || this.hasAttribute("data-privacy-ui"))) return this;
    return null;
  }
}
class AnchorStub extends ElementStub {
  constructor(public href: string, attributes: Record<string, string> = {}) { super(attributes); }
  closest(selector: string): ElementStub | null { return selector === "a[href]" ? this : super.closest(selector); }
}
class VideoStub extends ElementStub {}

let listeners: Map<string, (event: { target: unknown }) => void>;
let observer: ((records: Array<{ addedNodes: ElementStub[] }>) => void) | undefined;
let store: Map<string, string>;
let cleanups: Array<() => void>;
const sendBeacon = vi.fn(() => true);
let doc: { cookie: string; title: string; referrer: string; body: ElementStub; addEventListener: ReturnType<typeof vi.fn>; removeEventListener: ReturnType<typeof vi.fn> };
let sessionStorageMock: { getItem: ReturnType<typeof vi.fn>; setItem: ReturnType<typeof vi.fn>; removeItem: ReturnType<typeof vi.fn> };
let Tracker: () => null;
async function payloads() { return Promise.all(sendBeacon.mock.calls.map(async (args) => JSON.parse(await (args as unknown as [string, Blob])[1].text()))); }
function render() { hooks.index = 0; hooks.effects = []; Tracker(); for (const effect of hooks.effects) { const cleanup = effect(); if (cleanup) cleanups.push(cleanup); } }
function cleanup() { cleanups.forEach((fn) => fn()); cleanups = []; }

beforeEach(async () => {
  vi.resetModules(); vi.clearAllMocks(); vi.stubEnv("NODE_ENV", "production");
  hooks.refs = []; hooks.effects = []; hooks.index = 0; hooks.pathname = "/"; hooks.consent = { ready: true, analytics: true };
  listeners = new Map(); store = new Map(); cleanups = []; observer = undefined;
  doc = {
    cookie: serializeConsentCookie({ analytics: true, externalMedia: false }, false), title: "Portfolio", referrer: "https://instagram.com/artist?secret=1", body: new ElementStub(),
    addEventListener: vi.fn((name: string, listener: (event: { target: unknown }) => void) => listeners.set(name, listener)),
    removeEventListener: vi.fn((name: string) => listeners.delete(name)),
  };
  sessionStorageMock = { getItem: vi.fn((key: string) => store.get(key) || null), setItem: vi.fn((key: string, value: string) => { store.set(key, value); }), removeItem: vi.fn((key: string) => { store.delete(key); }) };
  vi.stubGlobal("document", doc); vi.stubGlobal("window", { location: { pathname: "/", href: "https://portfolio.example/", origin: "https://portfolio.example" } });
  vi.stubGlobal("Element", ElementStub); vi.stubGlobal("HTMLAnchorElement", AnchorStub); vi.stubGlobal("HTMLVideoElement", VideoStub);
  vi.stubGlobal("navigator", { sendBeacon }); vi.stubGlobal("fetch", vi.fn()); vi.stubGlobal("sessionStorage", sessionStorageMock);
  vi.stubGlobal("MutationObserver", class { constructor(callback: typeof observer) { observer = callback; } observe() {} disconnect() { observer = undefined; } });
  Tracker = (await import("@/components/AnalyticsTracker")).default;
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("AnalyticsTracker consent and explicit interactions", () => {
  it("does not collect, create storage, or install tracking listeners before a choice", () => {
    hooks.consent = { ready: true, analytics: false }; doc.cookie = ""; render();
    expect(sendBeacon).not.toHaveBeenCalled(); expect(sessionStorageMock.setItem).not.toHaveBeenCalled(); expect(doc.addEventListener).not.toHaveBeenCalled();
  });
  it("waits for preference hydration without clearing an existing active session", () => {
    hooks.consent = { ready: false, analytics: false }; render();
    expect(sessionStorageMock.removeItem).not.toHaveBeenCalled(); expect(sendBeacon).not.toHaveBeenCalled();
  });
  it("records only after acceptance and strips the incoming URL down to its origin", async () => {
    render();
    expect(await payloads()).toEqual([expect.objectContaining({ eventName: "page_view", metadata: { title: "Portfolio", landingReferrer: "https://instagram.com" } })]);
    expect(sessionStorageMock.setItem).toHaveBeenCalledTimes(1);
  });
  it("fails closed when reading document.cookie throws", () => {
    Object.defineProperty(doc, "cookie", { get() { throw new Error("blocked"); }, configurable: true });
    expect(() => render()).not.toThrow();
    expect(sendBeacon).not.toHaveBeenCalled(); expect(sessionStorageMock.setItem).not.toHaveBeenCalled();
  });
  it("does not instrument outbound policy links or marked dialogs inside privacy UI", () => {
    render(); sendBeacon.mockClear();
    listeners.get("click")?.({ target: new AnchorStub("https://external.example/privacy", { "data-privacy-ui": "true" }) });
    observer?.([{ addedNodes: [new ElementStub({ "data-analytics-open": "video_open", "data-privacy-ui": "true" })] }]);
    expect(sendBeacon).not.toHaveBeenCalled();
  });
  it("checks withdrawal immediately even while the old React listener is still installed", () => {
    render(); sendBeacon.mockClear(); sessionStorageMock.setItem.mockClear();
    doc.cookie = serializeConsentCookie({ analytics: false, externalMedia: false }, false);
    listeners.get("click")?.({ target: new AnchorStub("https://open.spotify.com/artist/123") });
    expect(sendBeacon).not.toHaveBeenCalled(); expect(sessionStorageMock.setItem).not.toHaveBeenCalled();
    cleanup(); hooks.consent = { ready: true, analytics: false }; render();
    expect(store.size).toBe(0); expect(listeners.size).toBe(0);
  });
  it("does not turn a cookie/privacy dialog or a preview video into a video action", async () => {
    render(); sendBeacon.mockClear();
    observer?.([{ addedNodes: [new ElementStub({ role: "dialog", "aria-label": "Privacy preferences" })] }]);
    listeners.get("play")?.({ target: new VideoStub({ "data-analytics-preview": "true", "data-analytics-play": "true" }) });
    listeners.get("play")?.({ target: new VideoStub() });
    expect(await payloads()).toEqual([]);
  });
  it("records marked gallery/full video actions once and does not double-count booking CTA", async () => {
    render(); sendBeacon.mockClear();
    const gallery = new ElementStub({ "data-analytics-open": "gallery_open", "data-analytics-label": "Portrait" });
    observer?.([{ addedNodes: [gallery] }]); observer?.([{ addedNodes: [gallery] }]);
    const video = new VideoStub({ "data-analytics-play": "true", "data-analytics-label": "Showreel" });
    listeners.get("play")?.({ target: video }); listeners.get("play")?.({ target: video });
    listeners.get("click")?.({ target: new AnchorStub("https://portfolio.example/booking", { "data-analytics-event": "cta_click" }) });
    expect((await payloads()).map((event) => event.metadata.action)).toEqual(["gallery_open", "video_play", "contact_open"]);
  });
  it("ignores all admin routes and development activity", () => {
    hooks.pathname = "/admin/v2/pages/home"; render(); expect(sendBeacon).not.toHaveBeenCalled(); expect(listeners.size).toBe(0);
    vi.stubEnv("NODE_ENV", "development"); hooks.pathname = "/"; render(); expect(sendBeacon).not.toHaveBeenCalled(); expect(sessionStorageMock.setItem).not.toHaveBeenCalled();
  });
});
