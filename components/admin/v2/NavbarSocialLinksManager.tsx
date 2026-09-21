"use client";

import {
  useActionState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  FaArrowDown,
  FaArrowUp,
  FaArchive,
  FaCheck,
  FaExclamationTriangle,
  FaEye,
  FaEyeSlash,
  FaPlus,
  FaSpinner,
  FaTrash,
} from "react-icons/fa";
import { saveNavbarSocialLinksV2 } from "@/app/admin/v2/navigation/social-actions";
import {
  loadNavbarShortcutArchivePage,
  mutateNavbarShortcutArchive,
} from "@/app/admin/v2/navigation/archive-actions";
import {
  ARCHIVE_PAGE_SIZE,
  parseArchivePage,
  type ArchiveData,
} from "@/lib/admin/content-archive-editor";
import { needsEditorReload, runEditorSave } from "@/lib/admin/editor-save-recovery";
import SocialPlatformIcon from "@/components/SocialPlatformIcon";
import { useNavbarUnsavedChanges } from "@/components/admin/v2/NavbarUnsavedChangesProvider";
import {
  INITIAL_NAVBAR_SOCIAL_LINKS_SAVE_STATE,
  createEmptyNavbarSocialLink,
  moveNavbarSocialLink,
  parseNavbarSocialLinksDraft,
  parseNavbarSocialLinksSubmission,
  serializeNavbarSocialLinks,
  updateNavbarSocialLinkUrl,
  type NavbarSocialLinkItem,
  type NavbarSocialLinksSnapshot,
} from "@/lib/admin/navbar-social-links-editor";
import { detectSocialPlatform, getSocialPlatformDefinition } from "@/lib/content/social-platforms";

type Props = {
  snapshot: NavbarSocialLinksSnapshot;
  disabled: boolean;
  migrationRequired: boolean;
  loadError?: string;
  archiveData?: ArchiveData;
};

const panelClass =
  "rounded-[24px] border border-white/9 bg-[#0f0f11]/92 shadow-[0_20px_70px_rgba(0,0,0,0.26)]";
const inputClass =
  "mt-2 min-h-11 w-full rounded-2xl border border-white/10 bg-black/28 px-3.5 py-2.5 text-sm text-white outline-none transition placeholder:text-white/24 focus:border-white/34 focus:bg-black/38 disabled:cursor-not-allowed disabled:opacity-45";
const labelClass =
  "text-[10px] font-semibold uppercase tracking-[0.17em] text-white/42";
const archiveButtonClass =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-white/65 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-35";
const EMPTY_ARCHIVE: ArchiveData = {
  available: false,
  page: { items: [], total: 0, offset: 0 },
  message: "Shortcut archive is not available yet. Regular shortcut editing still works.",
};

function serialized(items: readonly NavbarSocialLinkItem[]) {
  return JSON.stringify(serializeNavbarSocialLinks(items));
}

function errorAt(errors: Record<string, string[]>, index: number, field: string) {
  return (
    errors[`${index}.${field}`] ||
    errors[`items.${index}.${field}`] ||
    []
  ).join(" ");
}

