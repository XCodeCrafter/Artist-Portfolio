import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const reactHarness = vi.hoisted(() => ({
  cleanups: [] as Array<() => void>,
}));

vi.mock("react", () => ({
  useCallback: <T>(callback: T) => callback,
  useEffect: (effect: () => void | (() => void)) => {
    const cleanup = effect();
    if (cleanup) reactHarness.cleanups.push(cleanup);
  },
  useRef: <T>(value: T) => ({ current: value }),
  useState: <T>(initialValue: T | (() => T)) => [
    typeof initialValue === "function"
      ? (initialValue as () => T)()
      : initialValue,
    vi.fn(),
  ],
}));

import useUnsavedChangesGuard from "@/components/admin/useUnsavedChangesGuard";

type Listener = (event: FakeEvent) => void;

class FakeEvent {
  altKey = false;
  button = 0;
  ctrlKey = false;
  defaultPrevented = false;
  immediatePropagationStopped = false;
  metaKey = false;
  returnValue: string | undefined;
  shiftKey = false;
  submitter: FakeButton | FakeInput | null = null;
  target: unknown = null;

  preventDefault() {
    this.defaultPrevented = true;
  }

  stopImmediatePropagation() {
    this.immediatePropagationStopped = true;
  }
}

class FakeEventTarget {
  private listeners = new Map<string, Set<Listener>>();

  addEventListener(type: string, listener: Listener) {
    const listeners = this.listeners.get(type) || new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: Listener) {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type: string, event: FakeEvent) {
    for (const listener of this.listeners.get(type) || []) {
      listener(event);
      if (event.immediatePropagationStopped) break;
    }
  }
}

class FakeElement {
  closest(selector: string): FakeElement | null {
    void selector;
    return null;
  }
}

class FakeAnchor extends FakeElement {
  target = "";
  private attributes = new Map<string, string>();

  constructor(public href: string) {
    super();
    this.attributes.set("href", href);
  }

  override closest(selector: string) {
    return selector === "a[href]" ? this : null;
  }

  getAttribute(name: string) {
    return this.attributes.get(name) || null;
  }

  hasAttribute(name: string) {
    return this.attributes.has(name);
  }
}

class FakeButton {
  form: FakeForm | null = null;
}

class FakeInput {
  form: FakeForm | null = null;
}

class FakeDocument extends FakeEventTarget {}

class FakeForm extends FakeElement {
  dataset: Record<string, string> = {};
  isConnected = true;
  observedResubmissionFlags: Array<string | undefined> = [];
  requestSubmit: ReturnType<typeof vi.fn>;

  constructor(private ownerDocument: FakeDocument) {
    super();
    this.requestSubmit = vi.fn((submitter?: FakeButton | FakeInput) => {
      this.observedResubmissionFlags.push(
        this.dataset.unsavedGuardResubmitting
      );
      const event = new FakeEvent();
      event.target = this;
      event.submitter = submitter || null;
      this.ownerDocument.dispatch("submit", event);
    });
  }
}

class FakeLocation {
  private url: URL;
  assign = vi.fn((url: string) => this.set(url));
  reload = vi.fn();

  constructor(initialUrl: string) {
    this.url = new URL(initialUrl);
  }

  get hash() {
    return this.url.hash;
  }

  get href() {
    return this.url.href;
  }

  get pathname() {
    return this.url.pathname;
  }

  get search() {
    return this.url.search;
  }

  set(nextUrl: string) {
    this.url = new URL(nextUrl, this.url);
  }
}

type HistoryEntry = {
  state: Record<string, unknown>;
  url: string;
};

class FakeHistory {
  private entries: HistoryEntry[];
  private index = 0;
  private pendingTraversals: number[] = [];

  back = vi.fn(() => this.pendingTraversals.push(-1));
  forward = vi.fn(() => this.pendingTraversals.push(1));
  pushState = vi.fn(
    (state: Record<string, unknown>, _unused: string, url?: string | URL | null) => {
      const entry = { state, url: this.resolveUrl(url) };
      this.entries = [...this.entries.slice(0, this.index + 1), entry];
      this.index += 1;
      this.location.set(entry.url);
    }
  );
  replaceState = vi.fn(
    (state: Record<string, unknown>, _unused: string, url?: string | URL | null) => {
      const entry = { state, url: this.resolveUrl(url) };
      this.entries[this.index] = entry;
      this.location.set(entry.url);
    }
  );

