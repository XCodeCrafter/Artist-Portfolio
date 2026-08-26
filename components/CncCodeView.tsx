import type {
  CncPreviewRow,
  CncToken,
  ParsedCncLine,
  ParsedCncProgram,
} from "@/lib/cnc-code";

function Token({ token }: { token: CncToken }) {
  if (token.kind === "whitespace") return token.text;

  return (
    <span className={`cnc-token cnc-token-${token.kind}`}>
      {token.text}
    </span>
  );
}

function SourceLine({
  idPrefix,
  line,
  showBoundary,
}: {
  idPrefix: string;
  line: ParsedCncLine;
  showBoundary: boolean;
}) {
  const classes = [
    "cnc-code-line",
    line.kind === "program-end" ? "is-program-end" : "",
    line.kind === "label" ? "is-label" : "",
    line.region === "post-end" ? "is-post-end" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <>
      <span className={classes} id={`${idPrefix}-line-${line.index + 1}`}>
        <span aria-hidden="true" className="cnc-line-number">
          {line.index + 1}
        </span>
        <span className="cnc-line-source">
          {line.raw.length ? (
            line.tokens.map((token, tokenIndex) => (
              <Token key={`${tokenIndex}-${token.text}`} token={token} />
            ))
          ) : (
            " "
          )}
        </span>
      </span>

      {showBoundary && line.kind === "program-end" ? (
        <span className="cnc-program-boundary" aria-hidden="true">
          <span>END MAIN PROGRAM</span>
          <span>SUBPROGRAMS &amp; LABELS BELOW</span>
        </span>
      ) : null}
    </>
  );
}

function Omission({ count }: { count: number }) {
  return (
    <span className="cnc-code-omission" aria-label={`${count} lines omitted from preview`}>
      <span aria-hidden="true" className="cnc-line-number">
        ···
      </span>
      <span className="cnc-line-source">{count} lines hidden in preview</span>
    </span>
  );
}

export function CncPreviewCode({
  idPrefix,
  rows,
}: {
  idPrefix: string;
  rows: readonly CncPreviewRow[];
}) {
  return (
    <span className="cnc-code-lines">
      {rows.map((row, index) =>
        row.type === "omission" ? (
          <Omission count={row.omittedCount} key={`omission-${index}`} />
        ) : (
          <SourceLine
            idPrefix={idPrefix}
            key={`line-${row.line.index}`}
            line={row.line}
            showBoundary={false}
          />
        )
      )}
    </span>
  );
}

export function CncFullCode({
  idPrefix,
  program,
}: {
  idPrefix: string;
  program: ParsedCncProgram;
}) {
  const hasPostEndContent =
    program.m30Index >= 0 && program.m30Index < program.lines.length - 1;

  return (
    <code className="cnc-code-lines">
      {program.lines.map((line) => (
        <SourceLine
          idPrefix={idPrefix}
          key={`line-${line.index}`}
          line={line}
          showBoundary={hasPostEndContent}
        />
      ))}
    </code>
  );
}
