"use client";

import Link from "next/link";
import {
  useActionState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  FaCheck,
  FaChevronLeft,
  FaDesktop,
  FaEnvelope,
  FaExclamationTriangle,
  FaExternalLinkAlt,
  FaInbox,
  FaMobileAlt,
  FaShieldAlt,
  FaSlidersH,
  FaSpinner,
  FaTimes,
} from "react-icons/fa";
import { saveContactSectionV2 } from "@/app/admin/v2/pages/contact/actions";
import MediaAssetPicker from "@/components/admin/MediaAssetPicker";
import useUnsavedChangesGuard from "@/components/admin/useUnsavedChangesGuard";
import ContactPreviewFrame, {
  type ContactPreviewDevice,
} from "@/components/admin/v2/ContactPreviewFrame";
import {
  CONTACT_EDITOR_SECTIONS,
  INITIAL_CONTACT_SAVE_STATE,
  getContactSectionPayload,
  getContactSectionVersions,
  getDirtyContactSections,
  isContactSectionDirty,
  parseContactDetailsDraft,
  parseContactHeroDraft,
  parseContactSectionSubmission,
  type ContactDetailsDraft,
  type ContactEditorDraft,
  type ContactEditorSection,
  type ContactEditorSnapshot,
  type ContactEditorVersions,
  type ContactHeroDraft,
  type ContactSaveState,
} from "@/lib/admin/contact-editor";
import type { MediaAsset } from "@/lib/admin/media";

type FieldErrors = Record<string, string[]>;

type ContactEditorProps = {
  assets: MediaAsset[];
  delivery: {
    emailConfigured: boolean;
    inboxConfigured: boolean;
    webhookConfigured: boolean;
  };
  disabled: boolean;
  loadError?: string;
  mediaLoadError?: string;
  migrationRequired: boolean;
  snapshot: ContactEditorSnapshot;
};

const panelClass =
  "rounded-[24px] border border-white/9 bg-[#0f0f11]/94 shadow-[0_22px_80px_rgba(0,0,0,0.3)]";
const inputClass =
  "mt-2 min-h-11 w-full rounded-2xl border border-white/10 bg-black/28 px-3.5 py-2.5 text-sm text-white outline-none transition placeholder:text-white/24 focus:border-white/34 focus:bg-black/38 disabled:cursor-not-allowed disabled:opacity-45";
const labelClass =
  "text-[10px] font-semibold uppercase tracking-[0.17em] text-white/58";

const SECTION_META: Record<
  ContactEditorSection,
  { label: string; description: string }
> = {
  hero: {
    label: "Hero",
    description: "Opening title, button, and background media",
  },
  details: {
    label: "Contact & form",
    description: "The introduction and location beside the inquiry form",
  },
};

function issueMap(error: {
  issues: Array<{ path: PropertyKey[]; message: string }>;
}) {
  const errors: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".") || "form";
    errors[key] = [...(errors[key] || []), issue.message];
  }
  return errors;
}

function validateSection(draft: ContactEditorDraft, section: ContactEditorSection) {
  const parsed =
    section === "hero"
      ? parseContactHeroDraft(draft.hero)
      : parseContactDetailsDraft(draft.details);
  return parsed.success
    ? { ok: true, errors: {} as FieldErrors }
    : { ok: false, errors: issueMap(parsed.error) };
}

function fieldMessage(errors: FieldErrors, path: string) {
  return errors[path]?.join(" ") || "";
}

function mergeErrors(...sources: FieldErrors[]) {
  const merged: FieldErrors = {};
  for (const source of sources) {
    for (const [key, messages] of Object.entries(source)) {
      merged[key] = [...(merged[key] || []), ...messages];
    }
  }
  return merged;
}

function applyCanonicalSection(
  draft: ContactEditorDraft,
  section: ContactEditorSection,
  value: unknown
): ContactEditorDraft | null {
  const parsed =
    section === "hero"
      ? parseContactHeroDraft(value)
      : parseContactDetailsDraft(value);
  if (!parsed.success) return null;
  return { ...draft, [section]: parsed.data } as ContactEditorDraft;
}

