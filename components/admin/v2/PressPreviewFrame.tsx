"use client";

import { useCallback, useEffect, useRef } from "react";
import type { HomePress } from "@/lib/admin/home-editorial";
import { PRESS_PREVIEW_READY_MESSAGE, PRESS_PREVIEW_UPDATE_MESSAGE } from "@/lib/admin/press-preview";

export type PressPreviewDevice = "desktop" | "mobile";
const VIEWPORTS = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } } as const;

export default function PressPreviewFrame({ device, draft, isLive }: { device: PressPreviewDevice; draft: HomePress; isLive: boolean }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const draftRef = useRef(draft);
  const viewport = VIEWPORTS[device];
  const sendDraft = useCallback(() => {
    frameRef.current?.contentWindow?.postMessage({ type: PRESS_PREVIEW_UPDATE_MESSAGE, draft: draftRef.current }, window.location.origin);
  }, []);

  useEffect(() => {
    const container = viewportRef.current;
    const stage = stageRef.current;
    const frame = frameRef.current;
    if (!container || !stage || !frame) return;
    const fit = () => {
      const scale = Math.min(1, Math.max(1, container.clientWidth - 24) / viewport.width);
      frame.style.width = `${viewport.width}px`;
      frame.style.height = `${viewport.height}px`;
      frame.style.transform = `scale(${scale})`;
      stage.style.width = `${Math.round(viewport.width * scale)}px`;
      stage.style.height = `${Math.round(viewport.height * scale)}px`;
    };
    fit();
    const observer = new ResizeObserver(fit); observer.observe(container);
    return () => observer.disconnect();
  }, [viewport.width, viewport.height]);

  useEffect(() => { draftRef.current = draft; sendDraft(); }, [draft, sendDraft]);
  useEffect(() => {
    function receiveReady(event: MessageEvent) {
      if (event.origin !== window.location.origin || event.source !== frameRef.current?.contentWindow) return;
      if (event.data && typeof event.data === "object" && event.data.type === PRESS_PREVIEW_READY_MESSAGE) sendDraft();
    }
    window.addEventListener("message", receiveReady);
    return () => window.removeEventListener("message", receiveReady);
  }, [sendDraft]);

  return <div className="min-w-0 overflow-hidden rounded-[24px] border border-white/9 bg-[#09090a] p-3">
    {!isLive ? <p className="mb-3 rounded-xl border border-amber-300/18 bg-amber-400/[0.07] p-3 text-xs text-amber-100/78">Review-only preview · saving is disabled</p> : null}
    <div className="admin-scrollbar-none flex justify-center overflow-auto rounded-[18px] bg-black/50 p-3" ref={viewportRef}>
      <div className="relative shrink-0 overflow-hidden rounded-[16px] border border-white/12 bg-black" ref={stageRef} style={{ width: viewport.width, height: viewport.height }}>
        <iframe aria-label={`Press page ${device} preview`} className="absolute left-0 top-0 block origin-top-left border-0 bg-black" ref={frameRef}
          onLoad={sendDraft} src="/admin/v2-preview/press" style={{ width: viewport.width, height: viewport.height }} title={`Press page preview at ${viewport.width} pixels`} />
      </div>
    </div>
  </div>;
}
