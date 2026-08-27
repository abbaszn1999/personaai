import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RETRIEVAL_MODES } from "@/lib/retrieval/types";
import { parseSkill } from "./load-skill";
import { skillDoc } from "./persona/registry";

/**
 * The safety net for putting prompts in markdown.
 *
 * Moving them out of TypeScript costs the compiler's help: a renamed file, a description that
 * quietly became empty, or a `{{placeholder}}` that no longer matches what the caller passes are
 * all runtime bugs now, and the kind that surface as a subtly worse model response rather than a
 * crash. This walks every skill file in every agent and checks the things the compiler used to.
 */

const AGENTS_ROOT = join(process.cwd(), "src", "lib", "agents", "wearable");

function everySkillFile(): string[] {
  return readdirSync(AGENTS_ROOT, { recursive: true, encoding: "utf8" })
    .map((entry) => entry.replaceAll("\\", "/"))
    .filter((entry) => entry.endsWith(".md"))
    .sort();
}

const files = everySkillFile();

describe("the skills markdown", () => {
  it("finds skill files at all", () => {
    // Guards the walk itself: a broken glob would make every `it.each` below vacuously pass.
    expect(files.length).toBeGreaterThan(0);
  });

  it("keeps every skill file inside a skills/ directory", () => {
    // `skills/` is the whole point — one directory per agent holding everything a model is told,
    // with no code in the way and nothing instructional hiding elsewhere in the tree.
    expect(files.filter((file) => !file.includes("skills/"))).toEqual([]);
  });

  describe.each(files)("%s", (file) => {
    const doc = parseSkill(readFileSync(join(AGENTS_ROOT, file), "utf8"));

    it("declares a name matching its filename", () => {
      expect(doc.name).toBe(file.split("/").pop()!.replace(/\.md$/, ""));
    });

    it("declares a description", () => {
      // For persona's modes this is the line the router picks from. An empty one means the
      // router is offered a blank bullet and effectively stops choosing that mode.
      expect(doc.description.length).toBeGreaterThan(0);
    });

    it("declares every placeholder its body uses", () => {
      const used = new Set([...doc.body.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1]));
      expect([...used].filter((name) => !doc.inputs.includes(name))).toEqual([]);
    });

    it("uses every input it declares", () => {
      // A stale entry here is how a renamed placeholder goes unnoticed: the body silently keeps
      // the old spelling and renders it as an empty string.
      expect(doc.inputs.filter((name) => !doc.body.includes(`{{${name}}}`))).toEqual([]);
    });
  });
});

describe("persona's mode coverage", () => {
  it.each(RETRIEVAL_MODES)("resolves a skill file for %s", (mode) => {
    // `SKILL_FILES` maps snake_case modes onto kebab-case filenames by hand, and `ask_info` maps
    // to `ask.md`. A typo there throws here rather than on a live turn.
    expect(() => skillDoc(mode)).not.toThrow();
    expect(skillDoc(mode).description.length).toBeGreaterThan(0);
  });
});
