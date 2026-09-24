import { describe, expect, it } from "vitest";
import { allSeedCharts, CHART_SEEDS } from "./index";
import { boundsFor, chartHasBounds, chartLabelSystems, rowLabels } from "@/lib/sizing/chart-schema";
import { GIRTH_MEASUREMENTS, isSizingGroup, MEASUREMENT_KEYS, requiredMeasurementsFor, type SizingGroup } from "@/lib/sizing/measurements";
import { AUDIENCES, normalizeBrandKey } from "@/lib/sizing/keys";
import { rowsFromColumns } from "./types";
import { audienceForPersonaPath, sanitizeCoverage, variantTags } from "@/lib/sizing/variant-match";
import { PERSONA_CATEGORIES, PERSONA_DEPARTMENTS, leafKeysFor } from "@/modules/store/mapping/persona-taxonomy";

/**
 * The seed's acceptance test, and the bar the extraction prompt is aiming at.
 *
 * A seed is written by hand into a registry every merchant reads, which makes a silent transcription
 * error the worst failure mode in the sizing pipeline: it is plausible on screen, it survives review,
 * and it recommends a wrong size to every shopper of that brand. These assertions are the mechanical
 * half of catching that — the half a human re-reading a column of numbers is worst at.
 */
describe("chart seeds", () => {
  const charts = allSeedCharts();

  it("seeds at least one brand", () => {
    expect(charts.length).toBeGreaterThan(0);
  });

  it("keys every chart under the brand it is registered against", () => {
    for (const [brandKey, brandCharts] of Object.entries(CHART_SEEDS)) {
      expect(normalizeBrandKey(brandKey)).toBe(brandKey);
      for (const chart of brandCharts) expect(chart.brandKey).toBe(brandKey);
    }
  });

  it("uses only real sizing groups and audiences", () => {
    for (const chart of charts) {
      expect(isSizingGroup(chart.sizingCategory), `${chart.variantName}: ${chart.sizingCategory}`).toBe(true);
      expect(AUDIENCES).toContain(chart.audience);
    }
  });

  /**
   * The check a stored `region` column could not make. It claimed one scale per chart, so a shoe table
   * printing EU, UK and US was filed as `EU` and the two other columns went unmentioned — which is why
   * the column was dropped in favour of reading the rows. What matters now is that the aliases behind
   * that reading are populated consistently: a chart where only some rows carry a UK size will answer
   * "UK" for the whole table while silently failing to match the rows that lack it.
   */
  it("publishes each regional scale on every row or on none", () => {
    for (const chart of charts) {
      const systems = chartLabelSystems(chart.chartRows);
      for (const system of systems) {
        const withSystem = chart.chartRows.filter((row) => row.aliases?.[system]?.trim());
        expect(
          withSystem.length,
          `${chart.brandKey} ${chart.variantName}: ${system} on ${withSystem.length} of ${chart.chartRows.length} rows`
        ).toBe(chart.chartRows.length);
      }
    }
  });

  it("gives every chart a non-empty variant name, unique within its brand and group", () => {
    const seen = new Set<string>();
    for (const chart of charts) {
      expect(chart.variantName.trim()).not.toBe("");
      // The scoped/global unique indexes on sizing_charts are exactly this key, so a duplicate here
      // would silently drop a chart at load time rather than fail.
      const key = `${chart.brandKey}|${chart.sizingCategory}|${chart.variantName}`;
      expect(seen.has(key), `duplicate identity: ${key}`).toBe(false);
      seen.add(key);
    }
  });

  it("carries the measurement its group is useless without", () => {
    for (const chart of charts) {
      expect(
        chartHasBounds(chart.chartRows, chart.sizingCategory),
        `${chart.variantName} (${chart.sizingCategory}) has no required measurement`
      ).toBe(true);
    }
  });

  it("gives every row the required measurement, not just some rows", () => {
    // A chart that carries chest on nine of twelve rows passes chartHasBounds and then excludes the
    // three sizes at the extremes, which are the ones a borderline shopper needs.
    for (const chart of charts) {
      const required = requiredMeasurementsFor(chart.sizingCategory, chart.audience);
      for (const row of chart.chartRows) {
        for (const measurement of required) {
          expect(
            boundsFor(row, measurement),
            `${chart.variantName} row ${row.size} is missing ${measurement}`
          ).not.toBeNull();
        }
      }
    }
  });

  it("never publishes a girth as a single pinned number", () => {
    // A chest of exactly 94 matches a shopper measuring 94 and nobody else. Lengths are exempt:
    // brands genuinely publish one inseam per size. Charts flagged `sourcePublishesPointValues` are
    // exempt too, and the flag is the point — kidswear guides publish points as a rule, so the choice
    // is between recording that honestly or inventing widths, and this keeps the check strict for
    // every chart whose source did publish ranges.
    for (const chart of charts) {
      if (chart.sourcePublishesPointValues) continue;

      for (const row of chart.chartRows) {
        for (const measurement of MEASUREMENT_KEYS) {
          if (!GIRTH_MEASUREMENTS.has(measurement)) continue;
          const bounds = boundsFor(row, measurement);
          if (!bounds || bounds.min === null || bounds.max === null) continue;
          expect(
            bounds.min === bounds.max,
            `${chart.variantName} row ${row.size}: ${measurement} is pinned at ${bounds.min}`
          ).toBe(false);
        }
      }
    }
  });

  it("orders every bound min <= max", () => {
    for (const chart of charts) {
      for (const row of chart.chartRows) {
        for (const measurement of MEASUREMENT_KEYS) {
          const bounds = boundsFor(row, measurement);
          if (!bounds || bounds.min === null || bounds.max === null) continue;
          expect(
            bounds.min <= bounds.max,
            `${chart.variantName} row ${row.size}: ${measurement} is ${bounds.min}-${bounds.max}`
          ).toBe(true);
        }
      }
    }
  });

  it("increases the required measurement monotonically as size increases", () => {
    // The signature of a column-misaligned transcription: the numbers are all real and all from the
    // right table, but one size's range sits below the size before it. This is the check that caught
    // the swimsuit hip typo.
    //
    // Charts carrying `underbust` are exempt, and only those. A bra grid is two-dimensional — band
    // then cup — so chest genuinely resets when the band steps up (70F is a wider chest than 75A).
    // Asserting a single ordering over a 2-D grid flattened into rows would be asserting something
    // untrue about the garment, so the exemption is keyed on the measurement that proves the grid is
    // 2-D rather than on the variant's name.
    const isBandAndCup = (chart: (typeof charts)[number]) =>
      chart.chartRows.some((row) => boundsFor(row, "underbust") !== null);

    for (const chart of charts) {
      if (isBandAndCup(chart)) continue;

      for (const measurement of requiredMeasurementsFor(chart.sizingCategory, chart.audience)) {
        let previous: number | null = null;
        let previousSize = "";
        for (const row of chart.chartRows) {
          const bounds = boundsFor(row, measurement);
          if (!bounds?.min) continue;
          if (previous !== null) {
            expect(
              bounds.min >= previous,
              `${chart.variantName}: ${measurement} falls from ${previous} at ${previousSize} to ${bounds.min} at ${row.size}`
            ).toBe(true);
          }
          previous = bounds.min;
          previousSize = row.size;
        }
      }
    }
  });

  it("never gives two rows the same primary size label", () => {
    for (const chart of charts) {
      const sizes = chart.chartRows.map((row) => row.size);
      expect(new Set(sizes).size, `${chart.variantName} repeats a size label`).toBe(sizes.length);
    }
  });

  it("gives every row at least one label to match merchant stock against", () => {
    for (const chart of charts) {
      for (const row of chart.chartRows) {
        expect(rowLabels(row).length).toBeGreaterThan(0);
      }
    }
  });

  it("records a source url on every chart, so a re-verification knows where to look", () => {
    for (const chart of charts) {
      expect(chart.sourceUrl, chart.variantName).toMatch(/^https:\/\//);
      expect(chart.sourceTitle.trim(), chart.variantName).not.toBe("");
    }
  });

  /**
   * `covers_leaves` is what `chartsForLeaf` trusts absolutely — it is never re-derived from a
   * chart's name or fields, only read back. So a seed claiming a leaf outside its own audience or
   * sizing group would misassign real stock with nothing downstream positioned to catch it. This
   * re-runs every hand-transcribed chart through the exact gate the research pass and the manual
   * chart API are held to, rather than trusting a human transcriber to have applied the rule by eye.
   */
  it("claims no leaf outside its own audience and sizing group", () => {
    for (const chart of charts) {
      const sanitized = sanitizeCoverage(chart.coversLeaves, chart.audience, chart.sizingCategory as SizingGroup);
      expect(sanitized, `${chart.brandKey} ${chart.variantName}`).toEqual(chart.coversLeaves);
    }
  });

  /**
   * The invariant `chartsForLeaf`'s fit-class guard exists to not have to rely on: `Men Tailored
   * Long` and every table like it should carry no leaf in the first place, because a fit class
   * describes the shopper's own proportions, never the garment. This is checked at the data level so
   * a future seed cannot quietly depend on the guard instead of stating its coverage honestly.
   */
  it("never claims a leaf on a chart carrying a fit class", () => {
    for (const chart of charts) {
      if (chart.coversLeaves.length === 0) continue;
      const tags = variantTags(chart.variantName);
      expect(tags.fit, `${chart.brandKey} ${chart.variantName} is fit-tagged (${tags.fit.join(", ")}) but claims leaves`).toEqual([]);
    }
  });

  /**
   * More than two charts claiming one leaf has no known reason in this catalog — the one deliberate
   * double-claim (`kids-unisex:footwear:*`, an `Infant` table and a `Boys & Girls` table covering two
   * disjoint age bands, see `tommy-hilfiger-kids.ts`) is exactly two. A third claimant would not be
   * another legitimate age band, it would be a copy-paste mistake, so this stays a hard ceiling rather
   * than an unbounded allowance.
   */
  it("never lets more than two charts claim the same leaf", () => {
    const claimCounts = new Map<string, number>();
    for (const chart of charts) {
      for (const leaf of chart.coversLeaves) {
        claimCounts.set(leaf, (claimCounts.get(leaf) ?? 0) + 1);
      }
    }
    for (const [leaf, count] of claimCounts) {
      expect(count, `${leaf} is claimed by ${count} charts`).toBeLessThanOrEqual(2);
    }
  });
});

/**
 * The completeness check `persona-taxonomy.ts` describes but never had: for every department a
 * brand's seed touches at all, every leaf under it should be claimed by some chart unless it is on
 * this file's own allowlist. Without this, a brand seed can quietly ship a hole — see the girls
 * outerwear leaves, which sat uncovered for a release because nothing forced a diff against the full
 * taxonomy rather than against the previous seed.
 *
 * A department the brand's seed never touches at all (zero leaves claimed anywhere under it, e.g.
 * Tommy Hilfiger and `unisex`) is skipped rather than flagged: that is a whole department the brand
 * genuinely does not sell into, which is a different fact from a gap inside a department it does
 * sell into, and conflating the two would force either a fabricated unisex chart or a silenced test.
 *
 * Every entry below is a leaf a real, cited source does not publish — not a chart this file forgot
 * to write. Adding to this list without a reason next to it defeats the point of the test.
 */
const ALLOWED_GAPS: Record<string, string[]> = {
  tommy_hilfiger: [
    // No jumpsuit, thobe, overall or co-ord "set" heading anywhere on the men's size guide — the
    // brand simply does not sell these as full-body products for men.
    "men:full-body:jumpsuit",
    "men:full-body:thobe",
    "men:full-body:overall",
    "men:full-body:set",
    // Rompers, all-in-ones, sleepsuits and one-piece swimsuits are baby garments in this brand's own
    // range (see the Infant `dresses` chart); Tommy prints no such heading for boys or girls aged
    // 3-16, and boys' swimwear is trunks (already `bottom:swim-short`), not a one-piece.
    "kids-boys:full-body:romper",
    "kids-boys:full-body:all-in-one",
    "kids-boys:full-body:sleepsuit",
    "kids-boys:full-body:swimsuit",
    "kids-girls:full-body:romper",
    "kids-girls:full-body:all-in-one",
    "kids-girls:full-body:sleepsuit",
    // No infant-specific swimwear table in this guide.
    "kids-unisex:full-body:swimsuit",
    // Tommy's kids sock guide sizes by age band and US shoe size ("S: US 9-11, ages 4-7"), not by
    // foot length or an EU/UK/US shoe scale — the one measurement this schema's footwear group
    // tracks. Converting one to the other would be exactly the invented number this file's header
    // warns against, so the leaf stays unclaimed for boys, girls and kids-unisex alike.
    "kids-boys:footwear:sock",
    "kids-girls:footwear:sock",
    "kids-unisex:footwear:sock",
  ],
};

describe("seed coverage completeness", () => {
  it("claims every taxonomy leaf a brand's seed touches at all, or documents why not", () => {
    for (const [brandKey, brandCharts] of Object.entries(CHART_SEEDS)) {
      const claimed = new Set(brandCharts.flatMap((chart) => chart.coversLeaves));
      const allowed = new Set(ALLOWED_GAPS[brandKey] ?? []);

      for (const dept of PERSONA_DEPARTMENTS) {
        const deptAudience = audienceForPersonaPath(dept.id);
        for (const cat of PERSONA_CATEGORIES) {
          const leaves = leafKeysFor(dept.id, cat.id);
          // Skip a department this brand's seed never claims a single leaf under, in any category —
          // a whole department the brand does not sell into, not a gap inside one it does.
          const brandTouchesDept = brandCharts.some(
            (chart) => chart.audience === deptAudience || chart.coversLeaves.some((leaf) => leaf.startsWith(`${dept.id}:`))
          );
          if (!brandTouchesDept) continue;

          for (const leaf of leaves) {
            expect(
              claimed.has(leaf) || allowed.has(leaf),
              `${brandKey}: ${leaf} is claimed by no chart and is not on the allowlist`
            ).toBe(true);
          }
        }
      }

      // Every allowlisted leaf has to be a real gap, not a stale entry left behind once a chart was
      // added for it — otherwise the allowlist rots into a second place gaps hide.
      for (const leaf of allowed) {
        expect(claimed.has(leaf), `${brandKey}: ${leaf} is on the allowlist but is also claimed by a chart`).toBe(false);
      }
    }
  });
});

describe("rowsFromColumns", () => {
  it("transposes columns into rows", () => {
    const rows = rowsFromColumns({
      sizes: ["S", "M"],
      aliases: { uk: ["8", "10"] },
      bounds: {
        chest: [
          [84, 88],
          [88, 92],
        ],
      },
    });

    expect(rows).toEqual([
      { size: "S", aliases: { uk: "8" }, chest_min: 84, chest_max: 88 },
      { size: "M", aliases: { uk: "10" }, chest_min: 88, chest_max: 92 },
    ]);
  });

  it("omits a measurement where the source printed n/a", () => {
    const rows = rowsFromColumns({
      sizes: ["S", "M"],
      bounds: { chest: [[84, 88], null] },
    });

    expect(boundsFor(rows[0], "chest")).toEqual({ min: 84, max: 88 });
    expect(boundsFor(rows[1], "chest")).toBeNull();
  });

  it("keeps an open-ended bound open rather than dropping the row", () => {
    const rows = rowsFromColumns({ sizes: ["XXL"], bounds: { chest: [[120, null]] } });
    expect(boundsFor(rows[0], "chest")).toEqual({ min: 120, max: null });
  });

  it("refuses a column count that does not match the size count", () => {
    // The one mistake this helper exists to prevent, so it has to be loud rather than silently
    // producing a chart whose last size carries no bounds.
    expect(() => rowsFromColumns({ sizes: ["S", "M"], bounds: { chest: [[84, 88]] } })).toThrow(
      /1 values for 2 sizes/
    );
  });
});