  constructor(
    private location: FakeLocation,
    private emitPopState: (event: FakeEvent) => void
  ) {
    this.entries = [{ state: { route: "initial" }, url: location.href }];
  }

  get length() {
    return this.entries.length;
  }

  get state() {
    return this.entries[this.index].state;
  }

  get queuedTraversalCount() {
    return this.pendingTraversals.length;
  }

  entryAt(index: number) {
    return this.entries[index];
  }

  flushNextTraversal() {
    const delta = this.pendingTraversals.shift();
    if (delta === undefined) throw new Error("No queued history traversal.");

    const nextIndex = this.index + delta;
    if (nextIndex < 0 || nextIndex >= this.entries.length) return false;

    this.index = nextIndex;
    const entry = this.entries[this.index];
    this.location.set(entry.url);
    const event = new FakeEvent();
    this.emitPopState(event);
    return true;
  }

  emitUnexpectedPop(state: Record<string, unknown>, url: string) {
    this.entries[this.index] = { state, url: this.resolveUrl(url) };
    this.location.set(this.entries[this.index].url);
    const event = new FakeEvent();
    this.emitPopState(event);
    return event;
  }

  private resolveUrl(url?: string | URL | null) {
    if (url === undefined || url === null || String(url) === "") {
      return this.location.href;
    }
    return new URL(String(url), this.location.href).href;
  }
}

class FakeWindow extends FakeEventTarget {
  location = new FakeLocation("http://localhost/admin/v2/pages/music");
  history = new FakeHistory(this.location, (event) =>
    this.dispatch("popstate", event)
  );
  confirm = vi.fn(() => true);
  private timers: Array<() => void> = [];

  setTimeout = vi.fn((callback: () => void) => {
    this.timers.push(callback);
    return this.timers.length;
  });

  runAllTimers() {
    while (this.timers.length) this.timers.shift()?.();
  }
}

let fakeDocument: FakeDocument;
let fakeWindow: FakeWindow;

beforeEach(() => {
  fakeDocument = new FakeDocument();
  fakeWindow = new FakeWindow();

  vi.stubGlobal("document", fakeDocument);
  vi.stubGlobal("window", fakeWindow);
  vi.stubGlobal("Element", FakeElement);
  vi.stubGlobal("HTMLAnchorElement", FakeAnchor);
  vi.stubGlobal("HTMLButtonElement", FakeButton);
  vi.stubGlobal("HTMLFormElement", FakeForm);
  vi.stubGlobal("HTMLInputElement", FakeInput);
});

afterEach(() => {
  reactHarness.cleanups.splice(0).forEach((cleanup) => cleanup());
  vi.unstubAllGlobals();
});

const invokeUnsavedChangesGuard = useUnsavedChangesGuard;

function renderGuard(guardOtherFormSubmissions = false) {
  return invokeUnsavedChangesGuard(
    "Discard test changes?",
    guardOtherFormSubmissions
  );
}

