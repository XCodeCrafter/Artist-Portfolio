"use client";

import {
  useActionState,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  FaArrowDown,
  FaArrowUp,
  FaCheck,
  FaExclamationTriangle,
  FaEye,
  FaEyeSlash,
  FaPlus,
  FaSpinner,
  FaTrash,
} from "react-icons/fa";
import { saveNavbarSocialLinksV2 } from "@/app/admin/v2/navigation/social-actions";
import SocialPlatformIcon from "@/components/SocialPlatformIcon";
import { useNavbarUnsavedChanges } from "@/components/admin/v2/NavbarUnsavedChangesProvider";
import {
  INITIAL_NAVBAR_SOCIAL_LINKS_SAVE_STATE,
  createEmptyNavbarSocialLink,
  moveNavbarSocialLink,
  parseNavbarSocialLinksDraft,
  serializeNavbarSocialLinks,
  updateNavbarSocialLinkUrl,
  type NavbarSocialLinkItem,
  type NavbarSocialLinksSnapshot,
} from "@/lib/admin/navbar-social-links-editor";
import { getSocialPlatformDefinition } from "@/lib/content/social-platforms";

type Props = {
  snapshot: NavbarSocialLinksSnapshot;
  disabled: boolean;
  migrationRequired: boolean;
  loadError?: string;
};

const panelClass =
  "rounded-[24px] border border-white/9 bg-[#0f0f11]/92 shadow-[0_20px_70px_rgba(0,0,0,0.26)]";
const inputClass =
  "mt-2 min-h-11 w-full rounded-2xl border border-white/10 bg-black/28 px-3.5 py-2.5 text-sm text-white outline-none transition placeholder:text-white/24 focus:border-white/34 focus:bg-black/38 disabled:cursor-not-allowed disabled:opacity-45";
const labelClass =
  "text-[10px] font-semibold uppercase tracking-[0.17em] text-white/42";

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
}: Props) {
  const [baseline, setBaseline] = useState(snapshot.items);
  const [draft, setDraft] = useState(snapshot.items);
  const [versions, setVersions] = useState(snapshot.expectedVersions);
  const [announcement, setAnnouncement] = useState("");
  const { clearDirty, confirmDiscard, markDirty } =
    useNavbarUnsavedChanges("shortcuts");
  const clientAction = useCallback(
    async (previousState: typeof INITIAL_NAVBAR_SOCIAL_LINKS_SAVE_STATE, formData: FormData) => {
      const result = await saveNavbarSocialLinksV2(previousState, formData);
      if (
        result.status === "saved" &&
        result.items &&
        result.expectedVersions
      ) {
        setDraft(result.items);
        setBaseline(result.items);
        setVersions(result.expectedVersions);
        setAnnouncement("Platform shortcuts saved and published.");
        clearDirty();
      }
      return result;
    },
    [clearDirty]
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
    disabled || pending || migrationRequired || Boolean(loadError);
  const canSave = isDirty && validation.success && !editorDisabled;
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
    if (!confirmDiscard()) return;
    window.location.reload();
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
                  <span className="text-[10px] leading-4 text-white/30">
                    Hide to remove it from the public site without deleting it.
                  </span>
                )}
              </div>
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
          {saveState.status === "conflict" ? (
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
            {pending
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
