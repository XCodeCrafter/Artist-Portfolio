import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createInquiryFormDraft,
  discardInquiryFormDraft,
  isInquiryDraftDiscardRequested,
  parsePendingInquiryDraft,
  pendingInquiryMatchesSaved,
} from "@/lib/admin/inquiry-drafts";

// Minimal hook harness: preserve React's initializer-once/setter semantics
// across simulated server-prop refreshes without requiring a browser renderer.
const state = vi.hoisted(() => ({ current: undefined as unknown }));
vi.mock("react", () => ({
  useState(initializer: () => unknown) {
    if (state.current === undefined) state.current = initializer();
    return [state.current, (update: (current: unknown) => unknown) => { state.current = update(state.current); }];
  },
}));
import useVersionedFormSnapshot from "@/components/admin/useVersionedFormSnapshot";

const OLD_VERSION = "2026-09-21T10:00:00.123456Z";
const NEW_VERSION = "2026-09-21T10:05:00.654321Z";

describe("uncontrolled form draft/version coherence", () => {
  beforeEach(() => { state.current = undefined; });

  it("freezes metadata and version together across a neighboring save/refresh", () => {
    const original = { updatedAt: OLD_VERSION, label: "Original", isPublished: true };
    useVersionedFormSnapshot(original);
    const refreshed = useVersionedFormSnapshot({ updatedAt: NEW_VERSION, label: "Other admin", isPublished: false });
    expect(refreshed.snapshot).toBe(original);
    expect(refreshed.hasNewVersion).toBe(true);
    expect(refreshed.revision).toBe(0);
  });

  it("does not rewrite a form when unrelated server props arrive with the same version", () => {
    const original = { updatedAt: OLD_VERSION, label: "Original" };
    useVersionedFormSnapshot(original);
    const refreshed = useVersionedFormSnapshot({ updatedAt: OLD_VERSION, label: "Refreshed prop" });
    expect(refreshed.snapshot).toBe(original);
    expect(refreshed.hasNewVersion).toBe(false);
  });

  it("advances values and version atomically only after explicit reload, remounting uncontrolled inputs", () => {
    useVersionedFormSnapshot({ updatedAt: OLD_VERSION, artistName: "Old name" });
    const latest = { updatedAt: NEW_VERSION, artistName: "New name" };
    useVersionedFormSnapshot(latest).loadLatest();
    const reloaded = useVersionedFormSnapshot(latest);
    expect(reloaded.snapshot).toBe(latest);
    expect(reloaded.revision).toBe(1);
    expect(reloaded.hasNewVersion).toBe(false);
  });
});

describe("Inbox recovery keeps the original optimistic-lock baseline", () => {
  const original = { id: "inquiry-1", updatedAt: OLD_VERSION, status: "new" as const, adminNotes: "Original note" };
  const pending = { ...createInquiryFormDraft(original), id: original.id, status: "replied" as const, adminNotes: "My unsaved reply" };

  it("serializes and restores both draft and original baseline without borrowing a refreshed version", () => {
    const recovered = parsePendingInquiryDraft(JSON.parse(JSON.stringify(pending)));
    expect(recovered).toEqual(pending);
    expect(recovered?.expectedUpdatedAt).toBe(OLD_VERSION);
    expect(recovered?.initialAdminNotes).toBe("Original note");
    expect(recovered?.adminNotes).toBe("My unsaved reply");
  });

  it.each([
    { ...pending, expectedUpdatedAt: undefined },
    { ...pending, expectedUpdatedAt: "not-a-version" },
    { ...pending, initialStatus: undefined },
    { ...pending, initialAdminNotes: undefined },
    { ...pending, status: "unexpected" },
    { ...pending, adminNotes: "x".repeat(4001) },
  ])("rejects incomplete or old recovery records rather than trusting current server props", (value) => {
    expect(parsePendingInquiryDraft(value)).toBeNull();
  });

  it("does not acknowledge an old saved notice or another row's successful action", () => {
    expect(pendingInquiryMatchesSaved(pending, original)).toBe(false);
    expect(pendingInquiryMatchesSaved(pending, { ...original, updatedAt: NEW_VERSION, status: "read" })).toBe(false);
    expect(pendingInquiryMatchesSaved(pending, { ...original, id: "inquiry-2", updatedAt: NEW_VERSION, status: pending.status, adminNotes: pending.adminNotes })).toBe(false);
  });

  it("acknowledges only canonical saved data matching that submitted draft and a new version", () => {
    expect(pendingInquiryMatchesSaved(pending, { ...original, updatedAt: NEW_VERSION, status: pending.status, adminNotes: pending.adminNotes })).toBe(true);
    expect(pendingInquiryMatchesSaved(pending, { ...original, status: pending.status, adminNotes: pending.adminNotes })).toBe(false);
  });

  it("distinguishes confirmed discard from React's automatic reset on conflict redirects", () => {
    const form = { dataset: {} as DOMStringMap, reset: vi.fn() };
    expect(isInquiryDraftDiscardRequested(form)).toBe(false);
    form.reset.mockImplementation(() => {
      expect(isInquiryDraftDiscardRequested(form)).toBe(true);
    });
    discardInquiryFormDraft(form);
    expect(form.reset).toHaveBeenCalledOnce();
    expect(isInquiryDraftDiscardRequested(form)).toBe(false);
  });

  it("does not leave future automatic resets armed after a failed explicit reset", () => {
    const form = { dataset: {} as DOMStringMap, reset: () => { throw new Error("reset failed"); } };
    expect(() => discardInquiryFormDraft(form)).toThrow("reset failed");
    expect(isInquiryDraftDiscardRequested(form)).toBe(false);
  });
});

