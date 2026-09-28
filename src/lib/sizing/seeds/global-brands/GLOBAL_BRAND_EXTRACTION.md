# Global Brand Sizing-Chart Extraction Guide

This is the operating guide for adding or correcting a verified global-brand seed. Read it before
researching a brand, editing a seed, or publishing charts.

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

This document explains those contracts. It does not replace them.

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
- `covers_leaves` is the sole source of truth for which chart applies to a Persona leaf.
- Seeds are researched against the complete Persona taxonomy, not only the leaves or SKUs present in
  the connected test store.

The target is complete coverage for every Persona leaf to which the brand's official published table
honestly applies. Complete does **not** mean assigning an unrelated chart to force a green badge. A
tops chart cannot fill footwear, and an adult chart cannot fill child apparel. Unsupported leaves
must stay visible as gaps until a valid source is found.

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

- `women:top:*`: `t-shirt`, `shirt`, `blouse`, `camisole`, `tank-top`, `crop-top`, `bodysuit`,
  `knit`, `sweater`, `hoodie`, `sweatshirt`, `tunic`, `activewear-top`, `swim-top`, `sleep-top`,
  `bra`
- `women:bottom:*`: `trouser`, `jean`, `skirt`, `short`, `legging`, `culotte`,
  `activewear-bottom`, `swim-bottom`, `sleep-bottom`
- `women:full-body:*`: `dress`, `gown`, `jumpsuit`, `romper`, `kaftan`, `abaya`, `swimsuit`, `set`,
  `sleepwear-set`
- `women:outerwear:*`: `blazer`, `jacket`, `coat`, `trench`, `cardigan`, `vest`, `kimono`,
  `activewear-jacket`
- `women:footwear:*`: `heel`, `flat`, `sneaker`, `boot`, `sandal`, `loafer`, `mule`, `wedge`,
  `slipper`, `sock`

### Men

- `men:top:*`: `t-shirt`, `shirt`, `polo-shirt`, `knit`, `sweater`, `hoodie`, `sweatshirt`,
  `activewear-top`, `sleep-top`
- `men:bottom:*`: `trouser`, `jean`, `chino`, `short`, `jogger`, `activewear-bottom`,
  `swim-short`, `sleep-bottom`
- `men:full-body:*`: `suit`, `jumpsuit`, `thobe`, `overall`, `set`, `sleepwear-set`
- `men:outerwear:*`: `blazer`, `suit-jacket`, `jacket`, `coat`, `cardigan`, `gilet`,
  `activewear-jacket`
- `men:footwear:*`: `sneaker`, `dress-shoe`, `boot`, `loafer`, `sandal`, `espadrille`, `slipper`,
  `sock`

### Adult Unisex

- `unisex:top:*`: `t-shirt`, `shirt`, `knit`, `sweater`, `hoodie`, `sweatshirt`, `activewear-top`
- `unisex:bottom:*`: `trouser`, `jean`, `short`, `jogger`, `activewear-bottom`
- `unisex:full-body:*`: `jumpsuit`, `overall`, `set`
- `unisex:outerwear:*`: `jacket`, `coat`, `cardigan`, `gilet`
- `unisex:footwear:*`: `sneaker`, `boot`, `sandal`, `slide`, `slipper`, `sock`

### Kids Boys

- `kids-boys:top:*`: `t-shirt`, `shirt`, `knit`, `hoodie`, `sweatshirt`, `bodysuit`,
  `activewear-top`, `sleep-top`
- `kids-boys:bottom:*`: `trouser`, `jean`, `short`, `legging`, `jogger`, `swim-short`,
  `sleep-bottom`
- `kids-boys:full-body:*`: `romper`, `all-in-one`, `sleepsuit`, `set`, `swimsuit`, `bathrobe`
- `kids-boys:outerwear:*`: `jacket`, `coat`, `cardigan`, `snowsuit`, `pramsuit`
- `kids-boys:footwear:*`: `sneaker`, `shoe`, `boot`, `sandal`, `bootie`, `slipper`, `sock`

### Kids Girls

- `kids-girls:top:*`: `t-shirt`, `shirt`, `blouse`, `knit`, `hoodie`, `sweatshirt`, `bodysuit`,
  `activewear-top`, `sleep-top`
- `kids-girls:bottom:*`: `trouser`, `jean`, `skirt`, `short`, `legging`, `jogger`, `sleep-bottom`
- `kids-girls:full-body:*`: `dress`, `romper`, `all-in-one`, `sleepsuit`, `set`, `swimsuit`,
  `bathrobe`
- `kids-girls:outerwear:*`: `jacket`, `coat`, `cardigan`, `snowsuit`, `pramsuit`
- `kids-girls:footwear:*`: `sneaker`, `shoe`, `boot`, `sandal`, `bootie`, `slipper`, `sock`

### Kids Unisex

- `kids-unisex:top:*`: `t-shirt`, `shirt`, `knit`, `hoodie`, `sweatshirt`, `bodysuit`, `sleep-top`
- `kids-unisex:bottom:*`: `trouser`, `jean`, `short`, `legging`, `jogger`, `sleep-bottom`
- `kids-unisex:full-body:*`: `romper`, `all-in-one`, `sleepsuit`, `set`, `swimsuit`, `bathrobe`
- `kids-unisex:outerwear:*`: `jacket`, `coat`, `cardigan`, `snowsuit`, `pramsuit`
- `kids-unisex:footwear:*`: `sneaker`, `shoe`, `boot`, `sandal`, `bootie`, `slipper`, `sock`

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

Fit classes such as Tall, Petite, Long, Big & Tall, Plus, Slim, or Regular describe a shopper or
range, not a taxonomy leaf. Do not let a fit-class table claim general leaves. Keep
`coversLeaves: []` unless there is an explicit future selector that can choose that fit class.

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

1. Normalize the brand name and confirm its canonical key.
2. Find current official brand guides for every audience, market, garment family, footwear, socks,
   underwear, swimwear, sleepwear, children, and infant ranges.
3. Prefer direct official HTML or official guide images/PDFs. Record the exact URL and title.
4. Reject model measurements, reviews, marketplace conversions, generic regional charts, and
   garment dimensions presented as body dimensions.
5. Inventory every distinct published table before coding.
6. Classify each table by audience and one of the five sizing groups.
7. Transcribe all official labels, aliases, measurements, units, open bounds, and missing cells.
8. Convert inches to centimetres once during normalization and note the conversion.
9. Preserve source errors or withhold the affected row/table. Never silently repair a probable typo.
10. Map each table to explicit Persona leaves based on the source heading and defensible garment
    scope.
11. Audit all six departments and all five categories, even when the current merchant has no SKU
    there.
12. Add unsupported individual leaves to `ALLOWED_GAPS` with a source-based reason.
13. Add whole unsupported departments to `UNSUPPORTED_DEPARTMENTS`. Never rely on an untouched
    department being silently skipped.
14. Register the new seed in `index.ts`.
15. Run tests, dry-run publication, publish, and verify the database.

## 9. Leaf-coverage rules

- A chart can claim many leaves when the official table genuinely covers them.
- A leaf must match both the chart audience and sizing group.
- Specialized tables should take specialized leaves: denim → jean, swim top → swim-top, swim bottom
  → swim-bottom, wired bra → bra, shoes → footwear excluding socks unless the source includes socks.
- A general published table may cover several garment leaves in its stated family.
- Different tables can share a source page, but each database row must represent one coherent table.
- Do not merge incompatible scales into one chart.
- Avoid more than two charts claiming one leaf. Two are allowed only for a real disjoint reason such
  as infant and older-child age bands.
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
