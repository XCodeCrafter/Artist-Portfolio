import { describe, expect, it } from "vitest";
import {
  buildCncPreviewRows,
  parseCncProgram,
  tokenizeCncLine,
  type CncDialect,
  type CncProgramDefinition,
} from "../lib/cnc-code";

function program(
  dialect: CncDialect,
  source: string,
  previewLineCount = 4
): CncProgramDefinition {
  return {
    description: "Parser fixture",
    dialect,
    fileName: "fixture.nc",
    id: `fixture-${dialect}`,
    previewLineCount,
    source,
    title: "Fixture",
  };
}

describe("CNC code parser", () => {
  it("preserves source text while finding Siemens variables, M30 and labels", () => {
    const parsed = parseCncProgram(
      program(
        "siemens",
        [
          "N10 R1=R2+5 ; setup value",
          "N20 IF R1==R2 GOTOB LABEL3",
          "N30 M30",
          "N100 LABEL3: R[R1]=Q2+10",
        ].join("\n")
      )
    );

    for (const line of parsed.lines) {
      expect(line.tokens.map((token) => token.text).join("")).toBe(line.raw);
    }
    expect(parsed.m30Index).toBe(2);
    expect(parsed.stats.labels).toBe(1);
    expect(parsed.stats.variables).toBeGreaterThanOrEqual(3);
    expect(parsed.outline.map((item) => item.label)).toContain("LABEL3");
  });

  it("recognizes numbered Heidenhain labels and Q variables after M30", () => {
    const parsed = parseCncProgram(
      program(
        "heidenhain",
        [
          "0 BEGIN PGM ELLIPSE MM",
          "28 Q21 = Q3 *COS Q36",
          "30 M30",
          "33 LBL 1",
          "34 Q1=Q2+1",
          "46 LBL 0",
          "47 END PGM ELLIPSE MM",
        ].join("\n")
      )
    );

    expect(parsed.m30Index).toBe(2);
    expect(parsed.stats.labels).toBe(2);
    expect(parsed.stats.variables).toBe(5);
    expect(parsed.lines[3]).toMatchObject({
      kind: "label",
      label: "1",
      region: "post-end",
    });
  });

  it("builds a compact preview from the start and the post-M30 library", () => {
    const parsed = parseCncProgram(
      program(
        "siemens",
        [
          "N10 G0 X0",
          "N20 G0 Y0",
          "N30 G0 Z0",
          "N40 G1 X1",
          "N50 G1 X2",
          "N60 G1 X3",
          "N70 G1 X4",
          "N80 G1 X5",
          "N90 M30",
          "; label library",
          "CUT_A:",
          "R1=Q1+10",
          "G1 X=R1",
        ].join("\n"),
        3
      )
    );
    const preview = buildCncPreviewRows(parsed);
    const visibleLines = preview.flatMap((row) =>
      row.type === "line" ? [row.line.index] : []
    );

    expect(preview.some((row) => row.type === "omission")).toBe(true);
    expect(visibleLines).toEqual(expect.arrayContaining([0, 1, 2, 8, 10, 11, 12]));
  });

  it("does not treat M30 inside a comment as a program boundary", () => {
    const parsed = parseCncProgram(
      program("iso", ["G0 X0", "; M30 is documented here", "M30"].join("\n"))
    );

    expect(parsed.m30Index).toBe(2);
    expect(tokenizeCncLine("(M30 is documented here)", "iso")[0].kind).toBe(
      "comment"
    );
  });
});
