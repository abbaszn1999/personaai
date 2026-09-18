import { createChatCompletion, getPlatformOpenAiKey, type ChatCompletionMessage } from "@/lib/ai/openai";
import type { StoreConnectionRow } from "@/lib/db/store-connections";
import {
  listSizingCoverage,
  setBrandType,
  setResearchOutcomes,
  type SizingCoverageRow,
} from "@/lib/db/sizing-coverage";
import { listChartsForBrands, upsertChart } from "@/lib/db/sizing-charts";
import {
  CHART_REGIONS,
  chartHasBounds,
  isChartRegion,
  parseSizeChart,
  universalRowJsonSchema,
  type ChartRegion,
  type CoverageRequest,
  type SizeChartRow,
} from "./chart-schema";
import { CHART_CONFIDENCE_THRESHOLD } from "./chart-review";
import {
  isSizingGroup,
  measurementsFor,
  SIZING_GROUP_KEYS,
  SIZING_GROUP_SCOPES,
  type SizingGroup,
} from "./measurements";
import { AUDIENCES, isAudience, isSizingCategory, UNKNOWN_BRAND_KEY, type Audience } from "./keys";

/**
 * Doc Tab 4 — Size Chart Research. Runs only against brands Phase 3 classified `global`, one web
 * search per brand, never per SKU or per category. See "The architecture that makes 'no product
 * mirror' work" in the phased plan for why this is the one stage allowed to cost real money.
 *
 * Two things here deliberately depart from the doc, both recorded in the Stage 4 refit plan:
 *
 * 1. **Extraction is not scoped to `categories_needed`.** The doc says to skip anything the store
 *    doesn't sell. We take every table the brand publishes instead, because `sizing_charts` is a
 *    shared cross-merchant registry — the next store selling this brand's kidswear then pays
 *    nothing — and because matching against what a store carries is a join we can run ourselves
 *    afterwards, rather than a judgement the model has to make and can get wrong.
 * 2. **Audience comes off the source page, not the product.** The doc keys charts `mens_tops`,
 *    which assumes the catalog knows who a product is for. A store with no gender field cannot say,
 *    so the audience is read from the brand's own guide (`/men/`, the section heading) and stored on
 *    the chart; coverage stays keyed on the bare garment group.
 */

// Confirmed against OpenAI's model docs: "gpt-5.6-sol" is the flagship GPT-5.6 model's real id
// (the bare "gpt-5.6" alias also routes to Sol, but the explicit id is used here so an env override
// stays unambiguous about which tier it is replacing). Supports the Responses API's `web_search`
// tool and `text.format` structured output — both of which this module relies on.
const RESEARCH_MODEL = process.env.SIZING_RESEARCH_MODEL ?? "gpt-5.6-sol";

/**
 * Five minutes per call, up from one.
 *
 * The old 60s was set before anything had run. A search across a brand's whole size guide followed
 * by forty structured tables is minutes of work, and the previous version of this file already
 * carried a comment admitting the pair cost "over a minute each" — so every research pass was
 * running at the edge of an abort, and an abort is indistinguishable in the outcome table from a
 * brand that publishes no guide.
 */
const CALL_TIMEOUT_MS = 300_000;

export interface ResearchResult {
  /** Distinct global brands considered this run. */
  brandsConsidered: number;
  /** Brand+category charts already in the registry — no search spent. */
  reused: number;
  /** Charts written this run. One per published table, so this exceeds the number of coverage rows
   *  a store needed — the surplus is what the next merchant inherits for free. */
  written: number;
  /** Brands the finder could not locate at all. */
  notFound: number;
  /** Brands reclassified `private` because the search proved they publish nothing. A subset of
   *  `notFound`, counted separately because it is the pass correcting the classification rather than
   *  reporting on it — and because a store where this is consistently high has a classifier problem,
   *  not a research problem. */
  demoted: number;
  /** Requested categories a found brand's guide did not cover. */
  categoriesNotCovered: number;
  /** Brands whose research errored or came back unstructurable — a retry, not a gap to hand-fill. */
  failed: number;
  /** Tables thrown away before structuring: misaligned, empty, garment-measurement, or ungrouped. */
  tablesRejected: number;
  /** Brands this tick did not get to. Non-zero means the caller must queue another tick. */
  brandsRemaining: number;
  /**
   * Exactly which brands are still owed work, so the caller can write the shrunken scope back.
   *
   * A count alone is not enough now that research is scoped: the next tick has to know *which* two
   * brands were skipped, and recomputing "whatever still looks outstanding" is how a request for one
   * brand turns into a bulk pass over the whole catalog.
   */
  remainingBrandKeys: string[];
}

export interface ResearchOptions {
  /** Brands the merchant asked for. An empty list means do nothing — see `queueScopedResearch`. */
  brandKeys: readonly string[];
  /** How many brands this tick may actually search before handing back. */
  maxBrands?: number;
  /** Regenerate rather than Generate: ignore charts already in the registry and search again. */
  force?: boolean;
  /** Called as each brand's search begins, so the run row can name it while it happens. */
  onBrandStart?: (brandKey: string) => Promise<void>;
}

/**
 * Brands one job tick will research before handing back.
 *
 * `/api/internal/sizing/advance` runs under Vercel's `maxDuration = 300`, and research is
 * sequential with two calls per brand each allowed up to five minutes. Eighteen brands in one tick
 * is far past that budget; it only ever completed locally because the in-process worker has no
 * timeout at all. Bounded and re-enqueued instead, so the work survives a platform that will cut it
 * off mid-brand — and so a tick's cost is predictable rather than proportional to the catalog.
 */
const BRANDS_PER_TICK = 2;

