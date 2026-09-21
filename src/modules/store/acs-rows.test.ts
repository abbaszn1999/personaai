import { describe, expect, it } from "vitest";
import { EMPTY_ACS_MAPPING } from "@/lib/catalog/acs-mapping";
import { buildAcsRows } from "./acs-rows";

describe("buildAcsRows", () => {
  it("marks only the categories row as Persona-sourced", () => {
    const rows = buildAcsRows(EMPTY_ACS_MAPPING, []);

    const categories = rows.find((row) => row.key === "categories");
    expect(categories?.personaSourced).toBe(true);

    const others = rows.filter((row) => row.key !== "categories");
    expect(others.every((row) => row.personaSourced === false)).toBe(true);
  });

  it("still marks categories required, since ACS rejects a product with an empty categories array", () => {
    const rows = buildAcsRows(EMPTY_ACS_MAPPING, []);
    const categories = rows.find((row) => row.key === "categories");

    expect(categories?.required).toBe(true);
  });

  it("does not expose the retired per-product size-chart mapping", () => {
    const rows = buildAcsRows(EMPTY_ACS_MAPPING, []);

    expect(rows.some((row) => row.key === "sizeChartData")).toBe(false);
  });
});
