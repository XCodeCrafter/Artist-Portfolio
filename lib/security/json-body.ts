import "server-only";

type JsonBodyErrorCode =
  | "invalid-content-length"
  | "invalid-payload"
  | "payload-too-large"
  | "unsupported-media-type";

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
 * Reads a JSON request body without ever buffering more than maxBytes.
 * Content-Length is only an early rejection hint; the stream limit remains
 * authoritative because clients can omit or falsify that header.
 */
export async function readJsonBodyWithLimit(
  request: Request,
  maxBytes: number
): Promise<JsonBodyReadResult> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new RangeError("maxBytes must be a positive safe integer");
  }

  if (getMediaType(request.headers.get("content-type")) !== "application/json") {
    return {
      ok: false,
      status: 415,
      code: "unsupported-media-type",
      bytes: 0,
    };
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
    return { ok: true, body: JSON.parse(raw) as unknown, bytes };
  } catch {
    return {
      ok: false,
      status: 400,
      code: "invalid-payload",
      bytes,
    };
  }
}