export default function NavbarSocialLinksManager({
  snapshot,
  disabled,
  migrationRequired,
  loadError,
  archiveData = EMPTY_ARCHIVE,
}: Props) {
  const [baseline, setBaseline] = useState(snapshot.items);
  const [draft, setDraft] = useState(snapshot.items);
  const [versions, setVersions] = useState(snapshot.expectedVersions);
  const [announcement, setAnnouncement] = useState("");
  const [archive, setArchive] = useState(archiveData);
  const [archivePending, setArchivePending] = useState(false);
  const [archivePagePending, setArchivePagePending] = useState(false);
  const [archiveReloadRequired, setArchiveReloadRequired] = useState(false);
  const [archiveFeedback, setArchiveFeedback] = useState<{ message: string; error: boolean } | null>(null);
  const [confirmArchiveId, setConfirmArchiveId] = useState<string | null>(null);
  const archiveInFlight = useRef<"mutation" | "page" | null>(null);
  const { clearDirty, confirmDiscard, markDirty } =
    useNavbarUnsavedChanges("shortcuts");
  const clientAction = useCallback(
    async (previousState: typeof INITIAL_NAVBAR_SOCIAL_LINKS_SAVE_STATE, formData: FormData) => {
      if (archiveInFlight.current === "mutation" || archiveReloadRequired) return previousState;
      return runEditorSave(previousState, () => saveNavbarSocialLinksV2(previousState, formData), (result) => {
        const confirmed = parseNavbarSocialLinksSubmission(result.items, result.expectedVersions);
        if (confirmed.success && confirmed.data.items.length === Object.keys(confirmed.data.expectedVersions).length) {
          setDraft(confirmed.data.items);
          setBaseline(confirmed.data.items);
          setVersions(confirmed.data.expectedVersions);
          setAnnouncement("Platform shortcuts saved and published.");
          clearDirty();
          return true;
        }
        return false;
      });
    },
    [archiveReloadRequired, clearDirty]
  );
  const [saveState, formAction, pending] = useActionState(
    clientAction,
    INITIAL_NAVBAR_SOCIAL_LINKS_SAVE_STATE
  );

  const validation = useMemo(
    () => parseNavbarSocialLinksDraft(serializeNavbarSocialLinks(draft)),
    [draft]
  );
  const localErrors = validation.success ? {} : validation.fieldErrors;
  const responseErrors = saveState.fieldErrors || {};
  const errors = { ...responseErrors, ...localErrors };
  const isDirty = serialized(draft) !== serialized(baseline);
  const editorDisabled =
    disabled || pending || archivePending || archiveReloadRequired || needsEditorReload(saveState) || migrationRequired || Boolean(loadError);
  const canSave = isDirty && validation.success && !editorDisabled;
  const canArchive = archive.available && !isDirty && !editorDisabled && !archivePagePending;
  const visibleLinks = draft.filter(
    (item) => item.isPublished && item.href.trim()
  );

  useEffect(() => {
    if (isDirty) markDirty();
    else clearDirty();
  }, [clearDirty, isDirty, markDirty]);

  function updateItem(index: number, patch: Partial<NavbarSocialLinkItem>) {
    setDraft((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item
      )
    );
  }

  function updateUrl(index: number, href: string) {
    setDraft((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? updateNavbarSocialLinkUrl(item, href) : item
      )
    );
  }

  function moveItem(index: number, direction: -1 | 1) {
    setDraft((current) =>
      moveNavbarSocialLink(current, index, index + direction)
    );
    setAnnouncement(
      `Shortcut moved to position ${index + direction + 1}. Save to publish the order.`
    );
  }

  function addItem() {
    const id = `social-${crypto.randomUUID()}`;
    setDraft((current) => [...current, createEmptyNavbarSocialLink(id)]);
    setAnnouncement("New shortcut added. Paste its profile URL.");
  }

  function removeUnsavedItem(index: number) {
    setDraft((current) => current.filter((_, itemIndex) => itemIndex !== index));
    setAnnouncement("Unsaved shortcut removed.");
  }

  function reloadSaved() {
    confirmDiscard(() => window.location.reload());
  }

  async function mutateArchive(operation: "archive" | "restore", itemId: string) {
    if (!canArchive || archiveInFlight.current) return;
    const savedItem = baseline.find(item => item.id === itemId);
    const archivedItem = archive.page.items.find(item => item.id === itemId);
    if (operation === "archive" && (!savedItem || confirmArchiveId !== itemId)) return;
    if (operation === "restore" && (!archivedItem || draft.length >= 16)) return;

    archiveInFlight.current = "mutation";
    setArchivePending(true);
    setArchiveFeedback(null);
    try {
      const result = await mutateNavbarShortcutArchive({
        operation,
        itemId,
        expectedVersions: versions,
        ...(operation === "restore" ? { expectedArchiveUpdatedAt: archivedItem!.updatedAt } : {}),
      });
      if (!result || typeof result.ok !== "boolean" || typeof result.message !== "string") {
        throw new Error("Unverified archive response");
      }
      if (!result.ok) {
        if (result.reloadRequired) setArchiveReloadRequired(true);
        setArchiveFeedback({ message: result.message, error: true });
        return;
      }
      const confirmed = result.snapshot && parseNavbarSocialLinksSubmission(
        result.snapshot.items, result.snapshot.expectedVersions
      );
      const confirmedArchive = parseArchivePage(result.archive);
      if (!confirmed?.success ||
        confirmed.data.items.length !== Object.keys(confirmed.data.expectedVersions).length ||
        !confirmedArchive) {
        throw new Error("Unverified archive snapshot");
      }
      const restoredItem = confirmed.data.items.find(item => item.id === itemId);
      if ((operation === "archive" && restoredItem) ||
        (operation === "restore" && (!restoredItem || restoredItem.isPublished))) {
        throw new Error("Unverified archive operation");
      }
      setDraft(confirmed.data.items);
      setBaseline(confirmed.data.items);
      setVersions(confirmed.data.expectedVersions);
      setArchive({ available: true, page: confirmedArchive });
      setConfirmArchiveId(null);
      setArchiveFeedback({ message: result.message, error: false });
      setAnnouncement(operation === "archive"
        ? "Shortcut archived. It is no longer shown in the navbar or footer."
        : "Shortcut restored as hidden. Review it, then make it visible and save when ready.");
      clearDirty();
    } catch {
      setArchiveReloadRequired(true);
      setArchiveFeedback({
        error: true,
        message: "The archive outcome could not be confirmed. The server may have applied it. Reload saved links before trying again.",
      });
    } finally {
      archiveInFlight.current = null;
      setArchivePending(false);
    }
  }

  async function loadArchivePage(offset: number) {
    if (!archive.available || editorDisabled || archiveInFlight.current ||
      offset < 0 || offset % ARCHIVE_PAGE_SIZE !== 0) return;
    archiveInFlight.current = "page";
    setArchivePagePending(true);
    setArchiveFeedback(null);
    try {
      const next = await loadNavbarShortcutArchivePage(offset);
      const nextPage = next && parseArchivePage(next.page);
      if (!next?.available || !nextPage || nextPage.offset !== offset) {
        setArchiveFeedback({ error: true, message: next?.message || "Archived shortcuts could not be loaded. Your current page has been kept." });
        return;
      }
      setArchive({ ...next, page: nextPage });
    } catch {
      setArchiveFeedback({ error: true, message: "Archived shortcuts could not be loaded. Your current page has been kept." });
    } finally {
      archiveInFlight.current = null;
      setArchivePagePending(false);
    }
  }

  const statusIsError = !["idle", "saved"].includes(saveState.status);

  return (
    <form
      action={formAction}
      className={`${panelClass} overflow-hidden`}
      data-unsaved-guard-bypass="true"
      noValidate
      onSubmit={(event) => {
        if (!canSave) event.preventDefault();
      }}
    >
      <input
        name="expectedVersions"
        readOnly
        type="hidden"
        value={JSON.stringify(versions)}
      />
      <input name="items" readOnly type="hidden" value={serialized(draft)} />

      <div className="border-b border-white/8 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#ff715b]">
              Platform shortcuts
            </p>
            <h2 className="heading-ui mt-2 text-xl font-semibold text-white">
              Music and social icons
            </h2>
            <p className="mt-2 text-sm leading-6 text-white/44">
              Paste a profile URL and the matching icon is selected
              automatically. Visible links appear in the navbar and shared
              footer.
            </p>
          </div>
          <button
            className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-white/12 bg-white/[0.045] px-4 text-xs font-semibold text-white/72 transition hover:bg-white hover:text-black disabled:cursor-not-allowed disabled:opacity-40"
            disabled={editorDisabled || draft.length >= 16}
            onClick={addItem}
            type="button"
          >
            <FaPlus /> Add shortcut
          </button>
        </div>

        <div className="mt-5 overflow-hidden rounded-[18px] border border-white/9 bg-[#080809] px-4 py-4">
          <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-white/30">
            Navbar icon preview
          </p>
          <div className="mt-3 flex min-h-11 flex-wrap items-center gap-2">
            {visibleLinks.map((item) => (
              <span
                className="grid h-10 w-10 place-items-center rounded-full border border-[#ff3b1f]/45 text-[#ff583f]"
                key={item.id}
                title={item.label}
              >
                <SocialPlatformIcon
                  className="text-base"
                  href={item.href}
                  iconKey={item.iconKey}
                  label={item.label}
                  platform={item.platform}
                />
              </span>
            ))}
            {!visibleLinks.length ? (
              <span className="text-xs text-white/34">
                No icon shortcuts selected yet.
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {(migrationRequired || loadError) && (
        <div
          className="border-b border-amber-300/16 bg-amber-400/[0.055] px-4 py-3 text-xs leading-5 text-amber-50/72 sm:px-5"
          role="alert"
        >
          <span className="inline-flex items-start gap-2">
            <FaExclamationTriangle className="mt-1 shrink-0" />
            <span>
              {migrationRequired
                ? "Apply database migration 0029 to enable one-click shortcut saving."
                : loadError}
            </span>
          </span>
        </div>
      )}

      <fieldset className="grid gap-3 p-3 sm:p-4" disabled={editorDisabled}>
        {draft.map((item, index) => {
          const definition = getSocialPlatformDefinition(item.platform);
          const isNew = !Object.prototype.hasOwnProperty.call(versions, item.id);
          return (
            <section
              className={`rounded-[20px] border p-4 ${
                item.isPublished
                  ? "border-emerald-300/14 bg-emerald-400/[0.028]"
                  : "border-white/8 bg-black/20"
              }`}
              key={item.id}
            >
              <div className="flex items-start gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-[#ff3b1f]/42 text-[#ff583f]">
                  <SocialPlatformIcon
                    className="text-lg"
                    href={item.href}
                    iconKey={item.iconKey}
                    label={item.label}
                    platform={item.platform}
                  />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white/80">
                    {item.label || definition.label}
                  </p>
                  <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-white/34">
                    {definition.label} · icon detected from URL
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    aria-label={`Move ${item.label} up`}
                    className="grid h-10 w-10 place-items-center rounded-xl border border-white/9 text-white/45 transition hover:bg-white hover:text-black disabled:opacity-20"
                    disabled={index === 0}
                    onClick={() => moveItem(index, -1)}
                    type="button"
                  >
                    <FaArrowUp />
                  </button>
                  <button
                    aria-label={`Move ${item.label} down`}
                    className="grid h-10 w-10 place-items-center rounded-xl border border-white/9 text-white/45 transition hover:bg-white hover:text-black disabled:opacity-20"
                    disabled={index === draft.length - 1}
                    onClick={() => moveItem(index, 1)}
                    type="button"
                  >
                    <FaArrowDown />
                  </button>
                </div>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
                <label className="block">
                  <span className={labelClass}>Profile URL</span>
                  <input
                    className={inputClass}
                    inputMode="url"
                    maxLength={2048}
                    onChange={(event) => updateUrl(index, event.target.value)}
                    placeholder={definition.hrefPlaceholder}
                    value={item.href}
                  />
                  {errorAt(errors, index, "href") ? (
                    <span className="mt-2 block text-xs text-red-200" role="alert">
                      {errorAt(errors, index, "href")}
                    </span>
                  ) : null}
                </label>
                <label className="block">
                  <span className={labelClass}>Accessible label</span>
                  <input
                    className={inputClass}
                    maxLength={220}
                    onChange={(event) =>
                      updateItem(index, { label: event.target.value })
                    }
                    value={item.label}
                  />
                  {errorAt(errors, index, "label") ? (
                    <span className="mt-2 block text-xs text-red-200" role="alert">
                      {errorAt(errors, index, "label")}
                    </span>
                  ) : null}
                </label>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/7 pt-4">
                <label className="inline-flex min-h-11 cursor-pointer items-center gap-3 rounded-2xl border border-white/9 bg-black/22 px-3.5 py-2.5">
                  <input
                    checked={item.isPublished}
                    className="h-4 w-4 accent-[#ff3b1f]"
                    onChange={(event) =>
                      updateItem(index, { isPublished: event.target.checked })
                    }
                    type="checkbox"
                  />
                  <span className="inline-flex items-center gap-2 text-xs font-semibold text-white/68">
                    {item.isPublished ? <FaEye /> : <FaEyeSlash />}
                    {item.isPublished ? "Visible" : "Hidden"}
                  </span>
                </label>
                {isNew ? (
                  <button
                    className="inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-xs font-semibold text-red-100/58 transition hover:bg-red-400/10 hover:text-red-100"
                    onClick={() => removeUnsavedItem(index)}
                    type="button"
                  >
                    <FaTrash /> Remove unsaved link
                  </button>
                ) : (
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="max-w-60 text-[10px] leading-4 text-white/30">
                      Hide to keep it here. Archive to free a shortcut slot.
                    </span>
                    <button
                      aria-label={`Archive ${item.label}`}
                      className={archiveButtonClass}
                      disabled={!canArchive}
                      onClick={() => {
                        if (canArchive) setConfirmArchiveId(item.id);
                      }}
                      type="button"
                    >
                      <FaArchive aria-hidden /> Archive
                    </button>
                  </div>
                )}
              </div>
              {!isNew && confirmArchiveId === item.id ? (
                <div
                  className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-300/[0.045] p-4"
                  aria-label={`Confirm archiving ${item.label}`}
                  role="group"
                >
                  <p className="text-sm font-semibold text-amber-100/85">Archive {item.label}?</p>
                  <p className="mt-2 text-xs leading-5 text-white/55">
                    This immediately removes the shortcut from the navbar and shared footer.
                    You can restore it later as hidden. No Media files are deleted.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      className={`${archiveButtonClass} border-amber-300/30 text-amber-100`}
                      disabled={!canArchive}
                      onClick={() => mutateArchive("archive", item.id)}
                      type="button"
                    >
                      {archivePending ? <FaSpinner aria-hidden className="animate-spin" /> : <FaArchive aria-hidden />}
                      Confirm archive
                    </button>
                    <button
                      className={archiveButtonClass}
                      disabled={archivePending}
                      onClick={() => setConfirmArchiveId(null)}
                      type="button"
                    >Cancel archive</button>
                  </div>
                </div>
              ) : null}
            </section>
          );
        })}

        {!draft.length ? (
          <button
            className="min-h-28 rounded-[20px] border border-dashed border-white/12 text-sm text-white/42 transition hover:border-white/25 hover:text-white"
            onClick={addItem}
            type="button"
          >
            <FaPlus className="mx-auto mb-2" /> Add the first platform shortcut
          </button>
        ) : null}
      </fieldset>

      <section id="shortcut-archive" aria-labelledby="shortcut-archive-heading" className="scroll-mt-24 border-t border-white/8 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 id="shortcut-archive-heading" className="inline-flex items-center gap-2 text-sm font-semibold text-white/75">
              <FaArchive aria-hidden className="text-white/40" /> Archived shortcuts
            </h3>
            <p className="mt-2 max-w-2xl text-xs leading-5 text-white/42">
              A recoverable content archive, separate from Media Trash. Archived shortcuts do not
              use the 16 active slots. Restoring brings back a hidden shortcut; it does not publish it.
            </p>
          </div>
          <span className="rounded-full border border-white/10 px-3 py-1.5 text-[10px] text-white/45">
            {draft.length}/16 active slots{archive.available ? ` · ${archive.page.total} archived` : ""}
          </span>
        </div>

        {!archive.available ? (
          <p className="mt-3 rounded-xl border border-amber-300/12 bg-amber-300/[0.035] px-3 py-2 text-xs leading-5 text-amber-100/65">
            {archive.message || "Shortcut archive is unavailable. Regular shortcut editing still works."}
          </p>
        ) : (
          <>
            {isDirty ? (
              <p className="mt-3 text-xs leading-5 text-amber-100/70">Save or discard shortcut changes before archiving or restoring.</p>
            ) : draft.length >= 16 ? (
              <p className="mt-3 text-xs leading-5 text-amber-100/70">All 16 active slots are used. Archive a saved shortcut before restoring another.</p>
            ) : null}
            {archive.page.items.length ? (
              <ul className="mt-4 grid gap-2">
                {archive.page.items.map(item => (
                  <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/8 bg-black/20 p-3">
                    <div className="min-w-0 flex-1 basis-40">
                      <p className="break-words text-sm font-semibold text-white/70">{item.label}</p>
                      <p className="mt-1 text-[10px] leading-4 text-white/35">
                        {getSocialPlatformDefinition(detectSocialPlatform("", item.platform)).label} · archived {item.archivedAt.slice(0, 10)}
                      </p>
                    </div>
                    <button
                      aria-label={`Restore ${item.label} as hidden`}
                      className={archiveButtonClass}
                      disabled={!canArchive || draft.length >= 16}
                      onClick={() => mutateArchive("restore", item.id)}
                      type="button"
                    >
                      <FaEyeSlash aria-hidden /> Restore as hidden
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 rounded-2xl border border-dashed border-white/10 p-4 text-xs text-white/38">
                {archive.page.total ? "No shortcuts on this archive page. Go back to see earlier entries." : "No archived shortcuts yet. Hidden links remain in the editor above until you archive them."}
              </p>
            )}
            {archive.page.total > ARCHIVE_PAGE_SIZE || archive.page.offset > 0 ? (
              <div className="mt-3 flex flex-wrap items-center gap-2" aria-label="Archived shortcuts pagination">
                <button className={archiveButtonClass} disabled={editorDisabled || archivePagePending || archive.page.offset === 0}
                  onClick={() => loadArchivePage(Math.max(0, archive.page.offset - ARCHIVE_PAGE_SIZE))} type="button">Previous archived shortcuts</button>
                <span aria-live="polite" className="text-[10px] text-white/38">
                  {archivePagePending ? "Loading archive…" : `Page ${Math.floor(archive.page.offset / ARCHIVE_PAGE_SIZE) + 1}`}
                </span>
                <button className={archiveButtonClass} disabled={editorDisabled || archivePagePending || archive.page.offset + ARCHIVE_PAGE_SIZE >= archive.page.total}
                  onClick={() => loadArchivePage(archive.page.offset + ARCHIVE_PAGE_SIZE)} type="button">Next archived shortcuts</button>
              </div>
            ) : null}
          </>
        )}
        {archiveFeedback ? (
          <div className={`mt-3 rounded-xl border px-3 py-2 text-xs leading-5 ${archiveFeedback.error ? "border-amber-300/16 bg-amber-300/[0.04] text-amber-100/80" : "border-emerald-300/16 bg-emerald-300/[0.04] text-emerald-100/80"}`}
            role={archiveFeedback.error ? "alert" : "status"}>
            {archiveFeedback.message}
            {archiveReloadRequired ? (
              <button className="ml-3 underline underline-offset-4" onClick={reloadSaved} type="button">Reload saved links</button>
            ) : null}
          </div>
        ) : null}
      </section>

      {saveState.status !== "idle" ? (
        <div
          className={`border-t px-4 py-3 text-xs leading-5 sm:px-5 ${
            statusIsError
              ? "border-red-300/12 bg-red-400/[0.045] text-red-50/72"
              : "border-emerald-300/12 bg-emerald-400/[0.045] text-emerald-50/72"
          }`}
          role={statusIsError ? "alert" : "status"}
        >
          {saveState.message}
          {needsEditorReload(saveState) ? (
            <button
              className="ml-3 underline underline-offset-4"
              onClick={reloadSaved}
              type="button"
            >
              Reload saved links
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/8 bg-[#101012]/92 p-3 sm:p-4">
        <div>
          <p className="text-xs font-semibold text-white/62">
            {archivePending
              ? "Updating shortcut archive…"
              : pending
              ? "Saving shortcuts…"
              : isDirty
                ? "Shortcut changes are not saved yet"
                : "Shortcuts match the last save"}
          </p>
          <p aria-live="polite" className="mt-1 text-[10px] text-white/32">
            {announcement || `${visibleLinks.length} visible icon links`}
          </p>
        </div>
        <button
          className="min-h-11 rounded-xl border border-white/15 px-4 text-xs text-white/70 disabled:opacity-35"
          disabled={pending || archivePending || archiveReloadRequired || !isDirty}
          type="button"
          onClick={() => {
            setDraft(baseline);
            setAnnouncement("Platform shortcuts restored to the last save.");
          }}
        >
          Discard shortcut changes
        </button>
        <button
          aria-busy={pending}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white px-5 text-sm font-semibold text-black transition hover:bg-[#ff3b1f] hover:text-white disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto sm:min-w-[190px]"
          disabled={!canSave}
          type="submit"
        >
          {pending ? <FaSpinner className="animate-spin" /> : <FaCheck />}
          {pending ? "Saving…" : "Save shortcuts"}
        </button>
      </div>
    </form>
  );
}
