import { z } from "zod";
import { CNC_DIALECTS } from "@/lib/cnc-code";
import {
  CNC_PROGRAM_LIMIT, CNC_PROGRAM_MAX_LINES, CNC_PROGRAM_MAX_LINE_CHARS,
  CNC_PROGRAM_MAX_PREVIEW_LINES, CNC_PROGRAM_MAX_SOURCE_BYTES,
  CNC_PROGRAM_MAX_SOURCE_CHARS, CNC_PROGRAM_MAX_TOTAL_BYTES,
  CNC_PROGRAM_MIN_PREVIEW_LINES, getCncSourceByteLength,
  getCncSourceLineCount, getLongestCncLineLength, isValidCncFileName,
  normalizeCncSource,
} from "@/lib/cnc-program-input";
import type { EditableCncProgram } from "@/lib/admin/cnc-programs";

const id = z.string().min(1).max(100).regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/);
const timestamp = z.string().max(64).refine(
  (value) => /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value)),
  "Reload this editor to obtain the saved version."
);
const sourceSchema = z.string().max(CNC_PROGRAM_MAX_SOURCE_CHARS)
  .transform(normalizeCncSource).superRefine((source, context) => {
    const errors = [
      !source.trim() && "Paste the complete program source.",
      source.includes("\0") && "Source cannot contain a null byte.",
      getCncSourceByteLength(source) > CNC_PROGRAM_MAX_SOURCE_BYTES && "This program is too large.",
      getCncSourceLineCount(source) > CNC_PROGRAM_MAX_LINES && "Use at most 5,000 lines.",
      getLongestCncLineLength(source) > CNC_PROGRAM_MAX_LINE_CHARS && "A source line is too long.",
    ];
    for (const message of errors) if (message) context.addIssue({ code: "custom", message });
  });
const programSchema = z.object({
  id,
  fileName: z.string().trim().min(1, "Enter a file name.").max(100)
    .refine(isValidCncFileName, "Use a file name without paths or control characters."),
  title: z.string().trim().min(1, "Enter a program title.").max(220),
  description: z.string().trim().max(1000),
  dialect: z.enum(CNC_DIALECTS),
  source: sourceSchema,
  previewLineCount: z.number().int().min(CNC_PROGRAM_MIN_PREVIEW_LINES).max(CNC_PROGRAM_MAX_PREVIEW_LINES),
  isPublished: z.boolean(),
}).strict();
export const cncProgramsSubmissionSchema = z.object({
  programs: z.array(programSchema).max(CNC_PROGRAM_LIMIT),
  expectedVersions: z.record(id, timestamp).refine((versions) => Object.keys(versions).length <= CNC_PROGRAM_LIMIT),
}).strict().superRefine(({ programs }, context) => {
  if (new Set(programs.map((program) => program.id)).size !== programs.length) {
    context.addIssue({ code: "custom", path: ["programs"], message: "Program IDs must be unique." });
  }
  if (programs.reduce((total, program) => total + getCncSourceByteLength(program.source), 0) > CNC_PROGRAM_MAX_TOTAL_BYTES) {
    context.addIssue({ code: "custom", path: ["programs"], message: "The combined source is too large." });
  }
});
export type CncProgramDraft = z.infer<typeof programSchema>;
export type CncProgramsSnapshot = z.infer<typeof cncProgramsSubmissionSchema>;
export type CncProgramsSaveState = {
  status: "idle" | "saved" | "invalid" | "conflict" | "security-error" | "missing-service" | "migration-required" | "error";
  message: string;
  eventId: string;
  snapshot?: CncProgramsSnapshot;
  fieldErrors?: Record<string, string[]>;
  requiresReload?: boolean;
};
export const INITIAL_CNC_PROGRAMS_SAVE_STATE: CncProgramsSaveState = { status: "idle", message: "", eventId: "" };
export const CNC_PROGRAMS_PAYLOAD_MAX_BYTES = CNC_PROGRAM_MAX_TOTAL_BYTES + 100_000;

export function createCncProgramsSnapshot(items: EditableCncProgram[]): CncProgramsSnapshot {
  return {
    programs: [...items].sort((a, b) => a.sortOrder - b.sortOrder).map((item) => ({
      id: item.id, fileName: item.fileName, title: item.title, description: item.description,
      dialect: item.dialect, source: item.source, previewLineCount: item.previewLineCount ?? 6,
      isPublished: item.isPublished,
    })),
    expectedVersions: Object.fromEntries(items.map((item) => [item.id, item.updatedAt])),
  };
}

export function parseCncProgramsSubmission(input: unknown) {
  const result = cncProgramsSubmissionSchema.safeParse(input);
  if (result.success) return { success: true as const, data: result.data };
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".") || "form";
    fieldErrors[key] = [...(fieldErrors[key] || []), issue.message];
  }
  return { success: false as const, fieldErrors };
}

export function createCncProgramRows(programs: CncProgramDraft[]) {
  return programs.map((program, index) => ({
    id: program.id, file_name: program.fileName, title: program.title,
    description: program.description, dialect: program.dialect, source_code: program.source,
    preview_line_count: program.previewLineCount, is_published: program.isPublished,
    sort_order: (index + 1) * 10,
  }));
}

export function classifyCncProgramsError(error: { code?: string; message?: string }): CncProgramsSaveState["status"] {
  if (error.code === "40001" || error.message?.includes("cnc_programs_changed")) return "conflict";
  if (["PGRST202", "PGRST205", "42883", "42P01"].includes(error.code || "") &&
      /cnc_programs/.test(error.message || "")) return "migration-required";
  if (["22023", "23514", "23505"].includes(error.code || "")) return "invalid";
  return "error";
}
