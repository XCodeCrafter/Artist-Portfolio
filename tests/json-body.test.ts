import { describe, expect, it } from "vitest";
import {
  readJsonBodyWithLimit,
  readTextBodyWithLimit,
} from "../lib/security/json-body";

describe("bounded JSON request reader", () => {
  it("parses a valid JSON body inside the limit", async () => {
    const request = new Request("https://portfolio.example/api", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok: true }),
    });

    const result = await readJsonBodyWithLimit(request, 128);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.body).toEqual({ ok: true });
  });

  it("rejects a declared or streamed payload above the limit", async () => {
    const declared = new Request("https://portfolio.example/api", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": "999",
      },
      body: "{}",
    });
    const streamed = new Request("https://portfolio.example/api", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ long: "x".repeat(100) }),
    });

    expect(await readJsonBodyWithLimit(declared, 64)).toMatchObject({
      ok: false,
      code: "payload-too-large",
    });
    expect(await readJsonBodyWithLimit(streamed, 32)).toMatchObject({
      ok: false,
      code: "payload-too-large",
    });
  });

  it("rejects non-JSON content types", async () => {
    const request = new Request("https://portfolio.example/api", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "{}",
    });

    expect(await readJsonBodyWithLimit(request, 64)).toMatchObject({
      ok: false,
      code: "unsupported-media-type",
    });
  });
});

describe("bounded text request reader", () => {
  it("reads signed webhook payloads without trusting Content-Length", async () => {
    const request = new Request("https://portfolio.example/webhook", {
      method: "POST",
      body: "signed payload",
    });

    expect(await readTextBodyWithLimit(request, 64)).toMatchObject({
      ok: true,
      body: "signed payload",
    });
  });

  it("rejects invalid or oversized lengths before buffering", async () => {
    const invalidLength = new Request("https://portfolio.example/webhook", {
      method: "POST",
      headers: { "content-length": "not-a-number" },
      body: "payload",
    });
    const streamed = new Request("https://portfolio.example/webhook", {
      method: "POST",
      body: "x".repeat(100),
    });

    expect(await readTextBodyWithLimit(invalidLength, 64)).toMatchObject({
      ok: false,
      code: "invalid-content-length",
    });
    expect(await readTextBodyWithLimit(streamed, 32)).toMatchObject({
      ok: false,
      code: "payload-too-large",
    });
  });
});
