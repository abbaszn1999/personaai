import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ALL_PERSONA_LEAF_KEYS,
  LEAF_MERGES_V4,
  PERSONA_TAXONOMY_VERSION,
  absorbedSubCategories,
  canonicalLeafKey,
  formatLeafLabel,
  leafLabel,
  mappedPersonaLeaves,
} from "./persona-taxonomy";
import type { PersonaCategoryMap } from "./persona-taxonomy";
import { NON_OUTFIT_LEAVES } from "@/lib/agents/bundle/slots";

describe("taxonomy v4", () => {
  const leafSet = new Set(ALL_PERSONA_LEAF_KEYS);

  it("has exactly 155 leaves with no duplicates", () => {
    expect(PERSONA_TAXONOMY_VERSION).toBe(4);
    expect(ALL_PERSONA_LEAF_KEYS).toHaveLength(155);
    expect(leafSet.size).toBe(155);
  });

  it("folds every removed leaf into a leaf that exists, and keeps no removed leaf", () => {
    for (const [removed, survivor] of Object.entries(LEAF_MERGES_V4)) {
      expect(leafSet.has(removed), `${removed} must be gone`).toBe(false);
      expect(leafSet.has(survivor), `${survivor} must exist`).toBe(true);
      expect(survivor.split(":").slice(0, 2)).toEqual(removed.split(":").slice(0, 2));
    }
  });

  it("never chains a merge: a survivor is never itself folded away", () => {
    for (const survivor of Object.values(LEAF_MERGES_V4)) {
      expect(LEAF_MERGES_V4[survivor]).toBeUndefined();
    }
  });

  it("leaves every current leaf untouched and converts a removed one", () => {
    for (const leaf of ALL_PERSONA_LEAF_KEYS) expect(canonicalLeafKey(leaf)).toBe(leaf);
    expect(canonicalLeafKey("women:top:blouse")).toBe("women:top:shirt");
    expect(canonicalLeafKey("men:bottom:chino")).toBe("men:bottom:trouser");
    expect(canonicalLeafKey("kids-girls:bottom:jean")).toBe("kids-girls:bottom:trouser");
    expect(canonicalLeafKey("custom:custom:thing")).toBe("custom:custom:thing");
  });

  it("keeps adult jeans a leaf of their own and folds only the kids' jeans", () => {
    expect(leafSet.has("women:bottom:jean")).toBe(true);
    expect(leafSet.has("men:bottom:jean")).toBe(true);
    expect(leafSet.has("unisex:bottom:jean")).toBe(true);
    expect(leafSet.has("kids-boys:bottom:jean")).toBe(false);
    expect(absorbedSubCategories("kids-boys:bottom:trouser")).toContain("jean");
  });

  it("gives every leaf a readable label", () => {
    for (const leaf of ALL_PERSONA_LEAF_KEYS) {
      const [dept, , sub] = leaf.split(":");
      expect(leafLabel(leaf).length).toBeGreaterThan(0);
      expect(formatLeafLabel(sub, dept).length).toBeGreaterThan(0);
    }
    expect(formatLeafLabel("shirt", "women")).toBe("Shirts & Blouses");
  });

  it("keeps every outfit-exclusion leaf a real leaf in at least one department", () => {
    const subs = new Set(ALL_PERSONA_LEAF_KEYS.map((leaf) => leaf.split(":")[2]));
    for (const sub of NON_OUTFIT_LEAVES) expect(subs.has(sub), `${sub} is not a leaf`).toBe(true);
  });

  it("is mirrored exactly by the SQL migration that converts stored chart coverage", () => {
    const sql = readFileSync(
      join(process.cwd(), "supabase/migrations/20261007200000_persona_taxonomy_v4.sql"),
      "utf8",
    );
    const statements = sql.split(/\bwith merges\b/).slice(1);
    expect(statements).toHaveLength(2);
    expect(sql).toContain("public.sizing_charts as target");
    expect(sql).toContain("public.sizing_charts_private as target");

    const expected = Object.entries(LEAF_MERGES_V4).map(([from, to]) => `${from}>${to}`).sort();
    for (const statement of statements) {
      const pairs = [...statement.matchAll(/\('([a-z:-]+)', '([a-z:-]+)'\)/g)]
        .map((match) => `${match[1]}>${match[2]}`)
        .sort();
      expect(pairs).toEqual(expected);
    }
  });
});

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
        enabledLeafKeys: ["women:top:shirt", "women:top:hoodie"],
        customLeaves: [],
        customCategories: [],
      })
    ).toEqual(["women:top:shirt", "women:top:hoodie"]);
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
