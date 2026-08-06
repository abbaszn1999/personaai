/** Curated list of widely-used Google Fonts offered in the branding font picker, covering
 *  sans, serif, display, and monospace styles. Not the full Google Fonts catalog (1000+
 *  families) — a static, always-available "search & pick" set that doesn't depend on a
 *  Google Fonts API key. Kept in one place so the branding editor, the standalone embed page,
 *  and widget.js all agree on the exact same list + loading behavior. */
export const GOOGLE_FONT_FAMILIES = [
  "Inter",
  "Roboto",
  "Open Sans",
  "Poppins",
  "Lato",
  "Montserrat",
  "Nunito",
  "Nunito Sans",
  "Work Sans",
  "DM Sans",
  "Manrope",
  "Rubik",
  "Karla",
  "Mulish",
  "Sora",
  "Outfit",
  "Space Grotesk",
  "Plus Jakarta Sans",
  "Urbanist",
  "Figtree",
  "Jost",
  "Barlow",
  "Heebo",
  "Raleway",
  "Quicksand",
  "Kanit",
  "Cabin",
  "Assistant",
  "Hind",
  "Josefin Sans",
  "Titillium Web",
  "IBM Plex Sans",
  "Source Sans 3",
  "Noto Sans",
  "PT Sans",
  "Archivo",
  "Lexend",
  "Red Hat Display",
  "Bricolage Grotesque",
  "Onest",
  // Serif
  "Playfair Display",
  "Merriweather",
  "Lora",
  "PT Serif",
  "Source Serif 4",
  "Noto Serif",
  "Cormorant Garamond",
  "Crimson Text",
  "Libre Baskerville",
  "EB Garamond",
  "Bitter",
  "Domine",
  "Spectral",
  // Display / headline
  "Bebas Neue",
  "Oswald",
  "Anton",
  "Abril Fatface",
  "Righteous",
  "Pacifico",
  "Caveat",
  "Comfortaa",
  "Fredoka",
  "Baloo 2",
  "Unbounded",
  "Syne",
  "Clash Display",
  // Monospace
  "JetBrains Mono",
  "Space Mono",
  "IBM Plex Mono",
  "Fira Code",
  "Roboto Mono",
  "Source Code Pro",
] as const;

export type GoogleFontFamily = (typeof GOOGLE_FONT_FAMILIES)[number];

/** Not an actual webfont — resolves to whatever the visitor's OS/browser considers its
 *  default UI font. Always offered first in the picker. */
export const SYSTEM_FONT_VALUE = "system-ui";

export const FONT_PICKER_OPTIONS = [SYSTEM_FONT_VALUE, ...GOOGLE_FONT_FAMILIES];

const loadedFonts = new Set<string>();

/** Idempotently injects a Google Fonts `<link>` for the given family into `document.head` so
 *  the font is available to `font-family` anywhere on the page — including inside a Shadow
 *  DOM (widget.js), since `@font-face`-registered fonts are a page-global browser resource,
 *  not scoped to whichever stylesheet declared them. No-op for the "system-ui" pseudo-font
 *  or during SSR (no `document`). Safe to call on every branding load/change. */
export function loadGoogleFont(fontFamily: string): void {
  if (typeof document === "undefined") return;
  if (!fontFamily || fontFamily === SYSTEM_FONT_VALUE) return;
  if (loadedFonts.has(fontFamily)) return;

  const href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontFamily).replace(/%20/g, "+")}:wght@400;500;600;700;800&display=swap`;
  const existing = document.head.querySelector<HTMLLinkElement>(`link[data-google-font="${fontFamily}"]`);
  if (existing) {
    loadedFonts.add(fontFamily);
    return;
  }

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.setAttribute("data-google-font", fontFamily);
  document.head.appendChild(link);
  loadedFonts.add(fontFamily);
}

/** CSS `font-family` value for a picker selection — quotes multi-word family names and adds a
 *  sensible generic fallback so text never fully disappears while the webfont is loading. */
export function fontFamilyCssValue(fontFamily: string): string {
  if (!fontFamily || fontFamily === SYSTEM_FONT_VALUE) {
    return "system-ui, -apple-system, sans-serif";
  }
  const quoted = fontFamily.includes(" ") ? `"${fontFamily}"` : fontFamily;
  return `${quoted}, system-ui, sans-serif`;
}
