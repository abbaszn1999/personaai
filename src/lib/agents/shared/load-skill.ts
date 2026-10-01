import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Resolved from the working directory because `next dev`, `next build` and vitest all run from
 * the repo root. `outputFileTracingIncludes` in `next.config.ts` ships the files in a standalone
 * build.
 */
const AGENTS_ROOT = join(process.cwd(), "src", "lib", "agents");

/** Production only: in development a prompt edit shows up on the next turn without a restart. */
const cache = process.env.NODE_ENV === "production" ? new Map<string, string>() : null;

/**
 * CRLF is normalized because a Windows checkout would otherwise produce different bytes than a
 * Linux deploy for the same file, and the cached prompt prefix must be byte-identical everywhere.
 */
export function normalizeSkillText(raw: string): string {
  return raw.replace(/\r\n/g, "\n").trim();
}

/** @param relativePath e.g. `persona/skills/general.md`, relative to `src/lib/agents`. */
export function loadSkill(relativePath: string): string {
  const cached = cache?.get(relativePath);
  if (cached !== undefined) return cached;
  const text = normalizeSkillText(readFileSync(join(AGENTS_ROOT, relativePath), "utf8"));
  cache?.set(relativePath, text);
  return text;
}

/**
 * Cuts a skill into its `## §N` sections so a call can be given only the sections it uses.
 * Text before the first section heading is returned under key `"0"`.
 */
export function sliceSections(text: string): Map<string, string> {
  const sections = new Map<string, string>();
  const pattern = /^## §(\d+)\b.*$/gm;
  const headings = [...text.matchAll(pattern)];
  const preamble = text.slice(0, headings[0]?.index ?? text.length).trim();
  if (preamble) sections.set("0", preamble);
  headings.forEach((heading, index) => {
    const start = heading.index ?? 0;
    const end = headings[index + 1]?.index ?? text.length;
    sections.set(heading[1], text.slice(start, end).trim());
  });
  return sections;
}

export function pickSections(text: string, numbers: readonly string[]): string {
  const sections = sliceSections(text);
  return numbers
    .map((number) => sections.get(number))
    .filter((section): section is string => Boolean(section))
    .join("\n\n");
}
