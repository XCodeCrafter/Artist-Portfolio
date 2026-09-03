"use client";

import { useEffect, useMemo, useState } from "react";
import MusicPageView, {
  MUSIC_PREVIEW_SELECTION_MESSAGE,
} from "@/components/music/MusicPageView";
import {
  createMusicPageViewDataFromEditor,
  parseMusicPreviewUpdateMessage,
  type MusicEditorSnapshot,
  type MusicEditorSection,
} from "@/lib/admin/music-editor";

export const MUSIC_PREVIEW_READY_MESSAGE = "music-preview-ready" as const;

export default function MusicPreviewRuntime({
  initialSnapshot,
}: {
  initialSnapshot: MusicEditorSnapshot;
}) {
  const [draft, setDraft] = useState(initialSnapshot.draft);
  const [footer, setFooter] = useState(initialSnapshot.footer);
  const [selectedSection, setSelectedSection] =
    useState<MusicEditorSection>("hero");
  const [focusRequestId, setFocusRequestId] = useState(0);

  useEffect(() => {
    function receiveUpdate(event: MessageEvent) {
      if (
        event.origin !== window.location.origin ||
        event.source !== window.parent
      ) {
        return;
      }
      const message = parseMusicPreviewUpdateMessage(event.data);
      if (!message) return;
      setDraft(message.draft);
      setFooter(message.footer);
      setSelectedSection(message.selectedSection);
      setFocusRequestId(message.focusRequestId);
    }

    window.addEventListener("message", receiveUpdate);
    if (window.parent !== window) {
      window.parent.postMessage(
        { type: MUSIC_PREVIEW_READY_MESSAGE },
        window.location.origin
      );
    }
    return () => window.removeEventListener("message", receiveUpdate);
  }, []);

  useEffect(() => {
    if (!focusRequestId) return;

    const frame = window.requestAnimationFrame(() => {
      const section = document.querySelector<HTMLElement>(
        `[data-music-preview-section="${selectedSection}"]`
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
    () => createMusicPageViewDataFromEditor(draft, footer),
    [draft, footer]
  );

  function selectSection(section: MusicEditorSection) {
    if (window.parent !== window) {
      window.parent.postMessage(
        { type: MUSIC_PREVIEW_SELECTION_MESSAGE, section },
        window.location.origin
      );
    }
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <MusicPageView
        data={viewData}
        mode="preview"
        onSelectSection={selectSection}
        selectedSection={selectedSection}
      />
    </div>
  );
}
