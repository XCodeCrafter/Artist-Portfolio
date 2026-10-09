"use client";

import { useEffect, useState } from "react";
import { PressReviewsSection } from "@/components/home/HomeEditorialSections";
import { PRESS_PREVIEW_READY_MESSAGE, parsePressPreviewUpdateMessage } from "@/lib/admin/press-preview";
import type { HomePress } from "@/lib/admin/home-editorial";

export default function PressPreviewRuntime({ initialDraft }: { initialDraft: HomePress }) {
  const [draft, setDraft] = useState(initialDraft);
  useEffect(() => {
    function receiveUpdate(event: MessageEvent) {
      if (event.origin !== window.location.origin || event.source !== window.parent) return;
      const message = parsePressPreviewUpdateMessage(event.data);
      if (message) setDraft(message.draft);
    }
    window.addEventListener("message", receiveUpdate);
    if (window.parent !== window) window.parent.postMessage({ type: PRESS_PREVIEW_READY_MESSAGE }, window.location.origin);
    return () => window.removeEventListener("message", receiveUpdate);
  }, []);
  return <div className="min-h-screen bg-black text-white"><PressReviewsSection data={draft} standalone staticPreview /></div>;
}
