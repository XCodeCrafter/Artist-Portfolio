import "server-only";

type LimitedBodyErrorCode =
  | "invalid-content-length"
  | "invalid-payload"
  | "payload-too-large";

type JsonBodyErrorCode = LimitedBodyErrorCode | "unsupported-media-type";

export type TextBodyReadResult =
  | {
      ok: true;
      body: string;
      bytes: number;
    }
  | {
      ok: false;
      status: 400 | 413;
      code: LimitedBodyErrorCode;
      bytes: number;
      declaredLength?: number;
    };

export type JsonBodyReadResult =
  | {
      ok: true;
      body: unknown;
      bytes: number;
    }
  | {
      ok: false;
      status: 400 | 413 | 415;
      code: JsonBodyErrorCode;
      bytes: number;
      declaredLength?: number;
    };

function getMediaType(contentType: string | null) {
  return contentType?.split(";", 1)[0]?.trim().toLowerCase() || "";
}

/**
 * Reads a UTF-8 request body without ever buffering more than maxBytes.
 * Content-Length is only an early rejection hint; the stream limit remains
 * authoritative because clients can omit or falsify that header.
 */
export async function readTextBodyWithLimit(
  request: Request,
  maxBytes: number
): Promise<TextBodyReadResult> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new RangeError("maxBytes must be a positive safe integer");
  }

  const rawContentLength = request.headers.get("content-length");
  if (rawContentLength !== null) {
    const normalizedLength = rawContentLength.trim();
    if (!/^\d+$/.test(normalizedLength)) {
      return {
        ok: false,
        status: 400,
        code: "invalid-content-length",
        bytes: 0,
      };
    }

    const declaredLength = Number(normalizedLength);
    if (!Number.isSafeInteger(declaredLength)) {
      return {
        ok: false,
        status: 413,
        code: "payload-too-large",
        bytes: 0,
      };
    }

    if (declaredLength > maxBytes) {
      return {
        ok: false,
        status: 413,
        code: "payload-too-large",
        bytes: 0,
        declaredLength,
      };
    }
  }

  if (!request.body) {
    return {
      ok: false,
      status: 400,
      code: "invalid-payload",
      bytes: 0,
    };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      if (bytes + value.byteLength > maxBytes) {
        await reader.cancel("request body exceeded limit").catch(() => {});
        return {
          ok: false,
          status: 413,
          code: "payload-too-large",
          bytes: bytes + value.byteLength,
        };
      }

      chunks.push(value);
      bytes += value.byteLength;
    }
  } catch {
    return {
      ok: false,
      status: 400,
      code: "invalid-payload",
      bytes,
    };
  } finally {
    reader.releaseLock();
  }

  const buffer = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const raw = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    return { ok: true, body: raw, bytes };
  } catch {
    return {
      ok: false,
      status: 400,
      code: "invalid-payload",
      bytes,
    };
  }
}

/** Reads and parses a bounded JSON body with strict UTF-8 and media type checks. */
export async function readJsonBodyWithLimit(
  request: Request,
  maxBytes: number
): Promise<JsonBodyReadResult> {
  if (getMediaType(request.headers.get("content-type")) !== "application/json") {
    return {
      ok: false,
      status: 415,
      code: "unsupported-media-type",
      bytes: 0,
    };
  }

  const result = await readTextBodyWithLimit(request, maxBytes);
  if (!result.ok) return result;

  try {
    return {
      ok: true,
      body: JSON.parse(result.body) as unknown,
      bytes: result.bytes,
    };
  } catch {
    return {
      ok: false,
      status: 400,
      code: "invalid-payload",
      bytes: result.bytes,
    };
  }
}
