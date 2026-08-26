export const CNC_PROGRAM_LIMIT = 3;
export const CNC_PROGRAM_MAX_SOURCE_CHARS = 200_000;
export const CNC_PROGRAM_MAX_SOURCE_BYTES = 500_000;
export const CNC_PROGRAM_MAX_TOTAL_BYTES = 650_000;
export const CNC_PROGRAM_MAX_LINES = 5_000;
export const CNC_PROGRAM_MAX_LINE_CHARS = 4_000;
export const CNC_PROGRAM_MIN_PREVIEW_LINES = 3;
export const CNC_PROGRAM_MAX_PREVIEW_LINES = 20;

export function normalizeCncSource(value: string) {
  return value.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
}

export function getCncSourceLineCount(value: string) {
  if (!value) return 0;
  return normalizeCncSource(value).split("\n").length;
}

export function getCncSourceByteLength(value: string) {
  return new TextEncoder().encode(value).byteLength;
}

export function getLongestCncLineLength(value: string) {
  if (!value) return 0;
  return normalizeCncSource(value)
    .split("\n")
    .reduce((longest, line) => Math.max(longest, line.length), 0);
}

export function isValidCncFileName(value: string) {
  return (
    value.trim().length > 0 &&
    !/[\\/]/.test(value) &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}
