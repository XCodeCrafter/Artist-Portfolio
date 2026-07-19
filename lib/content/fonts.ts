export type FontOption = {
  key: string;
  label: string;
  family: string;
  googleFamily: string;
};

const FONT_CATALOG = {
  "abril-fatface": {
    key: "abril-fatface",
    label: "Abril Fatface",
    family: "'Abril Fatface', Georgia, serif",
    googleFamily: "Abril+Fatface",
  },
  "playfair-display": {
    key: "playfair-display",
    label: "Playfair Display",
    family: "'Playfair Display', Georgia, serif",
    googleFamily: "Playfair+Display:wght@400;500;600;700;800;900",
  },
  "bodoni-moda": {
    key: "bodoni-moda",
    label: "Bodoni Moda",
    family: "'Bodoni Moda', Didot, Georgia, serif",
    googleFamily: "Bodoni+Moda:wght@400;500;600;700;800;900",
  },
  "libre-caslon-display": {
    key: "libre-caslon-display",
    label: "Libre Caslon Display",
    family: "'Libre Caslon Display', Georgia, serif",
    googleFamily: "Libre+Caslon+Display",
  },
  "cormorant-sc": {
    key: "cormorant-sc",
    label: "Cormorant SC",
    family: "'Cormorant SC', Georgia, serif",
    googleFamily: "Cormorant+SC:wght@300;400;500;600;700",
  },
  marcellus: {
    key: "marcellus",
    label: "Marcellus",
    family: "Marcellus, Georgia, serif",
    googleFamily: "Marcellus",
  },
  italiana: {
    key: "italiana",
    label: "Italiana",
    family: "Italiana, Georgia, serif",
    googleFamily: "Italiana",
  },
  "dm-serif-display": {
    key: "dm-serif-display",
    label: "DM Serif Display",
    family: "'DM Serif Display', Georgia, serif",
    googleFamily: "DM+Serif+Display",
  },
  spectral: {
    key: "spectral",
    label: "Spectral",
    family: "Spectral, Georgia, serif",
    googleFamily: "Spectral:wght@400;500;600;700",
  },
  prata: {
    key: "prata",
    label: "Prata",
    family: "Prata, Georgia, serif",
    googleFamily: "Prata",
  },
  inter: {
    key: "inter",
    label: "Inter",
    family: "Inter, system-ui, sans-serif",
    googleFamily: "Inter:wght@400;500;600;700",
  },
  manrope: {
    key: "manrope",
    label: "Manrope",
    family: "Manrope, system-ui, sans-serif",
    googleFamily: "Manrope:wght@400;500;600;700;800",
  },
  "source-sans-3": {
    key: "source-sans-3",
    label: "Source Sans 3",
    family: "'Source Sans 3', system-ui, sans-serif",
    googleFamily: "Source+Sans+3:wght@400;500;600;700",
  },
  "dm-sans": {
    key: "dm-sans",
    label: "DM Sans",
    family: "'DM Sans', system-ui, sans-serif",
    googleFamily: "DM+Sans:wght@400;500;600;700",
  },
  "work-sans": {
    key: "work-sans",
    label: "Work Sans",
    family: "'Work Sans', system-ui, sans-serif",
    googleFamily: "Work+Sans:wght@400;500;600;700",
  },
  "plus-jakarta-sans": {
    key: "plus-jakarta-sans",
    label: "Plus Jakarta Sans",
    family: "'Plus Jakarta Sans', system-ui, sans-serif",
    googleFamily: "Plus+Jakarta+Sans:wght@400;500;600;700",
  },
  "ibm-plex-sans": {
    key: "ibm-plex-sans",
    label: "IBM Plex Sans",
    family: "'IBM Plex Sans', system-ui, sans-serif",
    googleFamily: "IBM+Plex+Sans:wght@400;500;600;700",
  },
  "space-grotesk": {
    key: "space-grotesk",
    label: "Space Grotesk",
    family: "'Space Grotesk', system-ui, sans-serif",
    googleFamily: "Space+Grotesk:wght@400;500;600;700",
  },
  urbanist: {
    key: "urbanist",
    label: "Urbanist",
    family: "Urbanist, system-ui, sans-serif",
    googleFamily: "Urbanist:wght@400;500;600;700",
  },
} as const satisfies Record<string, FontOption>;

export const DISPLAY_FONT_KEYS = [
  "abril-fatface",
  "playfair-display",
  "bodoni-moda",
  "libre-caslon-display",
  "cormorant-sc",
  "marcellus",
  "italiana",
  "dm-serif-display",
  "spectral",
  "prata",
] as const;

export const BODY_FONT_KEYS = [
  "inter",
  "source-sans-3",
  "dm-sans",
  "work-sans",
  "plus-jakarta-sans",
  "ibm-plex-sans",
] as const;

export const UI_FONT_KEYS = [
  "manrope",
  "space-grotesk",
  "dm-sans",
  "inter",
  "urbanist",
  "ibm-plex-sans",
] as const;

export type DisplayFontKey = (typeof DISPLAY_FONT_KEYS)[number];
export type BodyFontKey = (typeof BODY_FONT_KEYS)[number];
export type UiFontKey = (typeof UI_FONT_KEYS)[number];
export type FontKey = keyof typeof FONT_CATALOG;

export const DISPLAY_FONT_OPTIONS = DISPLAY_FONT_KEYS.map(
  (key) => FONT_CATALOG[key]
);
export const BODY_FONT_OPTIONS = BODY_FONT_KEYS.map((key) => FONT_CATALOG[key]);
export const UI_FONT_OPTIONS = UI_FONT_KEYS.map((key) => FONT_CATALOG[key]);

export const DEFAULT_DISPLAY_FONT: DisplayFontKey = "playfair-display";
export const DEFAULT_BODY_FONT: BodyFontKey = "inter";
export const DEFAULT_UI_FONT: UiFontKey = "manrope";

function isFontInList<T extends readonly string[]>(
  value: string | null | undefined,
  keys: T
): value is T[number] {
  return typeof value === "string" && keys.includes(value);
}

export function normalizeDisplayFont(value: string | null | undefined) {
  return isFontInList(value, DISPLAY_FONT_KEYS) ? value : DEFAULT_DISPLAY_FONT;
}

export function normalizeBodyFont(value: string | null | undefined) {
  return isFontInList(value, BODY_FONT_KEYS) ? value : DEFAULT_BODY_FONT;
}

export function normalizeUiFont(value: string | null | undefined) {
  return isFontInList(value, UI_FONT_KEYS) ? value : DEFAULT_UI_FONT;
}

export function getFontFamily(key: FontKey) {
  return FONT_CATALOG[key].family;
}

export function getGoogleFontsStylesheetUrl(keys: readonly FontKey[]) {
  const fontQueries = Array.from(
    new Set(keys.map((key) => FONT_CATALOG[key].googleFamily))
  ).map((family) => `family=${family}`);

  return `https://fonts.googleapis.com/css2?${fontQueries.join("&")}&display=swap`;
}
