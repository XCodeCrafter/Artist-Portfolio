import {
  cncSource,
  type CncProgramDefinition,
} from "@/lib/cnc-code";

/**
 * Paste complete CNC programs into `source` verbatim. The viewer automatically
 * detects M30, label declarations and R/Q variables; no line-by-line JSX is
 * needed when these samples grow to hundreds of lines.
 */
export const CNC_PROGRAMS = [
  {
    id: "demo-01",
    fileName: "DEMO_01.NC",
    title: "Tool change & first move",
    description:
      "A temporary ISO-style sample. Replace this source with the complete program when it is ready for the portfolio.",
    dialect: "siemens",
    previewLineCount: 6,
    source: cncSource`T06 M06,
M3 S1500
G00 X100 Y-50
G01 Z3 F900`,
  },
] satisfies readonly CncProgramDefinition[];
