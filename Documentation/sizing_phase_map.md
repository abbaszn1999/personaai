# Sizing Implementation — Five-Stage Page Map

| Phase | Page | Stage | Responsible for |
|---|---|---|---|
| 1 | Categories | Sub-step 2 (new) | Merchant maps each selected leaf path to one of five parent sizing categories. |
| 2 | Setup | Stage 1 — Column Mapping | Merchant declares the store's size type (EU/US/UK/Alpha/Numeric) plus brand overrides. |
| 3 | Setup | Stages 2–3 — Item Preview / Brand Discovery | Persist product-grain leaf, raw brand, brand type and canonical-brand mapping. |
| 4 | Setup | Stage 4 — Size Chart Research | Maintain global and private charts and their exact `covers_leaves` coverage. |
| 5 | Setup | Stage 5 — Active Overview | Resolve every product, show exact counts, and publish trimmed sizing data to ACS. |
| 6 | None (catalog ingest) | — | Capture per-size stock from Woo and Shopify so each size carries its own availability. |
| 7 | Shopper body profile / retrieval | Size Filter | Apply recall-preserving envelopes and exact same-size measurement checks. |
| 8 | Shopper chat | — | Persona recommends from products and sizes that passed deterministic sizing. |

There are five Setup stages: 1 Column Mapping, 2 Item Preview, 3 Brand Discovery, 4 Size
Chart Research, and 5 Active Overview.

`covers_leaves` is the sole chart-assignment truth. There is no category-path assignment stage,
parent fallback, fit-class fallback, or per-SKU chart override.

## Stage 4 — research is a queue, not a pass

Research is the only part of the pipeline that spends money per unit of work, so it is the only part a
merchant starts by hand. Reaching Stage 4 does nothing; each brand is searched because someone pressed
Generate on it, or pressed Generate All.

This inverts how it worked. Classification used to park the run at `research`/`pending`, and the worker
took that as authorisation to search every global brand it could find — so a merchant who simply walked
forward through the pipeline bought a bulk pass over their whole catalog, watched a full-screen progress
panel for however long it took, and had no way to try one brand first or to stop it. The behaviour is
now impossible to reach: `advanceSizingRun` returns immediately when the run's scope is empty, which is
the state a parked run sits in.

**The brand is the unit** because the brand is what a search costs. One web search reads a brand's whole
published size guide and yields every table on it, so charging per (brand × parent) would pay several
times over for one page. Charts nest under the brand that produced them for the same reason.

**The scope lives on the run row**, in `sizing_runs.research_brand_keys`, not in the request that
started it. A pass is bounded per tick so a Generate All over twenty brands returns through the worker
many times, and a scope held in the request would be gone by the second tick — at which point the worker
would fall back to "everything", which is the behaviour being removed. The scope is drained as each
brand finishes, so `phase_total` records the size of the request at the moment it is made: it is the
only denominator Stage 4's progress bar can trust, since the row itself says "two left" by the time
three of five are done.

**Regenerate does not delete first.** `research_force` bypasses the registry short-circuit and
`upsertChart` replaces each table as it succeeds, so a search that fails leaves the merchant with the
charts they already had. The endpoint this replaced cleared the brand's charts up front, which left
them with nothing.

Everything a client sends is re-derived server-side. `POST /sizing/research` takes a `brandKey` from a
browser and writes into `sizing_charts` rows shared with every other merchant, so the scope is rebuilt
from this store's own coverage and anything not in it is refused — including private labels and the
unbranded bucket, which publish nothing to find.

Leaving Stage 4 with brands still uncharted is allowed, and confirmed rather than silent. Some brands
genuinely publish nothing; holding a merchant there over those would make the pipeline uncompletable.

## Stage 5 — Active Overview

Stage 5 is a live product-resolution and publish screen. For each `sizing_product_records` row it
uses the product's `primary_persona_leaf_key`, brand type, canonical brand mapping, and the isolated
global/private chart source. A chart matches only when its exact `covers_leaves` contains that leaf
and its parent and audience are compatible.

Global products resolve from `sizing_charts` through the connection's canonical brand mapping.
Private and unbranded products resolve only from `sizing_charts_private` for that connection.
Fit-class charts without leaf coverage are never selected. Zero or multiple matching charts leave
the product unresolved with an explicit status.

Raw stock labels are matched deterministically to labels in the resolved chart. Canonical labels
are derived at read/publish time and are never stored in Postgres. If any stock label cannot be
resolved, the product publishes no sizing attributes rather than a misleading partial chart.

Finish queues a full sizing-aware catalog publish. Completion is persisted only after the catalog
queue settles successfully (`sizing_runs.status = complete` and `published_at` is set), so refreshes
cannot fake or lose the completed state.

## ACS sizing contract

Only stocked chart rows are written to ACS; the complete chart remains in Postgres:

- Identity/filter fields: `sizing_chart_key`, `fit_leaf`, `fit_group`, `fit_audience`,
  `fit_chart_variant`, `fit_size_labels`.
- Exact retrieved payload: `fit_rows`, one compact JSON string per stocked canonical size.
- Filterable numeric envelopes: `fit_chest_min/max`, `fit_waist_min/max`,
  `fit_height_min/max`, and `fit_foot_length_min/max`.

ACS limits a catalog to 30 retrievable attributes. `fit_size_labels` and `fit_rows` are retrievable
because exact fitting needs them. Identity and numeric envelope fields remain indexable/filterable but
are not retrievable; their role is server-side filtering and they would otherwise consume the shared
retrievable budget.

## Where the code lives

| Concern | File |
|---|---|
| Product-grain scan record | `src/lib/db/sizing-product-records.ts`, `src/lib/sizing/scan.ts` |
| Deterministic label forms | `src/lib/sizing/size-label-forms.ts` |
| Product/chart resolver | `src/lib/sizing/product-chart.ts` |
| ACS trimmed payload | `src/lib/sizing/acs-payload.ts` |
| Brand-level research status | `buildBrandResearch` in `src/lib/sizing/chart-results.ts` |
| Publish lifecycle | `src/lib/sizing/jobs.ts`, `src/lib/catalog/process-queue.ts` |
| Single-product webhook indexing | `src/lib/catalog/index-product.ts` |
| ACS attribute registration | `src/lib/catalog/acs/attributes-config.ts` |
| Stage 4 screen | `src/modules/store/sizing/components/stage-chart-research.tsx` |
| Stage 5 screen | `src/modules/store/sizing/components/stage-confirmation.tsx` |
| Migration | `supabase/migrations/20260925155000_sizing_product_raw_size_format.sql` |
