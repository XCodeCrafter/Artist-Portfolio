"use client";

import { useCallback, useMemo, useState } from "react";
import { homeSectionHeadingClass } from "@/components/HomeSectionCta";
import { CncPreviewCode } from "@/components/CncCodeView";
import CncProgramDialog from "@/components/CncProgramDialog";
import {
  buildCncPreviewRows,
  parseCncProgram,
  type CncPreviewRow,
  type CncProgramDefinition,
  type ParsedCncProgram,
} from "@/lib/cnc-code";

function FileIcon() {
  return (
    <span aria-hidden="true" className="cnc-file-icon">
      NC
    </span>
  );
}

function EditorHeader({
  activeIndex,
  onSelect,
  programs,
}: {
  activeIndex: number;
  onSelect: (index: number) => void;
  programs: readonly CncProgramDefinition[];
}) {
  return (
    <div className="cnc-editor-header">
      <span aria-hidden="true" className="cnc-window-controls">
        <span />
        <span />
        <span />
      </span>

      {programs.length > 1 ? (
        <div className="cnc-file-tabs" aria-label="Code sample preview">
          {programs.map((program, index) => (
            <button
              aria-pressed={activeIndex === index}
              className={`cnc-file-tab${activeIndex === index ? " is-active" : ""}`}
              key={program.id}
              onClick={() => onSelect(index)}
              type="button"
            >
              <FileIcon />
              <span>{program.fileName}</span>
            </button>
          ))}
        </div>
      ) : (
        <span className="cnc-file-tab is-active">
          <FileIcon />
          <span>{programs[0].fileName}</span>
        </span>
      )}

      <span className="cnc-editor-language">CNC / READ ONLY</span>
    </div>
  );
}

function ProgramPreview({
  activeIndex,
  onOpen,
  onSelect,
  previewRows,
  program,
  programs,
}: {
  activeIndex: number;
  onOpen: () => void;
  onSelect: (index: number) => void;
  previewRows: readonly CncPreviewRow[];
  program: ParsedCncProgram;
  programs: readonly CncProgramDefinition[];
}) {
  return (
    <div className="cnc-editor" data-reveal="side" data-reveal-from="right">
      <EditorHeader
        activeIndex={activeIndex}
        onSelect={onSelect}
        programs={programs}
      />

      <button
        aria-label={`Open full CNC program ${program.definition.title}`}
        aria-haspopup="dialog"
        className="cnc-preview-trigger"
        onClick={onOpen}
        type="button"
      >
        <span className="cnc-code-preview">
          <CncPreviewCode
            idPrefix={`cnc-preview-${program.definition.id}`}
            rows={previewRows}
          />
          <span aria-hidden="true" className="cnc-preview-fade" />
        </span>

        <span className="cnc-editor-toggle">
          <span className="cnc-editor-toggle-copy">
            <span className="cnc-toggle-kicker">
              PROGRAM {String(activeIndex + 1).padStart(2, "0")} /{" "}
              {String(programs.length).padStart(2, "0")}
            </span>
            <span className="cnc-toggle-title">{program.definition.title}</span>
          </span>
          <span aria-hidden="true" className="cnc-toggle-icon">
            <span />
            <span />
          </span>
          <span className="cnc-toggle-label">Open full program viewer</span>
        </span>
      </button>
    </div>
  );
}

export default function CncCodeShowcase({
  programs,
}: {
  programs: readonly CncProgramDefinition[];
}) {
  const visiblePrograms = useMemo(() => programs.slice(0, 3), [programs]);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [activeProgramIndex, setActiveProgramIndex] = useState<number | null>(
    null
  );
  const safePreviewIndex = Math.min(
    previewIndex,
    Math.max(0, visiblePrograms.length - 1)
  );
  const previewDefinition = visiblePrograms[safePreviewIndex];
  const previewProgram = useMemo(
    () => (previewDefinition ? parseCncProgram(previewDefinition) : null),
    [previewDefinition]
  );
  const previewRows = useMemo(
    () => (previewProgram ? buildCncPreviewRows(previewProgram) : []),
    [previewProgram]
  );
  const closeViewer = useCallback(() => setActiveProgramIndex(null), []);

  if (!previewProgram) return null;

  return (
    <section id="cnc-code" className="cnc-showcase">
      <div aria-hidden="true" className="cnc-showcase-glow" />
      <div aria-hidden="true" className="cnc-showcase-grid" />

      <div className="cnc-showcase-inner">
        <div className="cnc-showcase-copy" data-reveal="up">
          <p className="cnc-showcase-kicker">ENGINEERING DETAIL / 01</p>
          <h2 className={`${homeSectionHeadingClass} cnc-showcase-heading`}>
            CODE, IN
            <br />
            MOTION.
          </h2>
          <p className="cnc-showcase-intro">
            The preview keeps HOME concise. The full viewer is built for long
            programs, including the main sequence, M30 boundary and R/Q-driven
            labels or subprograms below it.
          </p>
          <div className="cnc-showcase-meta" aria-label="Code sample details">
            <span>{previewProgram.stats.sourceLines} LINES</span>
            <span>{previewProgram.stats.labels} LABELS</span>
            <span>FULL VIEWER</span>
          </div>
        </div>

        <div className="cnc-programs">
          <ProgramPreview
            activeIndex={safePreviewIndex}
            onOpen={() => setActiveProgramIndex(safePreviewIndex)}
            onSelect={setPreviewIndex}
            previewRows={previewRows}
            program={previewProgram}
            programs={visiblePrograms}
          />
        </div>
      </div>

      {activeProgramIndex !== null &&
      activeProgramIndex < visiblePrograms.length ? (
        <CncProgramDialog
          activeIndex={activeProgramIndex}
          onClose={closeViewer}
          onSelectProgram={setActiveProgramIndex}
          programs={visiblePrograms}
        />
      ) : null}
    </section>
  );
}
