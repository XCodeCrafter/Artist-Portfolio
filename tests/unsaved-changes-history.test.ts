import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const guard = readFileSync(
  new URL("../components/admin/useUnsavedChangesGuard.ts", import.meta.url),
  "utf8"
);
const guardedReloadEditors = [
  "BioEditor",
  "ContactEditor",
  "GalleryEditor",
  "MusicEditor",
  "ShowreelEditor",
].map((editor) =>
  readFileSync(
    new URL(`../components/admin/v2/${editor}.tsx`, import.meta.url),
    "utf8"
  )
);
const guardedSubmitWorkspaces = [
  "AnalyticsDashboard",
  "ContentEditor",
  "InquiryInbox",
  "MediaManager",
  "SecurityCenter",
].map((component) =>
  readFileSync(
    new URL(`../components/admin/${component}.tsx`, import.meta.url),
    "utf8"
  )
);
const navigationManager = readFileSync(
  new URL("../components/admin/v2/NavigationManager.tsx", import.meta.url),
  "utf8"
);

describe("unsaved-change history guard", () => {
  it("consumes its duplicate history entry after an in-place save or discard", () => {
    expect(guard).toContain("const shouldCompactHistory = removeCurrentHistoryMarker()");
    expect(guard).toContain("HISTORY_GUARD_BASE_KEY");
    expect(guard).toContain("historyCompactionRef.current = {");
    expect(guard).toContain("targetUrl: window.location.href");
    expect(guard).toContain("window.history.back()");
    expect(guard).toContain("window.history.replaceState(");
  });

  it("accepts only the expected base entry as an internal compaction event", () => {
    expect(guard).toContain(
      "currentState[HISTORY_GUARD_BASE_KEY] !== historyCompaction.guardId"
    );
    expect(guard).toContain("historyCompaction.afterCompaction?.()");
    expect(guard).toContain("withoutHistoryGuardKeys(currentState)");
  });

  it("keeps cleanup single-flight when another edit or action arrives", () => {
    expect(guard).toContain("historyCompaction.rearmDirty = true");
    expect(guard).toContain("!pendingCompaction.afterCompaction");
    expect(guard).toContain(
      "!dirtyRef.current && !historyCompactionRef.current"
    );
  });

  it("sequences confirmed links, forms, and reloads after compaction", () => {
    expect(guard).toContain(
      "clearDirty(() => window.location.assign(destination.href))"
    );
    expect(guard).toContain("submitter?.form === form ? submitter : undefined");
    expect(guard).toContain("isGuardedFormResubmission(form)");
    for (const workspace of guardedSubmitWorkspaces) {
      expect(workspace).toContain("prepareFormSubmission(");
    }
    for (const editor of guardedReloadEditors) {
      expect(editor).toContain(
        "confirmDiscard(() => window.location.reload())"
      );
    }
    expect(navigationManager).toContain(
      "clearDirty(() => router.refresh())"
    );
  });
});
