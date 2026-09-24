import { describe, expect, it } from "vitest";
import { chartLabelSystems, formatLabelSystems, parseSizeChartRow, rowLabels, type SizeChartRow } from "./chart-schema";

/**
 * These cover the replacement for a stored `region` column, so the cases are the ones that column got
 * wrong on real data: a footwear table filed as `EU` whose rows all carried UK and US sizes too, and a
 * `Men Big & Tall` table filed as `INTL` that published nothing but US sizes.
 */
describe("chartLabelSystems", () => {
  const shoeRows: SizeChartRow[] = [
    { size: "39", aliases: { eu: "39", uk: "6", us: "6.5" }, foot_length_min: 24.5, foot_length_max: 25 },
    { size: "40", aliases: { eu: "40", uk: "6.5", us: "7" }, foot_length_min: 25, foot_length_max: 25.5 },
  ];

  it("names every regional scale the rows carry, not just one", () => {
    expect(chartLabelSystems(shoeRows)).toEqual(["eu", "uk", "us"]);
    expect(formatLabelSystems(shoeRows)).toBe("EU · UK · US");
  });

  it("reports declaration order rather than the order the aliases happen to be written in", () => {
    const reversed: SizeChartRow[] = [{ size: "8", aliases: { us: "8", uk: "6", eu: "39" } }];
    expect(formatLabelSystems(reversed)).toBe("EU · UK · US");
  });

  it("excludes alpha, numeric, age, neck and waist_inseam, which describe a label rather than name a market", () => {
    const rows: SizeChartRow[] = [
      {
        size: "M",
        aliases: { alpha: "M", numeric: "32", age: "8-9y", neck: "39", waist_inseam: "3431" },
        chest_min: 96,
        chest_max: 104,
      },
    ];
    expect(chartLabelSystems(rows)).toEqual([]);
    // Empty rather than a placeholder: the source printed no regional scale, which the UI shows by
    // omitting the badge instead of claiming an unknown one.
    expect(formatLabelSystems(rows)).toBe("");
  });

  it("keeps age out of chartLabelSystems while still surfacing it to rowLabels", () => {
    // `age` used to be dumped into `alpha` on the kids seeds — "3M" is not an S/M/L label, and it
    // is not a claim about a market either, so it belongs on neither list `numeric` isn't on.
    const row: SizeChartRow = { size: "NB", aliases: { age: "NB", eu: "44" } };
    expect(chartLabelSystems([row])).toEqual(["eu"]);
    expect(rowLabels(row)).toEqual(["NB", "44"]);
  });

  it("still surfaces numeric to rowLabels even though it is not a regional scale", () => {
    // `numeric` is a market-neutral scale (a denim inch waist, a dress size) split out from
    // eu/us specifically so it never has to masquerade as one of them — it must still be
    // matchable, just not badged as a region.
    const row: SizeChartRow = { size: "M", aliases: { alpha: "M", numeric: "32" } };
    expect(rowLabels(row)).toEqual(["M", "32"]);
    expect(chartLabelSystems([row])).toEqual([]);
  });

  it("no longer recognises fr/it/de/jp as alias keys", () => {
    // A row arriving from stale stored jsonb (written before these keys were dropped) or from a
    // model that ignores the enum must have the foreign keys silently discarded, the same
    // leniency parseSizeChartRow already applies to any other unknown key.
    const parsed = parseSizeChartRow(
      { size: "M", aliases: { eu: "38", fr: "40", it: "44", de: "38", jp: "9" }, chest_min: 96, chest_max: 104 },
      "tops"
    );
    expect(parsed?.aliases).toEqual({ eu: "38" });
  });

  it("ignores blank and missing alias values so a half-filled key is not advertised", () => {
    const rows: SizeChartRow[] = [
      { size: "39", aliases: { eu: "39", uk: "   ", us: "" } },
      { size: "40", aliases: { eu: "40" } },
      { size: "41" },
    ];
    expect(chartLabelSystems(rows)).toEqual(["eu"]);
  });

  it("answers US-only for a US-only table, which is what `INTL` hid", () => {
    const bigAndTall: SizeChartRow[] = [
      { size: "1XL", aliases: { us: "1XL" }, chest_min: 117, chest_max: 122 },
      { size: "2XL", aliases: { us: "2XL" }, chest_min: 122, chest_max: 127 },
    ];
    expect(formatLabelSystems(bigAndTall)).toBe("US");
  });

  it("agrees with rowLabels about which labels exist, since both read the same aliases", () => {
    for (const system of chartLabelSystems(shoeRows)) {
      const label = shoeRows[0].aliases?.[system];
      expect(rowLabels(shoeRows[0])).toContain(label);
    }
  });
});
