"use client";

import { useEffect, useMemo, useState } from "react";
import ContactPageView, {
  CONTACT_PREVIEW_SELECTION_MESSAGE,
} from "@/components/contact/ContactPageView";
import {
  createContactPageViewDataFromEditor,
  parseContactPreviewUpdateMessage,
  type ContactEditorSection,
  type ContactEditorSnapshot,
} from "@/lib/admin/contact-editor";

export const CONTACT_PREVIEW_READY_MESSAGE = "contact-preview-ready" as const;

export default function ContactPreviewRuntime({
  initialSnapshot,
}: {
  initialSnapshot: ContactEditorSnapshot;
}) {
  const [draft, setDraft] = useState(initialSnapshot.draft);
  const [selectedSection, setSelectedSection] =
    useState<ContactEditorSection>("hero");
  const [focusRequestId, setFocusRequestId] = useState(0);

  useEffect(() => {
    function receiveUpdate(event: MessageEvent) {
      if (
        event.origin !== window.location.origin ||
        event.source !== window.parent
      ) {
        return;
      }

      const message = parseContactPreviewUpdateMessage(event.data);
      if (!message) return;
      setDraft(message.draft);
      setSelectedSection(message.selectedSection);
      setFocusRequestId(message.focusRequestId);
    }

    window.addEventListener("message", receiveUpdate);
    if (window.parent !== window) {
      window.parent.postMessage(
        { type: CONTACT_PREVIEW_READY_MESSAGE },
        window.location.origin
      );
    }
    return () => window.removeEventListener("message", receiveUpdate);
  }, []);

  useEffect(() => {
    if (!focusRequestId) return;
    const frame = window.requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>(
          `[data-contact-preview-section="${selectedSection}"]`
        )
        ?.scrollIntoView({
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "auto"
            : "smooth",
          block: "start",
        });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusRequestId, selectedSection]);

  const viewData = useMemo(
    () => createContactPageViewDataFromEditor(draft),
    [draft]
  );

  function selectSection(section: ContactEditorSection) {
    if (window.parent !== window) {
      window.parent.postMessage(
        { type: CONTACT_PREVIEW_SELECTION_MESSAGE, section },
        window.location.origin
      );
    }
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <ContactPageView
        data={viewData}
        mode="preview"
        onSelectSection={selectSection}
        selectedSection={selectedSection}
      />
    </div>
  );
}
