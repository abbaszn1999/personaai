import { readFileSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";

/**
 * Reads the markdown that holds every instruction the wearable agents give a model.
 *
 * The prompts live in `<agent>/skills/*.md` rather than in TypeScript constants so the wording
 * can be read and tuned without touching the code that runs it. Only prose lives there: tool
 * schemas, response schemas and lookup tables stay in TypeScript, because YAML would cost them
 * their types and buy nothing.
 */

/**
 * Resolved from the working directory rather than `import.meta.url` because `next dev`,
 * `next build` and vitest all run from the repo root, and only the first of those keeps the
 * source layout intact on disk at runtime. The matching `outputFileTracingIncludes` entry in
 * `next.config.ts` is what gets these files into a standalone build.
 */
const AGENTS_ROOT = join(process.cwd(), "src", "lib", "agents", "wearable");

export interface SkillDoc {
  /** Matches the file's own basename. Enforced by `skills.test.ts`. */
  name: string;
  /** For persona's modes this is the line the router is given; elsewhere it is a summary. */
  description: string;
  /** Every `{{placeholder}}` the body may use. Enforced by `skills.test.ts`. */
  inputs: string[];
  /** The prompt itself. Empty for skills that carry only a description. */
  body: string;
}

/**
 * Only in production. In development a prompt edit should show up on the next turn without a
 * restart — that immediacy is most of the reason the prompts are files at all.
 */
const cache = process.env.NODE_ENV === "production" ? new Map<string, SkillDoc>() : null;

/**
 * Split out from `loadSkill` so the frontmatter and body rules are testable without disk I/O.
 *
 * Line endings are normalized first: on a Windows checkout these files are CRLF, and everything
 * downstream splits on `\n`, which leaves a stray carriage return on the end of every line of
 * every prompt — invisible in a log, and enough to make an exact-wording assertion fail against
 * a string that looks identical.
 */
export function parseSkill(raw: string): SkillDoc {
  const { data, content } = matter(raw.replace(/\r\n/g, "\n"));

  return {
    name: typeof data.name === "string" ? data.name : "",
    // trimEnd only: YAML literal blocks keep a trailing newline, but leading indentation inside
    // a description is deliberate (the router's mode list is indented on continuation lines).
    description: typeof data.description === "string" ? data.description.trimEnd() : "",
    inputs: Array.isArray(data.inputs) ? data.inputs.filter((entry): entry is string => typeof entry === "string") : [],
    body: content.trim(),
  };
}

/** @param relativePath e.g. `persona/skills/filter.md`, relative to the wearable agents root. */
export function loadSkill(relativePath: string): SkillDoc {
  const cached = cache?.get(relativePath);
  if (cached) return cached;

  const doc = parseSkill(readFileSync(join(AGENTS_ROOT, relativePath), "utf8"));
  cache?.set(relativePath, doc);
  return doc;
}

const PLACEHOLDER = /\{\{(\w+)\}\}/g;
/** A line whose entire content is one placeholder — the only kind that can vanish. */
const LONE_PLACEHOLDER = /^\s*\{\{(\w+)\}\}\s*$/;

/**
 * Substitutes `{{name}}` throughout, and drops any line that was nothing but a placeholder which
 * resolved to empty.
 *
 * That last rule is what reproduces the `.filter(Boolean)` the bundle prompt was built with: its
 * anchor and style-guide lines are absent entirely rather than blank when they don't apply.
 * Genuine blank lines in a body are left alone, because every other prompt uses them to separate
 * paragraphs.
 */
export function renderSkill(body: string, values: Record<string, string>): string {
  return body
    .split("\n")
    .filter((line) => {
      const lone = LONE_PLACEHOLDER.exec(line);
      return lone === null || (values[lone[1]] ?? "") !== "";
    })
    .map((line) => line.replace(PLACEHOLDER, (_, key: string) => values[key] ?? ""))
    .join("\n");
}