/**
 * Runs research for the brands the merchant asked for, and only those.
 *
 * The scope used to be implicit — every global brand coverage still needed a chart for — which meant
 * simply walking forward through the pipeline bought a bulk pass over the whole catalog. Stage 4 now
 * asks per brand, so an empty scope is a legitimate and common state, and it means do nothing.
 *
 * Still idempotent by construction: the registry short-circuit means a re-run after a partial failure
 * only pays for what is still missing, and a brand already resolved for a *different* store is
 * never re-searched at all — that reuse is the point of keying `sizing_charts` on `(brand_key,
 * sizing_category, audience, source_title)` with `connection_id = null` for global brands. `force`
 * is what Regenerate uses to bypass it deliberately.
 */
export async function runChartResearch(
  connection: StoreConnectionRow,
  options: ResearchOptions
): Promise<ResearchResult> {
  const maxBrands = options.maxBrands ?? BRANDS_PER_TICK;
  const requested = new Set(options.brandKeys);

  const coverage = await listSizingCoverage(connection.id);
  // Intersected with what the store actually carries as `global`, so a stale scope — a brand a
  // rescan dropped, or reclassified private since the request — cannot spend a search on a brand
  // this connection has no coverage for.
  const needed = new Map(
    [...groupGlobalBrandsNeeded(coverage)].filter(([brandKey]) => requested.has(brandKey))
  );
  const market = marketHintFor(connection.storeUrl);

  const result: ResearchResult = {
    brandsConsidered: needed.size,
    reused: 0,
    written: 0,
    notFound: 0,
    demoted: 0,
    categoriesNotCovered: 0,
    failed: 0,
    tablesRejected: 0,
    brandsRemaining: 0,
    remainingBrandKeys: [],
  };
  if (needed.size === 0) return result;

  const covered = new Map<string, Set<string>>();
  // Skipped entirely on a forced pass. Regenerate exists precisely because the stored chart is the
  // problem, and consulting it would make the button skip the brand it was pressed for.
  if (!options.force) {
    const existing = await listChartsForBrands(connection.id, [...needed.keys()]);
    for (const chart of existing) {
      if ((chart.confidence ?? 0) < CHART_CONFIDENCE_THRESHOLD) continue;
      if (!covered.has(chart.brandKey)) covered.set(chart.brandKey, new Set());
      covered.get(chart.brandKey)!.add(chart.sizingCategory);
    }
  }

  // Sequential and per-brand logged. Nothing here is parallelized — two brands researched at once
  // would double the odds of tripping a rate limit on the same platform key every other sizing call
  // shares — but that means a store with a long brand tail can legitimately take many minutes, with
  // the finder+normalizer pair now allowed up to five minutes each. The per-brand line below exists
  // so that wait is visible progress in the server log, not silence indistinguishable from a hang.
  // The caller is responsible for bounding how many brands one job tick attempts; see `jobs.ts`.
  let index = 0;
  let searched = 0;

  for (const [brandKey, { brandName, searchName, requests }] of needed) {
    index += 1;
    const already = covered.get(brandKey) ?? new Set<string>();
    const reused = requests.filter((req) => already.has(req.sizingCategory));
    // Only pairs nothing has concluded on yet. A chart is not the only way a pair finishes: a brand
    // whose guide simply has no swimwear leaves that pair `not_covered` forever, and filtering on
    // stored charts alone would put the brand back in the queue on the next tick and re-pay for the
    // identical search — for as long as the run exists. `failed` is likewise left alone here and
    // reopened only by an explicit retry, which resets the row to `pending`.
    //
    // A forced pass takes every requested pair regardless of status: Regenerate is the merchant
    // saying the recorded conclusion is wrong, so respecting it would make the button do nothing.
    const remaining = options.force
      ? requests
      : requests.filter((req) => !already.has(req.sizingCategory) && req.researchStatus === "pending");
    result.reused += reused.length;

    // Recorded even though no search was spent: from the review screen's point of view a reused
    // chart and a freshly researched one are both "found", and leaving the reused ones `pending`
    // would show a chart sitting next to "not researched yet". Restricted to rows still `pending`
    // so a note this run already wrote is not overwritten with the reuse wording on the next tick.
    await setResearchOutcomes(
      connection.id,
      brandKey,
      reused.filter((req) => req.researchStatus === "pending").map((req) => req.sizingCategory),
      "found",
      "Reused from the shared registry — no new search was needed."
    );

    if (remaining.length === 0) {
      console.log(`[sizing research] (${index}/${needed.size}) ${brandName}: nothing left outstanding`);
      continue;
    }

    // Counted against the budget only when a search is actually spent: a tick that skips twenty
    // already-covered brands has done no expensive work and should keep going.
    if (searched >= maxBrands) {
      result.brandsRemaining += 1;
      result.remainingBrandKeys.push(brandKey);
      continue;
    }
    searched += 1;
    await options.onBrandStart?.(brandKey);

    console.log(
      `[sizing research] (${index}/${needed.size}) ${brandName}: searching${
        searchName === brandName ? "" : ` as "${searchName}"`
      }...`
    );
    const before = result.written;
    try {
      await researchOneBrand(connection.id, brandKey, brandName, searchName, remaining, market, result);
      console.log(
        `[sizing research] (${index}/${needed.size}) ${brandName}: wrote ${result.written - before} chart(s)`
      );
    } catch (err) {
      // One brand's search failing should not discard every other brand this run already paid for
      // and wrote — the next pass over the same connection only re-pays for what is still missing.
      console.error(`[sizing research] (${index}/${needed.size}) ${brandName}: failed`, err);
      result.failed += 1;
      await setResearchOutcomes(
        connection.id,
        brandKey,
        remaining.map((req) => req.sizingCategory),
        "failed",
        err instanceof Error ? err.message : "The research call failed."
      );
    }
  }

  return result;
}

/** One brand to research: what the merchant calls it, what to search for, and which categories are
 *  outstanding. The two names differ whenever the store files a brand under an abbreviation. */
export interface BrandResearchTarget {
  brandName: string;
  searchName: string;
  requests: CoverageRequest[];
}

/**
 * Groups a connection's `global`-typed coverage rows by brand, into the doc's Step 0
 * `categories_needed` shape. Pure grouping over an already-classified table — no model call, free.
 *
 * Still computed even though the finder is no longer told about it: this is what the extracted
 * tables are matched against afterwards, which is how `not_covered` becomes something we can prove
 * rather than something the model asserts.
 */
