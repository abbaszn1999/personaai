import type { UnsupportedSourceState } from "../product-chart";

/**
 * Where a brand's official sources publish nothing usable, said out loud instead of left implicit.
 *
 * Two shapes, both consumed by `resolveProductChart` so the publication gate reports
 * `unsupported-source` (with this reason) rather than an anonymous `no-chart` / `sizes-unresolved`:
 *
 *  - no `labels`: the leaf has no official table at all, so no chart claims it;
 *  - `labels`: a chart claims the leaf, but the source prints no row for these stocked labels.
 *
 * An entry is a statement about the SOURCE, never a shortcut. Each is re-checked whenever the
 * brand's pages are re-extracted; when a source starts publishing the data, delete the entry and add
 * the chart rows. Nothing here ever produces a size recommendation.
 */

const VERIFIED_AT = "2026-10-05";

const PENTI_DYNAMIC_GUIDE =
  "Penti renders its size tables client-side; the pages return no table to a machine reader, so no row can be transcribed without guessing.";

const kidsPairedAges = ["8/9", "10/11", "12/13"];

function state(
  brandKey: string,
  leafKey: string,
  reason: string,
  extra: Pick<UnsupportedSourceState, "labels" | "evidenceUrl"> = {},
): UnsupportedSourceState {
  return { brandKey, leafKey, reason, missingFields: [], verifiedAt: VERIFIED_AT, ...extra };
}

export const UNSUPPORTED_SOURCES: UnsupportedSourceState[] = [
  // Tom Tailor ------------------------------------------------------------------------------
  state(
    "tom_tailor",
    "men:bottom:swim-short",
    "The Tom Tailor size guide publishes no swimwear table; men's swim shorts have no official size source.",
    { evidenceUrl: "https://www.tom-tailor.eu/en/size-guides" },
  ),
  state(
    "tom_tailor",
    "men:bottom:short",
    "The men's American-size table stops at XXXL; larger alpha labels are not published for shorts.",
    { labels: ["4XL"], evidenceUrl: "https://www.tom-tailor.eu/en/size-guides" },
  ),
  state(
    "tom_tailor",
    "women:bottom:short",
    "Shorts stocked as EU size / short-length (34/28 ...) have no published length-28 option; the guide lists inside legs 30, 32 and 34 only.",
    {
      labels: ["32/28", "34/28", "36/28", "38/28", "40/28", "42/28", "44/28", "46/28"],
      evidenceUrl: "https://www.tom-tailor.eu/en/size-guides",
    },
  ),

  // Tommy Hilfiger ----------------------------------------------------------------------------
  ...[
    "kids-unisex:top:t-shirt",
    "kids-unisex:top:shirt",
    "kids-unisex:top:hoodie",
    "kids-unisex:bottom:trouser",
    "kids-unisex:bottom:short",
  ].map((leaf) =>
    state(
      "tommy_hilfiger",
      leaf,
      "The product stocks size 92 (Tommy's infant table, 24M) together with 3-16 year sizes. Tommy publishes these as two separate tables, so no single chart can size the whole product.",
      { labels: ["92"], evidenceUrl: "https://uk.tommy.com/children-size-guide" },
    ),
  ),

  // Penti -----------------------------------------------------------------------------------
  ...[
    "women:footwear:sock",
    "women:footwear:slipper",
    "kids-girls:footwear:sock",
    "kids-boys:footwear:shoe",
  ].map((leaf) =>
    state("penti", leaf, "Penti publishes no foot-length or body measurements for socks, slippers and shoes."),
  ),
  state(
    "penti",
    "kids-girls:full-body:swimsuit",
    `Children's swimwear has no readable size table. ${PENTI_DYNAMIC_GUIDE}`,
  ),
  state(
    "penti",
    "women:bottom:legging",
    "Hosiery-style numeric sizes (1-6, paired 1/2 3/4 5/6) and XXS/XXL are not mapped to body measurements by any Penti page.",
    { labels: ["1", "2", "3", "4", "5", "6", "1/2", "3/4", "5/6", "XXS", "XXL"] },
  ),
  ...["women:top:swim-top", "women:bottom:swim-bottom", "women:full-body:swimsuit"].map((leaf) =>
    state(
      "penti",
      leaf,
      `Swimwear is stocked in EU 34-50 but the guide's EU-to-measurement mapping is not readable. ${PENTI_DYNAMIC_GUIDE}`,
      { labels: ["34", "36", "38", "40", "42", "44", "46", "48", "50"], evidenceUrl: "https://www.penti.com/en/guide/bikini" },
    ),
  ),
  state(
    "penti",
    "women:top:bra",
    "Bralettes are stocked in alpha, cup-only and paired alpha sizes; the bra guide publishes band+cup (70A-95E) rows only.",
    {
      labels: ["XS", "S", "M", "L", "XL", "A", "B", "C", "S/M", "M/L", "L/XL", "LXL", "XL/XXL", "100C", "100D"],
      evidenceUrl: "https://www.penti.com/en/rehber/sutyen",
    },
  ),
  state(
    "penti",
    "women:top:t-shirt",
    "Paired alpha labels (S/M, M/L, L/XL) span two chart rows; the source publishes single-size rows only.",
    { labels: ["S/M", "M/L", "L/XL"] },
  ),
  state(
    "penti",
    "women:full-body:kaftan",
    "STD (standard) is a one-size label with no published measurement.",
    { labels: ["STD"] },
  ),
  ...[
    "kids-boys:top:t-shirt",
    "kids-girls:top:t-shirt",
    "kids-boys:bottom:trouser",
    "kids-girls:bottom:trouser",
    "kids-boys:full-body:set",
    "kids-girls:full-body:set",
    "kids-girls:full-body:dress",
    "kids-boys:full-body:sleepsuit",
    "kids-girls:full-body:sleepsuit",
  ].map((leaf) =>
    state(
      "penti",
      leaf,
      `Children's ages 8-9, 10-11 and 12-13 are stocked but absent from the only readable grid. ${PENTI_DYNAMIC_GUIDE}`,
      { labels: kidsPairedAges },
    ),
  ),
];
