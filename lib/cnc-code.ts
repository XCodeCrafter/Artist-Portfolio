export type CncDialect = "heidenhain" | "iso" | "siemens";

export type CncProgramDefinition = {
  id: string;
  fileName: string;
  title: string;
  description: string;
  dialect: CncDialect;
  source: string;
  previewLineCount?: number;
};

export type CncTokenKind =
  | "axis"
  | "block-number"
  | "command"
  | "comment"
  | "delimiter"
  | "feed"
  | "keyword"
  | "label-decl"
  | "label-ref"
  | "number"
  | "operator"
  | "plain"
  | "program-marker"
  | "string"
  | "tool"
  | "variable"
  | "whitespace";

export type CncToken = {
  kind: CncTokenKind;
  text: string;
};

export type ParsedCncLine = {
  index: number;
  kind: "blank" | "code" | "comment" | "header" | "label" | "program-end";
  label?: string;
  raw: string;
  region: "main" | "post-end";
  tokens: readonly CncToken[];
};

export type CncOutlineItem = {
  kind: "labels" | "main" | "program-end" | "subprogram";
  label: string;
  lineIndex: number;
};

export type ParsedCncProgram = {
  definition: CncProgramDefinition;
  lines: readonly ParsedCncLine[];
  m30Index: number;
  outline: readonly CncOutlineItem[];
  stats: {
    executableBlocks: number;
    labels: number;
    sourceLines: number;
    variables: number;
  };
};

export type CncPreviewRow =
  | { type: "line"; line: ParsedCncLine }
  | { type: "omission"; omittedCount: number };

const KEYWORDS = new Set([
  "ABS",
  "APPR",
  "BEGIN",
  "CALL",
  "CC",
  "CHF",
  "CR",
  "CT",
  "COS",
  "CYCL",
  "DEF",
  "END",
  "FN",
  "GOTO",
  "GOTOB",
  "GOTOC",
  "GOTOF",
  "IF",
  "LBL",
  "L",
  "MSG",
  "PROC",
  "REPEAT",
  "RET",
  "ROT",
  "RND",
  "SCALE",
  "SIN",
  "SQRT",
  "STOPRE",
  "THEN",
  "TAN",
  "TOOL",
  "TRANS",
  "WAIT",
]);

const LABEL_REFERENCE_KEYWORDS = new Set([
  "GOTO",
  "GOTOB",
  "GOTOC",
  "GOTOF",
]);

const OPERATOR_CHARS = new Set(["+", "-", "*", "/", "=", "<", ">"]);
const DELIMITER_CHARS = new Set([",", ":", "[", "]", "(", ")"]);

function isIdentifierStart(character: string) {
  return /[A-Za-z_]/.test(character);
}

function isIdentifierPart(character: string) {
  return /[A-Za-z0-9_.$]/.test(character);
}

function isDigit(character: string) {
  return /\d/.test(character);
}

function classifyIdentifier(text: string, dialect: CncDialect): CncTokenKind {
  const upper = text.toUpperCase();

  if (upper.endsWith(":")) return "label-decl";
  if (/^N\d+$/.test(upper)) return "block-number";
  if (/^[GM]\d+(?:\.\d+)?$/.test(upper)) return "command";
  if (/^T\d+$/.test(upper)) return "tool";
  if (/^[FS]\d*(?:\.\d+)?$/.test(upper)) return "feed";
  if (/^Q(?:L|R|S)?\d+$/.test(upper)) return "variable";
  if (dialect === "siemens" && /^R\d+$/.test(upper)) return "variable";
  if (/^[XYZABCIJKUVW]\d*(?:\.\d+)?$/.test(upper)) return "axis";
  if (dialect !== "siemens" && /^R\d*(?:\.\d+)?$/.test(upper)) return "axis";
  if (KEYWORDS.has(upper)) return "keyword";

  return "plain";
}

function markLabelReferences(tokens: CncToken[]) {
  let expectsLabel = false;
  let callSeen = false;

  for (const token of tokens) {
    if (token.kind === "whitespace" || token.kind === "comment") continue;

    const upper = token.text.toUpperCase();
    if (LABEL_REFERENCE_KEYWORDS.has(upper)) {
      expectsLabel = true;
      callSeen = false;
      continue;
    }

    if (upper === "CALL") {
      callSeen = true;
      continue;
    }

    if (callSeen && upper === "LBL") {
      expectsLabel = true;
      callSeen = false;
      continue;
    }

    if (expectsLabel && ["number", "plain", "string"].includes(token.kind)) {
      token.kind = "label-ref";
    }

    expectsLabel = false;
    callSeen = false;
  }
}