export function groupGlobalBrandsNeeded(
  coverage: SizingCoverageRow[]
): Map<string, BrandResearchTarget> {
  const byBrand = new Map<string, BrandResearchTarget>();

  for (const row of coverage) {
    if (row.brandType !== "global" || row.brandKey === UNKNOWN_BRAND_KEY) continue;
    if (!isSizingCategory(row.sizingCategory)) continue;

    let entry = byBrand.get(row.brandKey);
    if (!entry) {
      entry = {
        brandName: row.brandName ?? row.brandKey,
        // What the search actually runs on. A store's brand field is whatever their PIM happened to
        // hold — "CLAUDIE" for Claudie Pierlot, "On Cloud" for On — and searching under that spends a
        // paid request that can only come back empty, then hands the merchant a chart to hand-fill
        // that is published on a public website. Falls back to the store's string when classification
        // predates this or could not name the company.
        searchName: row.brandCanonicalName ?? row.brandName ?? row.brandKey,
        requests: [],
      };
      byBrand.set(row.brandKey, entry);
    }
    if (!entry.requests.some((req) => req.sizingCategory === row.sizingCategory)) {
      entry.requests.push({
        sizingCategory: row.sizingCategory,
        group: row.sizingCategory,
        rawLabels: Object.keys(row.rawFormats ?? {}),
        researchStatus: row.researchStatus,
      });
    }
  }

  return byBrand;
}

/**
 * Which market's guide to ask for.
 *
 * Derived from the merchant's own storefront hostname rather than a configured country, because
 * there is no country field on a connection and the hostname is a fact we already hold. The model
 * is given the host and left to draw the conclusion — it does not need a ccTLD table to work out
 * that a `.gr` storefront wants the European guide, and a hardcoded table would be wrong for the
 * `.com` and `.myshopify.com` cases anyway.
 */
export function marketHintFor(storeUrl: string | null | undefined): string {
  if (!storeUrl) return "Unknown. Prefer the brand's European or international guide.";
  try {
    return `The merchant's storefront is ${new URL(storeUrl).hostname}. Prefer the brand's size guide for that country or region.`;
  } catch {
    return `The merchant's storefront is ${storeUrl}. Prefer the brand's size guide for that country or region.`;
  }
}

/**
 * 4a then 4b for one brand, writing every table the guide published.
 *
 * Every exit path records a reason against the coverage rows it was asked about. An absent chart on
 * its own cannot distinguish "this brand publishes nothing" from "the guide says nothing about boys'
 * hats" from "the call errored", and those want a retry, a hand-filled template and a retry
 * respectively — so the distinction has to be persisted while it is still known.
 */
/**
 * Records that a brand classified `global` publishes no guide after all.
 *
 * This is the pipeline's only self-correction, and the reason it belongs here is that research is the
 * only step with evidence: classification asks a model to recall from a name alone, while this step
 * actually goes and looks. Before this, a wrong `global` was permanent — the row was marked
 * `not_found` and left `global`, which meant it sat in Stage 4's "no guide found" list rather than the
 * manual-fill queue where a house label belongs, and it was re-searched on every pass. Worse, a
 * re-scan resets `research_status` while deliberately carrying `brand_type` across, so the guess
 * survived and the evidence did not.
 *
 * Demoting to `private` puts it where the merchant can resolve it, stops it costing another search
 * (`groupGlobalBrandsNeeded` only queues `global`), and — because `brand_type` is the column that
 * persists — makes the correction the thing that survives the next scan.
 *
 * The canonical name is cleared with it. Whatever company the classifier thought this was, the search
 * for that name came back empty, so keeping it would just aim the next search at the same nothing.
 */
async function demoteToPrivate(connectionId: string, brandKey: string): Promise<void> {
  await setBrandType(connectionId, brandKey, "private", null);
}

