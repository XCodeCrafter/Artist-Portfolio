"use client";

import { useEffect, useMemo, useState } from "react";
import GalleryPageView, {
  GALLERY_PREVIEW_SELECTION_MESSAGE,
} from "@/components/gallery/GalleryPageView";
import {
  createGalleryPageViewDataFromEditor,
  parseGalleryPreviewUpdateMessage,
  type GalleryEditorSection,
  type GalleryEditorSnapshot,
} from "@/lib/admin/gallery-editor";

export const GALLERY_PREVIEW_READY_MESSAGE = "gallery-preview-ready" as const;

export default function GalleryPreviewRuntime({
  initialSnapshot,
}: {
  initialSnapshot: GalleryEditorSnapshot;
}) {
  const [draft, setDraft] = useState(initialSnapshot.draft);
  const [footer, setFooter] = useState(initialSnapshot.footer);
  const [selectedSection, setSelectedSection] =
    useState<GalleryEditorSection>("hero");
  const [focusRequestId, setFocusRequestId] = useState(0);

  useEffect(() => {
    function receiveUpdate(event: MessageEvent) {
      if (
        event.origin !== window.location.origin ||
        event.source !== window.parent
      ) {
        return;
      }

      const message = parseGalleryPreviewUpdateMessage(event.data);
      if (!message) return;
      setDraft(message.draft);
      setFooter(message.footer);
      setSelectedSection(message.selectedSection);
      setFocusRequestId(message.focusRequestId);
    }

    window.addEventListener("message", receiveUpdate);
    if (window.parent !== window) {
      window.parent.postMessage(
        { type: GALLERY_PREVIEW_READY_MESSAGE },
        window.location.origin
      );
    }
    return () => window.removeEventListener("message", receiveUpdate);
  }, []);

  useEffect(() => {
    if (!focusRequestId) return;

    const frame = window.requestAnimationFrame(() => {
      const section = document.querySelector<HTMLElement>(
        `[data-gallery-preview-section="${selectedSection}"]`
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
    () => createGalleryPageViewDataFromEditor(draft, footer),
    [draft, footer]
  );

  function selectSection(section: GalleryEditorSection) {
    if (window.parent !== window) {
      window.parent.postMessage(
        { type: GALLERY_PREVIEW_SELECTION_MESSAGE, section },
        window.location.origin
      );
    }
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <GalleryPageView
        data={viewData}
        mode="preview"
        onSelectSection={selectSection}
        selectedSection={selectedSection}
      />
    </div>
  );
}
