"use client";

import { useEffect, useState } from "react";
import HomePageView, { HOME_PREVIEW_SELECTION_MESSAGE } from "@/components/home/HomePageView";
import { parseHomePreviewUpdateMessage, type HomeEditorSection, type HomeEditorSnapshot } from "@/lib/admin/home-editor";
import type { CncProgramDefinition } from "@/lib/cnc-code";

export const HOME_PREVIEW_READY_MESSAGE = "home-preview-ready" as const;

export default function HomePreviewRuntime({ initialSnapshot, programs }: {
  initialSnapshot: HomeEditorSnapshot;
  programs: CncProgramDefinition[];
}) {
  const [draft, setDraft] = useState(initialSnapshot.draft);
  const [selectedSection, setSelectedSection] = useState<HomeEditorSection>("layout");
  const [focusRequestId, setFocusRequestId] = useState(0);

  useEffect(() => {
    function receiveUpdate(event: MessageEvent) {
      if (event.origin !== window.location.origin || event.source !== window.parent) return;
      const message = parseHomePreviewUpdateMessage(event.data);
      if (!message) return;
      setDraft(message.draft);
      setSelectedSection(message.selectedSection);
      setFocusRequestId(message.focusRequestId);
    }
    window.addEventListener("message", receiveUpdate);
    if (window.parent !== window) window.parent.postMessage({ type: HOME_PREVIEW_READY_MESSAGE }, window.location.origin);
    return () => window.removeEventListener("message", receiveUpdate);
  }, []);

  useEffect(() => {
    if (!focusRequestId || selectedSection === "layout") return;
    const frame = window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(`[data-home-preview-section="${selectedSection}"]`)
        ?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusRequestId, selectedSection]);

  return <div className="min-h-screen bg-black text-white">
    <HomePageView data={draft} programs={programs} mode="preview" selectedSection={selectedSection}
      onSelectSection={(section) => {
        if (window.parent !== window) window.parent.postMessage({ type: HOME_PREVIEW_SELECTION_MESSAGE, section }, window.location.origin);
      }} />
  </div>;
}
