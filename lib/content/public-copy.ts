const MUSIC_ONLY_TERMS =
  /\b(music|musician|release|track|album|single|spotify|soundcloud|concert|gig)\b/i;
const ACTING_ONLY_TERMS =
  /\b(actor|acting|casting|film|screen|theatre|theater|showreel|self[- ]?tape|performance)\b/i;

export function isSingleDisciplineCopy(value?: string | null) {
  const text = (value || "").replace(/\s+/g, " ").trim();
  if (!text) return false;

  const mentionsMusic = MUSIC_ONLY_TERMS.test(text);
  const mentionsActing = ACTING_ONLY_TERMS.test(text);
  return mentionsMusic !== mentionsActing;
}

/** Keeps custom generic/mixed copy while shielding public pages from old one-track defaults. */
export function getMixedPublicCopy(
  value: string | null | undefined,
  fallback: string
) {
  const text = (value || "").replace(/\s+/g, " ").trim();
  return !text || isSingleDisciplineCopy(text) ? fallback : text;
}
