# Global Brand Sizing-Chart Extraction Guide

This is the authoritative operating guide for discovering, extracting, validating, publishing, and
maintaining a verified global-brand seed. Read it before researching a brand, editing a seed,
reviewing chart coverage, or publishing charts. A future extraction agent must be able to complete a
brand from this file without relying on chat history or undocumented judgement.

Its scope is sizing-chart extraction only. It does not define shopper onboarding, shopper-profile
questions, measurement capture, or image creation.

The executable sources of truth are:

- Persona taxonomy: `src/modules/store/mapping/persona-taxonomy.ts`
- Measurement and sizing-group rules: `src/lib/sizing/measurements.ts`
- Seed shape and row helpers: `src/lib/sizing/seeds/types.ts`
- Seed registry: `src/lib/sizing/seeds/index.ts`
- Seed acceptance tests: `src/lib/sizing/seeds/seeds.test.ts`
- Shared-registry writer: `scripts/seed-sizing-charts.ts`
- Best complete reference: `src/lib/sizing/seeds/global-brands/tommy-hilfiger.ts` and
  `src/lib/sizing/seeds/global-brands/tommy-hilfiger-kids.ts`

This document defines the required process. The executable contracts enforce it; neither is optional.
A Markdown checklist alone cannot prove completeness, so every extraction also produces the
machine-readable source manifest described in section 13.

## 1. What a global seed guarantees

A global seed is brand-level data, never merchant-level data.

- It is written to `sizing_charts`, not `sizing_charts_private`.
- `connection_id` is always `null`.
- Its canonical `brand_key` is reused by every merchant whose Stage 4 brand mapping resolves to that
  canonical brand.
- It must not read or modify a merchant's products, earlier-stage mappings, taxonomy choices, or raw
  brand labels.
- Merchant aliases remain unchanged. Canonical mapping only decides which shared brand charts they
  may use.
- `covers_leaves` states garment coverage. It is necessary but not sufficient when several official
  tables cover the same leaf: product line, fit class, age band, market, supported label systems, and
  the chart's applicability metadata disambiguate those variants.
- Seeds are researched against the complete Persona taxonomy, not only the leaves or SKUs present in
  the connected test store.

The target is complete coverage for every official table and every Persona leaf to which that table
honestly applies, including tables for a line, fit class, age band, or regional label system that the
base chart does not cover. Complete does **not** mean assigning an unrelated chart to force a green
badge. A tops chart cannot fill footwear, and an adult chart cannot fill child apparel. Unsupported
leaves must stay visible as gaps until a valid source is found.

A completed brand has all of the following:

- every official source family and table inventoried before transcription;
- every usable official table represented by a chart;
- every unsupported table or leaf recorded with the exact missing official measurement;
- every official size label and parallel label system captured;
- every current catalog product resolving to exactly one applicable chart;
- every stocked size label resolving to exactly one chart row;
- no guessed measurements, widths, conversions, aliases, or sibling-gender fallbacks;
- source provenance and a dated verification record sufficient to detect later source drift.

## 2. Why Penti currently shows partial coverage

Stage 4 shows `3/4 keys` for Penti because the connected catalog carries:

- `tops` — covered
- `bottoms` — covered
- `dresses` — covered
- `footwear` — not covered

Penti publishes sellable footwear, slipper, and sock labels, but no official heel-to-toe
`foot_length` table was found. Footwear requires `foot_length`; clothing chest/waist/height data
cannot substitute for it.

The global registry currently contains 14 Penti charts, including the exact published bra grid and
children's height-based apparel tables. In the current store they cover 174 of 192 mapped SKUs. The
remaining 18 are footwear/socks/slippers and child swim leaves whose published specialist table has
no child height mapping. This is a source-data gap, not a save failure.

## 3. Tommy Hilfiger database benchmark

The shared `sizing_charts` table was checked directly. Tommy Hilfiger currently has:

- 40 shared charts
- 395 size rows
- 174 unique Persona leaves covered
- all five sizing groups represented
- five audiences represented: `mens`, `womens`, `boys`, `girls`, `kids`
- `connection_id = null` on every row
- `confidence = 1.00` and `provenance = manual` on every row

It is the structural benchmark because it separates real published tables such as women denim,
women swim, wired bras, men swim/lounge, tailored menswear, boys, girls, infant, shoes, and socks.
Do not copy its measurements or leaf coverage to another brand.

Tommy Hilfiger does not claim all Persona leaves blindly. For example, unsupported whole departments
or source gaps remain explicit. Its quality comes from accurate table-to-leaf coverage, not from
artificially reaching 100%.

## 4. The complete Persona taxonomy

There are six departments. Every department has the same five parent categories:

1. `top` → seed `sizingCategory: "tops"`
2. `bottom` → seed `sizingCategory: "bottoms"`
3. `full-body` → seed `sizingCategory: "dresses"`
4. `outerwear` → seed `sizingCategory: "outerwear"`
5. `footwear` → seed `sizingCategory: "footwear"`

Leaf identity is always `department:category:leaf`.

### Women

Taxonomy version 4. A leaf stands for every garment folded into it (listed in `LEAF_MERGES_V4` in
`persona-taxonomy.ts`): claim `shirt` for a table headed Blouses, `jacket` for Coats, `trouser` for
Chinos or Joggers, and so on. Never write a removed leaf into `coversLeaves`.

- `women:top:*`: `t-shirt` (camisole, tank-top, crop-top, tunic, bodysuit), `shirt` (blouse),
  `knit` (sweater), `hoodie` (sweatshirt), `activewear-top`, `swim-top`, `sleep-top`, `bra`
- `women:bottom:*`: `trouser` (culotte), `jean`, `skirt`, `short`, `legging` (activewear-bottom),
  `swim-bottom`, `sleep-bottom`
- `women:full-body:*`: `dress` (gown), `jumpsuit` (romper), `kaftan` (abaya), `set`, `swimsuit`,
  `sleepwear-set`
- `women:outerwear:*`: `jacket` (coat, trench, vest, kimono), `blazer`, `cardigan`,
  `activewear-jacket`
- `women:footwear:*`: `sneaker`, `boot`, `sandal`, `heel` (flat, loafer, mule, wedge), `slipper`,
  `sock`

### Men

- `men:top:*`: `t-shirt`, `polo-shirt`, `shirt`, `knit` (sweater), `hoodie` (sweatshirt),
  `activewear-top`, `sleep-top`
- `men:bottom:*`: `trouser` (chino, jogger), `jean`, `short`, `activewear-bottom`, `swim-short`,
  `sleep-bottom`
- `men:full-body:*`: `suit`, `jumpsuit` (overall), `thobe`, `set`, `sleepwear-set`
- `men:outerwear:*`: `jacket` (coat, gilet), `blazer` (suit-jacket), `cardigan`,
  `activewear-jacket`
- `men:footwear:*`: `sneaker`, `boot`, `sandal` (espadrille), `dress-shoe` (loafer), `slipper`,
  `sock`

### Adult Unisex

- `unisex:top:*`: `t-shirt`, `shirt`, `knit` (sweater), `hoodie` (sweatshirt), `activewear-top`
- `unisex:bottom:*`: `trouser` (jogger), `jean`, `short`, `activewear-bottom`
- `unisex:full-body:*`: `jumpsuit` (overall), `set`
- `unisex:outerwear:*`: `jacket` (coat, gilet), `cardigan`
- `unisex:footwear:*`: `sneaker`, `boot`, `sandal` (slide), `slipper`, `sock`

### Kids Boys

- `kids-boys:top:*`: `t-shirt`, `shirt`, `knit`, `hoodie` (sweatshirt), `bodysuit`,
  `activewear-top`, `sleep-top`