describe("useUnsavedChangesGuard behavior", () => {
  it("arms one base and one guard entry when marked dirty", () => {
    const guard = renderGuard();

    guard.markDirty();
    guard.markDirty();

    expect(fakeWindow.history.length).toBe(2);
    const baseState = fakeWindow.history.entryAt(0).state;
    const guardState = fakeWindow.history.entryAt(1).state;
    expect(baseState.__portfolioEditorGuardBase).toEqual(
      guardState.__portfolioEditorGuard
    );
    expect(guardState.__portfolioEditorGuardBase).toEqual(
      guardState.__portfolioEditorGuard
    );
  });

  it("runs a clear callback only after the matching compaction pop", () => {
    const guard = renderGuard();
    const afterCompaction = vi.fn();
    guard.markDirty();

    guard.clearDirty(afterCompaction);

    expect(afterCompaction).not.toHaveBeenCalled();
    expect(fakeWindow.history.back).toHaveBeenCalledTimes(1);
    expect(fakeWindow.history.state).toEqual({ route: "initial" });

    fakeWindow.history.flushNextTraversal();

    expect(afterCompaction).toHaveBeenCalledTimes(1);
    expect(fakeWindow.history.state).toEqual({ route: "initial" });
    expect(fakeWindow.location.href).toBe(
      "http://localhost/admin/v2/pages/music"
    );
  });

  it("coalesces clear requests into one traversal and one continuation", () => {
    const guard = renderGuard();
    const first = vi.fn();
    const second = vi.fn();
    guard.markDirty();

    guard.clearDirty(first);
    guard.clearDirty(second);

    expect(fakeWindow.history.back).toHaveBeenCalledTimes(1);
    fakeWindow.history.flushNextTraversal();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });

  it("does not run a second discard continuation during compaction", () => {
    const guard = renderGuard();
    const first = vi.fn();
    const second = vi.fn();
    guard.markDirty();

    guard.clearDirty(first);
    expect(guard.confirmDiscard(second)).toBe(true);

    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
    fakeWindow.history.flushNextTraversal();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });

  it("rearms after compaction when a new edit arrives mid-flight", () => {
    const guard = renderGuard();
    const afterCompaction = vi.fn();
    guard.markDirty();
    guard.clearDirty(afterCompaction);

    guard.markDirty();
    fakeWindow.history.flushNextTraversal();

    expect(afterCompaction).not.toHaveBeenCalled();
    expect(fakeWindow.history.length).toBe(2);
    const baseState = fakeWindow.history.entryAt(0).state;
    const guardState = fakeWindow.history.entryAt(1).state;
    expect(baseState.__portfolioEditorGuardBase).toEqual(
      guardState.__portfolioEditorGuard
    );
    expect(fakeWindow.history.back).toHaveBeenCalledTimes(1);
  });

  it("does not consume callbacks or rewrite state for an unrelated pop", () => {
    const guard = renderGuard();
    const afterCompaction = vi.fn();
    guard.markDirty();
    guard.clearDirty(afterCompaction);

    const event = fakeWindow.history.emitUnexpectedPop(
      { foreign: true },
      "/somewhere-else"
    );

    expect(afterCompaction).not.toHaveBeenCalled();
    expect(event.immediatePropagationStopped).toBe(false);
    expect(fakeWindow.history.state).toEqual({ foreign: true });
    expect(fakeWindow.location.pathname).toBe("/somewhere-else");
  });

  it("waits for compaction, preserves the submitter, and resubmits once", () => {
    const guard = renderGuard(true);
    const form = new FakeForm(fakeDocument);
    const submitter = new FakeButton();
    submitter.form = form;
    guard.markDirty();

    const shouldSubmitNow = guard.prepareFormSubmission(
      form as unknown as HTMLFormElement,
      submitter as unknown as HTMLButtonElement
    );

    expect(shouldSubmitNow).toBe(false);
    expect(form.requestSubmit).not.toHaveBeenCalled();
    fakeWindow.history.flushNextTraversal();
    expect(form.requestSubmit).not.toHaveBeenCalled();

    fakeWindow.runAllTimers();

    expect(form.requestSubmit).toHaveBeenCalledTimes(1);
    expect(form.requestSubmit).toHaveBeenCalledWith(submitter);
    expect(form.observedResubmissionFlags).toEqual(["true"]);
    expect(form.dataset.unsavedGuardResubmitting).toBeUndefined();
    expect(fakeWindow.history.back).toHaveBeenCalledTimes(1);
  });

  it("drops a detached submitter when replaying the form", () => {
    const guard = renderGuard();
    const form = new FakeForm(fakeDocument);
    const detachedSubmitter = new FakeButton();
    guard.markDirty();

    expect(
      guard.prepareFormSubmission(
        form as unknown as HTMLFormElement,
        detachedSubmitter as unknown as HTMLButtonElement
      )
    ).toBe(false);
    fakeWindow.history.flushNextTraversal();
    fakeWindow.runAllTimers();

    expect(form.requestSubmit).toHaveBeenCalledWith(undefined);
  });

  it.each([
    { button: 0, ctrlKey: true, label: "modified" },
    { button: 1, ctrlKey: false, label: "middle-button" },
  ])("leaves $label link clicks to the browser", ({ button, ctrlKey }) => {
    const guard = renderGuard();
    guard.markDirty();
    const anchor = new FakeAnchor("http://localhost/admin/v2");
    const event = new FakeEvent();
    event.button = button;
    event.ctrlKey = ctrlKey;
    event.target = anchor;

    fakeDocument.dispatch("click", event);

    expect(event.defaultPrevented).toBe(false);
    expect(fakeWindow.confirm).not.toHaveBeenCalled();
    expect(fakeWindow.history.back).not.toHaveBeenCalled();
    expect(fakeWindow.location.pathname).toBe("/admin/v2/pages/music");
  });
});
