import { describe, expect, it } from "vitest";
import {
  getCncSourceLineCount,
  getLongestCncLineLength,
  isValidCncFileName,
  normalizeCncSource,
} from "@/lib/cnc-program-input";

describe("CNC program input", () => {
  it("normalizes only BOM and newline encoding", () => {
    expect(normalizeCncSource("\uFEFFT06 M06\r\n  G00 X0\r\n\r\n")).toBe(
      "T06 M06\n  G00 X0\n\n"
    );
  });

  it("counts source lines without trimming intentional blanks", () => {
    const source = "T1 M6\n\nM30\nLBL_1:\n  R1=2";
    expect(getCncSourceLineCount(source)).toBe(5);
    expect(getLongestCncLineLength(source)).toBe(6);
  });

  it("accepts CNC file punctuation but rejects paths and control characters", () => {
    expect(isValidCncFileName("PART-01.MPF")).toBe(true);
    expect(isValidCncFileName("folder/PART.NC")).toBe(false);
    expect(isValidCncFileName("folder\\PART.NC")).toBe(false);
    expect(isValidCncFileName("PART\u0000.NC")).toBe(false);
  });
});
