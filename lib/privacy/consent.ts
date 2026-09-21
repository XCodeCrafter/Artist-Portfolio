/** Preference only, never an identifier. Bump the version when purposes change. */
export const CONSENT_COOKIE_NAME = "portfolio_privacy_v1";
export const CONSENT_MAX_AGE_SECONDS = 180 * 24 * 60 * 60;
export const ANALYTICS_SESSION_KEY = "portfolio.analytics.session.v1";

export type PrivacyConsent = {
  version: 1;
  analytics: boolean;
  externalMedia: boolean;
  updatedAt: number;
};
export type PrivacyChoices = Pick<PrivacyConsent, "analytics" | "externalMedia">;

export function readConsentCookie(cookieHeader: string, now = Date.now()): PrivacyConsent | null {
  // Reject duplicate cookies (e.g. conflicting paths) instead of choosing a grant.
  const values = cookieHeader.split(";").map((part) => part.trim())
    .filter((part) => part.startsWith(`${CONSENT_COOKIE_NAME}=`));
  if (values.length !== 1) return null;
  try {
    const raw = values[0].slice(CONSENT_COOKIE_NAME.length + 1);
    if (raw.length > 512) return null;
    const value: unknown = JSON.parse(decodeURIComponent(raw));
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const choice = value as Partial<PrivacyConsent>;
    if (choice.version !== 1 || typeof choice.analytics !== "boolean" ||
      typeof choice.externalMedia !== "boolean" || typeof choice.updatedAt !== "number" ||
      !Number.isSafeInteger(choice.updatedAt) || choice.updatedAt <= 0 ||
      choice.updatedAt > now || now - choice.updatedAt >= CONSENT_MAX_AGE_SECONDS * 1000) return null;
    return { version: 1, analytics: choice.analytics, externalMedia: choice.externalMedia, updatedAt: choice.updatedAt };
  } catch {
    return null;
  }
}

export function serializeConsentCookie(choices: PrivacyChoices, secure: boolean, now = Date.now()) {
  const value: PrivacyConsent = { version: 1, analytics: choices.analytics, externalMedia: choices.externalMedia, updatedAt: now };
  return `${CONSENT_COOKIE_NAME}=${encodeURIComponent(JSON.stringify(value))}; Path=/; Max-Age=${CONSENT_MAX_AGE_SECONDS}; SameSite=Lax${secure ? "; Secure" : ""}`;
}