export function tokenizeCncLine(raw: string, dialect: CncDialect): CncToken[] {
  const tokens: CncToken[] = [];
  let cursor = 0;

  while (cursor < raw.length) {
    const character = raw[cursor];

    if (/\s/.test(character)) {
      let end = cursor + 1;
      while (end < raw.length && /\s/.test(raw[end])) end += 1;
      tokens.push({ kind: "whitespace", text: raw.slice(cursor, end) });
      cursor = end;
      continue;
    }

    if (character === ";") {
      tokens.push({ kind: "comment", text: raw.slice(cursor) });
      break;
    }

    if (character === "(" && dialect !== "siemens") {
      const closingIndex = raw.indexOf(")", cursor + 1);
      const end = closingIndex === -1 ? raw.length : closingIndex + 1;
      tokens.push({ kind: "comment", text: raw.slice(cursor, end) });
      cursor = end;
      continue;
    }

    if (character === '"') {
      let end = cursor + 1;
      while (end < raw.length) {
        if (raw[end] !== '"') {
          end += 1;
          continue;
        }
        if (raw[end + 1] === '"') {
          end += 2;
          continue;
        }
        end += 1;
        break;
      }
      tokens.push({ kind: "string", text: raw.slice(cursor, end) });
      cursor = end;
      continue;
    }

    if (character === "%") {
      let end = cursor + 1;
      while (end < raw.length && !/\s/.test(raw[end])) end += 1;
      tokens.push({ kind: "program-marker", text: raw.slice(cursor, end) });
      cursor = end;
      continue;
    }

    if (isIdentifierStart(character)) {
      let end = cursor + 1;
      while (end < raw.length && isIdentifierPart(raw[end])) end += 1;
      if (raw[end] === ":") end += 1;
      const text = raw.slice(cursor, end);
      const kind =
        dialect === "siemens" && text.toUpperCase() === "R" && raw[end] === "["
          ? "variable"
          : classifyIdentifier(text, dialect);
      tokens.push({ kind, text });
      cursor = end;
      continue;
    }

    if (isDigit(character) || (character === "." && isDigit(raw[cursor + 1] || ""))) {
      let end = cursor;
      let sawDot = false;
      while (end < raw.length) {
        if (isDigit(raw[end])) {
          end += 1;
          continue;
        }
        if (raw[end] === "." && !sawDot) {
          sawDot = true;
          end += 1;
          continue;
        }
        break;
      }
      if (/[Ee]/.test(raw[end] || "")) {
        let exponentEnd = end + 1;
        if (/[+-]/.test(raw[exponentEnd] || "")) exponentEnd += 1;
        const digitStart = exponentEnd;
        while (isDigit(raw[exponentEnd] || "")) exponentEnd += 1;
        if (exponentEnd > digitStart) end = exponentEnd;
      }
      tokens.push({ kind: "number", text: raw.slice(cursor, end) });
      cursor = end;
      continue;
    }

    const pair = raw.slice(cursor, cursor + 2);
    if (["<=", ">=", "<>", "=="].includes(pair)) {
      tokens.push({ kind: "operator", text: pair });
      cursor += 2;
      continue;
    }

    if (OPERATOR_CHARS.has(character)) {
      tokens.push({ kind: "operator", text: character });
      cursor += 1;
      continue;
    }

    if (DELIMITER_CHARS.has(character)) {
      tokens.push({ kind: "delimiter", text: character });
      cursor += 1;
      continue;
    }

    tokens.push({ kind: "plain", text: character });
    cursor += 1;
  }

  if (dialect === "heidenhain") {
    const firstExecutable = tokens.find((token) => token.kind !== "whitespace");
    if (firstExecutable?.kind === "number" && /^\d+$/.test(firstExecutable.text)) {
      firstExecutable.kind = "block-number";
    }
  }

  markLabelReferences(tokens);
  return tokens;
}

function getExecutableTokens(tokens: readonly CncToken[]) {
  return tokens.filter(
    (token) => token.kind !== "comment" && token.kind !== "whitespace"
  );
}

function getLabel(raw: string, dialect: CncDialect) {
  const source = raw.replace(/;.*$/, "").trim();
  const withoutBlockNumber =
    dialect === "heidenhain"
      ? source.replace(/^\d+\s+/, "")
      : source.replace(/^N\d+\s+/i, "");
  const colonMatch = withoutBlockNumber.match(/^([A-Za-z_][A-Za-z0-9_.$]*):/);
  if (colonMatch) return colonMatch[1];

  if (dialect === "heidenhain") {
    const lblMatch = withoutBlockNumber.match(
      /^LBL\s+(?:SET\s+)?(?:"([^"]+)"|([A-Za-z0-9_.$]+))/i
    );
    return lblMatch?.[1] || lblMatch?.[2] || undefined;
  }

  return undefined;
}

