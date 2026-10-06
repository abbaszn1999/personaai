# Fit filter and Sizing Tester

How a shopper's body measurements become an ACS filter, why the rule is what it is, and how the
Sizing Tester shows the real ACS answer. Covers the design discussion and what was implemented.

## 1. Why this was changed

The fit filter decides which products the Persona agent may show, so it has to be correct and it
has to be testable. Before this change there were three inconsistent implementations:

| Where | What it did |
|---|---|
| Persona chat (`searchCatalog`) | ACS filter with a ±4 cm slack, then a code recheck (`fittingSizes`) that compared every measurement a chart listed, with special rules for one-number charts. |
| Tester API (`suitable-products.ts`) | ACS filter on the exact value (no tolerance) plus a size-label clause, then `productExactlyFits` in code. |
| Tester "Best Fit" (`matching.ts`) | Client-side weighted-distance maths with an invented 92-99.5% score. |

The Sizing Tester exists to test the accuracy of the ACS filter. Showing our own maths instead of
the ACS answer defeats that purpose, so the tester must send the real filter and show what ACS
returns.

## 2. Decisions

### One rule: range overlap with a fixed tolerance

A shopper value `v` fits a size when the size's range reaches anywhere inside `[v - t, v + t]`:

```
min <= v + t   AND   max >= v - t
```

The same test works for brands that publish ranges (chest 92-96) and brands that publish one
nominal number per size (chest 97, a range of one point). Example: chest 95 with a tolerance of 2
matches everything between 93 and 97.

### Which measurements go to ACS

Only the measurement that decides the size for the garment group, and nothing else:

| Group | Sent to ACS | Tolerance |
|---|---|---|
| Tops, outerwear, dresses | chest | ±2 cm |
| Bottoms | waist | ±2 cm |
| Footwear | foot length | ±0.3 cm |
| Kids (every group) | height | ±5 cm (not tuned yet) |

Foot length comes from the EU shoe size: `eu * 2/3 - 1.5`.

### Why not send more

ACS has no documented "field is absent" predicate. A clause on a field a product's chart does not
have fails, and the product disappears for every shopper. So:

- **Waist on tops** and **hips on bottoms** are not sent. Many charts do not list them, and a
  shirt cut from the chest can fit someone whose waist is outside the listed range.
- Hips matter for trousers, especially women's, but waist is the primary dimension (ISO 8559-2).
  Hips are used only to rank sizes. Whether to also send them waits on counting how many bottoms
  charts list a hip range.
- Inseam and age are not collected from the shopper, so they are not used. Height is kids-only.
- The retrieval slack for inseam, hip and the old ±4 values were removed.

### The tolerances are design choices, not a standard

No ISO or ASTM standard defines a body-to-chart matching tolerance. The values sit below half of
the usual 4 cm chest/waist grade step and below half of a Mondopoint step (0.5 cm). ISO 8559-2
only fixes which dimension is primary (chest for jackets and shirts, waist for trousers).
They live in one place and can be tuned: `FIT_TOLERANCE_CM` in `src/lib/sizing/fit-index.ts`
(re-exported from `src/lib/agents/shared/fit.ts`).

### Several sizes can pass: the tie-break

A tolerance window can touch two neighbouring sizes (chest 85 reaches both XS 84-87 and
XXS 80-83). Sizes that fit are ordered best first:

1. Inside the range, rather than only within tolerance.
2. The optional measurements (waist on a top, hips on trousers) inside their ranges.
3. Closest to the middle of the range.
4. A tie goes to the bigger size.

The first size in the list is the one used for the cart.

### ACS decides products; rows decide sizes

ACS indexes the exact values the in-stock sizes cover (see "Exact fit value index" at the end), so
a product passes the filter only when a size someone can buy is within tolerance. The size rows
(`fit_rows`) then name and rank the fitting sizes. In the rare case a product still comes back
with no fitting row (an edge value from outward rounding, or an index published before a size sold
out):

- **Persona chat** drops such a product, because it must never show something that does not fit.
- **The tester** keeps it and flags it ("no fitting size row"), because exposing that gap is the
  point of the tester.

## 3. What was implemented

### Shared fit logic: `src/lib/agents/shared/fit.ts`

- `FIT_TOLERANCE_CM`: the fixed tolerances above.
- `fitGroupClause(group, body, child, unsupported)`: the ACS clause for one group
  (`fit_group` plus the deciding measurement window). Null when the shopper lacks the
  measurement or ACS does not index the field.
- `fitFilterClause(...)`: every group's clause joined with `OR`. Used by the Persona agent.
- `fitRowSizes(rows, group, body, child, named)`: the sizes that fit among a product's chart rows,
  best first, using the tie-break above.