function Field({
  children,
  controlId,
  error,
  label,
  required = false,
}: {
  children: ReactNode;
  controlId: string;
  error?: string;
  label: string;
  required?: boolean;
}) {
  return (
    <label className="block" htmlFor={controlId}>
      <span className={labelClass}>
        {label}
        {required ? <span className="ml-1 text-[#ff715b]">*</span> : null}
      </span>
      {children}
      {error ? (
        <span
          className="mt-2 block text-xs leading-5 text-red-200"
          id={`${controlId}-error`}
          role="alert"
        >
          {error}
        </span>
      ) : null}
    </label>
  );
}

function HeroInspector({
  assets,
  draft,
  errors,
  instance,
  mediaRevision,
  onChange,
}: {
  assets: MediaAsset[];
  draft: ContactHeroDraft;
  errors: FieldErrors;
  instance: "desktop" | "mobile";
  mediaRevision: number;
  onChange: (patch: Partial<ContactHeroDraft>) => void;
}) {
  const titleId = `${instance}-contact-hero-title`;
  const subtitleId = `${instance}-contact-hero-subtitle`;
  const ctaLabelId = `${instance}-contact-hero-cta-label`;
  const ctaHrefId = `${instance}-contact-hero-cta-href`;
  const titleError = fieldMessage(errors, "title");
  const subtitleError = fieldMessage(errors, "subtitle");
  const ctaLabelError = fieldMessage(errors, "ctaLabel");
  const ctaHrefError = fieldMessage(errors, "ctaHref");
  return (
    <div className="grid gap-5">
      <Field controlId={titleId} error={titleError} label="Main title" required>
        <input
          aria-describedby={titleError ? `${titleId}-error` : undefined}
          aria-invalid={titleError ? true : undefined}
          className={inputClass}
          id={titleId}
          maxLength={220}
          onChange={(event) => onChange({ title: event.target.value })}
          required
          value={draft.title}
        />
      </Field>
      <Field controlId={subtitleId} error={subtitleError} label="Subtitle">
        <textarea
          aria-describedby={subtitleError ? `${subtitleId}-error` : undefined}
          aria-invalid={subtitleError ? true : undefined}
          className={`${inputClass} min-h-24 resize-y`}
          id={subtitleId}
          maxLength={220}
          onChange={(event) => onChange({ subtitle: event.target.value })}
          value={draft.subtitle}
        />
      </Field>
      <MediaAssetPicker
        assets={assets}
        defaultMediaType={draft.mediaType}
        error={fieldMessage(errors, "backgroundSrc")}
        key={`${instance}-contact-hero-${mediaRevision}`}
        kind="media"
        label="Hero background"
        mediaType={draft.mediaType}
        name={`${instance}-contact-hero-background`}
        onMediaTypeChange={(mediaType) => onChange({ mediaType })}
        onValueChange={(backgroundSrc, asset) =>
          onChange({
            backgroundSrc,
            ...(asset?.mediaType === "image" || asset?.mediaType === "video"
              ? { mediaType: asset.mediaType }
              : {}),
          })
        }
        required
        value={draft.backgroundSrc}
      />
      <section className="grid gap-4 rounded-[20px] border border-white/9 bg-black/22 p-4">
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-white/34">
            Hero button
          </p>
          <p className="mt-2 text-xs leading-5 text-white/52">
            Fill both fields to show the button, or leave both empty. Use
            <span className="text-white/62"> #form</span> to jump to the contact area.
          </p>
        </div>
        <Field controlId={ctaLabelId} error={ctaLabelError} label="Button label">
          <input
            aria-describedby={ctaLabelError ? `${ctaLabelId}-error` : undefined}
            aria-invalid={ctaLabelError ? true : undefined}
            className={inputClass}
            id={ctaLabelId}
            maxLength={220}
            onChange={(event) => onChange({ ctaLabel: event.target.value })}
            value={draft.ctaLabel}
          />
        </Field>
        <Field
          controlId={ctaHrefId}
          error={ctaHrefError}
          label="Button destination"
        >
          <input
            aria-describedby={ctaHrefError ? `${ctaHrefId}-error` : undefined}
            aria-invalid={ctaHrefError ? true : undefined}
            className={inputClass}
            id={ctaHrefId}
            maxLength={2048}
            onChange={(event) => onChange({ ctaHref: event.target.value })}
            placeholder="#form"
            value={draft.ctaHref}
          />
        </Field>
      </section>
      {draft.mediaType === "video" ? (
        <MediaAssetPicker
          assets={assets}
          error={fieldMessage(errors, "posterSrc")}
          key={`${instance}-contact-poster-${mediaRevision}`}
          kind="image"
          label="Video poster (optional)"
          name={`${instance}-contact-hero-poster`}
          onValueChange={(posterSrc) => onChange({ posterSrc })}
          showPreview={Boolean(draft.posterSrc)}
          value={draft.posterSrc}
        />
      ) : null}
    </div>
  );
}