async function researchOneBrand(
  connectionId: string,
  brandKey: string,
  brandName: string,
  searchName: string,
  requests: CoverageRequest[],
  market: string,
  result: ResearchResult
): Promise<void> {
  const allCategories = requests.map((req) => req.sizingCategory);

  const found = await findBrandChart(searchName, market);
  if (!found.found || found.tables.length === 0) {
    result.notFound += 1;
    result.demoted += 1;
    await Promise.all([
      setResearchOutcomes(
        connectionId,
        brandKey,
        allCategories,
        "not_found",
        `No size guide for "${searchName}" could be found on the web, so this is being treated as a private label.`
      ),
      demoteToPrivate(connectionId, brandKey),
    ]);
    return;
  }

  const { usable, rejected } = screenTables(found.tables);
  result.tablesRejected += rejected.length;
  for (const reject of rejected) {
    console.warn(`[sizing research] ${brandName}: dropped table "${reject.title}" — ${reject.reason}`);
  }

  if (usable.length === 0) {
    // A brand whose guide only ever publishes garment measurements is not a retry — the next search
    // reads the same page and drops the same tables. Routed to hand-fill instead, so it stops
    // costing a search and starts being something a merchant can actually resolve.
    const retryable = rejected.some((reject) => !reject.permanent);
    if (retryable) result.failed += 1;
    else result.notFound += 1;

    await setResearchOutcomes(
      connectionId,
      brandKey,
      allCategories,
      retryable ? "failed" : "not_found",
      `A guide was found but none of its ${found.tables.length} table(s) could be used: ${rejected[0]?.reason ?? "unknown"}.`
    );
    // Not demoted, even where this is permanent: a guide *was* located, so the brand is real and
    // global — what failed is that its published tables are unusable. Calling it a private label
    // would be a claim about the brand that the evidence contradicts.
    return;
  }

  // The canonical name again, not the store's string: this is the second model call, and it is being
  // told whose tables these are. Log lines above and below stay on `brandName`, which is what the
  // merchant sees in their own catalog.
  const normalized = await normalizeTables(searchName, usable, observedLabels(requests));
  if (normalized === null) {
    // Distinct from not_found on purpose: a guide *was* located, so the brand is not a hand-fill
    // candidate — the structuring step is what broke, and that is worth retrying.
    result.failed += 1;
    await setResearchOutcomes(
      connectionId,
      brandKey,
      allCategories,
      "failed",
      "A size guide was found, but the response structuring it could not be read."
    );
    return;
  }

  // Every table is written, including ones no coverage row asked for. That surplus is the shared
  // registry paying for itself: the next merchant selling this brand's womenswear inherits it.
  const groupsWritten = new Set<SizingGroup>();
  let writeFailures = 0;

  for (const { chart, variantName } of resolveVariantNames(normalized)) {
    // The only gate on storing a chart: rows carrying no measurement at all cannot be matched to a
    // shopper, so they are the one output that is worth nothing rather than worth reviewing.
    // Everything else is stored with its defects flagged — a chart with a suspicious column is
    // still most of a chart, and `assessChart` says so on the review screen where a merchant can
    // act on it. Silently dropping those would show a gap where the real problem is a bad column.
    if (!chartHasBounds(chart.rows, chart.group)) {
      console.warn(`[sizing research] ${brandName}: "${chart.table.title}" has no usable measurements`);
      continue;
    }

    const wrote = await upsertChart({
      connectionId: null, // Global brands are always the shared, cross-merchant registry.
      brandKey,
      sizingCategory: chart.group,
      variantName,
      variantGender: chart.table.variantGender,
      variantFitType: chart.table.variantFitType,
      audience: chart.table.audience,
      sourceTitle: chartTitleFor(chart.table),
      region: chart.table.region,
      chartRows: chart.rows,
      confidence: chart.confidence,
      sourceUrl: chart.table.sourceUrl,
      provenance: "research",
    });

    if (wrote) {
      result.written += 1;
      groupsWritten.add(chart.group);
    } else {
      writeFailures += 1;
    }
  }

  // The doc's `categories_not_covered`, computed rather than asserted: a category is uncovered when
  // nothing the brand published mapped onto it, which is a fact about the tables we hold.
  const covered = allCategories.filter((category) => groupsWritten.has(category as SizingGroup));
  const notCovered = allCategories.filter((category) => !groupsWritten.has(category as SizingGroup));
  result.categoriesNotCovered += notCovered.length;

  await Promise.all([
    setResearchOutcomes(connectionId, brandKey, covered, "found", null),
    setResearchOutcomes(
      connectionId,
      brandKey,
      notCovered,
      writeFailures > 0 ? "failed" : "not_covered",
      writeFailures > 0
        ? "Charts were researched but could not be saved."
        : `The brand's guide covers ${[...groupsWritten].join(", ") || "nothing we could use"}, but not this category.`
    ),
  ]);
}

/** The merchant's own distinct size strings for these categories, so 4b can tell which of a table's
 *  several label columns is the one this store's stock is actually written in. */
function observedLabels(requests: CoverageRequest[]): string[] {
  return [...new Set(requests.flatMap((req) => req.rawLabels))].slice(0, 60);
}

// ─── Step 4a — Finder ───────────────────────────────────────────────────────────

const FINDER_INSTRUCTIONS = [
  "You are transcribing one clothing brand's official published size guide. Accuracy of transcription",
  "matters more than anything else here: a later step converts your numbers into body measurements a",
  "shopper is matched against, and it cannot detect a value you copied into the wrong column.",
  "",
  "FINDING THE RIGHT PAGE",
  "- Use the brand's own website. Never a competitor's chart, never a generic sizing-advice site.",
  "- Prefer the guide for the market named below, and the centimetre version where the page offers a",
  "  choice of units. A US-only chart served to a European store is the wrong page, not a fallback.",
  "- Many brands hide the guide behind a link or a pop-up on a product page rather than on a page of",
  "  its own, and some serve it only on a regional storefront. If the obvious page will not open or",
  "  its tables will not load, keep looking: a regional site, or a major retailer's page dedicated to",
  "  this brand's own sizing, both carry the brand's real numbers and are fully acceptable then.",
  "- Return `found: false` only when the brand genuinely publishes no size guide you can read",
  "  anywhere. It is not a way to report that the first page you tried was awkward. Every brand you",
  "  give up on is hand-typed by a shop owner from the same page you were looking at.",
  "",
  "TRANSCRIBING EVERY TABLE",
  "- Return one entry in `tables` for EVERY distinct size table the guide publishes: men's, women's,",
  "  kids', every garment type, every fit line and sub-brand. Do not stop at the first table, do not",
  "  skip one for resembling another, and never merge two tables into one. A brand publishing forty",
  "  tables should come back with forty entries.",
  "- `columns` is the table's header row, verbatim and in order. Each `rows[].cells` is one row's",
  "  values, verbatim and in order, exactly one cell per column. If the first column has no header,",
  "  use an empty string for it rather than dropping it — otherwise every row is off by one.",
  "- Many size guides are laid out with the sizes across the top and the measurements down the side.",
  "  Transcribe that exactly as printed; do not turn it the right way up. The next step handles it.",
  "- Copy cells exactly as printed, including fractions (31 1/2), ranges (88-92) and open ends (120+).",
  "  Do not convert units, round, average, or fill a blank. An empty cell is an empty string.",
  "",
  "LABELLING EACH TABLE",
  "- `title`: the table's own heading, verbatim, e.g. 'TOPS, OUTERWEAR, CASUAL SHIRTS'.",
  "- `section`: the heading above it separating fit lines or sub-brands, e.g. 'TAILORED' or",
  "  'TOMMY JEANS SIZES'. Null when the table stands on its own.",
  "- `audience`: who the table is for, read off the page — the URL path, the tab, the heading. Read it,",
  "  do not infer it from the measurements.",
  "",
  "NAMING THE VARIANT — the field a shop owner will pick from a dropdown",
  "- `variant_name`: which of the brand's chart LINES this table is, within its garment group. This is",
  "  not the table's heading and not a description. It is the short name that tells one of the brand's",
  "  charts apart from another for the same garments: 'Men', 'Women', 'Men Tall', 'Women Petite',",
  "  'Unisex', 'Kids'. Use the brand's own wording where the page gives it.",
  "- Two tables for the same `garment_group` must never share a `variant_name`, and two tables that",
  "  really are the same line must never be given different names. This name is how the chart is",
  "  stored: a collision silently overwrites one chart with the other, and a needless difference",
  "  shows the shop owner two entries where the brand publishes one.",
  "- Where a brand separates by sub-brand or fit line as well as gender, put both in the name —",
  "  'Tommy Jeans Men', 'Tailored Men Slim' — so the two stay distinguishable.",
  "- `variant_gender`: just the gender part of that name, or null if the guide never says.",
  "- `variant_fit_type`: just the fit part — 'Regular', 'Tall', 'Petite', 'Slim'. Null if the brand",
  "  publishes only one fit for this group.",
  "- `garment_group`: which of these the table sizes. Go by what the group covers, not by what its",
  "  name sounds like — 'dresses' is the whole upper-and-lower-body group, so a men's SUITS or",
  "  OVERALLS table belongs there:",
  ...SIZING_GROUP_KEYS.map((group) => `    · ${group}: ${SIZING_GROUP_SCOPES[group]}`),
  "  Use 'other' only when the table sizes nothing on that list — never force a group that does not fit.",
  "- A table that sizes SEVERAL groups at once — a general 'CLOTHING' table, or one headed",
  "  'UPPER BODY + LOWER BODY' — must be returned once per group it serves, with identical columns and",
  "  rows each time and only `garment_group` differing. Returning it once under 'other' loses it.",
  "- `measurement_kind`: 'body' when the numbers describe the wearer, 'garment' when they describe the",
  "  garment laid flat. Guides publish both and they are not interchangeable, so label them honestly.",
  "- `unit`: the unit printed on the page you actually read.",
  "- `source_url`: the exact URL of the page this table came from. Required on every table.",
].join("\n");

