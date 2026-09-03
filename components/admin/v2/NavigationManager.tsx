"use client";

import { useRouter } from "next/navigation";
import {
  useActionState,
  useCallback,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from "react";
import {
  FaArrowDown,
  FaArrowUp,
  FaBars,
  FaCheck,
  FaDesktop,
  FaExclamationTriangle,
  FaEye,
  FaEyeSlash,
  FaGripVertical,
  FaLock,
  FaMobileAlt,
  FaRedo,
  FaSpinner,
  FaUndo,
} from "react-icons/fa";
import { saveNavigationV2 } from "@/app/admin/v2/navigation/actions";
import { useNavbarUnsavedChanges } from "@/components/admin/v2/NavbarUnsavedChangesProvider";
import {
  INITIAL_NAVIGATION_SAVE_STATE,
  canMoveNavigationItem,
  getNavigationEditorRows,
  getNavigationPosition,
  moveNavigationItem,
  moveNavigationItemBefore,
  restoreRecommendedNavigation,
  serializeNavigationDraft,
  setNavigationItemVisibility,
  showAllNavigationForReview,
  toPreviewNavigationItems,
  validateNavigationDraft,
  type NavigationEditorItem,
  type NavigationExpectedVersions,
  type NavigationSaveState,
} from "@/lib/admin/navigation-editor";
import {
  getVisiblePublicPageNavigationItems,
  type NavigationAvailabilityContext,
  type NavigationDestinationKey,
} from "@/lib/content/navigation";

type NavigationManagerProps = {
  artistName: string;
  availability: NavigationAvailabilityContext;
  blockingIssues: string[];
  configVersion: 0 | 1;
  disabled: boolean;
  expectedVersions: NavigationExpectedVersions;
  initialItems: NavigationEditorItem[];
  loadError?: string;
  migrationRequired: boolean;
  unsupportedVersion: boolean;
};

const panelClass =
  "rounded-[24px] border border-white/9 bg-[#0f0f11]/92 shadow-[0_20px_70px_rgba(0,0,0,0.26)]";

function availabilityLabel(
  item: Extract<NavigationEditorItem, { itemType: "known" }>,
  context: NavigationAvailabilityContext
) {
  if (item.availability === "conditional-cnc") {
    return context.hasPublishedCncPrograms
      ? "CNC content available"
      : "Needs a published CNC program";
  }
  if (item.availability === "conditional-resume") {
    return context.hasResumeContent
      ? "Resume content available"
      : "Needs resume or credits";
  }
  return item.kind === "page" ? "Public page" : "Page section";
}

function isRuntimeAvailable(
  item: Extract<NavigationEditorItem, { itemType: "known" }>,
  context: NavigationAvailabilityContext
) {
  if (item.availability === "conditional-cnc") {
    return context.hasPublishedCncPrograms;
  }
  if (item.availability === "conditional-resume") {
    return context.hasResumeContent;
  }
  return item.availability === "available";
}

function NavigationPreview({
  artistName,
  availability,
  items,
}: {
  artistName: string;
  availability: NavigationAvailabilityContext;
  items: NavigationEditorItem[];
}) {
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const visibleItems = useMemo(
    () =>
      getVisiblePublicPageNavigationItems(
        toPreviewNavigationItems(items),
        availability
      ),
    [availability, items]
  );

  return (
    <section className={`${panelClass} overflow-hidden xl:sticky xl:top-4`}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/8 p-4 sm:p-5">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#ff715b]">
            Live draft
          </p>
          <h2 className="heading-ui mt-2 text-lg font-semibold text-white">
            Navbar preview
          </h2>
          <p className="mt-1 text-xs leading-5 text-white/38">
            {visibleItems.length} visible page links
          </p>
        </div>
        <div
          aria-label="Preview device"
          className="inline-flex rounded-xl border border-white/9 bg-black/25 p-1"
          role="group"
        >
          <button
            aria-pressed={device === "desktop"}
            className={`grid h-9 w-9 place-items-center rounded-lg text-xs transition ${
              device === "desktop"
                ? "bg-white text-black"
                : "text-white/42 hover:text-white"
            }`}
            onClick={() => setDevice("desktop")}
            title="Desktop preview"
            type="button"
          >
            <FaDesktop />
            <span className="sr-only">Desktop</span>
          </button>
          <button
            aria-pressed={device === "mobile"}
            className={`grid h-9 w-9 place-items-center rounded-lg text-xs transition ${
              device === "mobile"
                ? "bg-white text-black"
                : "text-white/42 hover:text-white"
            }`}
            onClick={() => setDevice("mobile")}
            title="Mobile preview"
            type="button"
          >
            <FaMobileAlt />
            <span className="sr-only">Mobile</span>
          </button>
        </div>
      </div>

      <div className="bg-[radial-gradient(circle_at_82%_8%,rgba(255,59,31,0.18),transparent_36%)] p-4 sm:p-5">
        {device === "desktop" ? (
          <div className="overflow-x-auto rounded-[18px] border border-white/10 bg-[#080809] shadow-2xl">
            <div className="grid min-h-16 min-w-[680px] grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4 border-b border-[#ff3b1f]/15 px-4">
              <div className="flex min-w-0 items-center gap-3 overflow-hidden">
                {visibleItems.map((item) => (
                  <span
                    className="whitespace-nowrap text-[8px] font-semibold tracking-[0.12em] text-white/58"
                    key={item.key}
                  >
                    {item.defaultLabel}
                  </span>
                ))}
              </div>
              <span className="max-w-[180px] truncate text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-[#ff5b43]">
                {artistName}
              </span>
              <div
                aria-label="Platform shortcuts appear here"
                className="flex min-w-0 justify-end gap-1.5"
              >
                {[0, 1, 2].map((slot) => (
                  <span
                    aria-hidden="true"
                    className="grid h-7 w-7 place-items-center rounded-full border border-[#ff3b1f]/55 text-[#ff5b43]"
                    key={slot}
                  >
                    <span className="h-1 w-1 rounded-full bg-current" />
                  </span>
                ))}
              </div>
            </div>
            <p className="px-4 py-3 text-[10px] leading-4 text-white/36">
              Pages stay on the left, the artist name stays centered, and the
              shortcut icons managed below appear on the right.
            </p>
            {!visibleItems.length ? (
              <p className="px-4 py-8 text-center text-xs text-amber-100/58">
                No destination can render in the navbar.
              </p>
            ) : null}
          </div>
        ) : (
          <div className="mx-auto w-[min(100%,290px)] overflow-hidden rounded-[30px] border border-white/12 bg-[#080809] p-2 shadow-2xl">
            <div className="min-h-[390px] rounded-[23px] border border-white/7 bg-[#0b0b0c]">
              <div className="flex min-h-16 items-center gap-3 border-b border-white/8 px-4">
                <span className="mr-auto truncate text-[10px] font-semibold uppercase tracking-[0.18em] text-white/72">
                  {artistName}
                </span>
                <span className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-white/58">
                  <FaBars />
                </span>
              </div>
              <div className="grid gap-1 p-3">
                {visibleItems.map((item, index) => (
                  <span
                    className="flex min-h-9 items-center rounded-xl border border-white/7 bg-white/[0.025] px-3 text-[10px] font-semibold tracking-[0.12em] text-white/62"
                    key={item.key}
                  >
                    <span className="mr-3 font-mono text-[8px] text-white/22">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    {item.defaultLabel}
                  </span>
                ))}
                {!visibleItems.length ? (
                  <p className="px-3 py-12 text-center text-xs leading-5 text-amber-100/58">
                    The hamburger would be impressively empty.
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function LockedRow({ item }: { item: NavigationEditorItem }) {
  if (item.itemType !== "locked") return null;
  return (
    <li className="rounded-[20px] border border-violet-300/14 bg-violet-400/[0.045] p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-violet-200/14 bg-violet-300/[0.07] text-violet-100/60">
          <FaLock />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="break-all text-sm font-semibold text-white/76">
              {item.key}
            </p>
            <span className="rounded-full border border-violet-200/14 px-2 py-1 text-[8px] font-semibold uppercase tracking-[0.12em] text-violet-100/60">
              Compatibility barrier
            </span>
          </div>
          <p className="mt-2 text-xs leading-5 text-white/40">
            {item.description}
          </p>
          <p className="mt-2 inline-flex items-center gap-1.5 text-[10px] text-white/38">
            {item.isVisible ? <FaEye /> : <FaEyeSlash />}
            {item.isVisible ? "Visible" : "Hidden"} · position locked
          </p>
        </div>
      </div>
    </li>
  );
}

export default function NavigationManager({
  artistName,
  availability,
  blockingIssues,
  configVersion: initialConfigVersion,
  disabled,
  expectedVersions: initialExpectedVersions,
  initialItems,
  loadError,
  migrationRequired,
  unsupportedVersion,
}: NavigationManagerProps) {
  const router = useRouter();
  const [draft, setDraft] = useState(initialItems);
  const draftRef = useRef(initialItems);
  const savedDraftRef = useRef(initialItems);
  const expectedVersionsInputRef = useRef<HTMLInputElement | null>(null);
  const configVersionInputRef = useRef<HTMLInputElement | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [presetUndo, setPresetUndo] = useState<NavigationEditorItem[] | null>(
    null
  );
  const draggedKeyRef = useRef<NavigationDestinationKey | null>(null);
  const { clearDirty, confirmDiscard, markDirty } =
    useNavbarUnsavedChanges("navigation");
  const clientAction = useCallback(
    async (previousState: NavigationSaveState, formData: FormData) => {
      const result = await saveNavigationV2(previousState, formData);
      if (
        result.status === "saved" &&
        result.expectedVersions &&
        result.configVersion !== undefined
      ) {
        if (expectedVersionsInputRef.current) {
          expectedVersionsInputRef.current.value = JSON.stringify(
            result.expectedVersions
          );
        }
        if (configVersionInputRef.current) {
          configVersionInputRef.current.value = String(result.configVersion);
        }
        savedDraftRef.current = draftRef.current;
        setHasUnsavedChanges(false);
        clearDirty();
        router.refresh();
      }
      return result;
    },
    [clearDirty, router]
  );
  const [saveState, formAction, pending] = useActionState(
    clientAction,
    INITIAL_NAVIGATION_SAVE_STATE
  );

  const validation = useMemo(
    () => validateNavigationDraft(draft),
    [draft]
  );
  const editorRows = useMemo(() => getNavigationEditorRows(draft), [draft]);
  const selectedCount = draft.filter(
    (item) =>
      item.itemType === "known" && item.kind === "page" && item.isVisible
  ).length;
  const effectiveCount = getVisiblePublicPageNavigationItems(
    toPreviewNavigationItems(draft),
    availability
  ).length;
  const editorDisabled =
    disabled ||
    pending ||
    migrationRequired ||
    unsupportedVersion ||
    blockingIssues.length > 0 ||
    Boolean(loadError);

  function updateDraft(next: NavigationEditorItem[], message?: string) {
    draftRef.current = next;
    setDraft(next);
    const nextSerialized = JSON.stringify(serializeNavigationDraft(next));
    const savedSerialized = JSON.stringify(
      serializeNavigationDraft(savedDraftRef.current)
    );
    const isDirty = nextSerialized !== savedSerialized;
    setHasUnsavedChanges(isDirty);
    if (isDirty) markDirty();
    else clearDirty();
    if (message) setAnnouncement(message);
  }

  function moveItem(key: NavigationDestinationKey, direction: -1 | 1) {
    const next = moveNavigationItem(draft, key, direction);
    if (next.every((item, index) => item === draft[index])) return;
    const position = getNavigationPosition(next, key);
    const item = next.find(
      (candidate) => candidate.itemType === "known" && candidate.key === key
    );
    updateDraft(
      next,
      item && position
        ? `${item.defaultLabel} moved to position ${position.position} of ${position.total}.`
        : undefined
    );
  }

  function dropBefore(
    event: DragEvent<HTMLLIElement>,
    targetKey: NavigationDestinationKey
  ) {
    event.preventDefault();
    const sourceKey = draggedKeyRef.current;
    draggedKeyRef.current = null;
    if (!sourceKey || sourceKey === targetKey) return;
    const next = moveNavigationItemBefore(draft, sourceKey, targetKey);
    if (next.every((item, index) => item === draft[index])) {
      setAnnouncement("That destination cannot cross a locked future row.");
      return;
    }
    const moved = next.find(
      (item) => item.itemType === "known" && item.key === sourceKey
    );
    const position = getNavigationPosition(next, sourceKey);
    updateDraft(
      next,
      moved && position
        ? `${moved.defaultLabel} moved to position ${position.position} of ${position.total}.`
        : undefined
    );
  }

  function applyShowAllPreset() {
    setPresetUndo(draft);
    updateDraft(
      showAllNavigationForReview(draft),
      "All six portfolio pages are selected. Save to publish the change."
    );
  }

  function applyRecommendedPreset() {
    setPresetUndo(draft);
    updateDraft(
      restoreRecommendedNavigation(draft),
      "Recommended page order restored. Save to publish the change."
    );
  }

  const validationMessage =
    validation.ok
      ? ""
      : validation.reason === "empty-unconditional-navigation"
        ? "Keep at least one always-available page visible."
        : "Keep at least one portfolio page visible.";
  const statusIsError = !["idle", "saved"].includes(saveState.status);
  const stickyStatusLabel = pending
    ? "Saving navbar..."
    : editorDisabled
      ? "Saving paused"
      : hasUnsavedChanges
        ? "Unsaved changes"
        : "Draft matches last save";
  const stickyStatusDot = pending
    ? "bg-sky-300"
    : editorDisabled || statusIsError
      ? "bg-amber-300"
      : hasUnsavedChanges
        ? "bg-amber-300"
        : "bg-emerald-300";
  const stickyFeedback = validationMessage
    ? validationMessage
    : statusIsError
      ? saveState.message
      : editorDisabled
        ? "Resolve the warning above before this navbar can be saved."
        : saveState.status === "saved" && !hasUnsavedChanges
          ? saveState.message
          : "All page choices save together; hidden links never delete their pages or content.";

  function reloadSavedNavbar() {
    if (!confirmDiscard()) return;
    window.location.reload();
  }

  return (
    <form
      action={formAction}
      data-unsaved-guard-bypass="true"
      onSubmit={(event) => {
        if (!validation.ok || editorDisabled) event.preventDefault();
      }}
    >
      <input
        defaultValue={initialConfigVersion}
        name="expectedConfigVersion"
        ref={configVersionInputRef}
        type="hidden"
      />
      <input
        defaultValue={JSON.stringify(initialExpectedVersions)}
        name="expectedVersions"
        ref={expectedVersionsInputRef}
        type="hidden"
      />
      <input
        name="items"
        type="hidden"
        value={JSON.stringify(serializeNavigationDraft(draft))}
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(330px,0.75fr)] xl:items-start">
        <div className="grid gap-4">
          {(migrationRequired || loadError || unsupportedVersion ||
            blockingIssues.length > 0) && (
            <section
              className="rounded-[20px] border border-amber-300/18 bg-amber-400/[0.065] p-4 text-sm leading-6 text-amber-50/76"
              role="alert"
            >
              <div className="flex items-start gap-3">
                <FaExclamationTriangle className="mt-1 shrink-0 text-amber-200" />
                <div>
                  <p className="font-semibold text-amber-50">
                    Navbar saving is paused
                  </p>
                  {migrationRequired ? (
                    <p className="mt-1">
                      Apply database migration 0027 to enable the atomic V2
                      save workflow.
                    </p>
                  ) : null}
                  {unsupportedVersion ? (
                    <p className="mt-1">
                      This database uses a newer navigation format than this
                      application build understands.
                    </p>
                  ) : null}
                  {loadError ? <p className="mt-1">{loadError}</p> : null}
                  {blockingIssues.map((issue) => (
                    <p className="mt-1" key={issue}>
                      {issue}
                    </p>
                  ))}
                </div>
              </div>
            </section>
          )}

          {saveState.status !== "idle" &&
          !(saveState.status === "saved" && hasUnsavedChanges) ? (
            <section
              className={`rounded-[18px] border px-4 py-3 text-sm leading-6 ${
                saveState.status === "saved"
                  ? "border-emerald-300/16 bg-emerald-400/[0.06] text-emerald-50/76"
                  : "border-red-300/16 bg-red-400/[0.06] text-red-50/76"
              }`}
              role={statusIsError ? "alert" : "status"}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="inline-flex items-center gap-2">
                  {saveState.status === "saved" ? (
                    <FaCheck />
                  ) : (
                    <FaExclamationTriangle />
                  )}
                  {saveState.message}
                </span>
                {saveState.status === "conflict" ? (
                  <button
                    className="min-h-10 rounded-xl border border-red-100/16 px-3 text-xs font-semibold transition hover:bg-white hover:text-black"
                    onClick={reloadSavedNavbar}
                    type="button"
                  >
                    Reload saved navbar
                  </button>
                ) : null}
              </div>
            </section>
          ) : null}

          <section className={`${panelClass} p-4 sm:p-5`}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#ff715b]">
                  Draft tools
                </p>
                <h2 className="heading-ui mt-2 text-xl font-semibold text-white">
                  Choose the main pages
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-white/44">
                  The navbar lists pages only. Hiding one changes the header,
                  while its route, content, and saved section data stay intact.
                </p>
              </div>
              <div className="flex gap-2 text-center">
                <span className="rounded-xl border border-white/8 bg-black/20 px-3 py-2">
                  <strong className="block text-lg text-white">
                    {selectedCount}
                  </strong>
                  <span className="text-[9px] uppercase tracking-[0.12em] text-white/34">
                    selected
                  </span>
                </span>
                <span className="rounded-xl border border-white/8 bg-black/20 px-3 py-2">
                  <strong className="block text-lg text-white">
                    {effectiveCount}
                  </strong>
                  <span className="text-[9px] uppercase tracking-[0.12em] text-white/34">
                    visible now
                  </span>
                </span>
              </div>
            </div>

            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <button
                className="min-h-12 rounded-2xl border border-white/9 bg-white/[0.04] px-4 text-left transition hover:border-white/16 hover:bg-white/[0.075] disabled:cursor-not-allowed disabled:opacity-40"
                disabled={editorDisabled}
                onClick={applyShowAllPreset}
                type="button"
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-white/76">
                  <FaEye className="text-[#ff715b]" /> Show every page
                </span>
                <span className="mt-1 block text-[10px] leading-4 text-white/34">
                  Select all six portfolio pages without changing their order.
                </span>
              </button>
              <button
                className="min-h-12 rounded-2xl border border-white/9 bg-white/[0.04] px-4 text-left transition hover:border-white/16 hover:bg-white/[0.075] disabled:cursor-not-allowed disabled:opacity-40"
                disabled={editorDisabled}
                onClick={applyRecommendedPreset}
                type="button"
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-white/76">
                  <FaRedo className="text-[#ff715b]" /> Restore recommended
                </span>
                <span className="mt-1 block text-[10px] leading-4 text-white/34">
                  Restore Home, Bio, Gallery, Music, Showreel, and Contact.
                </span>
              </button>
            </div>
            {presetUndo ? (
              <button
                className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl px-2 text-xs font-semibold text-white/48 transition hover:text-white"
                disabled={editorDisabled}
                onClick={() => {
                  updateDraft(presetUndo, "Preset undone.");
                  setPresetUndo(null);
                }}
                type="button"
              >
                <FaUndo /> Undo preset
              </button>
            ) : null}
          </section>

          <section className={`${panelClass} p-3 sm:p-4`}>
            <div className="flex items-center justify-between gap-3 px-1 pb-3">
              <div>
                <h2 className="heading-ui text-lg font-semibold text-white">
                  Navbar order
                </h2>
                <p className="mt-1 text-xs text-white/36">
                  Section anchors stay internal. Use arrows everywhere; drag is
                  a desktop shortcut.
                </p>
              </div>
              <span className="text-[10px] uppercase tracking-[0.14em] text-white/28">
                {draft.filter(
                  (item) => item.itemType === "known" && item.kind === "page"
                ).length} pages
              </span>
            </div>

            <ol className="grid gap-2.5">
              {editorRows.map((item) => {
                if (item.itemType === "locked") {
                  return <LockedRow item={item} key={item.key} />;
                }

                const available = isRuntimeAvailable(item, availability);
                const canMoveUp = canMoveNavigationItem(draft, item.key, -1);
                const canMoveDown = canMoveNavigationItem(draft, item.key, 1);
                const position = getNavigationPosition(draft, item.key);
                const descriptionId = `navigation-item-${item.key.replaceAll(".", "-")}`;
                return (
                  <li
                    className={`group/row rounded-[20px] border p-3 transition sm:p-4 ${
                      item.isVisible
                        ? "border-emerald-300/15 bg-emerald-400/[0.035]"
                        : "border-white/8 bg-black/20"
                    }`}
                    key={item.key}
                    onDragOver={(event) => {
                      if (draggedKeyRef.current) event.preventDefault();
                    }}
                    onDrop={(event) => dropBefore(event, item.key)}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        aria-hidden="true"
                        className="hidden h-11 w-8 shrink-0 cursor-grab place-items-center rounded-lg text-white/22 transition hover:bg-white/[0.05] hover:text-white/58 active:cursor-grabbing sm:grid"
                        draggable={!editorDisabled}
                        onDragEnd={() => {
                          draggedKeyRef.current = null;
                        }}
                        onDragStart={(event) => {
                          draggedKeyRef.current = item.key;
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData("text/plain", item.key);
                        }}
                      >
                        <FaGripVertical />
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-[9px] text-white/24">
                            {String(position?.position ?? 0).padStart(2, "0")}
                          </span>
                          <h3 className="text-sm font-semibold text-white/82">
                            {item.defaultLabel}
                          </h3>
                          <span className="rounded-full border border-white/9 px-2 py-1 text-[8px] font-semibold uppercase tracking-[0.12em] text-white/38">
                            page
                          </span>
                          <span
                            className={`rounded-full border px-2 py-1 text-[8px] font-semibold uppercase tracking-[0.1em] ${
                              available
                                ? "border-emerald-300/12 text-emerald-100/58"
                                : "border-amber-300/14 text-amber-100/62"
                            }`}
                          >
                            {availabilityLabel(item, availability)}
                          </span>
                        </div>
                        <p
                          className="mt-2 text-xs leading-5 text-white/40"
                          id={descriptionId}
                        >
                          {item.description}
                        </p>
                        <code className="mt-2 block truncate text-[10px] text-white/28">
                          {item.href}
                        </code>
                      </div>

                      <div className="flex shrink-0 flex-col items-end gap-2">
                        <label className="cursor-pointer">
                          <input
                            aria-describedby={descriptionId}
                            aria-label={`Show ${item.defaultLabel} in navbar`}
                            checked={item.isVisible}
                            className="peer sr-only"
                            disabled={editorDisabled}
                            onChange={(event) =>
                              updateDraft(
                                setNavigationItemVisibility(
                                  draft,
                                  item.key,
                                  event.target.checked
                                ),
                                `${item.defaultLabel} ${
                                  event.target.checked ? "selected" : "hidden"
                                }.`
                              )
                            }
                            type="checkbox"
                          />
                          <span
                            aria-hidden="true"
                            className={`relative block h-7 w-12 rounded-full border transition peer-focus-visible:ring-2 peer-focus-visible:ring-white/70 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-[#111] ${
                              item.isVisible
                                ? "border-emerald-300/24 bg-emerald-300/18"
                                : "border-white/10 bg-black/35"
                            }`}
                          >
                            <span
                              className={`absolute top-1/2 h-[18px] w-[18px] -translate-y-1/2 rounded-full transition ${
                                item.isVisible
                                  ? "left-[25px] bg-emerald-200"
                                  : "left-1 bg-white/30"
                              }`}
                            />
                          </span>
                        </label>
                        <span className="text-[9px] font-semibold text-white/34">
                          {item.isVisible ? "Shown" : "Hidden"}
                        </span>
                      </div>
                    </div>

                    <div className="mt-3 flex justify-end gap-2 border-t border-white/7 pt-3">
                      <button
                        aria-label={`Move ${item.defaultLabel} up`}
                        className="grid h-11 w-11 place-items-center rounded-xl border border-white/9 text-white/46 outline-none transition hover:bg-white hover:text-black focus-visible:ring-2 focus-visible:ring-white/60 disabled:cursor-not-allowed disabled:opacity-20"
                        disabled={editorDisabled || !canMoveUp}
                        onClick={() => moveItem(item.key, -1)}
                        type="button"
                      >
                        <FaArrowUp />
                      </button>
                      <button
                        aria-label={`Move ${item.defaultLabel} down`}
                        className="grid h-11 w-11 place-items-center rounded-xl border border-white/9 text-white/46 outline-none transition hover:bg-white hover:text-black focus-visible:ring-2 focus-visible:ring-white/60 disabled:cursor-not-allowed disabled:opacity-20"
                        disabled={editorDisabled || !canMoveDown}
                        onClick={() => moveItem(item.key, 1)}
                        type="button"
                      >
                        <FaArrowDown />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ol>

            <p aria-live="polite" className="sr-only">
              {announcement}
            </p>
          </section>
        </div>

        <NavigationPreview
          artistName={artistName}
          availability={availability}
          items={draft}
        />
      </div>

      <div className="sticky bottom-3 z-20 mt-4 rounded-[20px] border border-white/10 bg-[#101012]/95 p-3 shadow-[0_18px_70px_rgba(0,0,0,0.52)] backdrop-blur-2xl sm:flex sm:items-center sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-2 text-xs font-semibold text-white/62">
            <span
              className={`h-2 w-2 rounded-full ${stickyStatusDot}`}
            />
            {stickyStatusLabel}
          </p>
          <p
            className={`mt-1 text-[10px] ${
              validationMessage || statusIsError
                ? "text-red-100/68"
                : editorDisabled
                  ? "text-amber-100/62"
                  : "text-white/30"
            }`}
            role={validationMessage || statusIsError ? "alert" : undefined}
          >
            {stickyFeedback}
          </p>
          {saveState.status === "conflict" ? (
            <button
              className="mt-2 min-h-9 rounded-xl border border-red-100/16 px-3 text-[10px] font-semibold text-red-50/76 transition hover:bg-white hover:text-black"
              onClick={reloadSavedNavbar}
              type="button"
            >
              Reload saved navbar
            </button>
          ) : null}
        </div>
        <button
          aria-busy={pending}
          className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white px-5 text-sm font-semibold text-black transition hover:bg-[#ff3b1f] hover:text-white disabled:cursor-not-allowed disabled:opacity-40 sm:mt-0 sm:w-auto sm:min-w-[170px]"
          disabled={editorDisabled || !validation.ok || !hasUnsavedChanges}
          type="submit"
        >
          {pending ? <FaSpinner className="animate-spin" /> : <FaCheck />}
          {pending ? "Saving navbar..." : "Save navbar"}
        </button>
      </div>
    </form>
  );
}