- `kids-boys:bottom:*`: `trouser` (jean, jogger), `short`, `legging`, `swim-short`, `sleep-bottom`
- `kids-boys:full-body:*`: `romper` (all-in-one), `sleepsuit`, `set`, `swimsuit`, `bathrobe`
- `kids-boys:outerwear:*`: `jacket` (coat), `cardigan`, `snowsuit` (pramsuit)
- `kids-boys:footwear:*`: `shoe` (sneaker), `boot`, `sandal`, `bootie`, `slipper`, `sock`

### Kids Girls

- `kids-girls:top:*`: `t-shirt`, `shirt` (blouse), `knit`, `hoodie` (sweatshirt), `bodysuit`,
  `activewear-top`, `sleep-top`, `bra`
- `kids-girls:bottom:*`: `trouser` (jean, jogger), `skirt`, `short`, `legging`, `sleep-bottom`
- `kids-girls:full-body:*`: `dress`, `romper` (all-in-one), `sleepsuit`, `set`, `swimsuit`,
  `bathrobe`
- `kids-girls:outerwear:*`: `jacket` (coat), `cardigan`, `snowsuit` (pramsuit)
- `kids-girls:footwear:*`: `shoe` (sneaker), `boot`, `sandal`, `bootie`, `slipper`, `sock`

### Kids Unisex

- `kids-unisex:top:*`: `t-shirt`, `shirt`, `knit`, `hoodie` (sweatshirt), `bodysuit`, `sleep-top`
- `kids-unisex:bottom:*`: `trouser` (jean, jogger), `short`, `legging`, `sleep-bottom`
- `kids-unisex:full-body:*`: `romper` (all-in-one), `sleepsuit`, `set`, `swimsuit`, `bathrobe`
- `kids-unisex:outerwear:*`: `jacket` (coat), `cardigan`, `snowsuit` (pramsuit)
- `kids-unisex:footwear:*`: `shoe` (sneaker), `boot`, `sandal`, `bootie`, `slipper`, `sock`

Whenever `persona-taxonomy.ts` changes, update this snapshot and every affected seed audit.

## 5. Fixed extraction table

Only the fields in this table may be emitted. `Size` means the row's primary `size`.

| Audience | Seed group | Fixed columns |
| --- | --- | --- |
| Adults | Tops | Size, Chest, Waist |
| Adults | Outerwear | Size, Chest, Waist |
| Adults | Bottoms | Size, Waist, Hip, Inseam |
| Adults | Full-body (`dresses`) | Size, Chest, Waist, Hip |
| Adults | Footwear | Size, Foot Length |
| Kids | Tops | Size, Age, Chest, Waist, Height |
| Kids | Outerwear | Size, Age, Chest, Waist, Height |
| Kids | Bottoms | Size, Age, Waist, Hip, Inseam, Height |
| Kids | Full-body (`dresses`) | Size, Age, Chest, Waist, Hip, Height |
| Kids | Footwear | Size, Age, Foot Length |

Kids means `boys`, `girls`, or `kids`; adults means `mens`, `womens`, or `unisex`. Age is stored as
`aliases.age`, never as a measurement bound. Leave any fixed column blank when the official source
does not publish it. Never infer, interpolate, convert from an unrelated field, or invent a value.
Drop every measurement outside this table. In particular, drop `underbust` even for bras; retain
published `chest`. A single official point value must stay a point and the chart must set
`sourcePublishesPointValues: true`.

Footwear requires heel-to-longest-toe `foot_length`; regional shoe conversions alone do not replace
it. Model measurements, the size worn by a photographed model, and product dimensions are not chart
rows.

## 6. Every `SeedChart` field

