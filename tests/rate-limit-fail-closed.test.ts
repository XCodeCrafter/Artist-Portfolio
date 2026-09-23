import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { consumeDatabaseRateLimit } from "@/lib/security/rate-limit";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/admin/service", () => ({ createAdminServiceClient: mocks.createClient }));

const input = {
  bucket: "admin:imagekit:prepare",
  identifierHash: "a".repeat(64),
  limit: 10,
  windowSeconds: 60,
  failClosed: true,
};
const allowedRow = {
  allowed: true,
  first_denied: false,
  remaining: 9,
  retry_after_seconds: 60,
};
const unavailable = {
  allowed: false,
  firstDenied: false,
  limit: 10,
  remaining: 0,
  retryAfterSeconds: 60,
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.createClient.mockReturnValue({ rpc: mocks.rpc });
  mocks.rpc.mockResolvedValue({ data: [allowedRow], error: null });
});
afterEach(() => vi.unstubAllEnvs());

describe.each(["development", "production"])("strict database rate limit in %s", (environment) => {
  beforeEach(() => vi.stubEnv("NODE_ENV", environment));

  it.each([
    { bucket: "invalid bucket" },
    { bucket: "" },
    { bucket: "a".repeat(121) },
    { identifierHash: "raw-client-identity" },
    { identifierHash: "A".repeat(64) },
    { limit: 0 },
    { limit: -1 },
    { limit: 10_001 },
    { limit: 1.5 },
    { limit: Number.NaN },
    { limit: Number.POSITIVE_INFINITY },
    { windowSeconds: 0 },
    { windowSeconds: -1 },
    { windowSeconds: 604_801 },
    { windowSeconds: 1.5 },
    { windowSeconds: Number.NaN },
    { windowSeconds: Number.POSITIVE_INFINITY },
  ])("rejects invalid request parameters without creating a client: %j", async (override) => {
    const result = await consumeDatabaseRateLimit({ ...input, ...override });
    expect(result).toMatchObject({ allowed: false, configured: false, firstDenied: false, remaining: 0 });
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("denies without a configured database client", async () => {
    mocks.createClient.mockReturnValue(null);
    await expect(consumeDatabaseRateLimit(input)).resolves.toEqual({ ...unavailable, configured: false });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("denies safely if client creation throws", async () => {
    mocks.createClient.mockImplementation(() => { throw new Error("unavailable service configuration"); });
    await expect(consumeDatabaseRateLimit(input)).resolves.toMatchObject(unavailable);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each(["PGRST202", "42883", "42P01"])("denies with an unconfigured schema for %s", async (code) => {
    mocks.rpc.mockResolvedValue({ data: [allowedRow], error: { code } });
    await expect(consumeDatabaseRateLimit(input)).resolves.toEqual({ ...unavailable, configured: false });
  });

  it.each(["42501", "XX000", "PGRST301", "", undefined])("denies on database error %s", async (code) => {
    mocks.rpc.mockResolvedValue({ data: [allowedRow], error: { code } });
    await expect(consumeDatabaseRateLimit(input)).resolves.toEqual({ ...unavailable, configured: true });
  });

  it("denies when the RPC throws", async () => {
    mocks.rpc.mockRejectedValue(new Error("network failure"));
    await expect(consumeDatabaseRateLimit(input)).resolves.toEqual({ ...unavailable, configured: true });
  });

  it.each([
    null, undefined, false, "allowed", 1, {}, [], [null], [[]],
    [allowedRow, allowedRow],
    [allowedRow, { ...allowedRow, allowed: false }],
  ])("denies malformed or ambiguous response data: %j", async (data) => {
    mocks.rpc.mockResolvedValue({ data, error: null });
    await expect(consumeDatabaseRateLimit(input)).resolves.toEqual({ ...unavailable, configured: true });
  });

  it.each([
    { allowed: undefined }, { allowed: 1 }, { allowed: "true" },
    { first_denied: undefined }, { first_denied: 0 }, { first_denied: "false" },
    { remaining: undefined }, { remaining: "9" }, { remaining: null },
    { remaining: Number.NaN }, { remaining: Number.POSITIVE_INFINITY },
    { remaining: Number.NEGATIVE_INFINITY }, { remaining: 1.5 },
    { remaining: -1 }, { remaining: 11 },
    { retry_after_seconds: undefined }, { retry_after_seconds: "60" },
    { retry_after_seconds: null }, { retry_after_seconds: Number.NaN },
    { retry_after_seconds: Number.POSITIVE_INFINITY },
    { retry_after_seconds: Number.NEGATIVE_INFINITY }, { retry_after_seconds: 1.5 },
    { retry_after_seconds: -1 }, { retry_after_seconds: 0 }, { retry_after_seconds: 61 },
  ])("denies malformed or out-of-bounds response fields: %j", async (override) => {
    mocks.rpc.mockResolvedValue({ data: [{ ...allowedRow, ...override }], error: null });
    await expect(consumeDatabaseRateLimit(input)).resolves.toEqual({ ...unavailable, configured: true });
  });

  it.each(["object", "single row"])("accepts a valid allow response as %s", async (shape) => {
    mocks.rpc.mockResolvedValue({ data: shape === "object" ? allowedRow : [allowedRow], error: null });
    await expect(consumeDatabaseRateLimit(input)).resolves.toEqual({
      allowed: true, configured: true, firstDenied: false,
      limit: 10, remaining: 9, retryAfterSeconds: 60,
    });
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("consume_security_rate_limit", {
      p_bucket: input.bucket, p_identifier_hash: input.identifierHash,
      p_limit: input.limit, p_window_seconds: input.windowSeconds,
    });
  });

  it.each([true, false])("preserves a legitimate denial with firstDenied=%s", async (firstDenied) => {
    mocks.rpc.mockResolvedValue({ data: [{
      allowed: false, first_denied: firstDenied, remaining: 0, retry_after_seconds: 1,
    }], error: null });
    await expect(consumeDatabaseRateLimit(input)).resolves.toEqual({
      allowed: false, configured: true, firstDenied,
      limit: 10, remaining: 0, retryAfterSeconds: 1,
    });
  });

  it("accepts an allowed final slot with zero remaining", async () => {
    mocks.rpc.mockResolvedValue({ data: [{ ...allowedRow, remaining: 0 }], error: null });
    await expect(consumeDatabaseRateLimit(input)).resolves.toMatchObject({ allowed: true, remaining: 0 });
  });
});

describe("legacy rate-limit availability policy", () => {
  beforeEach(() => vi.stubEnv("NODE_ENV", "development"));

  it.each([undefined, false])("retains development fail-open when failClosed is %s", async (failClosed) => {
    mocks.createClient.mockReturnValue(null);
    await expect(consumeDatabaseRateLimit({ ...input, failClosed })).resolves.toMatchObject({
      allowed: true, configured: false,
    });
  });

  it("retains default development fail-open for missing schema", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "PGRST202" } });
    await expect(consumeDatabaseRateLimit({ ...input, failClosed: undefined })).resolves.toMatchObject({
      allowed: true, configured: false,
    });
  });

  it("retains default development fail-open on RPC failure", async () => {
    mocks.rpc.mockRejectedValue(new Error("offline"));
    await expect(consumeDatabaseRateLimit({ ...input, failClosed: undefined })).resolves.toMatchObject({
      allowed: true, configured: true,
    });
  });

  it("keeps the legacy production policy closed", async () => {
    vi.stubEnv("NODE_ENV", "production");
    mocks.createClient.mockReturnValue(null);
    await expect(consumeDatabaseRateLimit({ ...input, failClosed: undefined })).resolves.toEqual({
      ...unavailable, configured: false,
    });
  });
});
