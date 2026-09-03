"use client";

import { useEffect, useMemo, useState } from "react";
import ShowreelPageView, {
  SHOWREEL_PREVIEW_SELECTION_MESSAGE,
} from "@/components/video/ShowreelPageView";
import {
  createShowreelPageViewDataFromEditor,
  parseShowreelPreviewUpdateMessage,
  type ShowreelEditorSection,
  type ShowreelEditorSnapshot,
} from "@/lib/admin/showreel-editor";

export const SHOWREEL_PREVIEW_READY_MESSAGE =
  "showreel-preview-ready" as const;

export default function ShowreelPreviewRuntime({
  initialSnapshot,
}: {
  initialSnapshot: ShowreelEditorSnapshot;
}) {
  const [draft, setDraft] = useState(initialSnapshot.draft);
  const [footer, setFooter] = useState(initialSnapshot.footer);
  const [selectedSection, setSelectedSection] =
    useState<ShowreelEditorSection>("hero");
  const [focusRequestId, setFocusRequestId] = useState(0);

  useEffect(() => {
    function receiveUpdate(event: MessageEvent) {
      if (
        event.origin !== window.location.origin ||
        event.source !== window.parent
      ) {
        return;
      }
      const message = parseShowreelPreviewUpdateMessage(event.data);
      if (!message) return;
      setDraft(message.draft);
      setFooter(message.footer);
      setSelectedSection(message.selectedSection);
      setFocusRequestId(message.focusRequestId);
    }

    window.addEventListener("message", receiveUpdate);
    if (window.parent !== window) {
      window.parent.postMessage(
        { type: SHOWREEL_PREVIEW_READY_MESSAGE },
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
          `[data-showreel-preview-section="${selectedSection}"]`
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

  const data = useMemo(
    () => createShowreelPageViewDataFromEditor(draft, footer),
    [draft, footer]
  );

  function selectSection(section: ShowreelEditorSection, itemId?: string) {
    if (window.parent !== window) {
      window.parent.postMessage(
        {
          type: SHOWREEL_PREVIEW_SELECTION_MESSAGE,
          section,
          ...(itemId ? { itemId } : {}),
        },
        window.location.origin
      );
    }
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <ShowreelPageView
        data={data}
        mode="preview"
        onSelectSection={selectSection}
        selectedSection={selectedSection}
      />
    </div>
  );
}
