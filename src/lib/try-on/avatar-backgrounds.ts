import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The studio backdrop each avatar is rendered on, in the same order as the avatar styles. The
 * image itself is sent to Gemini as the second reference photo, with a prompt telling it to put the
 * person in front of exactly that backdrop. Describing a colour in words was unreliable: it came
 * back beige for magenta and near-white for sage green.
 *
 * Rendered by scripts/build-avatar-backgrounds.ts. Read with `readFileSync` like the agent skills,
 * so `outputFileTracingIncludes` in next.config.ts has to name them or a standalone build ships
 * without them.
 */
export const AVATAR_BACKGROUNDS = [
  { id: "magenta", name: "vivid magenta", file: "magenta.jpg" },
  { id: "sage", name: "sage green", file: "sage.jpg" },
  { id: "studio-grey", name: "warm grey photo-studio", file: "studio-grey.jpg" },
] as const;

export type AvatarBackground = (typeof AVATAR_BACKGROUNDS)[number];

const BACKGROUNDS_DIR = join(process.cwd(), "src", "lib", "try-on", "backgrounds");

const cache = new Map<string, Buffer>();

/** The backdrop's JPEG bytes. Read once per server process. */
export function loadAvatarBackground(background: AvatarBackground): Buffer {
  const cached = cache.get(background.file);
  if (cached) return cached;
  const bytes = readFileSync(join(BACKGROUNDS_DIR, background.file));
  cache.set(background.file, bytes);
  return bytes;
}
