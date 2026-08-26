"use client";

import { useEffect, useRef, useState } from "react";
import ClientPortal from "@/components/ClientPortal";
import { CncFullCode } from "@/components/CncCodeView";
import type { ParsedCncProgram } from "@/lib/cnc-code";

const DIALECT_LABELS = {
  heidenhain: "HEIDENHAIN",
  iso: "ISO G-CODE",
  siemens: "SINUMERIK / SIEMENS",
} as const;

type Props = {
  activeIndex: number;
  onClose: () => void;
  onSelectProgram: (index: number) => void;
  programs: readonly ParsedCncProgram[];
};

export default function CncProgramDialog({
  activeIndex,
  onClose,
  onSelectProgram,
  programs,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const codeScrollRef = useRef<HTMLPreElement | null>(null);
  const [copyState, setCopyState] = useState<"copied" | "error" | "idle">("idle");
  const program = programs[activeIndex];
  const viewerPrefix = `cnc-viewer-${program.definition.id}`;
  const dialogTitleId = `${program.definition.id}-dialog-title`;
  const codeLabelId = `${program.definition.id}-code-label`;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const previousOverflow = document.body.style.overflow;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";
    if (!dialog.open) dialog.showModal();
    const focusFrame = window.requestAnimationFrame(() =>
      closeButtonRef.current?.focus()
    );

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      if (dialog.open) dialog.close();
      previouslyFocused?.focus();
    };
  }, []);

  useEffect(() => {
    codeScrollRef.current?.scrollTo({ left: 0, top: 0 });
  }, [program.definition.id]);

  function selectProgram(index: number) {
    setCopyState("idle");
    onSelectProgram(index);
  }

  function jumpToLine(lineIndex: number) {
    const scrollContainer = codeScrollRef.current;
    const target = document.getElementById(
      `${viewerPrefix}-line-${lineIndex + 1}`
    );
    if (!scrollContainer || !target) return;

    scrollContainer.scrollTo({
      left: 0,
      top: Math.max(0, target.offsetTop - 16),
    });
    scrollContainer.focus({ preventScroll: true });
  }

  async function copyProgram() {
    try {
      await navigator.clipboard.writeText(program.definition.source);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  }

  return (
    <ClientPortal>
      <dialog
        aria-labelledby={dialogTitleId}
        className="cnc-program-dialog"
        onCancel={(event) => {
          event.preventDefault();
          onClose();
        }}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
        ref={dialogRef}
      >
        <div className="cnc-dialog-shell">
          <header className="cnc-dialog-header">
            <div className="cnc-dialog-title-group">
              <p className="cnc-dialog-eyebrow">CNC PROGRAM VIEWER</p>
              <h2 className="cnc-dialog-title" id={dialogTitleId}>
                {program.definition.title}
              </h2>
              <p className="cnc-dialog-description">
                {program.definition.description}
              </p>
            </div>

            <div className="cnc-dialog-actions">
              <button
                className="cnc-dialog-action"
                onClick={copyProgram}
                type="button"
              >
                {copyState === "copied"
                  ? "Copied"
                  : copyState === "error"
                    ? "Copy unavailable"
                    : "Copy code"}
              </button>
              <button
                aria-label="Close CNC program viewer"
                className="cnc-dialog-close"
                onClick={onClose}
                ref={closeButtonRef}
                type="button"
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>
          </header>

          <div className="cnc-dialog-tabs" aria-label="CNC programs">
            {programs.map((item, index) => (
              <button
                aria-pressed={index === activeIndex}
                className={index === activeIndex ? "is-active" : ""}
                key={item.definition.id}
                onClick={() => selectProgram(index)}
                type="button"
              >
                <span className="cnc-dialog-tab-icon" aria-hidden="true">
                  NC
                </span>
                <span>{item.definition.fileName}</span>
              </button>
            ))}
          </div>

          <div className="cnc-dialog-workspace">
            <aside className="cnc-dialog-outline">
              <div>
                <p>OUTLINE</p>
                <span>{program.outline.length} markers</span>
              </div>
              <nav aria-label="Program outline">
                {program.outline.map((item, index) => (
                  <button
                    className={`is-${item.kind}`}
                    key={`${item.kind}-${item.lineIndex}-${index}`}
                    onClick={() => jumpToLine(item.lineIndex)}
                    type="button"
                  >
                    <span>{item.label}</span>
                    <small>Ln {item.lineIndex + 1}</small>
                  </button>
                ))}
              </nav>
            </aside>

            <section className="cnc-dialog-editor" aria-label="Code editor">
              <div className="cnc-editor-breadcrumbs" aria-hidden="true">
                <span>PORTFOLIO</span>
                <span>/</span>
                <span>CNC</span>
                <span>/</span>
                <span>{program.definition.fileName}</span>
              </div>
              <span className="sr-only" id={codeLabelId}>
                Full CNC program: {program.definition.title}
              </span>
              <pre
                aria-labelledby={codeLabelId}
                className="cnc-code-full"
                ref={codeScrollRef}
                tabIndex={0}
              >
                <CncFullCode idPrefix={viewerPrefix} program={program} />
              </pre>
            </section>
          </div>

          <footer className="cnc-status-bar">
            <span>
              <span className="cnc-status-dot" aria-hidden="true" /> Read only
            </span>
            <span>{program.stats.sourceLines} lines</span>
            <span>{program.stats.executableBlocks} blocks</span>
            <span>{program.stats.labels} labels</span>
            <span>{program.stats.variables} R/Q variables</span>
            <span>{DIALECT_LABELS[program.definition.dialect]}</span>
            <span className="cnc-status-escape">ESC to close</span>
          </footer>
        </div>
        <span className="sr-only" aria-live="polite">
          {copyState === "copied"
            ? "CNC program copied to clipboard."
            : copyState === "error"
              ? "CNC program could not be copied."
              : ""}
        </span>
      </dialog>
    </ClientPortal>
  );
}