| Field | How to fill it |
| --- | --- |
| `brandKey` | Canonical normalized key, for example `tommy_hilfiger`. It must match the key in `CHART_SEEDS`. |
| `sizingCategory` | Exactly one of `tops`, `bottoms`, `dresses`, `outerwear`, `footwear`. |
| `variantName` | Stable human-readable identity of the published table. Unique for the same brand and sizing category. Include audience and real garment distinction, not merchant names. |
| `coversLeaves` | Explicit Persona leaf keys for which this exact table is authoritative. This is assignment truth. |
| `audience` | One of `mens`, `womens`, `boys`, `girls`, `kids`, `unisex`. |
| `sourceTitle` | The official table heading, close to verbatim. |
| `sourceUrl` | Direct current official brand URL. Retailer fallback requires an explicit note and should be exceptional. |
| `chartRows` | Normalized size rows built with `rowsFromColumns` where possible. |
| `sourcePublishesPointValues` | `true` only when the official source prints one nominal value rather than ranges. The writer persists the row marker automatically. |
| `notes` | Decisions, omissions, ambiguities, corrections, conversions, malformed columns, and provenance details. Notes are code audit history and are not database columns. |

Department-to-audience mapping:

- `women` → `womens`
- `men` → `mens`
- `unisex` → `unisex`
- `kids-boys` → `boys`
- `kids-girls` → `girls`
- `kids-unisex` → `kids`

`variantName` is database identity together with `brandKey` and `sizingCategory`. Audience is not
part of that unique key, so names such as `Boys General` and `Girls General` must be distinct.

Fit classes such as Tall, Petite, Long, Big & Tall, Plus, Slim, or Regular describe a body block,
not a taxonomy leaf. They must still be inventoried and transcribed when officially published.
Their applicability metadata must name the fit class, and the resolver must have an explicit signal
that can choose them before they may claim a shared garment leaf. Until that selector exists, retain
the chart in the manifest as `blocked` rather than omitting the official table or pretending the base
chart covers it.

## 7. Every chart-row field

Each row has:

- `size`: the primary sellable label, such as `M`, `38`, `80B`, or `9-10`.
- `aliases`: only parallel labels printed on the same official row.
- measurement bounds: `<measurement>_min` and `<measurement>_max`.
- `source_point_values: true`: persisted marker for official exact reference points. The seed writer
  adds it automatically when the chart sets `sourcePublishesPointValues`.

Allowed alias keys:

- `alpha`: S/M/L labels
- `eu`, `uk`, `us`: actual regional systems
- `numeric`: market-neutral dress/denim/plain numeric sizing
- `age`: child age label; allowed only for `boys`, `girls`, and `kids`
- `neck`: collar label sold as a size; allowed only on `tops`
- `waist_inseam`: combined label such as `34/31`; allowed only on `bottoms`

Do not add an alias merely because a generic conversion table says it is equivalent. It must appear
on the brand's own row. The base aliases `alpha`, `eu`, `uk`, `us`, and `numeric` are allowed for all
audiences and categories. Adult charts must not carry `age`.

Use `rowsFromColumns` to transpose a published table. Every alias and bound array must have exactly
the same number of entries as `sizes`.

## 8. Research and extraction procedure

1. Normalize the brand name and confirm its canonical key and official company identity.
2. Search every official market and source class in section 14, not only the merchant's market.
3. Build the complete source inventory and discovery matrix before writing a chart.
4. Record every official table, including variants that cannot yet be selected or lack a required
   measurement. Absence from the seed must never mean it was never investigated.
5. Reject model measurements, reviews, marketplace conversions, generic regional charts, and
   garment dimensions presented as body dimensions.
6. Classify each table by audience, group, product line, fit class, age band, market, and published
   sizing systems.
7. Decide whether one source table must be copied across groups. Do so only where the heading and
   measurements explicitly govern both groups; retain one shared `sourceTableId`.
8. Transcribe every official primary label, parallel label, measurement, unit, open bound, missing
   cell, duplicate, and source anomaly.
9. Convert inches to centimetres once during normalization and record the original value, unit,
   conversion rule, and rounded result in notes/manifest evidence.