describe("version-safe UI wiring", () => {
  const media = readFileSync(new URL("../components/admin/MediaManager.tsx", import.meta.url), "utf8");
  const content = readFileSync(new URL("../components/admin/ContentEditor.tsx", import.meta.url), "utf8");
  const inbox = readFileSync(new URL("../components/admin/InquiryInbox.tsx", import.meta.url), "utf8");
  const notice = readFileSync(new URL("../components/admin/VersionedDraftNotice.tsx", import.meta.url), "utf8");

  it("uses the frozen snapshot for Media metadata and Classic settings, not live version props", () => {
    expect(media).toContain("useVersionedFormSnapshot(asset)");
    expect(media).toContain('<form action={updateMediaAsset} key={revision} onReset={(event) => event.preventDefault()}>');
    expect(media).toContain('name="expectedUpdatedAt" type="hidden" value={metadata.updatedAt}');
    expect(media).not.toContain('name="expectedUpdatedAt" type="hidden" value={asset.updatedAt}');
    const settings = content.slice(content.indexOf("function SiteSettingsForm("), content.indexOf("function SiteSettingsForm(") + 11000);
    expect(settings).toContain("useVersionedFormSnapshot(content.settings)");
    expect(settings).toContain('name="expectedUpdatedAt" type="hidden" value={settings.updatedAt || ""}');
    expect(settings).not.toContain("defaultValue={content.settings.");
    expect(settings).not.toContain('value={content.settings.updatedAt || ""}');
    expect(settings.match(/key=\{revision\} onReset=\{\(event\) => event.preventDefault\(\)\}/g)).toHaveLength(4);
  });

  it("binds Inbox values, dirty baseline and both write versions to the same recovered draft", () => {
    expect(inbox).toContain("data-initial-admin-notes={draft.initialAdminNotes}");
    expect(inbox).toContain("data-initial-status={draft.initialStatus}");
    expect(inbox).toContain("value={draft.adminNotes}");
    expect(inbox).toContain("value={draft.status}");
    expect(inbox.match(/name="expectedUpdatedAt" type="hidden" value=\{draft.expectedUpdatedAt\}/g)).toHaveLength(2);
    expect(inbox).not.toContain('value={inquiry.updatedAt || ""}');
    expect(inbox).toContain("if (recoveredDraftRef.current) return");
    expect(inbox).toContain("pendingInquiryMatchesSaved(recoveredDraft, inquiry)");
    expect(inbox).toContain("if (!isInquiryDraftDiscardRequested(event.currentTarget)) return");
    expect(inbox).toContain("otherDraftForms.forEach(discardInquiryFormDraft)");
  });

  it("requires explicit confirmation before replacing drafts", () => {
    expect(notice).toContain("window.confirm(");
    expect(notice).toContain("Unsaved changes in this form will be replaced.");
    expect(notice).toContain('type="button"');
  });
});
