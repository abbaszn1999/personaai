import type * as React from "react";

const DEFAULT_PRIMARY = "#f76d01";

/** Parses #RGB or #RRGGBB into channels; null for anything else (named colors, rgb(), junk). */
function parseHex(color: string): { r: number; g: number; b: number } | null {
  const hex = color.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(hex)) {
    return {
      r: parseInt(hex[0] + hex[0], 16),
      g: parseInt(hex[1] + hex[1], 16),
      b: parseInt(hex[2] + hex[2], 16),
    };
  }
  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
    };
  }
  return null;
}

function darken({ r, g, b }: { r: number; g: number; b: number }, factor: number): string {
  const scale = (c: number) => Math.max(0, Math.min(255, Math.round(c * factor)));
  return `rgb(${scale(r)},${scale(g)},${scale(b)})`;
}

/** Picks the higher-contrast text color for a merchant-selected brand background. */
function contrastText({ r, g, b }: { r: number; g: number; b: number }): string {
  const linearize = (channel: number) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
  return luminance > 0.179 ? "#17121d" : "#ffffff";
}

/**
 * Expands one merchant-chosen primary color into the full set of CSS custom properties the
 * wearable-agent components reference — brand, the (originally purple) "wearable"/"accent"
 * identity, gradient stops, light tints, and the glow shadow. Spread onto the embed mount
 * root's inline `style`, it cascades only to the widget subtree, so the dashboard's own
 * chrome keeps the app's default palette.
 *
 * Alphas match the existing `.dark` overrides in src/styles/globals.css (0.14 brand-light,
 * 0.20 accent-light) so tint intensity stays consistent with the stock look.
 */
export function resolveBrandCssVars(primaryColor: string): React.CSSProperties {
  const rgb = parseHex(primaryColor) ?? parseHex(DEFAULT_PRIMARY)!;
  const primary = parseHex(primaryColor) ? primaryColor : DEFAULT_PRIMARY;
  const { r, g, b } = rgb;
  const darker = darken(rgb, 0.72);

  return {
    "--color-brand": primary,
    "--color-brand-from": primary,
    "--color-brand-to": darker,
    "--color-brand-strong": darker,
    "--color-brand-contrast": contrastText(rgb),
    "--color-brand-light": `rgba(${r},${g},${b},0.14)`,
    "--color-wearable-from": primary,
    "--color-wearable-to": darker,
    "--color-accent": primary,
    "--color-accent-from": primary,
    "--color-accent-to": darker,
    "--color-accent-light": `rgba(${r},${g},${b},0.20)`,
    "--color-unwearable-from": primary,
    "--color-unwearable-to": darker,
    "--shadow-glow": `0 8px 24px -6px rgba(${r},${g},${b},0.45), 0 2px 8px -2px rgba(${r},${g},${b},0.30)`,
  } as React.CSSProperties;
}