/** The five groups and what each covers, for the one-line form a JSON-schema description takes. */
function groupScopeList(): string {
  return SIZING_GROUP_KEYS.map((group) => `'${group}' = ${SIZING_GROUP_SCOPES[group]}.`).join(" ");
}

const TABLE_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "The table's own heading, verbatim." },
    section: {
      type: ["string", "null"],
      description: "The fit-line or sub-brand heading above the table, verbatim. Null if it stands alone.",
    },
    audience: {
      type: "string",
      enum: [...AUDIENCES],
      description: "Who the table is for, read off the page rather than inferred.",
    },
    variant_name: {
      type: "string",
      description:
        "Which of the brand's chart lines this table is, within its garment group — 'Men', " +
        "'Women Petite', 'Tommy Jeans Men', 'Unisex'. Short and distinguishing, not the heading. " +
        "Unique among this brand's tables for the same garment_group.",
    },
    variant_gender: {
      type: ["string", "null"],
      enum: [...AUDIENCES, null],
      description: "The gender part of variant_name alone. Null when the guide does not say.",
    },
    variant_fit_type: {
      type: ["string", "null"],
      description: "The fit part of variant_name alone — Regular, Tall, Petite, Slim. Null if none.",
    },
    garment_group: {
      type: "string",
      enum: [...SIZING_GROUP_KEYS, "other"],
      // Each key is glossed rather than left bare. `dresses` is why: read as the plain English word
      // it looks like womenswear, so a men's SUITS or OVERALLS table was being filed under 'other'
      // and permanently discarded, when it is precisely what this group is for.
      description: `Which garment group this table sizes. ${groupScopeList()} Use 'other' only when the table sizes nothing on that list.`,
    },
    measurement_kind: {
      type: "string",
      enum: ["body", "garment"],
      description: "Whether the numbers describe the wearer's body or the garment laid flat.",
    },
    unit: { type: "string", enum: ["cm", "inch"], description: "The unit printed on the source page." },
    region: {
      type: ["string", "null"],
      enum: [...CHART_REGIONS, null],
      description: "Which regional label set the size values are drawn from.",
    },
    source_url: { type: "string", description: "Exact URL this table was read from." },
    columns: { type: "array", items: { type: "string" }, description: "Header row, verbatim and in order." },
    rows: {
      type: "array",
      description: "One entry per row of the table, in order.",
      items: {
        type: "object",
        properties: {
          cells: {
            type: "array",
            items: { type: "string" },
            description: "This row's values, verbatim, exactly one per column.",
          },
        },
        required: ["cells"],
        additionalProperties: false,
      },
    },
  },
  required: [
    "title",
    "section",
    "audience",
    "variant_name",
    "variant_gender",
    "variant_fit_type",
    "garment_group",
    "measurement_kind",
    "unit",
    "region",
    "source_url",
    "columns",
    "rows",
  ],
  additionalProperties: false,
} as const;

const FINDER_SCHEMA = {
  type: "object",
  properties: {
    found: { type: "boolean", description: "Whether an official size guide for this brand was located." },
    confidence: { type: "number", description: "0-1 confidence this is the brand's real, current, official guide." },
    tables: {
      type: "array",
      description: "Every size table the guide publishes. Empty only when found is false.",
      items: TABLE_SCHEMA,
    },
  },
  required: ["found", "confidence", "tables"],
  additionalProperties: false,
} as const;

/** One table as the finder transcribed it, before anything has been interpreted. */
export interface ExtractedTable {
  title: string;
  section: string | null;
  audience: Audience;
  /** Doc Part 5. Which of the brand's chart lines this table is, within its garment group. Empty
   *  when the model gave nothing usable; `variantNameFor` supplies a fallback before storage. */
  variantName: string;
  variantGender: Audience | null;
  variantFitType: string | null;
  /** `other` survives this far so it can be rejected with a reason rather than silently dropped. */
  garmentGroup: SizingGroup | "other";
  measurementKind: "body" | "garment";
  unit: "cm" | "inch";
  region: ChartRegion | null;
  sourceUrl: string;
  columns: string[];
  rows: string[][];
}

