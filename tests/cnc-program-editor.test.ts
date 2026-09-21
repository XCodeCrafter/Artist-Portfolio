import { describe, expect, it } from "vitest";
import {
  classifyCncProgramsError, createCncProgramRows, createCncProgramsSnapshot, parseCncProgramsSubmission,
  type CncProgramDraft,
} from "@/lib/admin/cnc-program-editor";

const program: CncProgramDraft = {
  id: "cnc-one", title: "First program", fileName: "PART_01.NC", description: "A program",
  dialect: "siemens", source: "G0 X0\nM30", isPublished: true, previewLineCount: 6,
};
const expectedVersions = { "cnc-one": "2026-09-20T10:00:00.000001Z" };
const submit = (patch: Partial<CncProgramDraft> = {}) => parseCncProgramsSubmission({ programs: [{ ...program, ...patch }], expectedVersions });

describe("CNC V2 program editor", () => {
  it("preserves source indentation and normalizes only BOM and newlines", () => {
    const parsed = submit({ source: "\uFEFF  G0 X0\r\n  M30\r" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.programs[0].source).toBe("  G0 X0\n  M30\n");
  });
  it("supports removing every program with the complete previous version map", () => {
    expect(parseCncProgramsSubmission({ programs: [], expectedVersions }).success).toBe(true);
  });
  it.each([
    { source: "" }, { source: "G0\0 X0" }, { source: "x".repeat(4001) },
    { source: "x\n".repeat(5000) }, { source: "x".repeat(200001) },
    { fileName: "../PART.NC" }, { fileName: "C:\\PART.NC" }, { fileName: "PART\nNC" },
    { title: "" }, { description: "x".repeat(1001) },
    { previewLineCount: 2 }, { previewLineCount: 21 }, { previewLineCount: 4.5 },
  ])("rejects invalid content", (patch) => {
    expect(submit(patch).success).toBe(false);
  });
  it("rejects unknown fields, invalid versions, duplicate IDs and over-limit collections", () => {
    expect(submit({ isAdmin: true } as Partial<CncProgramDraft>).success).toBe(false);
    expect(parseCncProgramsSubmission({ programs: [program], expectedVersions: { "cnc-one": "yesterday" } }).success).toBe(false);
    expect(parseCncProgramsSubmission({ programs: [program, program], expectedVersions }).success).toBe(false);
    expect(parseCncProgramsSubmission({ programs: Array.from({ length: 4 }, (_, i) => ({ ...program, id: "cnc-" + i })), expectedVersions }).success).toBe(false);
  });
  it("enforces UTF-8 byte budget across the collection", () => {
    const source = ("č".repeat(1900) + "\n").repeat(100);
    expect(submit({ source }).success).toBe(true);
    expect(parseCncProgramsSubmission({ programs: [{ ...program, source }, { ...program, id: "cnc-two", source }], expectedVersions }).success).toBe(false);
  });
  it("maps ordered public data and exact microsecond versions without losing hidden programs", () => {
    const snapshot = createCncProgramsSnapshot([
      { ...program, id: "cnc-two", sortOrder: 20, isPublished: false, updatedAt: expectedVersions["cnc-one"] },
      { ...program, sortOrder: 10, updatedAt: expectedVersions["cnc-one"] },
    ]);
    expect(snapshot.programs.map((item) => item.id)).toEqual(["cnc-one", "cnc-two"]);
    expect(snapshot.expectedVersions["cnc-one"]).toBe(expectedVersions["cnc-one"]);
    expect(createCncProgramRows(snapshot.programs)[1]).toMatchObject({ id: "cnc-two", sort_order: 20, is_published: false, source_code: program.source });
  });
  it("distinguishes conflicts, schema problems and invalid input", () => {
    expect(classifyCncProgramsError({ code: "40001" })).toBe("conflict");
    expect(classifyCncProgramsError({ code: "PGRST202", message: "Could not find public.replace_cnc_programs" })).toBe("migration-required");
    expect(classifyCncProgramsError({ code: "PGRST202", message: "Unrelated schema failure" })).toBe("error");
    expect(classifyCncProgramsError({ code: "23514" })).toBe("invalid");
  });
});