- `fittingSizes(candidate, body, named, child)`: the same, for a catalog candidate. It reads the
  group from the product's `fit_group` attribute; a product without one has nothing to confirm.
- The old one-number-chart special case (`pointFits`) is gone: a point is a range of one value.

Callers updated: `searchCatalog` (`shared/search.ts`) and the context builder (`shared/context.ts`)
now pass whether the shopper is a child.

### Tester backend

- `src/lib/catalog/acs/fit-search.ts` (replaces `suitable-products.ts`):
  - `parseFitSearchQuery`: validates brand, group, department, chart and measurements, and
    requires the group's deciding measurement.
  - `buildFitSearchFilter`: brand, the shared `fitGroupClause`, department (`fit_audience`),
    chart (`fit_chart_variant`) and `IN_STOCK`. No size-label clause and no code recheck.
  - `toFitSearchProducts`: groups variants under their parent product and attaches `fitSizes`.
    Nothing ACS returned is removed. "No brand" cannot be expressed in ACS, so it is scoped from
    the retrievable `brands` field and the number dropped is reported.
  - `unsupportedFitField`: recognises ACS rejecting a fit field it does not know yet.
- `GET /api/store-connection/sizing/tester/products`:
  - Reads up to 5 pages of 100 hits.
  - Returns `products`, `hitCount`, ACS's own `totalSize`, `pages`, `truncated`, `outOfScope`, the
    exact `filter` string and the `tolerances` used.
  - Returns 422 with `reason: "unsupported_field"` when ACS does not index the fit field yet,
    instead of a generic 500.

### Tester frontend

The page was a demo component under `Documentation/store_src_demo_frontend`. It was copied to
`src/modules/store/sizing/tester/sizing-tester-view.tsx` and the store dashboard now imports that
copy. The original is untouched. Layout is unchanged.

- **Found Sizes** sends the request and shows a loading state on the right while ACS answers.
- Results show: products returned, how many have a fitting stocked size, how many have no fitting
  size row, hit count and ACS total, the tolerance used, and a collapsible "Filter sent to ACS"
  block with the exact string.
- The size table's **Items** column is the count of ACS products with that size within tolerance;
  **Status** is "Best Fit", "ACS match" or "No ACS items".
- The **Items** popup lists the ACS products for a size, and "View all" lists everything ACS
  returned. Each product shows the sizes that fit, or "No stocked size fits".
- An answer is shown only while the request on screen is the one that produced it; changing a
  sent input hides it until the button is pressed again. Weight and an adult's height are not
  sent, so changing them does not invalidate it.
- Removed: the locally computed size badges on the category chips and the fake match score.
- `src/modules/store/sizing/tester/acs-result.ts` holds the request builder
  (`testerSearchParams`) and the per-size summary (`summarizeSearch`, `productFitsSize`).
  The best-fit highlight is chosen only among sizes ACS actually produced products for.

### Removed

- `src/modules/store/sizing/tester/matching.ts` and its test.
- `src/lib/catalog/acs/suitable-products.ts` and its test.

### Tests

New or rewritten: `shared/fit.test.ts`, `shared/search.test.ts` (fixtures now carry `fit_group`),
`catalog/acs/fit-search.test.ts`, `tester/products/route.test.ts`, `tester/acs-result.test.ts`.
`tsc` is clean. The one failing suite, `sizing/charts/route.test.ts`, needs Supabase env vars and
failed before this work.

## 4. Verified live against ACS

Against the test store (`5dd08b5c-cfaa-4c55-b502-677e895dc99d`), before the exact value index
below replaced the numeric min/max attributes:

| Request | Filter accepted | Result |
|---|---|---|
| Tops, chest 85 | `fit_chest_min IN(*,87i) AND fit_chest_max IN(83i,*)` | 100 products returned of a total of 230; sizes S and XS matched for several T-shirts |
| Tops, chest 97 | `IN(*,99i)` / `IN(95i,*)` | total 440; sizes M and L matched |
| Bottoms, waist 80 | `fit_waist_min IN(*,82i)` / `fit_waist_max IN(78i,*)` | total 105; sizes 30, 31, 32 matched for jeans |
| Footwear, foot 27.2 | rejected | ACS has no `fit_foot_length_min` field: no footwear sizing has reached the catalog |

## 5. Known issues and open points

- **Footwear:** cannot be filtered or tested until footwear charts are synced to ACS. The Persona
  agent already drops the footwear branch in that case; the tester now explains it.
