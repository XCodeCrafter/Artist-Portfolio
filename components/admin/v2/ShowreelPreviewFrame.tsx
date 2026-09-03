"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { SHOWREEL_PREVIEW_READY_MESSAGE } from "@/components/admin/v2/ShowreelPreviewRuntime";
import {
  SHOWREEL_PREVIEW_SECTIONS,
  SHOWREEL_PREVIEW_SELECTION_MESSAGE,
  type ShowreelPreviewSelectionMessage,
} from "@/components/video/ShowreelPageView";
import {
  SHOWREEL_PREVIEW_UPDATE_MESSAGE,
  type ShowreelEditorDraft,
  type ShowreelEditorFooter,
  type ShowreelEditorSection,
  type ShowreelPreviewUpdateMessage,
} from "@/lib/admin/showreel-editor";

export type ShowreelPreviewDevice = "desktop" | "mobile";

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
} as const;

function isSelectionMessage(
  value: unknown
): value is ShowreelPreviewSelectionMessage {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.type === SHOWREEL_PREVIEW_SELECTION_MESSAGE &&
    SHOWREEL_PREVIEW_SECTIONS.includes(
      candidate.section as ShowreelEditorSection
    ) &&
    (candidate.itemId === undefined ||
      (typeof candidate.itemId === "string" &&
        candidate.itemId.length <= 512 &&
        candidate.itemId.trim().length > 0 &&
        !/[\u0000-\u001f\u007f]/.test(candidate.itemId)))
  );
}

export default function ShowreelPreviewFrame({
  device,
  draft,
  focusRequestId,
  footer,
  isLive,
  onSelectSection,
  selectedSection,
}: {
  device: ShowreelPreviewDevice;
  draft: ShowreelEditorDraft;
  focusRequestId: number;
  footer: ShowreelEditorFooter;
  isLive: boolean;
  onSelectSection: (section: ShowreelEditorSection, itemId?: string) => void;
  selectedSection: ShowreelEditorSection;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const onSelectSectionRef = useRef(onSelectSection);
  const viewport = VIEWPORTS[device];
  const message = useMemo<ShowreelPreviewUpdateMessage>(
    () => ({
      type: SHOWREEL_PREVIEW_UPDATE_MESSAGE,
      draft,
      footer,
      focusRequestId,
      selectedSection,
    }),
    [draft, focusRequestId, footer, selectedSection]
  );
  const messageRef = useRef(message);

  const sendDraft = useCallback(() => {
    frameRef.current?.contentWindow?.postMessage(
      messageRef.current,
      window.location.origin
    );
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    const stage = stageRef.current;
    const frame = frameRef.current;
    if (!container || !stage || !frame) return;
    const fit = () => {
      const availableWidth = Math.max(280, container.clientWidth - 24);
      const scale = Math.min(1, availableWidth / viewport.width);
      frame.style.width = `${viewport.width}px`;
      frame.style.height = `${viewport.height}px`;
      frame.style.transform = `scale(${scale})`;
      stage.style.width = `${Math.round(viewport.width * scale)}px`;
      stage.style.height = `${Math.round(viewport.height * scale)}px`;
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(container);
    return () => observer.disconnect();
  }, [viewport.height, viewport.width]);

  useEffect(() => {
    messageRef.current = message;
    sendDraft();
  }, [message, sendDraft]);

  useEffect(() => {
    onSelectSectionRef.current = onSelectSection;
  }, [onSelectSection]);

  useEffect(() => {
    function receivePreviewMessage(event: MessageEvent) {
      if (
        event.origin !== window.location.origin ||
        event.source !== frameRef.current?.contentWindow
      ) {
        return;
      }
      if (
        event.data &&
        typeof event.data === "object" &&
        event.data.type === SHOWREEL_PREVIEW_READY_MESSAGE
      ) {
        sendDraft();
        return;
      }
      if (!isSelectionMessage(event.data)) return;
      onSelectSectionRef.current(event.data.section, event.data.itemId);
    }
    window.addEventListener("message", receivePreviewMessage);
    return () => window.removeEventListener("message", receivePreviewMessage);
  }, [sendDraft]);

  return (
    <div
      className="min-w-0 overflow-hidden rounded-[24px] border border-white/9 bg-[#09090a] p-3 shadow-[0_30px_100px_rgba(0,0,0,0.38)]"
      ref={containerRef}
    >
      {!isLive ? (
        <div className="mb-3 rounded-2xl border border-amber-300/18 bg-amber-400/[0.07] px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-amber-100/78">
          Review-only preview · saving is disabled
        </div>
      ) : null}
      <div className="admin-scrollbar-none flex min-h-[520px] justify-center overflow-auto rounded-[18px] bg-black/50 p-3">
        <div
          className="relative shrink-0 overflow-hidden rounded-[16px] border border-white/12 bg-black shadow-[0_18px_70px_rgba(0,0,0,0.55)]"
          ref={stageRef}
          style={{ width: viewport.width, height: viewport.height }}
        >
          <iframe
            aria-label={`Showreel page ${device} preview`}
            className="absolute left-0 top-0 block origin-top-left border-0 bg-black"
            onLoad={sendDraft}
            ref={frameRef}
            src="/admin/v2-preview/showreel"
            style={{ width: viewport.width, height: viewport.height }}
            title={`Showreel page preview at ${viewport.width} pixels`}
          />
        </div>
      </div>
    </div>
  );
}