10. Preserve source errors or withhold the affected row/table. Never silently repair a probable typo.
11. Map each table to explicit Persona leaves. Every claim needs heading evidence or separately
    recorded official brand evidence; body similarity alone is not evidence.
12. Audit all six departments, five categories, 214 standard leaves, custom-leaf policy, and every
    specialist family even when the current merchant has no SKU there.
13. Compare every current catalog raw size system and token with the extracted row labels. Catalog
    replay discovers missing aliases and variants; it never authorizes invented conversions.
14. Add unsupported leaves/tables to the manifest gap register and executable allowlists with a
    source-based reason and the exact missing field.
15. Register the seed and manifest, run all tests, run dry publication, and reject any blocker.
16. Publish one brand, replay all affected products, rebuild ACS, run every tester chart/system, and
    verify the database and cart-size behavior.

## 9. Leaf-coverage rules

- A chart can claim many leaves when the official table genuinely covers them.
- A leaf must match both the chart audience and sizing group.
- Specialized tables should take specialized leaves: denim → jean, swim top → swim-top, swim bottom
  → swim-bottom, wired bra → bra, shoes → footwear excluding socks unless the source includes socks.
- A general published table may cover several garment leaves in its stated family.
- Different tables can share a source page, but each database row must represent one coherent table.
- Do not merge incompatible scales into one chart.
- More than one chart may claim one leaf only when applicability metadata makes selection
  deterministic (for example disjoint infant and older-child age/size bands). Merely documenting a
  double claim is not sufficient: the resolver must prove exactly one result for every product.
- Zero current products does not remove a leaf from global coverage. Coverage describes what the
  chart supports for any future merchant.
- Current merchant scope controls what Stage 4 displays, not what the global seed contains.

If a leaf cannot be covered:

1. Search official sources again, including localized sites, official images, PDFs, and embedded
   page data.
2. If an official source still lacks the category's required measurement, document the gap.
3. Leave Stage 4 partial and show Contact support.
4. Never create a plausible-looking chart from another brand or a generic internet conversion.

## 10. Database columns

Global publication writes these `sizing_charts` fields:

| Database column | Seed/source |
| --- | --- |
| `id` | Generated by database |
| `connection_id` | Always `null` for global charts |
| `brand_key` | `brandKey` |
| `sizing_category` | `sizingCategory` |
| `variant_name` | `variantName` |
| `covers_leaves` | `coversLeaves` |
| `audience` | `audience` |
| `source_title` | `sourceTitle` |
| `source_table_id` | Stable manifest `sourceTableId` |
| `applicability` | Product line, fit class, age band, and market |
| `deciding_measurements` | Measurements this table uses to select a row |
| `source_verification` | Verification date/status/locale/evidence/snapshot metadata |
| `chart_rows` | `chartRows` JSON |
| `confidence` | `1` for hand-verified seeds |
| `source_url` | `sourceUrl` |
| `provenance` | `manual` |
| `version` | Database-managed/current row version |
| `created_at`, `updated_at` | Database timestamps |

The writer deliberately accepts no connection ID and cannot write private charts.

## 11. Validation and publication

Run:

```bash
pnpm exec vitest run src/lib/sizing/seeds/seeds.test.ts
pnpm sizing:seed -- --dry-run canonical_brand_key
pnpm sizing:seed -- canonical_brand_key
```

The tests verify:

- canonical brand registration
- valid sizing groups and audiences
- stable unique chart identity
- required measurements on every row
- min/max order and monotonic required measurements
- valid labels and regional aliases
- official sources
- valid audience/group leaf claims
- no fit-class chart claiming general leaves
- bounded overlap per leaf
- complete audit of all six Persona departments
- explicit individual gaps and unsupported whole departments

After publication verify:

- every global row has `connection_id IS NULL`
- `provenance = 'manual'`
- `confidence = 1`
- row counts and `covers_leaves` match the seed
- no row leaked into `sizing_charts_private`
- Stage 4 canonical brands load the shared charts
- charted key count and SKU count agree with leaf coverage
- unsupported leaves remain visible as partial coverage rather than receiving a wrong chart

## 12. Completion checklist for a new brand

- [ ] Canonical key confirmed
- [ ] Official sources saved and verified
- [ ] Women audited
- [ ] Men audited
- [ ] Adult unisex audited
- [ ] Kids boys audited
- [ ] Kids girls audited
- [ ] Kids unisex audited
- [ ] Tops audited
- [ ] Bottoms audited
- [ ] Full-body/dresses audited
- [ ] Outerwear audited
- [ ] Footwear audited
- [ ] Bras/underwear/swim/sleep/socks checked separately
- [ ] Every chart row transcribed with correct units
- [ ] Every applicable Persona leaf claimed
- [ ] Every unsupported leaf or department documented
- [ ] Seed registered
- [ ] Tests pass
- [ ] Dry run has no unexpected errors
- [ ] Shared registry published
- [ ] Database and Stage 4 verified

## 13. Mandatory source manifest

Every brand seed has a sibling executable manifest. It is the inventory and audit ledger, while the
seed is the publishable data. A source table is never silently dropped. Each manifest records:

- stable `sourceTableId`, exact source heading, URL, market, locale, and source kind;
- verification date, evidence locator, optional snapshot/hash, and accessibility status;
- audience, sizing group, product line, fit class, age band, and all stated garment families;
- primary sizing system and every official parallel label system;
- the complete expected label sequence for each system;
- chart-deciding measurements and units;
- exact standard leaves and any validated custom-leaf bridge;
- one state: `published`, `blocked`, `unsupported`, `superseded`, or `inaccessible`;
- a specific reason and missing fields for every non-published state;
- notes about duplicated headings, contradictions, probable source errors, or regional differences.

Manifest-to-seed validation must prove that every `published` table has exactly one matching chart,
every chart has a manifest table, expected labels equal the rows, claimed leaves are a subset of the
evidenced leaves, and every inventoried non-published table has a reason. Source access failure is an
explicit state, not permission to reuse an old table as newly verified.

## 14. Discovery matrix

Complete every row before transcription. Record `found`, `not published`, `inaccessible`, or
`not applicable`, with evidence.

### Markets and source classes

- global brand site and every relevant regional/localized brand site;
- official help centre, fit finder, product-detail size modal, and embedded application data;
- official PDF, image, downloadable guide, store manual, or brand-owned marketplace page;
- current source and archived official source when the current page was removed;
- desktop and mobile variants when either exposes additional tables.

Third-party retailers, marketplaces, conversion blogs, search snippets, and competitor charts are
discovery leads only. Their values cannot be published as official brand data.

### Audiences and life stages

- women, men, adult unisex;
- girls, boys, kids unisex;
- newborn, infant, toddler, child, junior/teen, and any named transition range;
- maternity, adaptive, plus, petite, tall/long, short, curve, big-and-tall, slim, regular, athletic,
  or other explicitly published fit/line.

### Product families

- general apparel, tops/shirts, knitwear, sweatshirts, jackets/coats;
- trousers, jeans/denim, shorts, skirts;
- dresses, jumpsuits, suits and other full-body products;
- shoes, boots, sandals, slippers, socks/hosiery;
- bras, underwear, shapewear, lingerie, swim tops, swim bottoms, one-piece swim;
- sleepwear, robes, base layers, thermals;
- hats/headwear, gloves, belts, neckwear, bags, jewellery, watches, and sized accessories;
- sport, workwear, performance, uniform, compression, or named product-line tables.

### Sizing systems and source dimensions

Search for Alpha, numeric, EU, US, UK, FR, IT, DE, ES, AU, JP, CN, KR, RU, age, height, shoe,
collar/neck, waist, inseam, cup/band, and every brand-specific system. Also record:

- combined labels (`XS/S`, `3-6M`, `W32/L34`, `85B`);
- dual or multiple official labels in one cell;
- ranges, open bounds, half sizes, one-size labels, and foot-length labels;
- whether the table gives body measurements, garment measurements, both, or conversions only.

## 15. Table identity and applicability

A distinct official heading is normally a distinct source table. Do not collapse tables merely
because their values currently match. Stable chart identity consists of:

`brand + sourceTableId + audience + sizing group + market + line + fit + age band`.

Applicability fields mean:

- `productLine`: named range such as denim, essentials, performance, or maternity;
- `fitClass`: body/garment block such as petite, tall, slim, curve, or regular;
- `ageBand`: published life-stage bounds and/or named stage;
- `market`: market for which labels and measurements were published;
- `decidingMeasurements`: measurements used to choose a row in this table;
- `supportedSystems`: official label systems that identify the same row;
- `evidence`: source headings or official text justifying garment and leaf scope.

Never route by chart title text. Empty metadata means “not distinguished by that dimension”; it does
not mean “matches every possible value.” If two charts still match after all known product signals,
resolution is ambiguous and publication is blocked.

## 16. Measurements, ranges, and labels

### Ranges are first-class data

If a source says size 52 fits 102–105 cm, store `minCm: 102` and `maxCm: 105`. A shopper at 103 cm is
a match. Never reduce a published range to an endpoint or require exact equality. Inclusive bounds
are the default unless the source explicitly says otherwise. Adjacent source ranges may overlap; use
the existing fit/tie policy and preserve the official values.

Open bounds are stored only when the source publishes them. Missing is not the same as unbounded:
`null` due to absence must carry a reason and cannot make a row eligible on that measurement.
Measurements used only as supplementary guidance must not become globally mandatory. Each chart
declares the measurements that decide its fit.

### Labels

Preserve the exact display label and also a normalized matching key. Each row may have multiple
official labels in the same system and labels in multiple systems. Normalization may standardize
case, whitespace, Unicode dashes, and equivalent separators, but may not create a conversion.

- `XS/S` may match the officially combined row and must not invent separate XS and S rows.
- `3–6 months`, `3-6M`, and `3 / 6 M` may normalize together only when the brand uses them for the
  same row.
- `W32/L34` is one waist/inseam label. Never split it into stock sizes 32 and 34.
- band/cup labels preserve both dimensions.
- one-size and brand-specific tokens remain literal supported labels.

Conflicting official labels are retained with evidence or blocked for review; they are never silently
“fixed.” A label found only in the merchant catalog may be added as an alias only after official
evidence proves it maps to that row.

## 17. Leaf evidence, unisex, and custom leaves

Coverage is explicit and exact. Parent categories do not automatically claim children, and a women's
or men's claim does not imply adult-unisex. A unisex chart may claim unisex leaves only when the
official source or product line is explicitly unisex. A gendered chart may not be used as fallback.

A custom merchant leaf is supported only through a validated bridge to one standard Persona leaf or
through a private chart for that exact leaf. The bridge needs product evidence and must preserve
audience/group compatibility. Never persist an arbitrary custom key as global brand coverage.

For each leaf, record the source heading or official garment-family text. Broad headings can support
multiple leaves, but every expansion must be defensible. Similar body measurements, current catalog
absence, or a desire for a green completion state is not evidence.

## 18. Completion and publication gates

Completion is evaluated at four levels:

1. **Source inventory:** every discovered official table has an explicit manifest state.
2. **Chart coverage:** every publishable table and evidenced leaf is represented.
3. **Product resolution:** every in-scope catalog product resolves to exactly one chart or a specific
   unsupported-source state.
4. **Label resolution:** every stocked raw size token resolves to exactly one official chart row.