- **Hips for bottoms:** ranking signal only. Count how many published bottoms charts list a hip
  range; above roughly 90% it becomes safe to add a hip value list at ±2 cm.
- **Data quality:** at chest 85 a Penti bra came back as a top (band size in the chest range).
  That is a chart mapping issue, not the filter.
- **Kids:** only wired through the same code path (height ±5 cm). The age slider no longer
  affects the search. Tolerances and age intervals still need research (EN 13402).
- **Unisex and kids-unisex shoppers** stay strict: only unisex-tagged products.
- **Pagination:** the tester reads at most 5 pages; `truncated` says when more exist, and the
  per-size counts are then partial.

## Follow-up: Found Sizes runs for every chart

- **One click, every chart.** Found Sizes now sends one request per category x subcategory chart of the selected brand and persona (4 at a time). Each answer is stored per chart, so switching category or subcategory shows that chart's own result without pressing the button again. Category chips show `matched/total` charts that got a best size; the subcategory dropdown shows `Best <size>`, `no match` or `failed`.
- **Stale answers.** An answer only counts while its request string still equals what the inputs on screen would send (brand, persona, measurements that apply to that group). Changing a slider hides outdated answers.
- **Per-chart failures** (for example footwear before foot-length charts are indexed) show on that chart only and do not stop the others.
- **"0 products" explained.** When ACS returns nothing, the route sends the same scope filter (brand, audience, chart variant, in stock) without the measurements and returns `chartProducts`. `0` means no product in the store is matched to that chart (the case for Tom Tailor "Men Blazers": its variant has 0 products even with no measurement filter, while "Men Jackets" has 26). A positive number means products exist on the chart but none is within tolerance.
- `buildChartScopeFilter` in `src/lib/catalog/acs/fit-search.ts` builds that measurement-free filter.

## Exact fit value index

ACS cannot look inside a product's list of size rows, and one min/max range across all sizes would
also match the gap left by a sold-out size. So the filter works on exact value lists instead.

### How a product is stored

For each size-deciding measurement, the product carries a text list of the values its in-stock
sizes cover. The module `src/lib/sizing/fit-index.ts` is the single source for the attribute
names, step sizes, domains and tolerance; both the writer and the filter import it.

| Measurement | Attribute | Step | Domain |
|---|---|---|---|
| chest | `fit_chest_cm` | 1 cm | 30-200 |
| waist | `fit_waist_cm` | 1 cm | 30-200 |
| height | `fit_height_cm` | 1 cm | 40-250 |
| foot length | `fit_foot_length_cm` | 0.1 cm | 8-36 |

Example, Navy T-Shirt with S 88-93, M 93-98 (sold out), L 98-104, XL 104-110 (sold out):

```
fit_group:        ["tops"]
fit_size_labels:  ["S", "L"]
fit_rows:         ['{"s":"S","chest":[88,93],...}', '{"s":"L","chest":[98,104],...}']
fit_chest_cm:     ["88", "89", ..., "93", "98", "99", ..., "104"]
```

- The PRIMARY record lists the values of every stocked size. A VARIANT record lists only its own
  row. A sold-out size has no sizing entry, so it contributes nothing.
- A row's bounds are rounded outward (floor of the minimum, ceiling of the maximum) so a list can
  only be too wide, never too narrow. A missing bound runs to the edge of the measurement's domain,
  which also keeps every list under ACS's 400-values-per-attribute cap.
- `fit_rows` stays non-indexed. It is read back from search results and decides the size names and
  ranking (`fitRowSizes`).
- Hip, inseam and age are no longer indexed. Their values remain inside `fit_rows`.

### How the filter reads it

`fitGroupClause` asks for every value within tolerance of the shopper:

```
(attributes.fit_group: ANY("tops") AND attributes.fit_chest_cm: ANY("98", "99", "100", "101", "102"))
```

`ANY(...)` on a textual custom attribute is documented ACS syntax. Chest 100 matches the product
above through L; chest 95 (window 93-97) matches through S at 93; chest 96 (window 94-98) matches
through L at 98; and chest 107 matches nothing, because XL is sold out.

A property test (`fit-index.test.ts`) checks that whenever the exact row check accepts a size,
the row's listed values and the shopper's window overlap, so the filter never drops a size that
fits.

### Rollout

1. `npm run acs:bootstrap` registers the four attributes in the catalog.
2. Republish sizing for each store, so every product is rewritten with the value lists. Until a
   store is republished its products carry no lists and fit searches return nothing for it.
3. The old numeric `fit_*_min` / `fit_*_max` attributes stay registered in the catalog but are no
   longer written or filtered on.