function DetailsInspector({
  draft,
  errors,
  instance,
  onChange,
}: {
  draft: ContactDetailsDraft;
  errors: FieldErrors;
  instance: "desktop" | "mobile";
  onChange: (patch: Partial<ContactDetailsDraft>) => void;
}) {
  const blurbId = `${instance}-contact-details-blurb`;
  const locationId = `${instance}-contact-details-location`;
  const blurbError = fieldMessage(errors, "contactBlurb");
  const locationError = fieldMessage(errors, "location");
  return (
    <div className="grid gap-5">
      <p className="rounded-2xl border border-white/8 bg-white/[0.025] px-4 py-3 text-xs leading-5 text-white/52">
        These details appear beside the real inquiry form and are also reused
        in portfolio footers. Form security and delivery messages remain
        system-owned so an innocent copy edit cannot accidentally lie about
        where a message went.
      </p>
      <Field
        controlId={blurbId}
        error={blurbError}
        label="Collaboration introduction"
        required
      >
        <textarea
          aria-describedby={blurbError ? `${blurbId}-error` : undefined}
          aria-invalid={blurbError ? true : undefined}
          className={`${inputClass} min-h-36 resize-y`}
          id={blurbId}
          maxLength={1000}
          onChange={(event) => onChange({ contactBlurb: event.target.value })}
          placeholder="For acting, music, productions, bookings, and creative collaborations."
          required
          value={draft.contactBlurb}
        />
      </Field>
      <Field
        controlId={locationId}
        error={locationError}
        label="Based in"
        required
      >
        <input
          aria-describedby={locationError ? `${locationId}-error` : undefined}
          aria-invalid={locationError ? true : undefined}
          className={inputClass}
          id={locationId}
          maxLength={220}
          onChange={(event) => onChange({ location: event.target.value })}
          placeholder="Amsterdam, The Netherlands"
          required
          value={draft.location}
        />
      </Field>
    </div>
  );
}