export interface FinderResult {
  found: boolean;
  confidence: number;
  tables: ExtractedTable[];
}

/**
 * What a chart is stored and displayed as.
 *
 * The section is folded in rather than kept beside the title because the title alone is not unique:
 * Tommy Hilfiger's women's page prints three separate tables headed "DRESSES", one per fit line,
 * and `sizing_charts` keys a chart on `(brand, group, audience, source_title)`. Left as the bare
 * title, the second would overwrite the first and a whole sub-brand's sizing would vanish silently.
 * It also reads better: "TOMMY JEANS SIZES — DRESSES" says what the chart is for on its own.
 */
export function chartTitleFor(table: ExtractedTable): string {
  return table.section ? `${table.section} — ${table.title}` : table.title;
}

/**
 * The variant name a table is stored under, with a fallback for a model that left it blank.
 *
 * Falls back to the audience rather than the heading. A brand's chart lines are overwhelmingly split
 * by who they are for, so `Men` is both the likely right answer and one a merchant recognises in
 * Phase 5's dropdown, where a raw heading like `TOPS, OUTERWEAR, CASUAL SHIRTS` is noise. The
 * heading is kept regardless, as `source_title`.
 */
export function variantNameFor(table: ExtractedTable): string {
  if (table.variantName) return table.variantName;
  if (table.variantGender) return AUDIENCE_VARIANT_LABELS[table.variantGender];
  return AUDIENCE_VARIANT_LABELS[table.audience];
}

const AUDIENCE_VARIANT_LABELS: Record<Audience, string> = {
  mens: "Men",
  womens: "Women",
  boys: "Boys",
  girls: "Girls",
  kids: "Kids",
  unisex: "Unisex",
};

/** A normalized chart paired with the name it will be stored and offered under. */
export interface ChartVariant {
  chart: NormalizedChart;
  variantName: string;
}

/**
 * Gives every one of a brand's charts a name unique within its garment group.
 *
 * Necessary because `variant_name` is now identity: `sizing_charts` is uniquely indexed on
 * `(brand_key, sizing_category, variant_name)`, and `upsertChart` deletes that key before inserting.
 * Two tables the model names `Men` under `tops` would therefore not produce two charts — the second
 * would delete the first, and a brand's second fit line would vanish with no error anywhere. The
 * model is told not to do this, but "the model was told" is not a uniqueness guarantee.
 *
 * A collision is disambiguated with the table's own heading, which is what actually differs between
 * two tables the model saw as one line, and only then by a counter. Suffixing rather than dropping
 * because both tables hold real published numbers; the merchant picks between them in Phase 5.
 */
export function resolveVariantNames(charts: NormalizedChart[]): ChartVariant[] {
  const taken = new Map<string, Set<string>>();
  const resolved: ChartVariant[] = [];

  for (const chart of charts) {
    const used = taken.get(chart.group) ?? new Set<string>();
    taken.set(chart.group, used);

    const base = variantNameFor(chart.table);
    let name = base;

    if (used.has(name)) {
      const heading = chartTitleFor(chart.table);
      name = `${base} — ${heading}`;
      for (let n = 2; used.has(name); n += 1) name = `${base} (${n})`;
    }

    used.add(name);
    resolved.push({ chart, variantName: name });
  }

  return resolved;
}

/**
 * Raised when the model's reply is not the JSON it was constrained to produce.
 *
 * Its own error type because the caller has to tell it apart from "this brand publishes no guide".
 * The previous version returned `found: false` here, so an oversized reply truncated mid-JSON was
 * recorded as a brand with no size chart and routed to a merchant to hand-fill — when the right
 * answer was to run it again.
 */
export class ResearchResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResearchResponseError";
  }
}

/** One web-search request per brand — the doc's exact unit of cost for this step. */
export async function findBrandChart(brandName: string, market: string): Promise<FinderResult> {
  const messages: ChatCompletionMessage[] = [
    { role: "system", content: FINDER_INSTRUCTIONS },
    { role: "user", content: `Brand: ${brandName}\nMarket: ${market}` },
  ];

  const { content } = await createChatCompletion(getPlatformOpenAiKey(), messages, {
    model: RESEARCH_MODEL,
    tools: [{ type: "web_search" }],
    jsonSchema: { name: "brand_chart_finder", schema: FINDER_SCHEMA as unknown as Record<string, unknown> },
    timeoutMs: CALL_TIMEOUT_MS,
  });

  if (!content) throw new ResearchResponseError("The finder returned an empty response.");

  let parsed: { found?: unknown; confidence?: unknown; tables?: unknown };
  try {
    parsed = JSON.parse(content) as typeof parsed;
  } catch {
    // Almost always a reply that ran out of output budget partway through a large guide. Surfaced
    // rather than swallowed, because the fix is a retry and not a hand-filled template.
    throw new ResearchResponseError(
      `The finder's response was not valid JSON (${content.length} characters) — likely truncated.`
    );
  }

  return {
    found: parsed.found === true,
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
    tables: Array.isArray(parsed.tables) ? parsed.tables.flatMap((t) => parseExtractedTable(t) ?? []) : [],
  };
}

function parseExtractedTable(value: unknown): ExtractedTable | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;

  const title = typeof record.title === "string" ? record.title.trim() : "";
  const sourceUrl = typeof record.source_url === "string" ? record.source_url.trim() : "";
  if (!title || !sourceUrl) return null;

  const group = record.garment_group;
  const columns = Array.isArray(record.columns) ? record.columns.map((c) => (typeof c === "string" ? c : "")) : [];
  const rows = Array.isArray(record.rows)
    ? record.rows.map((row) => {
        const cells = (row as { cells?: unknown } | null)?.cells;
        return Array.isArray(cells) ? cells.map((c) => (typeof c === "string" ? c : "")) : [];
      })
    : [];

  return {
    title,
    section: typeof record.section === "string" && record.section.trim() ? record.section.trim() : null,
    audience: isAudience(record.audience) ? record.audience : "unisex",
    variantName: typeof record.variant_name === "string" ? record.variant_name.trim() : "",
    variantGender: isAudience(record.variant_gender) ? record.variant_gender : null,
    variantFitType:
      typeof record.variant_fit_type === "string" && record.variant_fit_type.trim()
        ? record.variant_fit_type.trim()
        : null,
    garmentGroup: isSizingGroup(group) ? group : "other",
    measurementKind: record.measurement_kind === "garment" ? "garment" : "body",
    unit: record.unit === "inch" ? "inch" : "cm",
    region: isChartRegion(record.region) ? record.region : null,
    sourceUrl,
    columns,
    rows,
  };
}

