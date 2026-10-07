import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PrivacyProvider from "@/components/privacy/PrivacyProvider";
import PrivacyPreferences from "@/components/privacy/PrivacyPreferences";
import ExternalMediaGate from "@/components/privacy/ExternalMediaGate";
import GalleryFooter from "@/components/GalleryFooter";
import { DEFAULT_FOOTER_CONTENT } from "@/lib/content/footer";
import { ANALYTICS_SESSION_KEY, CONSENT_MAX_AGE_SECONDS, readConsentCookie, serializeConsentCookie } from "@/lib/privacy/consent";

// A deterministic hook/effect store exercises real component callbacks without
// a browser dependency. Native dialog layout, focus trapping and cross-tab
// browser delivery remain browser-QA concerns, not claims made by these tests.
const mocks = vi.hoisted(() => ({
  pathname: "/", now: 1_790_000_000_000, context: undefined as unknown,
  cursor: 0, active: "provider", banks: new Map<string, Array<{ value?: unknown; deps?: unknown[]; cleanup?: () => void }>>(),
  effects: [] as Array<() => void>,
}));
vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname }));
vi.mock("react", async (original) => {
  const react = await original<typeof import("react")>();
  function slot() {
    const bank = mocks.banks.get(mocks.active) ?? [];
    mocks.banks.set(mocks.active, bank);
    const index = mocks.cursor++;
    return bank[index] ??= {};
  }
  return {
    ...react,
    useState: (initial: unknown) => {
      const state = slot();
      if (!("value" in state)) state.value = typeof initial === "function" ? initial() : initial;
      return [state.value, (next: unknown) => { state.value = typeof next === "function" ? next(state.value) : next; }];
    },
    useRef: (initial: unknown) => { const state = slot(); return state.value ??= { current: initial }; },
    useCallback: (callback: unknown) => callback,
    useContext: (context: { _currentValue: unknown }) => mocks.context ?? context._currentValue,
    useEffect: (effect: () => undefined | (() => void), deps?: unknown[]) => {
      const state = slot();
      if (!deps || !state.deps || deps.length !== state.deps.length || deps.some((value, index) => !Object.is(value, state.deps![index]))) {
        state.deps = deps;
        mocks.effects.push(() => { state.cleanup?.(); state.cleanup = effect(); });
      }
    },
  };
});

type Node = ReactElement<Record<string, unknown>>;
type ConsentContext = { ready: boolean; analytics: boolean; externalMedia: boolean; openPreferences: () => void; allowExternalMedia: () => void; registerFooterPrivacyControl: (element: HTMLElement) => () => void };
function nodes(tree: ReactNode): Node[] {
  return Children.toArray(tree).flatMap(node => isValidElement<Record<string, unknown>>(node) ? [node, ...nodes(node.props.children as ReactNode)] : []);
}
function text(tree: ReactNode): string {
  return Children.toArray(tree).map(node => isValidElement<Record<string, unknown>>(node) ? text(node.props.children as ReactNode) : String(node)).join("");
}
function findButton(tree: ReactNode, label: string) {
  const button = nodes(tree).find(node => node.type === "button" && (node.props["aria-label"] === label || text(node.props.children as ReactNode).trim() === label));
  if (!button) throw new Error(`Missing button: ${label}`);
  return button;
}
function click(tree: ReactNode, label: string) { (findButton(tree, label).props.onClick as () => void)(); }
function flushEffects() { while (mocks.effects.length) mocks.effects.shift()!(); }
function provider(flush = true) {
  mocks.active = "provider"; mocks.cursor = 0;
  const tree = PrivacyProvider({ children: <main>Public portfolio</main> });
  mocks.context = tree.props.value;
  if (flush && mocks.effects.length) { flushEffects(); return provider(false); }
  return tree;
}
function context() { return mocks.context as ConsentContext; }
function preferences(onSave: (value: { analytics: boolean; externalMedia: boolean }) => void, onClose = vi.fn()) {
  mocks.active = "preferences"; mocks.cursor = 0;
  return PrivacyPreferences({ analytics: context().analytics, externalMedia: context().externalMedia, onSave, onClose });
}
function gate() { return ExternalMediaGate({ provider: "YouTube", children: <iframe src="https://www.youtube.com/embed/example" title="External clip" /> }); }
function mountFooter(preview = false) {
  mocks.active = "footer"; mocks.cursor = 0;
  const tree = GalleryFooter({ artistName: "Owner", location: "Prague", socialLinks: [], content: DEFAULT_FOOTER_CONTENT, preview });
  const control = findButton(tree, "Privacy choices");
  const element = {} as HTMLButtonElement;
  (control.props.ref as { current: HTMLButtonElement | null }).current = element;
  flushEffects();
  return { tree, element };
}
function hasFloatingControl(tree = provider()) { return nodes(tree).some(node => node.props.className === "privacy-reopen"); }
type ObservedControl = { callback: IntersectionObserverCallback; options?: IntersectionObserverInit; observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> };
function intersect(observer: ObservedControl, element: HTMLElement, ratio: number) {
  const rect = { x: 0, y: 0, width: 140, height: 44, top: 0, left: 0, right: 140, bottom: 44, toJSON: () => ({}) };
  observer.callback([{ target: element, isIntersecting: ratio > 0, intersectionRatio: ratio, boundingClientRect: rect,
    intersectionRect: { ...rect, height: rect.height * ratio, bottom: rect.bottom * ratio }, rootBounds: rect, time: 0 }], observer as unknown as IntersectionObserver);
}

