"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { BIO_PREVIEW_READY_MESSAGE } from "@/components/admin/v2/BioPreviewRuntime";
import {
  BIO_PREVIEW_SECTIONS,
  BIO_PREVIEW_SELECTION_MESSAGE,
  type BioPreviewSelectionMessage,
} from "@/components/bio/BioPageView";
import {
  BIO_PREVIEW_UPDATE_MESSAGE,
  type BioEditorDraft,
  type BioEditorFooter,
  type BioEditorSection,
  type BioPreviewUpdateMessage,
} from "@/lib/admin/bio-editor";

export type BioPreviewDevice = "desktop" | "mobile";

export const BIO_PREVIEW_VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
} as const;

function isSelectionMessage(value: unknown): value is BioPreviewSelectionMessage {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.type === BIO_PREVIEW_SELECTION_MESSAGE &&
    BIO_PREVIEW_SECTIONS.includes(candidate.section as BioEditorSection)
  );
}

export default function BioPreviewFrame({
  device,
  draft,
  focusRequestId,
  footer,
  hasResumeDetails,
  isLive,
  onSelectSection,
  selectedSection,
}: {
  device: BioPreviewDevice;
  draft: BioEditorDraft;
  focusRequestId: number;
  footer: BioEditorFooter;
  hasResumeDetails: boolean;
  isLive: boolean;
  onSelectSection: (section: BioEditorSection) => void;
  selectedSection: BioEditorSection;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const onSelectSectionRef = useRef(onSelectSection);
  const viewport = BIO_PREVIEW_VIEWPORTS[device];
  const message = useMemo<BioPreviewUpdateMessage>(
    () => ({
      type: BIO_PREVIEW_UPDATE_MESSAGE,
      draft,
      footer,
      hasResumeDetails,
      focusRequestId,
      selectedSection,
    }),
    [draft, focusRequestId, footer, hasResumeDetails, selectedSection]
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
        event.data.type === BIO_PREVIEW_READY_MESSAGE
      ) {
        sendDraft();
        return;
      }
      if (!isSelectionMessage(event.data)) return;
      onSelectSectionRef.current(event.data.section);
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
        <div
          className="mb-3 rounded-2xl border border-amber-300/18 bg-amber-400/[0.07] px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-amber-100/78"
          role="status"
        >
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
            aria-label={`Bio page ${device} preview`}
            className="absolute left-0 top-0 block origin-top-left border-0 bg-black"
            onLoad={sendDraft}
            ref={frameRef}
            src="/admin/v2-preview/bio"
            style={{ width: viewport.width, height: viewport.height }}
            title={`Bio page preview at ${viewport.width} pixels`}
          />
        </div>
      </div>
    </div>
  );
}