function isProgramHeader(tokens: readonly CncToken[], raw: string) {
  const executable = getExecutableTokens(tokens);
  if (executable[0]?.kind === "program-marker") return true;
  return /\b(?:BEGIN|END)\s+PGM\b/i.test(raw);
}

export function cncSource(
  strings: TemplateStringsArray,
  ...values: Array<string | number>
) {
  const source = String.raw(strings, ...values).replace(/^\uFEFF/, "");
  return source.replace(/^\r?\n/, "").replace(/\r?\n$/, "");
}

export function parseCncProgram(
  definition: CncProgramDefinition
): ParsedCncProgram {
  const normalizedSource = definition.source
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n");
  const rawLines = normalizedSource.split("\n");
  let m30Index = -1;

  const preliminary = rawLines.map((raw, index) => {
    const tokens = tokenizeCncLine(raw, definition.dialect);
    const executable = getExecutableTokens(tokens);
    const hasM30 = executable.some(
      (token) => token.kind === "command" && token.text.toUpperCase() === "M30"
    );
    if (hasM30 && m30Index === -1) m30Index = index;

    return { executable, index, raw, tokens };
  });

  const lines: ParsedCncLine[] = preliminary.map((line) => {
    const label = getLabel(line.raw, definition.dialect);
    const region = m30Index >= 0 && line.index > m30Index ? "post-end" : "main";
    let kind: ParsedCncLine["kind"] = "code";

    if (!line.raw.trim()) kind = "blank";
    else if (!line.executable.length) kind = "comment";
    else if (isProgramHeader(line.tokens, line.raw)) kind = "header";
    else if (line.index === m30Index) kind = "program-end";
    else if (label) kind = "label";

    return {
      index: line.index,
      kind,
      label,
      raw: line.raw,
      region,
      tokens: line.tokens,
    };
  });

  const variables = new Set<string>();
  for (const line of lines) {
    for (const token of line.tokens) {
      if (token.kind === "variable") variables.add(token.text.toUpperCase());
    }
  }

  const labelLines = lines.filter((line) => line.kind === "label");
  const outline: CncOutlineItem[] = [
    { kind: "main", label: "Program start", lineIndex: 0 },
  ];

  if (m30Index >= 0) {
    outline.push({ kind: "program-end", label: "M30 · Main end", lineIndex: m30Index });
    if (m30Index < lines.length - 1) {
      outline.push({ kind: "labels", label: "Labels / subprograms", lineIndex: m30Index + 1 });
    }
  }

  for (const line of labelLines) {
    outline.push({
      kind: "subprogram",
      label: line.label || `Label at line ${line.index + 1}`,
      lineIndex: line.index,
    });
  }

  return {
    definition,
    lines,
    m30Index,
    outline,
    stats: {
      executableBlocks: lines.filter((line) =>
        ["code", "label", "program-end"].includes(line.kind)
      ).length,
      labels: labelLines.length,
      sourceLines: lines.length,
      variables: variables.size,
    },
  };
}

export function buildCncPreviewRows(
  program: ParsedCncProgram
): CncPreviewRow[] {
  const lineCount = Math.max(3, program.definition.previewLineCount || 6);
  const selected = new Set<number>();

  for (let index = 0; index < Math.min(lineCount, program.lines.length); index += 1) {
    selected.add(index);
  }

  if (program.m30Index >= 0) {
    selected.add(program.m30Index);
    const firstPostEndLabel = program.lines.find(
      (line) => line.index > program.m30Index && line.kind === "label"
    );
    const postEndStart = firstPostEndLabel?.index ?? program.m30Index + 1;
    for (
      let index = postEndStart;
      index < Math.min(postEndStart + 5, program.lines.length);
      index += 1
    ) {
      selected.add(index);
    }
  }

  const indices = [...selected].sort((first, second) => first - second);
  const rows: CncPreviewRow[] = [];

  indices.forEach((lineIndex, position) => {
    const previousIndex = indices[position - 1];
    if (position > 0 && lineIndex - previousIndex > 1) {
      rows.push({ type: "omission", omittedCount: lineIndex - previousIndex - 1 });
    }
    rows.push({ type: "line", line: program.lines[lineIndex] });
  });

  return rows;
}
