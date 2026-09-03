"use client";

import { useEffect, useMemo, useState } from "react";
import BioPageView, {
  BIO_PREVIEW_SELECTION_MESSAGE,
} from "@/components/bio/BioPageView";
import {
  createBioPageViewDataFromEditor,
  parseBioPreviewUpdateMessage,
  type BioEditorSection,
  type BioEditorSnapshot,
} from "@/lib/admin/bio-editor";

export const BIO_PREVIEW_READY_MESSAGE = "bio-preview-ready" as const;

export default function BioPreviewRuntime({
  initialSnapshot,
}: {
  initialSnapshot: BioEditorSnapshot;
}) {
  const [draft, setDraft] = useState(initialSnapshot.draft);
  const [footer, setFooter] = useState(initialSnapshot.footer);
  const [hasResumeDetails, setHasResumeDetails] = useState(
    initialSnapshot.hasResumeDetails
  );
  const [selectedSection, setSelectedSection] =
    useState<BioEditorSection>("hero");
  const [focusRequestId, setFocusRequestId] = useState(0);

  useEffect(() => {
    function receiveUpdate(event: MessageEvent) {
      if (
        event.origin !== window.location.origin ||
        event.source !== window.parent
      ) {
        return;
      }
      const message = parseBioPreviewUpdateMessage(event.data);
      if (!message) return;
      setDraft(message.draft);
      setFooter(message.footer);
      setHasResumeDetails(message.hasResumeDetails);
      setSelectedSection(message.selectedSection);
      setFocusRequestId(message.focusRequestId);
    }

    window.addEventListener("message", receiveUpdate);
    if (window.parent !== window) {
      window.parent.postMessage(
        { type: BIO_PREVIEW_READY_MESSAGE },
        window.location.origin
      );
    }
    return () => window.removeEventListener("message", receiveUpdate);
  }, []);

  useEffect(() => {
    if (!focusRequestId) return;

    const frame = window.requestAnimationFrame(() => {
      const section = document.querySelector<HTMLElement>(
        `[data-bio-preview-section="${selectedSection}"]`
      );
      section?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "start",
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [focusRequestId, selectedSection]);

  const viewData = useMemo(
    () =>
      createBioPageViewDataFromEditor(draft, footer, hasResumeDetails),
    [draft, footer, hasResumeDetails]
  );

  function selectSection(section: BioEditorSection) {
    if (window.parent !== window) {
      window.parent.postMessage(
        { type: BIO_PREVIEW_SELECTION_MESSAGE, section },
        window.location.origin
      );
    }
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <BioPageView
        data={viewData}
        mode="preview"
        onSelectSection={selectSection}
        selectedSection={selectedSection}
      />
    </div>
  );
}