function DeliveryItem({
  configured,
  icon,
  label,
  missing,
  ready,
}: {
  configured: boolean;
  icon: ReactNode;
  label: string;
  missing: string;
  ready: string;
}) {
  return (
    <div className="rounded-2xl border border-white/8 bg-black/22 p-4">
      <div className="flex items-start gap-3">
        <span
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl border ${configured ? "border-emerald-300/16 bg-emerald-400/[0.07] text-emerald-200" : "border-amber-300/16 bg-amber-400/[0.07] text-amber-200"}`}
        >
          {icon}
        </span>
        <div>
          <p className="text-xs font-semibold text-white/74">{label}</p>
          <p className="mt-1 text-[11px] leading-5 text-white/52">
            {configured ? ready : missing}
          </p>
        </div>
      </div>
    </div>
  );
}

function InspectorHeader({
  activeSection,
  onClose,
}: {
  activeSection: ContactEditorSection;
  onClose: () => void;
}) {
  const meta = SECTION_META[activeSection];
  return (
    <header className="flex items-start justify-between gap-4 border-b border-white/9 p-4 sm:p-5">
      <div>
        <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-[#ff715b]">
          Page section
        </p>
        <h2 className="heading-ui mt-2 text-xl font-semibold text-white">
          {meta.label}
        </h2>
        <p className="mt-1 text-xs leading-5 text-white/48">{meta.description}</p>
      </div>
      <button
        aria-label="Close inspector"
        className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/9 text-white/48 transition hover:bg-white hover:text-black"
        onClick={onClose}
        type="button"
      >
        <FaTimes />
      </button>
    </header>
  );
}

function formatSavedAt(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "just now";
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

export default function ContactEditor({
  assets,
  delivery,
  disabled,
  loadError,
  mediaLoadError,
  migrationRequired,
  snapshot,
}: ContactEditorProps) {
  const [baseline, setBaseline] = useState(snapshot.draft);
  const [draft, setDraft] = useState(snapshot.draft);
  const [versions, setVersions] = useState(snapshot.versions);
  const baselineRef = useRef(baseline);
  const draftRef = useRef(draft);
  const versionsRef = useRef(versions);
  const [activeSection, setActiveSection] = useState<ContactEditorSection>("hero");
  const [device, setDevice] = useState<ContactPreviewDevice>("desktop");
  const [focusRequestId, setFocusRequestId] = useState(0);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState(false);
  const [dismissedEventId, setDismissedEventId] = useState("");
  const [mediaRevision, setMediaRevision] = useState(0);
  const [savingSection, setSavingSection] = useState<ContactEditorSection | null>(null);
  const [lastSaved, setLastSaved] = useState<{
    section: ContactEditorSection;
    savedAt: string;
  } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const mobileDialogRef = useRef<HTMLDialogElement | null>(null);
  const mobileInspectorTriggerRef = useRef<HTMLButtonElement | null>(null);
  const desktopInspectorOpenRef = useRef<HTMLButtonElement | null>(null);
  const handledEventIdsRef = useRef(new Set<string>());
  const latestSaveEventIdRef = useRef("");
  const { clearDirty, confirmDiscard, hasUnsavedChanges, markDirty } =
    useUnsavedChangesGuard(
      "You have unsaved Contact page changes. Leave and discard them?",
      true
    );

  const applySaveResult = useCallback(
    (result: ContactSaveState) => {
      if (!result.eventId || handledEventIdsRef.current.has(result.eventId)) return;
      handledEventIdsRef.current.add(result.eventId);
      if (
        result.status !== "saved" ||
        !result.section ||
        !result.canonicalSection ||
        !result.versions
      ) {
        return;
      }
      const confirmed = parseContactSectionSubmission(
        result.section,
        result.canonicalSection,
        result.versions
      );
      if (!confirmed.success) return;
      const nextDraft = applyCanonicalSection(
        draftRef.current,
        result.section,
        confirmed.data.payload
      );
      if (!nextDraft) return;
      const nextBaseline = {
        ...baselineRef.current,
        [result.section]: nextDraft[result.section],
      } as ContactEditorDraft;
      const nextVersions = {
        ...versionsRef.current,
        [result.section]: confirmed.data.versions,
      } as ContactEditorVersions;
      draftRef.current = nextDraft;
      baselineRef.current = nextBaseline;
      versionsRef.current = nextVersions;
      setDraft(nextDraft);
      setBaseline(nextBaseline);
      setVersions(nextVersions);
      setMediaRevision((value) => value + 1);
      setLastSaved({
        section: result.section,
        savedAt: result.savedAt || new Date().toISOString(),
      });
      setAnnouncement(`${SECTION_META[result.section].label} saved.`);
      if (!getDirtyContactSections(nextBaseline, nextDraft).length) clearDirty();
    },
    [clearDirty]
  );

  const clientAction = useCallback(
    async (previousState: ContactSaveState, formData: FormData) => {
      const section = CONTACT_EDITOR_SECTIONS.find(
        (candidate) => candidate === formData.get("section")
      );
      setSavingSection(section || null);
      try {
        const result = await saveContactSectionV2(previousState, formData);
        latestSaveEventIdRef.current = result.eventId;
        applySaveResult(result);
        return result;
      } finally {
        setSavingSection(null);
      }
    },
    [applySaveResult]
  );
  const [saveState, formAction, pending] = useActionState(
    clientAction,
    INITIAL_CONTACT_SAVE_STATE
  );

  useEffect(() => {
    if (window.matchMedia("(min-width: 1280px)").matches) return;
    const frame = window.requestAnimationFrame(() => setDevice("mobile"));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const dialog = mobileDialogRef.current;
    if (!dialog) return;
    if (mobileInspectorOpen && !dialog.open) dialog.showModal();
    else if (!mobileInspectorOpen && dialog.open) dialog.close();
  }, [mobileInspectorOpen]);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1280px)");
    const closeAtDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) setMobileInspectorOpen(false);
    };
    desktop.addEventListener("change", closeAtDesktop);
    return () => desktop.removeEventListener("change", closeAtDesktop);
  }, []);

  useEffect(() => {
    if (!mobileInspectorOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileInspectorOpen]);

  const dirtySections = useMemo(
    () => getDirtyContactSections(baseline, draft),
    [baseline, draft]
  );
  const activeDirty = isContactSectionDirty(baseline, draft, activeSection);
  const validation = useMemo(
    () => validateSection(draft, activeSection),
    [activeSection, draft]
  );
  const responseVisible =
    Boolean(saveState.eventId) && saveState.eventId !== dismissedEventId;
  const responseErrors =
    responseVisible && saveState.section === activeSection
      ? saveState.fieldErrors || {}
      : {};
  const errors = mergeErrors(validation.errors, responseErrors);
  const editorDisabled = disabled || pending;
  const canSave = !editorDisabled && activeDirty && validation.ok;
  const statusIsError =
    responseVisible && !["idle", "saved"].includes(saveState.status);

  function commitDraft(next: ContactEditorDraft) {
    if (next === draftRef.current) return;
    draftRef.current = next;
    setDraft(next);
    if (latestSaveEventIdRef.current) {
      setDismissedEventId(latestSaveEventIdRef.current);
    }
    if (getDirtyContactSections(baselineRef.current, next).length) markDirty();
    else clearDirty();
  }

  function updateHero(patch: Partial<ContactHeroDraft>) {
    commitDraft({
      ...draftRef.current,
      hero: { ...draftRef.current.hero, ...patch },
    });
  }

  function updateDetails(patch: Partial<ContactDetailsDraft>) {
    commitDraft({
      ...draftRef.current,
      details: { ...draftRef.current.details, ...patch },
    });
  }

  const selectSection = useCallback(
    (section: ContactEditorSection) => {
      if (pending || savingSection) return;
      setActiveSection(section);
      setFocusRequestId((value) => value + 1);
      if (window.matchMedia("(min-width: 1280px)").matches) {
        setInspectorOpen(true);
      } else {
        setMobileInspectorOpen(true);
      }
    },
    [pending, savingSection]
  );

  function discardActiveSection() {
    const discardedSection = activeSection;
    commitDraft({
      ...draftRef.current,
      [activeSection]: baselineRef.current[activeSection],
    } as ContactEditorDraft);
    setMediaRevision((value) => value + 1);
    setAnnouncement(
      `${SECTION_META[activeSection].label} restored to its last saved version.`
    );
    window.requestAnimationFrame(() => {
      const instance = mobileDialogRef.current?.open ? "mobile" : "desktop";
      const fieldId =
        discardedSection === "hero"
          ? `${instance}-contact-hero-title`
          : `${instance}-contact-details-blurb`;
      document.getElementById(fieldId)?.focus();
    });
  }

  function reloadAfterConflict() {
    if (hasUnsavedChanges && !confirmDiscard()) return;
    window.location.reload();
  }

  function closeMobileInspector() {
    setMobileInspectorOpen(false);
    if (!window.matchMedia("(min-width: 1280px)").matches) {
      window.requestAnimationFrame(() => mobileInspectorTriggerRef.current?.focus());
    }
  }

  function closeDesktopInspector() {
    setInspectorOpen(false);
    window.requestAnimationFrame(() => desktopInspectorOpenRef.current?.focus());
  }

  const inspector = (instance: "desktop" | "mobile") =>
    activeSection === "hero" ? (
      <HeroInspector
        assets={assets}
        draft={draft.hero}
        errors={errors}
        instance={instance}
        mediaRevision={mediaRevision}
        onChange={updateHero}
      />
    ) : (
      <DetailsInspector
        draft={draft.details}
        errors={errors}
        instance={instance}
        onChange={updateDetails}
      />
    );

  const statusLabel = pending
    ? `Saving ${SECTION_META[savingSection || activeSection].label}...`
    : disabled
      ? "Editor is read-only"
      : !validation.ok
        ? `${SECTION_META[activeSection].label} needs attention`
        : activeDirty
          ? `${SECTION_META[activeSection].label} has unsaved changes`
          : dirtySections.length
            ? `${dirtySections.length} other ${dirtySections.length === 1 ? "section has" : "sections have"} unsaved changes`
            : "All Contact changes are saved";
  const statusDetail = migrationRequired
    ? "Database migration 0033 is required before this editor can publish."
    : loadError
      ? loadError
      : mediaLoadError
        ? mediaLoadError
        : !validation.ok
          ? `${Object.values(validation.errors).flat().length} highlighted ${Object.values(validation.errors).flat().length === 1 ? "field needs" : "fields need"} attention before saving.`
          : activeDirty
            ? "Only the active section will be published."
            : dirtySections.length
              ? `Return to ${dirtySections.map((section) => SECTION_META[section].label).join(", ")} to review and save ${dirtySections.length === 1 ? "it" : "them"}.`
              : lastSaved
                ? `${SECTION_META[lastSaved.section].label} last saved at ${formatSavedAt(lastSaved.savedAt)}.`
                : "Select a section in the preview or use the tabs above.";

  return (
    <form action={formAction} data-unsaved-guard-bypass="true">
      <input name="section" readOnly type="hidden" value={activeSection} />
      <input
        name="payload"
        readOnly
        type="hidden"
        value={JSON.stringify(getContactSectionPayload(draft, activeSection))}
      />
      <input
        name="versions"
        readOnly
        type="hidden"
        value={JSON.stringify(getContactSectionVersions(versions, activeSection))}
      />

      {migrationRequired || loadError || mediaLoadError ? (
        <section aria-label="Contact editor notices" className="mb-4 grid gap-2">
          {migrationRequired ? (
            <p className="rounded-[18px] border border-amber-300/16 bg-amber-400/[0.055] px-4 py-3 text-sm leading-6 text-amber-100/72">
              The Contact layout is ready for review, but migration 0033 must be
              applied before saving.
            </p>
          ) : null}
          {loadError ? (
            <p className="rounded-[18px] border border-red-300/16 bg-red-400/[0.055] px-4 py-3 text-sm leading-6 text-red-100/72">
              {loadError}
            </p>
          ) : null}
          {mediaLoadError ? (
            <p className="rounded-[18px] border border-amber-300/16 bg-amber-400/[0.055] px-4 py-3 text-sm leading-6 text-amber-100/72">
              {mediaLoadError}
            </p>
          ) : null}
        </section>
      ) : null}

      <section className={`${panelClass} mb-4 p-4 sm:p-5`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-white/30">
              Message delivery
            </p>
            <h2 className="heading-ui mt-2 text-lg font-semibold text-white">
              Know where an inquiry goes
            </h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-white/52">
              These checks confirm configuration, not a real delivered email.
              A controlled end-to-end test comes after rollout.
            </p>
          </div>
          <Link
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/10 px-3 text-xs font-semibold text-white/58 transition hover:bg-white hover:text-black"
            href="/admin/analytics#inquiries"
          >
            Open current Inbox <FaExternalLinkAlt />
          </Link>
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-3">
          <DeliveryItem
            configured={delivery.inboxConfigured}
            icon={<FaInbox />}
            label="Inbox storage"
            missing="Server-side database access is unavailable."
            ready="Server-side database access is configured."
          />
          <DeliveryItem
            configured={delivery.emailConfigured}
            icon={<FaEnvelope />}
            label="Email notifications"
            missing="One or more Resend email settings are missing."
            ready="Required email settings are present."
          />
          <DeliveryItem
            configured={delivery.webhookConfigured}
            icon={<FaShieldAlt />}
            label="Delivery monitoring"
            missing="No delivery webhook secret is configured."
            ready="Delivery webhook configuration is present."
          />
        </div>
      </section>

      <section className={`${panelClass} mb-4 overflow-hidden`}>
        <div className="flex flex-col gap-3 border-b border-white/8 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-white/30">
              Page preview
            </p>
            <p className="mt-1 text-xs text-white/46">
              Click Hero or Contact & form. The preview form cannot submit.
            </p>
          </div>
          <div className="flex items-center justify-between gap-2">
            <div className="flex rounded-xl border border-white/9 bg-black/28 p-1">
              <button
                aria-label="Desktop preview"
                aria-pressed={device === "desktop"}
                className={`grid h-10 w-10 place-items-center rounded-lg text-xs transition ${device === "desktop" ? "bg-white text-black" : "text-white/42 hover:text-white"}`}
                onClick={() => setDevice("desktop")}
                title="Desktop preview"
                type="button"
              >
                <FaDesktop />
              </button>
              <button
                aria-label="Mobile preview"
                aria-pressed={device === "mobile"}
                className={`grid h-10 w-10 place-items-center rounded-lg text-xs transition ${device === "mobile" ? "bg-white text-black" : "text-white/42 hover:text-white"}`}
                onClick={() => setDevice("mobile")}
                title="Mobile preview"
                type="button"
              >
                <FaMobileAlt />
              </button>
            </div>
            <button
              className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-white/10 px-3.5 text-xs font-semibold text-white/64 transition hover:bg-white hover:text-black xl:hidden"
              onClick={() => setMobileInspectorOpen(true)}
              ref={mobileInspectorTriggerRef}
              type="button"
            >
              <FaSlidersH /> Inspector
            </button>
          </div>
        </div>
        <div
          aria-label="Contact editor sections"
          className="flex gap-2 overflow-x-auto p-3 sm:p-4"
          role="group"
        >
          {CONTACT_EDITOR_SECTIONS.map((section) => {
            const active = section === activeSection;
            const dirty = dirtySections.includes(section);
            return (
              <button
                aria-pressed={active}
                className={`relative min-h-10 shrink-0 rounded-xl border px-3 text-xs font-semibold transition ${active ? "border-[#ff583f]/32 bg-[#ff3b1f] text-white" : "border-white/9 bg-white/[0.035] text-white/48 hover:border-white/20 hover:text-white"}`}
                disabled={pending}
                key={section}
                onClick={() => selectSection(section)}
                type="button"
              >
                {SECTION_META[section].label}
                {dirty ? (
                  <span
                    aria-label="Unsaved changes"
                    className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-[#0f0f11] bg-amber-300"
                  />
                ) : null}
              </button>
            );
          })}
        </div>
      </section>

      <div
        className={`grid gap-4 xl:items-start ${inspectorOpen ? "xl:grid-cols-[minmax(0,1fr)_minmax(350px,440px)]" : "xl:grid-cols-[minmax(0,1fr)_64px]"}`}
      >
        <ContactPreviewFrame
          device={device}
          draft={draft}
          focusRequestId={focusRequestId}
          isLive={!disabled && !loadError && !migrationRequired}
          onSelectSection={selectSection}
          selectedSection={activeSection}
        />
        <aside
          aria-label="Contact section inspector"
          className={`${panelClass} sticky top-4 hidden max-h-[calc(100vh-2rem)] overflow-hidden xl:block`}
        >
          {inspectorOpen ? (
            <>
              <InspectorHeader
                activeSection={activeSection}
                onClose={closeDesktopInspector}
              />
              <fieldset
                className="admin-scrollbar-none max-h-[calc(100vh-11rem)] overflow-y-auto p-4 sm:p-5"
                disabled={editorDisabled}
              >
                {inspector("desktop")}
                {activeDirty ? (
                  <button
                    className="mt-5 min-h-11 w-full rounded-xl border border-white/10 text-xs font-semibold text-white/52 transition hover:bg-white hover:text-black"
                    onClick={discardActiveSection}
                    type="button"
                  >
                    Discard changes in {SECTION_META[activeSection].label}
                  </button>
                ) : null}
              </fieldset>
            </>
          ) : (
            <button
              aria-label="Open inspector"
              className="flex min-h-[260px] w-full flex-col items-center justify-center gap-3 text-white/48 transition hover:bg-white/[0.055] hover:text-white"
              onClick={() => setInspectorOpen(true)}
              ref={desktopInspectorOpenRef}
              type="button"
            >
              <FaChevronLeft />
              <span className="[writing-mode:vertical-rl] text-[10px] font-semibold uppercase tracking-[0.2em]">
                Open inspector
              </span>
            </button>
          )}
        </aside>
      </div>

      <dialog
        aria-label="Contact section inspector"
        className="m-0 ml-auto h-dvh max-h-none w-[min(94vw,440px)] max-w-none overscroll-contain bg-transparent p-0 text-white backdrop:bg-black/76 xl:hidden"
        onCancel={(event) => {
          event.preventDefault();
          closeMobileInspector();
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) closeMobileInspector();
        }}
        onClose={closeMobileInspector}
        ref={mobileDialogRef}
      >
        <div className="flex h-dvh flex-col border-l border-white/10 bg-[#0d0d0f] shadow-[-30px_0_100px_rgba(0,0,0,0.55)]">
          <InspectorHeader
            activeSection={activeSection}
            onClose={closeMobileInspector}
          />
          {mobileInspectorOpen ? (
            <>
              <fieldset
                className="admin-scrollbar-none min-h-0 flex-1 overscroll-contain overflow-y-auto p-4 sm:p-5"
                disabled={editorDisabled}
              >
                {inspector("mobile")}
                {activeDirty ? (
                  <button
                    className="mt-5 min-h-11 w-full rounded-xl border border-white/10 text-xs font-semibold text-white/52 transition hover:bg-white hover:text-black"
                    onClick={discardActiveSection}
                    type="button"
                  >
                    Discard changes in {SECTION_META[activeSection].label}
                  </button>
                ) : null}
              </fieldset>
              <div className="shrink-0 border-t border-white/9 bg-[#111113] p-4 shadow-[0_-18px_50px_rgba(0,0,0,0.34)]">
                <p className="text-xs font-semibold text-white/72">{statusLabel}</p>
                <p className="mt-1 text-[11px] leading-5 text-white/52">
                  {responseVisible && saveState.status !== "idle"
                    ? saveState.message
                    : statusDetail}
                </p>
                <button
                  aria-busy={pending}
                  className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white px-5 text-sm font-semibold text-black transition hover:bg-[#ff3b1f] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={!canSave}
                  type="submit"
                >
                  {pending ? <FaSpinner className="animate-spin" /> : <FaCheck />}
                  {pending
                    ? `Saving ${SECTION_META[savingSection || activeSection].label}...`
                    : `Save ${SECTION_META[activeSection].label}`}
                </button>
              </div>
            </>
          ) : null}
        </div>
      </dialog>

      {responseVisible && saveState.status !== "idle" ? (
        <section
          className={`mt-4 rounded-[18px] border px-4 py-3 text-sm leading-6 ${saveState.status === "saved" ? "border-emerald-300/16 bg-emerald-400/[0.06] text-emerald-50/76" : "border-red-300/16 bg-red-400/[0.06] text-red-50/76"}`}
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
                onClick={reloadAfterConflict}
                type="button"
              >
                Reload saved Contact page
              </button>
            ) : null}
          </div>
          {fieldMessage(responseErrors, "form") ? (
            <p className="mt-2 text-xs">{fieldMessage(responseErrors, "form")}</p>
          ) : null}
        </section>
      ) : null}

      <div className="sticky bottom-3 z-20 mt-4 rounded-[20px] border border-white/10 bg-[#101012]/95 p-3 shadow-[0_18px_70px_rgba(0,0,0,0.52)] backdrop-blur-2xl sm:flex sm:items-center sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-2 text-xs font-semibold text-white/66">
            <span
              className={`h-2 w-2 rounded-full ${pending ? "bg-sky-300" : disabled || statusIsError || !validation.ok || hasUnsavedChanges ? "bg-amber-300" : "bg-emerald-300"}`}
            />
            {statusLabel}
          </p>
          <p className="mt-1 text-[10px] leading-4 text-white/48">{statusDetail}</p>
          <p aria-live="polite" className="sr-only">
            {announcement}
          </p>
          <Link
            className="mt-2 inline-flex items-center gap-2 text-[10px] font-semibold text-white/58 underline decoration-white/22 underline-offset-4 transition hover:text-white"
            href="/admin/content#booking"
          >
            Open classic Contact editor <FaExternalLinkAlt />
          </Link>
        </div>
        <div className="mt-3 flex items-center gap-2 sm:mt-0">
          {!inspectorOpen ? (
            <button
              className="hidden h-12 items-center gap-2 rounded-2xl border border-white/10 px-4 text-xs font-semibold text-white/56 transition hover:bg-white hover:text-black xl:inline-flex"
              onClick={() => setInspectorOpen(true)}
              type="button"
            >
              <FaChevronLeft /> Inspector
            </button>
          ) : null}
          <button
            aria-busy={pending}
            className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-white px-5 text-sm font-semibold text-black transition hover:bg-[#ff3b1f] hover:text-white disabled:cursor-not-allowed disabled:opacity-40 sm:min-w-[190px] sm:flex-none"
            disabled={!canSave}
            type="submit"
          >
            {pending ? <FaSpinner className="animate-spin" /> : <FaCheck />}
            {pending
              ? `Saving ${SECTION_META[savingSection || activeSection].label}...`
              : `Save ${SECTION_META[activeSection].label}`}
          </button>
        </div>
      </div>
    </form>
  );
}