// ─── Between 4a and 4b — screening ──────────────────────────────────────────────

export interface RejectedTable {
  title: string;
  reason: string;
  /** True when re-reading the same page would drop the table again — the brand publishes garment
   *  measurements, or sizes something our vocabulary has no group for. Distinguished from a
   *  malformed transcription, which is exactly what a retry is for. */
  permanent: boolean;
}

/**
 * Drops the tables 4b must never see, each with the reason it was dropped.
 *
 * The alignment check is the important one and it is deliberately ours rather than the schema's:
 * JSON Schema can require `cells` to be an array of strings, but it cannot say "as many cells as
 * there are columns". That is exactly the failure that produced the unusable Tommy Hilfiger chart —
 * a header row of ten sizes against value rows of twenty — and every measurement in a misaligned
 * table is attached to the wrong size, which is worse than having no chart at all because it looks
 * perfectly plausible downstream.
 *
 * Garment-measurement and ungrouped tables are dropped here too rather than after structuring. They
 * would be discarded either way, and 4b is charged by the token.
 */
export function screenTables(tables: ExtractedTable[]): { usable: ExtractedTable[]; rejected: RejectedTable[] } {
  const usable: ExtractedTable[] = [];
  const rejected: RejectedTable[] = [];

  for (const table of tables) {
    if (table.measurementKind === "garment") {
      rejected.push({ title: table.title, reason: "measures the garment, not the wearer", permanent: true });
      continue;
    }
    if (table.garmentGroup === "other") {
      rejected.push({ title: table.title, reason: "no sizing group this table maps onto", permanent: true });
      continue;
    }
    if (table.columns.length < 2) {
      rejected.push({ title: table.title, reason: `only ${table.columns.length} column(s)`, permanent: false });
      continue;
    }
    if (table.rows.length === 0) {
      rejected.push({ title: table.title, reason: "no rows", permanent: false });
      continue;
    }

    const misaligned = table.rows.findIndex((row) => row.length !== table.columns.length);
    if (misaligned >= 0) {
      rejected.push({
        title: table.title,
        reason: `row ${misaligned + 1} has ${table.rows[misaligned].length} cells against ${table.columns.length} columns`,
        permanent: false,
      });
      continue;
    }

    usable.push(table);
  }

  return { usable, rejected };
}

// ─── Step 4b — Structuring / Normalizer ─────────────────────────────────────────

function normalizerInstructions(observed: string[]): string {
  return [
    "You are converting size tables that have already been transcribed from a brand's official guide",
    "into one fixed row schema. The tables are the only source of truth: never add a size, a column or",
    "a number they do not contain, and never carry a value down from the row above.",
    "",
    "Return one entry in `charts` per input table, carrying that table's `table_index`.",
    "",
    "ORIENTATION",
    "- Some tables list sizes across the top and measurements down the side. Read those transposed:",
    "  `rows` in your output is always one entry PER SIZE, never one per measurement.",
    "",
    "MEASUREMENTS",
    "- Every bound is a BODY measurement in centimetres. Each table states the unit it was printed in;",
    "  trust it and convert (1 inch = 2.54cm), resolving fractions first — '31 1/2' inches is 80.0cm.",
    "- A cell holding a range ('88-92') gives a min and a max. A cell holding one number sets both",
    "  bounds to that number; do not invent a spread around it.",
    "- An open end ('120+', 'up to 86') is a real bound with null at the open side.",
    "- An empty cell means the source published nothing there: null at both ends. Never estimate one",
    "  measurement from another, and leave every measurement this table does not publish null.",
    "",
    "LABELS",
    "- `size` is the row's primary label — the one a shopper sees on the garment.",
    "- `aliases` carries every OTHER label the same row is printed under. A collar column goes in",
    "  `neck`, a waist/inseam pair like '34/31' or '3431' goes in `waist_inseam` as printed, regional",
    "  numbers go in their own key. Null for any system the table does not publish.",
    observed.length > 0
      ? `- This merchant writes their stock sizes as: ${observed.join(", ")}. Where a table offers several label columns, make \`size\` the column matching those, so the two can be matched later.`
      : "- Where a table offers several label columns, prefer the alpha column (S/M/L), then the numeric column for the table's own region.",
    "",
    "Set each chart's `confidence` from how cleanly that specific table converted — a table whose",
    "columns you could not confidently identify is low confidence even if the guide itself is official.",
  ].join("\n");
}

function normalizerSchema(group: SizingGroup): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      charts: {
        type: "array",
        description: "One entry per input table, in any order, each identified by its table_index.",
        items: {
          type: "object",
          properties: {
            table_index: { type: "number", description: "The index of the input table this chart is for." },
            confidence: { type: "number", description: "0-1 confidence in this table's conversion." },
            rows: {
              type: "array",
              items: universalRowJsonSchema(measurementsFor(group)),
              description: "One entry per size.",
            },
          },
          required: ["table_index", "confidence", "rows"],
          additionalProperties: false,
        },
      },
    },
    required: ["charts"],
    additionalProperties: false,
  };
}

export interface NormalizedChart {
  table: ExtractedTable;
  /** The table's group, re-stated as a narrowed type: `screenTables` has already rejected `other`,
   *  and carrying it here saves every consumer re-proving that. */
  group: SizingGroup;
  confidence: number;
  rows: SizeChartRow[];
}