let cookie = "";
let cookieMode: "works" | "ignores-writes" | "throws-on-write" | "throws-on-read" = "works";
let cookieWrites: string[] = [];
let windowEvents: Map<string, () => void>;
let documentEvents: Map<string, () => void>;
let intervals: Map<number, () => void>;
let session: Map<string, string>;
let removeSession: ReturnType<typeof vi.fn>;
let channels: Array<{ onmessage: (() => void) | null; postMessage: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> }>;
let observers: ObservedControl[];

beforeEach(() => {
  vi.clearAllMocks(); mocks.banks.clear(); mocks.effects = []; mocks.context = undefined;
  mocks.pathname = "/"; mocks.now = 1_790_000_000_000; mocks.cursor = 0; mocks.active = "provider";
  cookie = ""; cookieMode = "works"; cookieWrites = []; windowEvents = new Map(); documentEvents = new Map(); intervals = new Map(); session = new Map(); channels = []; observers = [];
  vi.spyOn(Date, "now").mockImplementation(() => mocks.now);
  const documentStub = {
    body: { style: { overflow: "" } }, activeElement: null,
    addEventListener: vi.fn((event: string, callback: () => void) => documentEvents.set(event, callback)),
    removeEventListener: vi.fn((event: string) => documentEvents.delete(event)),
  };
  Object.defineProperty(documentStub, "cookie", {
    get: () => {
      if (cookieMode === "throws-on-read") throw new Error("Cookie read unavailable");
      return cookie;
    },
    set: (value: string) => {
      cookieWrites.push(value);
      if (cookieMode === "throws-on-write") throw new Error("Cookie storage unavailable");
      if (cookieMode === "works") cookie = value.split(";")[0];
    },
  });
  vi.stubGlobal("document", documentStub);
  vi.stubGlobal("location", { protocol: "https:" });
  vi.stubGlobal("window", {
    setInterval: vi.fn((callback: () => void) => { const id = intervals.size + 1; intervals.set(id, callback); return id; }),
    addEventListener: vi.fn((event: string, callback: () => void) => windowEvents.set(event, callback)),
    removeEventListener: vi.fn((event: string) => windowEvents.delete(event)),
  });
  vi.stubGlobal("clearInterval", vi.fn((id: number) => intervals.delete(id)));
  removeSession = vi.fn((key: string) => session.delete(key));
  vi.stubGlobal("sessionStorage", { removeItem: removeSession });
  vi.stubGlobal("BroadcastChannel", class {
    onmessage: (() => void) | null = null;
    postMessage = vi.fn(); close = vi.fn();
    constructor() { channels.push(this); }
  });
  vi.stubGlobal("IntersectionObserver", class {
    observe = vi.fn(); disconnect = vi.fn();
    constructor(public callback: IntersectionObserverCallback, public options?: IntersectionObserverInit) { observers.push(this); }
  });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("Privacy provider behavior", () => {
  it("defaults to denial before hydration and after an absent cookie", () => {
    const initial = provider(false);
    expect(context()).toMatchObject({ ready: false, analytics: false, externalMedia: false });
    expect(nodes(initial).some(node => node.props["aria-label"] === "Privacy choices")).toBe(false);
    expect(nodes(gate()).some(node => node.type === "iframe")).toBe(false);
    expect(findButton(gate(), "Allow external players").props.disabled).toBe(true);
    const hydrated = provider();
    expect(context()).toMatchObject({ ready: true, analytics: false, externalMedia: false });
    expect(nodes(hydrated).some(node => node.props["aria-label"] === "Privacy choices")).toBe(true);
    expect(removeSession).toHaveBeenCalledWith(ANALYTICS_SESSION_KEY);
    expect(cookieWrites).toEqual([]);
  });
  it("persists Accept all and mounts the external player only after a verified grant", () => {
    click(provider(), "Accept all");
    const saved = provider();
    expect(context()).toMatchObject({ ready: true, analytics: true, externalMedia: true });
    expect(readConsentCookie(cookie, mocks.now)).toMatchObject({ analytics: true, externalMedia: true, updatedAt: mocks.now });
    expect(cookieWrites[0]).toContain(`Max-Age=${CONSENT_MAX_AGE_SECONDS}`);
    expect(cookieWrites[0]).toContain("SameSite=Lax; Secure");
    expect(nodes(saved).some(node => node.props["aria-label"] === "Privacy choices")).toBe(false);
    expect(findButton(saved, "Privacy settings")).toBeTruthy();
    expect(nodes(gate()).some(node => node.type === "iframe")).toBe(true);
    expect(channels[0].postMessage).toHaveBeenCalledWith("changed");
  });
  it("remembers rejection without retaining the analytics session", () => {
    session.set(ANALYTICS_SESSION_KEY, "previous-session");
    click(provider(), "Reject optional");
    const saved = provider();
    expect(context()).toMatchObject({ ready: true, analytics: false, externalMedia: false });
    expect(readConsentCookie(cookie, mocks.now)).toMatchObject({ analytics: false, externalMedia: false });
    expect(session.has(ANALYTICS_SESSION_KEY)).toBe(false);
    expect(findButton(saved, "Privacy settings")).toBeTruthy();
    expect(nodes(gate()).some(node => node.type === "iframe")).toBe(false);
  });
  it("loads a saved grant, then withdrawal clears the session and unloads players", () => {
    cookie = serializeConsentCookie({ analytics: true, externalMedia: true }, true, mocks.now - 1000).split(";")[0];
    provider();
    expect(context()).toMatchObject({ analytics: true, externalMedia: true });
    session.set(ANALYTICS_SESSION_KEY, "current-session");
    context().openPreferences();
    const preference = nodes(provider()).find(node => node.type === PrivacyPreferences)!;
    (preference.props.onSave as (choices: unknown) => void)({ analytics: false, externalMedia: false });
    provider();
    expect(context()).toMatchObject({ analytics: false, externalMedia: false });
    expect(session.has(ANALYTICS_SESSION_KEY)).toBe(false);
    expect(nodes(gate()).some(node => node.type === "iframe")).toBe(false);
  });
  it.each(["ignores-writes", "throws-on-write"] as const)("fails closed when cookie storage %s", mode => {
    provider(); cookieMode = mode;
    click(provider(), "Accept all");
    const failed = provider();
    expect(context()).toMatchObject({ ready: true, analytics: false, externalMedia: false });
    expect(text(failed)).toContain("Optional features remain off");
    expect(nodes(failed).some(node => node.props.role === "alert")).toBe(true);
    expect(removeSession).toHaveBeenCalledWith(ANALYTICS_SESSION_KEY);
    expect(nodes(gate()).some(node => node.type === "iframe")).toBe(false);
  });
  it("keeps the portfolio available and optional categories denied when the cookie getter throws on mount", () => {
    cookieMode = "throws-on-read";
    expect(() => provider()).not.toThrow();
    expect(context()).toMatchObject({ ready: true, analytics: false, externalMedia: false });
    expect(text(provider())).toContain("Public portfolio");
    expect(removeSession).toHaveBeenCalledWith(ANALYTICS_SESSION_KEY);
    expect(nodes(gate()).some(node => node.type === "iframe")).toBe(false);
  });
  it("revokes in-memory optional access when a later cookie read fails", () => {
    cookie = serializeConsentCookie({ analytics: true, externalMedia: true }, true, mocks.now).split(";")[0];
    provider(); session.set(ANALYTICS_SESSION_KEY, "previously-granted");
    expect(context().externalMedia).toBe(true);
    cookieMode = "throws-on-read";
    expect(() => windowEvents.get("focus")!()).not.toThrow(); provider();
    expect(context()).toMatchObject({ analytics: false, externalMedia: false });
    expect(session.has(ANALYTICS_SESSION_KEY)).toBe(false);
    expect(nodes(gate()).some(node => node.type === "iframe")).toBe(false);
  });
  it("finishes a verified preference save when cross-tab broadcasting fails", () => {
    provider(); context().openPreferences();
    channels[0].postMessage.mockImplementation(() => { throw new Error("Broadcast unavailable"); });
    const preference = nodes(provider()).find(node => node.type === PrivacyPreferences)!;
    expect(() => (preference.props.onSave as (choices: unknown) => void)({ analytics: false, externalMedia: true })).not.toThrow();
    const saved = provider();
    expect(context()).toMatchObject({ analytics: false, externalMedia: true });
    expect(readConsentCookie(cookie, mocks.now)).toMatchObject({ analytics: false, externalMedia: true });
    expect(nodes(saved).some(node => node.type === PrivacyPreferences)).toBe(false);
    expect(findButton(saved, "Privacy settings")).toBeTruthy();
  });
  it("does not reactivate an old grant after a failed withdrawal, even on sync", () => {
    cookie = serializeConsentCookie({ analytics: true, externalMedia: true }, true, mocks.now - 1000).split(";")[0];
    provider(); cookieMode = "ignores-writes";
    context().openPreferences();
    const preference = nodes(provider()).find(node => node.type === PrivacyPreferences)!;
    (preference.props.onSave as (choices: unknown) => void)({ analytics: false, externalMedia: false });
    provider();
    windowEvents.get("focus")!(); channels[0].onmessage!(); intervals.values().next().value!(); provider();
    expect(context()).toMatchObject({ analytics: false, externalMedia: false });
    expect(readConsentCookie(cookie, mocks.now)).toMatchObject({ analytics: true, externalMedia: true });
    cookieMode = "works";
    const retry = nodes(provider()).find(node => node.type === PrivacyPreferences)!;
    (retry.props.onSave as (choices: unknown) => void)({ analytics: false, externalMedia: false }); provider();
    expect(readConsentCookie(cookie, mocks.now)).toMatchObject({ analytics: false, externalMedia: false });
  });
  it("permits external media separately without silently opting into analytics", () => {
    provider(); click(gate(), "Allow external players"); provider();
    expect(context()).toMatchObject({ analytics: false, externalMedia: true });
    expect(readConsentCookie(cookie, mocks.now)).toMatchObject({ analytics: false, externalMedia: true });
    expect(nodes(gate()).some(node => node.type === "iframe")).toBe(true);
  });
  it("resynchronizes expiry and other-tab withdrawal, removing optional state", () => {
    cookie = serializeConsentCookie({ analytics: true, externalMedia: true }, true, mocks.now).split(";")[0];
    provider(); session.set(ANALYTICS_SESSION_KEY, "session");
    cookie = serializeConsentCookie({ analytics: false, externalMedia: false }, true, mocks.now).split(";")[0];
    channels[0].onmessage!(); provider();
    expect(context()).toMatchObject({ analytics: false, externalMedia: false });
    expect(session.has(ANALYTICS_SESSION_KEY)).toBe(false);
    cookie = serializeConsentCookie({ analytics: true, externalMedia: true }, true, mocks.now).split(";")[0];
    documentEvents.get("visibilitychange")!(); provider();
    expect(context().analytics).toBe(true);
    mocks.now += CONSENT_MAX_AGE_SECONDS * 1000;
    windowEvents.get("pageshow")!(); provider();
    expect(context()).toMatchObject({ analytics: false, externalMedia: false });
  });
  it("cleans listeners, polling and the channel when unmounted", () => {
    provider();
    for (const state of mocks.banks.get("provider")!) state.cleanup?.();
    expect(windowEvents.size).toBe(0); expect(documentEvents.size).toBe(0); expect(intervals.size).toBe(0);
    expect(channels[0].close).toHaveBeenCalledOnce();
  });
  it("does not show public consent UI in the authenticated dashboard", () => {
    mocks.pathname = "/admin/v2";
    const tree = provider();
    expect(text(tree)).toContain("Public portfolio");
    expect(nodes(tree).some(node => node.props["aria-label"] === "Privacy choices")).toBe(false);
    expect(context()).toMatchObject({ analytics: false, externalMedia: false });
  });
});

describe("Footer privacy control visibility", () => {
  beforeEach(() => {
    cookie = serializeConsentCookie({ analytics: false, externalMedia: false }, true, mocks.now).split(";")[0];
    provider();
  });
  it("uses the actual footer control only when fully visible, then restores the floating control offscreen", () => {
    expect(hasFloatingControl()).toBe(true);
    const { tree, element } = mountFooter();
    expect(observers).toHaveLength(1);
    expect(observers[0].observe).toHaveBeenCalledExactlyOnceWith(element);
    expect(observers[0].options).toEqual({ threshold: 1 });
    intersect(observers[0], element, 0.99);
    expect(hasFloatingControl()).toBe(true);
    intersect(observers[0], element, 1);
    expect(hasFloatingControl()).toBe(false);
    click(tree, "Privacy choices");
    expect(nodes(provider()).some(node => node.type === PrivacyPreferences)).toBe(true);
    expect(context()).toMatchObject({ analytics: false, externalMedia: false });
    expect(cookieWrites).toEqual([]);
    intersect(observers[0], element, 0);
    expect(hasFloatingControl()).toBe(true);
  });
  it("keeps a focused floating trigger through its dialog and hides it after focus leaves", () => {
    const { element } = mountFooter();
    const trigger = findButton(provider(), "Privacy settings");
    (trigger.props.onFocus as () => void)();
    intersect(observers[0], element, 1);
    expect(hasFloatingControl()).toBe(true);
    click(provider(), "Privacy settings");
    const dialogTree = provider();
    (findButton(dialogTree, "Privacy settings").props.onBlur as () => void)();
    expect(hasFloatingControl()).toBe(true);
    const dialog = nodes(provider()).find(node => node.type === PrivacyPreferences)!;
    (dialog.props.onClose as () => void)();
    expect(hasFloatingControl()).toBe(true);
    (findButton(provider(), "Privacy settings").props.onBlur as () => void)();
    expect(hasFloatingControl()).toBe(false);
  });
  it("restores the floating control on footer unmount and ignores queued observer callbacks", () => {
    const { element } = mountFooter();
    intersect(observers[0], element, 1);
    expect(hasFloatingControl()).toBe(false);
    for (const state of mocks.banks.get("footer")!) state.cleanup?.();
    expect(observers[0].disconnect).toHaveBeenCalledOnce();
    expect(hasFloatingControl()).toBe(true);
    intersect(observers[0], element, 1);
    expect(hasFloatingControl()).toBe(true);
  });
  it("does not register inert admin preview controls", () => {
    mountFooter(true);
    expect(observers).toHaveLength(0);
    expect(hasFloatingControl()).toBe(true);
  });
  it("keeps the floating control available when visibility observation is unsupported", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    mountFooter();
    expect(observers).toHaveLength(0);
    expect(hasFloatingControl()).toBe(true);
  });
});

describe("Privacy preferences callbacks", () => {
  it("stages per-purpose choices without saving them until Save my choices", () => {
    provider(); const save = vi.fn();
    let tree = preferences(save);
    const toggle = nodes(tree).find(node => node.props["aria-label"] === "External players")!;
    (toggle.props.onChange as (event: unknown) => void)({ target: { checked: true } });
    expect(save).not.toHaveBeenCalled();
    expect(cookieWrites).toEqual([]);
    tree = preferences(save);
    expect(nodes(tree).find(node => node.props["aria-label"] === "External players")?.props.checked).toBe(true);
    expect(nodes(tree).find(node => node.props["aria-label"] === "Audience insights")?.props.checked).toBe(false);
    click(tree, "Save my choices");
    expect(save).toHaveBeenCalledWith({ analytics: false, externalMedia: true });
  });
  it("offers independent accept/reject actions without changing essentials", () => {
    provider(); const save = vi.fn(); const tree = preferences(save);
    click(tree, "Accept all"); expect(save).toHaveBeenLastCalledWith({ analytics: true, externalMedia: true });
    click(tree, "Reject optional"); expect(save).toHaveBeenLastCalledWith({ analytics: false, externalMedia: false });
    expect(text(tree)).toContain("Always on");
    expect(nodes(tree).filter(node => node.type === "input")).toHaveLength(2);
  });
  it("closes via its labelled button or Escape without granting consent", () => {
    provider(); const save = vi.fn(); const close = vi.fn(); const tree = preferences(save, close);
    click(tree, "Close privacy settings"); expect(close).toHaveBeenCalledOnce();
    const event = { preventDefault: vi.fn() };
    (tree.props.onCancel as (event: unknown) => void)(event);
    expect(event.preventDefault).toHaveBeenCalledOnce(); expect(close).toHaveBeenCalledTimes(2);
    expect(save).not.toHaveBeenCalled(); expect(cookieWrites).toEqual([]);
    expect(tree.props["aria-labelledby"]).toBe("privacy-title");
  });
});
