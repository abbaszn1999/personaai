import { describe, expect, it } from "vitest";
import { composePrefix, followUpPrefix, planPrefix } from "./bundle/prompt";
import { loadSkill, normalizeSkillText, pickSections, sliceSections } from "./shared/load-skill";

const SKILLS = [
  "persona/skills/general.md",
  "persona/skills/ask.md",
  "persona/skills/cosine.md",
  "persona/skills/filter.md",
  "bundle/skills/general.md",
  "bundle/skills/bundle.md",
  "attribute/skills/attribute.md",
];

describe("skill files", () => {
  it.each(SKILLS)("%s loads with content and no CRLF", (path) => {
    const text = loadSkill(path);
    expect(text.length).toBeGreaterThan(500);
    expect(text).not.toContain("\r");
  });

  it("filter.md ends with the path config heading code appends the config under", () => {
    expect(loadSkill("persona/skills/filter.md")).toMatch(/## PATH CONFIG[^\n]*$/);
  });

  it("bundle.md slices into §1 to §6", () => {
    const sections = sliceSections(loadSkill("bundle/skills/bundle.md"));
    for (const number of ["1", "2", "3", "4", "5", "6"]) {
      expect(sections.get(number), `§${number}`).toMatch(new RegExp(`^## §${number}\\b`));
    }
  });

  it("each bundle stage gets only its own sections", () => {
    expect(planPrefix()).toContain("## §4");
    expect(planPrefix()).not.toContain("## §5");
    expect(composePrefix()).toContain("## §5");
    expect(composePrefix()).not.toMatch(/## §[1-46]\b/);
    expect(followUpPrefix()).toContain("## §6");
    expect(followUpPrefix()).not.toMatch(/## §[1-5]\b/);
  });
});

describe("load-skill helpers", () => {
  it("normalizes line endings and trims", () => {
    expect(normalizeSkillText("\r\n# A\r\nb\r\n\r\n")).toBe("# A\nb");
  });

  it("keeps the preamble under key 0 and picks sections in order", () => {
    const text = "intro\n## §1 One\na\n## §2 Two\nb";
    expect(sliceSections(text).get("0")).toBe("intro");
    expect(pickSections(text, ["2", "1", "9"])).toBe("## §2 Two\nb\n\n## §1 One\na");
  });
});
