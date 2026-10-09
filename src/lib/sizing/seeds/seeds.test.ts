import { describe, expect, it } from "vitest";
import { allSeedCharts, CHART_SEEDS, GLOBAL_BRAND_MANIFESTS } from "./index";
import {
  allowedAliasKeys,
  aliasLabels,
  boundsFor,
  chartHasDecidingBounds,
  chartLabelSystems,
  rowLabels,
  type SizeAliasKey,
} from "@/lib/sizing/chart-schema";
import {
  GIRTH_MEASUREMENTS,
  isSizingGroup,
  MEASUREMENT_KEYS,
  measurementsFor,
  requiredMeasurementsFor,
  type SizingGroup,
} from "@/lib/sizing/measurements";
import { AUDIENCES, normalizeBrandKey } from "@/lib/sizing/keys";
import { rowsFromColumns } from "./types";
import { decidingMeasurementsFor, validateManifestParity } from "./manifest";
import { sanitizeCoverage, variantTags } from "@/lib/sizing/variant-match";
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
        const withSystem = chart.chartRows.filter(
          (row) => aliasLabels(row.aliases?.[system]).length > 0,
        );
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
        chartHasDecidingBounds(chart.chartRows, decidingMeasurementsFor(chart)),
        `${chart.variantName} (${chart.sizingCategory}) has no required measurement`
      ).toBe(true);
    }
  });

  it("gives every row the required measurement, not just some rows", () => {
    // A chart that carries chest on nine of twelve rows passes chartHasBounds and then excludes the
    // three sizes at the extremes, which are the ones a borderline shopper needs.
    for (const chart of charts) {
      const required = decidingMeasurementsFor(chart);
      for (const row of chart.chartRows) {
        expect(
          required.some((measurement) => boundsFor(row, measurement) !== null),
          `${chart.variantName} row ${row.size} is missing every chart-deciding measurement`,
        ).toBe(true);
      }
    }
  });

  it("publishes only the fixed measurements for its audience and category", () => {
    for (const chart of charts) {
      const allowed = new Set([
        ...measurementsFor(chart.sizingCategory, chart.audience),
        ...decidingMeasurementsFor(chart),
      ]);
      for (const row of chart.chartRows) {
        const present = MEASUREMENT_KEYS.filter(
          (measurement) => `${measurement}_min` in row || `${measurement}_max` in row
        );
        expect(
          present.every((measurement) => allowed.has(measurement)),
          `${chart.brandKey} ${chart.variantName} (${chart.audience}/${chart.sizingCategory}) has ${present.join(", ")}`
        ).toBe(true);
      }
    }
  });

  it("uses aliases only in their allowed audience and category", () => {
    for (const chart of charts) {
      const allowedAliases = new Set(allowedAliasKeys(chart.sizingCategory, chart.audience));
      for (const row of chart.chartRows) {
        for (const alias of Object.keys(row.aliases ?? {})) {
          expect(
            allowedAliases.has(alias as SizeAliasKey),
            `${chart.brandKey} ${chart.variantName} (${chart.audience}/${chart.sizingCategory}) uses ${alias}`
          ).toBe(true);
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
    // A bra grid is two-dimensional — band then cup — so chest genuinely resets when the band steps
    // up (70F is a wider chest than 75A). Underbust is intentionally absent from the fixed tops
    // fields, so the stable bra leaf identifies this one legitimate duplicate-range exception.
    const isBandAndCup = (chart: (typeof charts)[number]) =>
      chart.coversLeaves.includes("women:top:bra");

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
   * `covers_leaves` is the resolver's assignment truth — it is never re-derived from a
   * chart's name or fields. So a seed claiming a leaf outside its own audience or
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
   * Fit-class tables such as `Men Tailored Long` should carry no leaf, because a fit class
   * describes the shopper's own proportions, never the garment. This is checked at the data level so
   * a future seed cannot quietly depend on the guard instead of stating its coverage honestly.
   */
  it("requires structured applicability on every fit-class chart that claims leaves", () => {
    for (const chart of charts) {
      if (chart.coversLeaves.length === 0) continue;
      const tags = variantTags(chart.variantName);
      if (tags.fit.length === 0) continue;
      expect(
        chart.applicability?.fitClass,
        `${chart.brandKey} ${chart.variantName} claims leaves without fitClass applicability`,
      ).toBeTruthy();
    }
  });

  /**
   * More than two charts claiming one leaf has no known reason in this catalog — the one deliberate
   * double-claim (`kids-unisex:footwear:*`, an `Infant` table and a `Boys & Girls` table covering two
   * disjoint age bands, see `tommy-hilfiger-kids.ts`) is exactly two. A third claimant would not be
   * another legitimate age band, it would be a copy-paste mistake, so this stays a hard ceiling rather
   * than an unbounded allowance.
   */
  it("lets unqualified charts share a leaf only when each has labels the other lacks", () => {
    const claims = new Map<string, typeof charts>();
    for (const chart of charts) {
      for (const leaf of chart.coversLeaves) {
        const key = `${chart.brandKey}|${leaf}`;
        if (!claims.has(key)) claims.set(key, []);
        claims.get(key)!.push(chart);
      }
    }
    for (const [key, claimants] of claims) {
      if (claimants.length < 2) continue;
      const unconstrained = claimants.filter((chart) =>
        Object.keys(chart.applicability ?? {}).length === 0);
      expect(unconstrained.length, `${key} has ${unconstrained.length} unqualified claimants`)
        .toBeLessThanOrEqual(3);

      // The resolver picks between unqualified claimants by the stocked labels. That only works if
      // every claimant owns at least one label no other unqualified claimant prints; otherwise a
      // product could never prefer it and its chart would be dead weight.
      const labelSets = unconstrained.map((chart) => new Set(
        chart.chartRows.flatMap((row) => rowLabels(row).map((label) => label.toUpperCase())),
      ));
      unconstrained.forEach((chart, index) => {
        const others = labelSets.filter((_, other) => other !== index);
        const unique = [...labelSets[index]].filter((label) => !others.some((set) => set.has(label)));
        if (unconstrained.length > 1) {
          expect(unique.length, `${key}: ${chart.variantName} owns no distinguishing label`)
            .toBeGreaterThan(0);
        }
      });
    }
  });
});

describe("global brand source manifests", () => {
  it("has one complete executable manifest for every seed brand", () => {
    expect(Object.keys(GLOBAL_BRAND_MANIFESTS).sort()).toEqual(Object.keys(CHART_SEEDS).sort());
    for (const [brandKey, charts] of Object.entries(CHART_SEEDS)) {
      const manifest = GLOBAL_BRAND_MANIFESTS[brandKey];
      expect(manifest.brandKey).toBe(brandKey);
      expect(validateManifestParity(manifest, charts)).toEqual([]);
      for (const table of manifest.tables.filter((entry) => entry.state === "published")) {
        expect(table.sourceTableId.trim(), `${brandKey}: missing source table id`).not.toBe("");
        expect(table.decidingMeasurements.length, `${brandKey} ${table.sourceTableId}`).toBeGreaterThan(0);
        expect(table.verification.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(["verified", "inaccessible", "archived"]).toContain(table.verification.status);
      }
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
 * Whole departments the brand does not publish are not silently skipped. They must be declared in
 * `UNSUPPORTED_DEPARTMENTS`, so all six Persona departments are audited for every global seed
 * without forcing a fabricated chart.
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
    "kids-girls:top:bra",
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
  tom_tailor: [
    // The official guide names only T-shirts/polos, knits/sweats and blouses in women's tops.
    "women:top:camisole",
    "women:top:crop-top",
    "women:top:bodysuit",
    "women:top:tunic",
    "women:top:activewear-top",
    "women:top:swim-top",
    "women:top:sleep-top",
    "women:top:bra",
    // Trousers, jeans and skirts are the only published women's bottom tables.
    "women:bottom:culotte",
    "women:bottom:activewear-bottom",
    "women:bottom:swim-bottom",
    "women:bottom:sleep-bottom",
    // The full-body source heading names dresses only.
    "women:full-body:gown",
    "women:full-body:romper",
    "women:full-body:kaftan",
    "women:full-body:abaya",
    "women:full-body:swimsuit",
    "women:full-body:set",
    "women:full-body:sleepwear-set",
    // Only jackets and blazers have published women's outerwear tables.
    "women:outerwear:trench",
    "women:outerwear:kimono",
    "women:outerwear:activewear-jacket",
    // This guide publishes no foot-length table.
    ...leafKeysFor("women", "footwear"),
    // Men's tops cover shirts and the explicitly named T-shirt/polo/knit/sweat family only.
    "men:top:activewear-top",
    "men:top:sleep-top",
    // Only jeans and trousers have published men's bottom tables.
    "men:bottom:jogger",
    "men:bottom:activewear-bottom",
    "men:bottom:sleep-bottom",
    // No men's full-body table is published.
    ...leafKeysFor("men", "full-body"),
    // The source names jackets and blazers, not the remaining outerwear classes.
    "men:outerwear:suit-jacket",
    "men:outerwear:coat",
    "men:outerwear:activewear-jacket",
    ...leafKeysFor("men", "footwear"),
    // Children's tables name tops, jackets/coats, dresses and trousers/jeans/jogging/leggings/skirts
    // only. Underwear-like, sleep, swim, baby one-piece, snow/pram, cardigan and shorts headings
    // and any foot-length table are not published.
    "kids-boys:top:bodysuit",
    "kids-boys:top:activewear-top",
    "kids-boys:top:sleep-top",
    "kids-boys:bottom:short",
    "kids-boys:bottom:legging",
    "kids-boys:bottom:swim-short",
    "kids-boys:bottom:sleep-bottom",
    "kids-boys:full-body:romper",
    "kids-boys:full-body:all-in-one",
    "kids-boys:full-body:sleepsuit",
    "kids-boys:full-body:set",
    "kids-boys:full-body:swimsuit",
    "kids-boys:full-body:bathrobe",
    "kids-boys:outerwear:cardigan",
    "kids-boys:outerwear:snowsuit",
    "kids-boys:outerwear:pramsuit",
    ...leafKeysFor("kids-boys", "footwear"),
    "kids-girls:top:bodysuit",
    "kids-girls:top:activewear-top",
    "kids-girls:top:sleep-top",
    "kids-girls:top:bra",
    "kids-girls:bottom:short",
    "kids-girls:bottom:sleep-bottom",
    "kids-girls:full-body:romper",
    "kids-girls:full-body:all-in-one",
    "kids-girls:full-body:sleepsuit",
    "kids-girls:full-body:set",
    "kids-girls:full-body:swimsuit",
    "kids-girls:full-body:bathrobe",
    "kids-girls:outerwear:cardigan",
    "kids-girls:outerwear:snowsuit",
    "kids-girls:outerwear:pramsuit",
    ...leafKeysFor("kids-girls", "footwear"),
  ],
  penti: [
    // The ordinary apparel table has no blouse-specific table.
    "women:top:blouse",
    "women:top:knit",
    "women:top:sweater",
    "women:top:hoodie",
    "women:top:sweatshirt",
    "women:top:tunic",
    // Penti's cited ordinary and swim sources publish no denim table.
    "women:bottom:jean",
    "women:bottom:culotte",
    // Neither source names gowns or abayas.
    "women:full-body:gown",
    "women:full-body:jumpsuit",
    "women:full-body:romper",
    "women:full-body:abaya",
    // The ordinary table supports the brand's kimono product class, but the available official
    // sources publish no chart for the other outerwear classes.
    "women:outerwear:blazer",
    "women:outerwear:jacket",
    "women:outerwear:coat",
    "women:outerwear:trench",
    "women:outerwear:cardigan",
    "women:outerwear:vest",
    "women:outerwear:activewear-jacket",
    // No foot-length table is published in the cited sources.
    ...leafKeysFor("women", "footwear"),
    // Penti's general kids chart supports apparel, swim shorts and sleepwear. It does not publish
    // infant one-piece measurements, outerwear-specific tables or foot lengths.
    "kids-boys:top:bodysuit",
    "kids-boys:full-body:romper",
    "kids-boys:full-body:all-in-one",
    "kids-boys:full-body:swimsuit",
    ...leafKeysFor("kids-boys", "outerwear"),
    ...leafKeysFor("kids-boys", "footwear"),
    "kids-girls:top:bodysuit",
    "kids-girls:full-body:romper",
    "kids-girls:full-body:all-in-one",
    // The girls' swim table publishes bust/waist/hip but no required height, so it cannot safely
    // drive the child recommendation model without fabricating a height mapping.
    "kids-girls:full-body:swimsuit",
    ...leafKeysFor("kids-girls", "outerwear"),
    ...leafKeysFor("kids-girls", "footwear"),
    // The only published men's chart located for Penti is the pajamas table.
    ...leafKeysFor("men", "top"),
    ...leafKeysFor("men", "bottom"),
    ...leafKeysFor("men", "full-body").filter((leaf) => leaf !== "men:full-body:sleepwear-set"),
    ...leafKeysFor("men", "outerwear"),
    ...leafKeysFor("men", "footwear"),
  ],
  xint: [
    // XINT's embedded guide publishes tops, bottoms and shoes only.
    "women:top:bra",
    ...leafKeysFor("women", "full-body"),
    ...leafKeysFor("women", "outerwear"),
    "women:footwear:sock",
    ...leafKeysFor("men", "full-body"),
    ...leafKeysFor("men", "outerwear"),
    "men:footwear:sock",
  ],
};

/** A whole Persona department for which the brand publishes no applicable chart. This is explicit
 * rather than inferred from an empty seed so adding a new global brand always requires reviewing all
 * six departments. A listed department must have zero claimed leaves. */
const UNSUPPORTED_DEPARTMENTS: Record<string, string[]> = {
  tommy_hilfiger: ["unisex"],
  tom_tailor: ["unisex", "kids-unisex"],
  penti: ["unisex", "kids-unisex"],
  xint: ["unisex", "kids-boys", "kids-girls", "kids-unisex"],
};

describe("seed leaf coverage is either claimed or an explicitly documented gap", () => {
  it("audits every department and claims every supported leaf or documents why not", () => {
    for (const [brandKey, brandCharts] of Object.entries(CHART_SEEDS)) {
      const claimed = new Set(brandCharts.flatMap((chart) => chart.coversLeaves));
      const allowed = new Set(ALLOWED_GAPS[brandKey] ?? []);
      const unsupportedDepartments = new Set(UNSUPPORTED_DEPARTMENTS[brandKey] ?? []);

      for (const dept of PERSONA_DEPARTMENTS) {
        const departmentLeaves = PERSONA_CATEGORIES.flatMap((cat) => leafKeysFor(dept.id, cat.id));
        if (unsupportedDepartments.has(dept.id)) {
          expect(
            departmentLeaves.some((leaf) => claimed.has(leaf)),
            `${brandKey}: ${dept.id} is declared unsupported but claims leaves`
          ).toBe(false);
          continue;
        }

        for (const cat of PERSONA_CATEGORIES) {
          const leaves = leafKeysFor(dept.id, cat.id);

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

      for (const deptId of unsupportedDepartments) {
        expect(
          PERSONA_DEPARTMENTS.some((dept) => dept.id === deptId),
          `${brandKey}: unknown unsupported department ${deptId}`
        ).toBe(true);
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