/**
 * Rows one structuring call is asked to produce.
 *
 * The plan expected 4b to stay a single call per brand however many tables came back. It cannot:
 * Tommy Hilfiger's guide yields 45 usable tables and around 270 rows, and one request for all of
 * them ran past even the raised five-minute timeout without returning. Output length is the binding
 * constraint, not context length — each row is a fixed set of ~30 keys the model must write out in
 * full, so cost here is linear in rows and nothing about the prompt changes that.
 *
 * Chosen to keep a batch's output comfortably inside one response rather than to be optimal: a
 * misjudged ceiling costs an extra call, while one that is too high costs a whole brand's research.
 */
const MAX_ROWS_PER_NORMALIZER_CALL = 48;

/** Batches in flight at once. Small on purpose — every sizing call shares one platform key, and a
 *  rate limit tripped here fails the brand rather than just slowing it down. */
const NORMALIZER_CONCURRENCY = 4;

interface NormalizerBatch {
  group: SizingGroup;
  tables: ExtractedTable[];
}

/**
 * Splits a brand's tables into batches that fit one call each.
 *
 * Batched by garment group first, and not only to keep batches small: the schema each call sends is
 * narrowed to `measurementsFor(group)`, so a footwear batch never has to write out `null` for chest
 * and waist on every row. Mixing groups would force the full vocabulary on all of them and roughly
 * double the output that made the single call fail in the first place.
 *
 * A table is never split across batches — a half-transcribed chart is worse than a missing one — so
 * a single table larger than the ceiling still goes out whole, in a batch of its own.
 */
export function batchTables(tables: ExtractedTable[]): NormalizerBatch[] {
  const byGroup = new Map<SizingGroup, ExtractedTable[]>();
  for (const table of tables) {
    if (table.garmentGroup === "other") continue;
    const list = byGroup.get(table.garmentGroup) ?? [];
    list.push(table);
    byGroup.set(table.garmentGroup, list);
  }

  const batches: NormalizerBatch[] = [];
  for (const [group, groupTables] of byGroup) {
    let current: ExtractedTable[] = [];
    let rows = 0;

    for (const table of groupTables) {
      if (current.length > 0 && rows + table.rows.length > MAX_ROWS_PER_NORMALIZER_CALL) {
        batches.push({ group, tables: current });
        current = [];
        rows = 0;
      }
      current.push(table);
      rows += table.rows.length;
    }

    if (current.length > 0) batches.push({ group, tables: current });
  }

  return batches;
}

/**
 * Structures every table a brand published, in as few calls as the output budget allows.
 *
 * No web search and no truncation of the input. The previous version cut its input at 12,000
 * characters, which is roughly a third of one large brand's guide — so even a perfect transcription
 * lost most of its tables before the model saw them, and the loss was silent.
 *
 * Returns `null` only when nothing at all could be structured. A single batch failing costs its own
 * tables and no others, which is the reason to batch at all beyond fitting the budget: one bad
 * response no longer takes a whole brand's guide down with it.
 */
export async function normalizeTables(
  brandName: string,
  tables: ExtractedTable[],
  observed: string[] = []
): Promise<NormalizedChart[] | null> {
  const batches = batchTables(tables);
  if (batches.length === 0) return [];

  const results: NormalizedChart[][] = new Array(batches.length);
  let failures = 0;

  for (let start = 0; start < batches.length; start += NORMALIZER_CONCURRENCY) {
    const window = batches.slice(start, start + NORMALIZER_CONCURRENCY);
    await Promise.all(
      window.map(async (batch, offset) => {
        const index = start + offset;
        try {
          results[index] = await normalizeBatch(brandName, batch, observed);
        } catch (err) {
          console.error(`[sizing research] ${brandName}: ${batch.group} batch failed`, err);
          results[index] = [];
          failures += 1;
        }
      })
    );
  }

  // Every batch failing is indistinguishable from the brand having published nothing structurable,
  // and the caller records those differently — one is a retry, the other a hand-fill.
  if (failures === batches.length) return null;

  return results.flat();
}

async function normalizeBatch(
  brandName: string,
  batch: NormalizerBatch,
  observed: string[]
): Promise<NormalizedChart[]> {
  const payload = batch.tables.map((table, index) => ({
    table_index: index,
    title: table.title,
    section: table.section,
    audience: table.audience,
    variant_name: table.variantName,
    garment_group: table.garmentGroup,
    unit: table.unit,
    region: table.region,
    columns: table.columns,
    rows: table.rows,
  }));

  const messages: ChatCompletionMessage[] = [
    { role: "system", content: normalizerInstructions(observed) },
    { role: "user", content: `Brand: ${brandName}\n\nTables:\n${JSON.stringify(payload)}` },
  ];

  const { content } = await createChatCompletion(getPlatformOpenAiKey(), messages, {
    model: RESEARCH_MODEL,
    jsonSchema: { name: "brand_chart_rows", schema: normalizerSchema(batch.group) },
    timeoutMs: CALL_TIMEOUT_MS,
  });

  if (!content) throw new ResearchResponseError("The normalizer returned an empty response.");

  let parsed: { charts?: unknown };
  try {
    parsed = JSON.parse(content) as typeof parsed;
  } catch {
    throw new ResearchResponseError(
      `The normalizer's response was not valid JSON (${content.length} characters) — likely truncated.`
    );
  }

  if (!Array.isArray(parsed.charts)) throw new ResearchResponseError("The normalizer returned no charts array.");

  const normalized: NormalizedChart[] = [];
  for (const entry of parsed.charts) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;

    const index = typeof record.table_index === "number" ? record.table_index : -1;
    const table = batch.tables[index];
    if (!table || table.garmentGroup === "other") continue;

    normalized.push({
      table,
      group: table.garmentGroup,
      confidence: typeof record.confidence === "number" ? record.confidence : 0,
      rows: parseSizeChart(record.rows, table.garmentGroup),
    });
  }

  return normalized;
}
