export const AVATAR_GENERATION_STAGES = [
  { label: "Analyzing your face photo", progress: 18 },
  { label: "Mapping body measurements", progress: 42 },
  { label: "Building your body model", progress: 68 },
  { label: "Generating avatar variations", progress: 88 },
  { label: "Almost ready…", progress: 100 },
] as const;

/** Default standing mannequin — used only as an image-error fallback when a real avatar URL fails.
 *  `let`, not `const`: `setWearableAssetOrigin` below rewrites it in place for widget.js, and every
 *  consumer reads the live ES module binding rather than a snapshotted copy. */
export let DEFAULT_MANNEQUIN_IMAGE = "/avatars/avatar-studio-male-1.png";

/** The 4 fixed studio backdrop plates — same photos paired 1:1 with the generated avatar
 *  styles (see persona-agent backdropPathForIndex), offered here as swappable choices. */
/** Saved profiles still point at the old PNG plates. The files are WebP now. */
export function studioPlateUrl(url: string): string {
  return url.replace(/\/avatars\/backgrounds\/backdrop-(\d)\.png\b/, "/avatars/backgrounds/backdrop-$1.webp");
}

export const STUDIO_BACKDROPS: { id: string; label: string; url: string }[] = [
  { id: "backdrop-1", label: "Arched Studio", url: "/avatars/backgrounds/backdrop-1.webp" },
  { id: "backdrop-2", label: "Loft Studio", url: "/avatars/backgrounds/backdrop-2.webp" },
  { id: "backdrop-3", label: "Runway Studio", url: "/avatars/backgrounds/backdrop-3.webp" },
  { id: "backdrop-4", label: "White Studio", url: "/avatars/backgrounds/backdrop-4.webp" },
];

/** Called once by widget.js's bootstrap when running inside a merchant's page via Shadow
 *  DOM, where these root-relative `/avatars/...` paths would otherwise resolve against the
 *  host page's origin instead of ours. No-op for the dashboard and the same-origin
 *  `/embed/[token]` page, where relative paths already resolve correctly. */
export function setWearableAssetOrigin(origin: string): void {
  if (!origin) return;
  DEFAULT_MANNEQUIN_IMAGE = `${origin}${DEFAULT_MANNEQUIN_IMAGE}`;
  for (const bg of STUDIO_BACKDROPS) {
    bg.url = `${origin}${bg.url}`;
  }
}
