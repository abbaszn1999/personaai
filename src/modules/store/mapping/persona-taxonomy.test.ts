import { describe, expect, it } from "vitest";
import { mappedPersonaLeaves } from "./persona-taxonomy";
import type { PersonaCategoryMap } from "./persona-taxonomy";

describe("mappedPersonaLeaves", () => {
  it("returns one leaf per mapping that has a department, category, and subcategory", () => {
    const map: PersonaCategoryMap = {
      "1": { status: "mapped", departmentId: "women", categoryId: "bottom", subCategory: "jean" },
      "2": { status: "mapped", departmentId: "women", categoryId: "bottom", subCategory: "trouser" },
    };
    expect(mappedPersonaLeaves(map)).toEqual(
      expect.arrayContaining(["women:bottom:jean", "women:bottom:trouser"])
    );
    expect(mappedPersonaLeaves(map)).toHaveLength(2);
  });

  it("uses the configured merchandise scope as the authoritative leaf set", () => {
    const map: PersonaCategoryMap = {
      "1": { status: "mapped", departmentId: "women", categoryId: "top", subCategory: "swim-top" },
    };

    expect(
      mappedPersonaLeaves(map, {
        configured: true,
        enabledDeptIds: ["women"],
        enabledLeafKeys: ["women:top:shirt", "women:top:sweatshirt"],
        customLeaves: [],
        customCategories: [],
      })
    ).toEqual(["women:top:shirt", "women:top:sweatshirt"]);
  });

  it("drops a mapping stuck at category-level — no subcategory chosen yet", () => {
    // The real gap this exists to model: a classifier or merchant maps a store category down to
    // department + category ("persona > women > top") but never picks the leaf underneath it. There
    // is no leaf to name until that happens, same as `covers_leaves` matching treats it elsewhere.
    const map: PersonaCategoryMap = {
      "1": { status: "mapped", departmentId: "women", categoryId: "top" },
    };
    expect(mappedPersonaLeaves(map)).toEqual([]);
  });

  it("drops excluded mappings", () => {
    const map: PersonaCategoryMap = {
      "1": { status: "excluded", excludeReason: "Accessory" },
    };
    expect(mappedPersonaLeaves(map)).toEqual([]);
  });

  it("dedupes several store categories mapping to the same leaf", () => {
    const map: PersonaCategoryMap = {
      "1": { status: "mapped", departmentId: "women", categoryId: "bottom", subCategory: "jean" },
      "2": { status: "mapped", departmentId: "women", categoryId: "bottom", subCategory: "jean" },
    };
    expect(mappedPersonaLeaves(map)).toEqual(["women:bottom:jean"]);
  });

  it("tolerates a missing map", () => {
    expect(mappedPersonaLeaves(undefined)).toEqual([]);
    expect(mappedPersonaLeaves(null)).toEqual([]);
  });
});