The brand is rejected when any demanded product is `missing`, `ambiguous`, `unsupported` without a
specific reason, or when any stocked label is unmatched/ambiguous. Zero current products does not
waive source-inventory or globally evidenced leaf coverage.

Allowed unsupported states are narrowly defined:

- no official table is published for the garment family;
- a table lacks a chart-deciding measurement;
- the only official source is currently inaccessible and no verified snapshot exists;
- the product belongs to a fit/line/age variant for which selection metadata is unavailable;
- the source is internally contradictory and has been withheld pending review.

Every state names the affected source/table/leaf/product, the exact missing requirement, evidence,
verification date, and remediation. “Not found”, “other”, and parent-level allowlists are not
acceptable publication reasons.

## 19. Validation, replay, and release procedure

Before writing:

- validate manifest shape, unique table IDs, URLs, states, and expected label sequences;
- compare discovery-matrix entries with the manifest and investigate omissions.

Before publication:

- validate schema and units; bounds, monotonicity where appropriate, and source row counts;
- validate manifest-to-seed table, label, system, applicability, and leaf parity;
- run resolver fixtures for every shared leaf, line, fit, age boundary, system, and compound label;
- replay the complete current catalog, not a sample, and report unresolved product IDs and tokens;
- run a database dry-run and inspect inserts, updates, unchanged rows, superseded rows, and deletions;
- reject any destructive change without a recorded replacement/unsupported transition.

Release one brand at a time. Preserve the prior chart version, publish the candidate, rebuild/reindex
ACS, rerun catalog replay against persisted data, and exercise every chart/system in Sizing Tester.
Verify boundary values (minimum, between, maximum, below, above), alias labels, and ambiguous shared
leaves. Roll back the brand version if persisted rows, ACS, tester results, or cart-size output differ
from the validated candidate.

## 20. Copy-ready extraction report

Every extraction submits this completed record:

```text
Brand:
Canonical key:
Researcher/date:
Markets/locales checked:
Official source URLs and titles:
Inaccessible official sources:
Discovery matrix: [all entries and states]
Source manifest path:

Official tables inventoried:
- sourceTableId:
  exact heading:
  audience/group:
  market/line/fit/age:
  deciding measurements:
  sizing systems and complete expected labels:
  evidenced garment families/leaves:
  state:
  evidence/snapshot/hash:
  anomaly or blocker:

Catalog replay:
- products checked:
- leaves demanded:
- systems/raw tokens demanded:
- resolved:
- unsupported with exact reason:
- missing:
- ambiguous:
- unmatched labels:

Validation:
- manifest-to-seed:
- schema/unit/range:
- resolver fixtures:
- seed dry-run:
- database verification:
- ACS rebuild:
- Sizing Tester boundary/alias checks:
- rollback version:

Known unsupported data (never inferred):
- affected table/leaf/product:
  missing official field:
  evidence and date:
  next verification action:
```

## 21. Rejection criteria and maintenance

Reject an extraction or publication if it has any of these:

- research started from current products and skipped the full discovery matrix;
- an official table is omitted from both seed and manifest;
- a value, conversion, alias, range endpoint, leaf, audience, or fit was guessed;
- a source table was merged with a similar table without explicit source evidence;
- a published range is tested as exact equality;
- two charts can resolve the same product, or a demanded product/label resolves to none;
- a generic adult, gender sibling, parent category, or standard-size fallback hides missing data;
- unsupported status lacks precise evidence and missing requirements;
- source URL/verification identity is missing or stale data is presented as newly verified;
- manifest, seed, dry run, persisted rows, ACS index, and tester output disagree.

Reverify sources on every material catalog mismatch, reported sizing error, source change, and at the
project's scheduled review interval. Diff source headings, expected labels, values, applicability,
and URL accessibility. Never overwrite history: publish a new chart version and retain the prior
version for rollback/audit. When a source disappears, mark it inaccessible with the last verified
date; do not claim current verification. When a new official table appears, inventory it first, then
repeat the full validation and release procedure.
