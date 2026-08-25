import { timingSafeEqual } from "node:crypto";

export function hasValidBearerToken(
  authorization: string | null,
  expectedToken: string | undefined
) {
  if (!expectedToken || !authorization?.startsWith("Bearer ")) return false;

  const received = Buffer.from(authorization.slice("Bearer ".length), "utf8");
  const expected = Buffer.from(expectedToken, "utf8");
  return received.length === expected.length && timingSafeEqual(received, expected);
}
