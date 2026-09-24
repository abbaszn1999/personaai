import type { WearableBrandingInput } from "@/modules/wearable-agent/branding-context";
import type { WorkspaceBranding, WorkspaceDisplayMode, WorkspaceTheme } from "./types";

export const BRANDING_LIMITS = {
  agentName: 40,
  welcomeMessage: 280,
  statusText: 60,
  inputPlaceholder: 60,
  signInMessage: 140,
  launcherLabel: 24,
  quickReply: 40,
  quickReplies: 4,
} as const;

/** Square keeps right angles. Rounded is the standard look. Anything else is a custom px value. */
export const RADIUS_SQUARE = "0px";
export const RADIUS_ROUNDED = "16px";
export const RADIUS_MIN = 0;
export const RADIUS_MAX = 80;

/** Accepts `12px` inside the allowed range. Anything else is dropped. */
export function sanitizeBorderRadius(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const match = /^(\d{1,3})px$/.exec(value.trim());
  if (!match) return undefined;
  const px = Number(match[1]);
  if (px < RADIUS_MIN || px > RADIUS_MAX) return undefined;
  return `${px}px`;
}
const STUDIO_BACKDROP_IDS = new Set(["backdrop-1", "backdrop-2", "backdrop-3", "backdrop-4"]);
const THEMES = new Set<WorkspaceTheme>(["dark", "light"]);
const DISPLAY_MODES = new Set<WorkspaceDisplayMode>(["floating", "fullpage"]);
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const MAX_LOGO_CHARS = 3_000_000;

type TextKey = "agentName" | "welcomeMessage" | "statusText" | "inputPlaceholder" | "signInMessage" | "launcherLabel";
const TEXT_KEYS: TextKey[] = ["agentName", "welcomeMessage", "statusText", "inputPlaceholder", "signInMessage", "launcherLabel"];
/** Blank is never a valid value for these — the widget would render an empty header or button. */
const REQUIRED_TEXT = new Set<TextKey>(["agentName", "launcherLabel"]);

export function normalizeQuickReplies(value: unknown): string[] | null | undefined {
  if (value === null) return null;
  if (!Array.isArray(value)) return undefined;
  const seen = new Set<string>();
  const replies: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const text = item.trim().slice(0, BRANDING_LIMITS.quickReply);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    replies.push(text);
    if (replies.length === BRANDING_LIMITS.quickReplies) break;
  }
  return replies;
}

/**
 * Keeps only well-formed branding fields from an untrusted PATCH body. Invalid values are
 * dropped rather than rejected so one bad field never blocks saving the rest.
 */
export function sanitizeBrandingPatch(input: unknown): Partial<WorkspaceBranding> {
  if (!input || typeof input !== "object") return {};
  const raw = input as Record<string, unknown>;
  const out: Partial<WorkspaceBranding> = {};

  for (const key of TEXT_KEYS) {
    const value = raw[key];
    if (typeof value !== "string") continue;
    const text = value.trim().slice(0, BRANDING_LIMITS[key]);
    if (!text && REQUIRED_TEXT.has(key)) continue;
    out[key] = text;
  }

  if (typeof raw.primaryColor === "string" && HEX_COLOR.test(raw.primaryColor)) {
    out.primaryColor = raw.primaryColor.toLowerCase();
  }
  if (typeof raw.fontFamily === "string" && raw.fontFamily.trim()) {
    out.fontFamily = raw.fontFamily.trim().slice(0, 60);
  }
  const borderRadius = sanitizeBorderRadius(raw.borderRadius);
  if (borderRadius) out.borderRadius = borderRadius;
  if (typeof raw.theme === "string" && THEMES.has(raw.theme as WorkspaceTheme)) {
    out.theme = raw.theme as WorkspaceTheme;
  }
  if (typeof raw.displayMode === "string" && DISPLAY_MODES.has(raw.displayMode as WorkspaceDisplayMode)) {
    out.displayMode = raw.displayMode as WorkspaceDisplayMode;
  }
  if (typeof raw.position === "string" && raw.position.trim()) {
    out.position = raw.position.trim().slice(0, 30);
  }
  if (typeof raw.liveTryOnEnabled === "boolean") {
    out.liveTryOnEnabled = raw.liveTryOnEnabled;
  }
  if (typeof raw.studioBackdropId === "string" && STUDIO_BACKDROP_IDS.has(raw.studioBackdropId)) {
    out.studioBackdropId = raw.studioBackdropId;
  }
  if (raw.logoUrl === null) {
    out.logoUrl = null;
  } else if (
    typeof raw.logoUrl === "string" &&
    raw.logoUrl.length <= MAX_LOGO_CHARS &&
    /^(https:\/\/|data:image\/(png|jpeg|jpg|webp|svg\+xml);base64,)/.test(raw.logoUrl)
  ) {
    out.logoUrl = raw.logoUrl;
  }

  const quickReplies = normalizeQuickReplies(raw.quickReplies);
  if (quickReplies !== undefined) out.quickReplies = quickReplies;

  return out;
}

/** The subset of saved branding the shopper-facing widget renders. */
export function toWearableBranding(
  branding: WorkspaceBranding
): WearableBrandingInput & { welcomeMessage: string; borderRadius: string } {
  return {
    agentName: branding.agentName,
    welcomeMessage: branding.welcomeMessage,
    logoUrl: branding.logoUrl,
    borderRadius: branding.borderRadius,
    liveTryOnEnabled: branding.liveTryOnEnabled,
    studioBackdropId: branding.studioBackdropId,
    statusText: branding.statusText,
    inputPlaceholder: branding.inputPlaceholder,
    quickReplies: branding.quickReplies,
    signInMessage: branding.signInMessage,
    launcherLabel: branding.launcherLabel,
  };
}
