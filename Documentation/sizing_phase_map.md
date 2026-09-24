# Sizing Implementation — Phase to Page Map

| Phase | Page | Stage | Responsible for |
|---|---|---|---|
| 1 | Categories | Sub-step 2 (new) | Merchant maps each selected leaf path to one of five parent sizing categories. |
| 2 | Setup | Stage 1 — Column Mapping | Merchant declares the store's size type (EU/US/UK/Alpha/Numeric) plus brand overrides. |
| 3 | Setup | Stage 4 — Size Chart Research | Research discovers and normalizes the real chart variants each brand publishes per parent. |
| 4 | Setup | Stage 4 — Size Chart Research (modal) | Merchant hand-fills charts for private and null brands, and forks a template when editing. |
| 5 | Setup | Stage 5 — Chart Assignment | Merchant binds each brand + category path to one discovered chart variant. |
| 6 | Setup | Stage 6 — Active Overview | Merchant overrides the inherited chart for individual odd SKUs. |
| 7 | None (catalog ingest) | — | Capture per-size stock from Woo and Shopify so each size carries its own availability. |
| 8 | Setup | Stage 6 — Active Overview | Map the merchant's raw size strings to canonical sizes that exist in the assigned chart. |
| 9 | None (index pass) | Shown in Stage 6 | Trim the chart to the SKU's canonical sizes and write `final_chart` onto the indexed product. |
| 10 | Shopper body profile | — | Collect and persist hip circumference and foot length alongside the existing measurements. |
| 11 | None (retrieval) | Config on Size Filter page | Exclude SKUs where no single available size satisfies every measurement within guard bands. |
| 12 | Shopper chat | — | Persona picks the actual size from `final_chart` instead of guessing from BMI. |

Phases 1 through 6 are all merchant-facing screens; 7, 9 and 11 have no page of their own and run in the pipeline, with 9's output visible in Stage 6; 10 and 12 are the shopper side.

The six Setup stages are: 1 Column Mapping, 2 Item Preview, 3 Brand Discovery, 4 Size Chart Research,
5 Chart Assignment, 6 Active Overview.

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

## Stage 5 — Chart Assignment

Stage 5 exists because research and the catalog each know half the answer. Research can prove that
Tommy Hilfiger publishes a men's tops table and a women's one. It cannot know that this store's
`Sale > Tops` is womenswear. The merchant knows that, and nothing else in the pipeline does.

### Why `sizing_path_coverage` is a separate table

`sizing_coverage` groups by (brand × sizing parent), so "Tommy Hilfiger tops" is one row whether the
store files it under `Men > T-Shirts` or `Women > Tops` — and those two legitimately want different
variants of the same brand's chart. `sizing_path_coverage` adds the merchant category the product was
actually sized from.

It is **aggregate only**: brand, the deepest mapped category id, the sizing parent, and a SKU count.
No SKUs, ids, prices or images. Storing the merchant's catalog is what this pipeline is built to avoid,
and a count per path is all an assignment screen can act on — which is why Stage 5's inspector reports
what a rule governs without listing products, unlike the demo it is modelled on.

`category_id` is the platform's own stable term id, so a merchant renaming a category keeps their
assignment. `category_path` is the breadcrumb, refreshed by every scan.

### Why assignments are their own table

`sizing_chart_assignments` is keyed identically to `sizing_path_coverage` so the join is exact, but the
two have opposite lifecycles: coverage is replaced wholesale by every scan, while an assignment is a
merchant decision that has to survive one. A rescan prunes assignments whose path no longer exists and
leaves the rest alone.

It stores `variant_name`, not a chart id. Writing a chart deletes and re-inserts the row for that
published table, so a re-run of research mints new uuids for the same guide and a uuid here would dangle
the moment a merchant re-researched a brand they had just finished assigning. When a stored name matches
nothing current, the row is flagged rather than cleared — the merchant's decision is still the best
evidence of their intent.

A row with `variant_name is null` is a real answer: the merchant looked at the path and decided it gets
no chart. That is deliberately distinct from having no row, which means undecided, and it is what lets
the unresolved count reach zero.

### What auto-matching will and will not do

Two cases are resolved without asking: a brand publishing exactly one chart for a parent, and a path
whose own breadcrumb names an audience that exactly one variant matches. Everything else is left blank.
Guessing between a brand's Regular and its Petite line sizes every shopper on that path against the
wrong body *and* reports the path as governed, which is worse than an obviously undone one.

`unisex` is never matched on, because `audienceFor` returns it both for a genuinely unisex path and for
one it could not read at all.

Auto-matches are applied on read by `GET /sizing/assignments` rather than by a background job: the match
is a pure function over rows already in hand, it never touches a path that has a row, and doing it there
means a merchant's first visit shows the obvious cases resolved instead of forty dropdowns with one
option each. They are persisted as `source = 'auto'`, and a merchant's own choice is always written as
`source = 'merchant'`, which is what protects it from a later pass.

## Out of scope for stages 4 and 5

Stage 6 (`stage-confirmation.tsx`), SKU-level chart overrides, `final_chart`, and ACS publishing are
untouched by this work — Phase 9's index pass is its own pipeline.

## Known seeding gaps (data, not code)

`audienceCompatible` and `pickVariant` already handle every leaf correctly; these 58 leaves simply
have no chart in `sizing_charts` yet for any brand, Tommy Hilfiger included. Nothing here blocks a
merchant — an uncovered leaf just shows "no chart found" in Stage 4/5 the same way a brand that
publishes nothing does. Recorded so the next seeding pass has a checklist instead of a guess:

| Gap | Leaves | Why it's missing |
|---|---|---|
| No unisex-audience chart | 24 | Tommy publishes every table split by a specific audience (mens/womens/boys/girls/kids); unisex paths currently fall through to the closest adult chart via `audienceCompatible` rather than a chart of their own. |
| No mens `dresses` chart | 6 | Covers suits/formalwear — Tommy's own guide has no dedicated mens full-body table to transcribe from. |
| No girls full-body / outerwear / footwear chart | 17 | Tommy's girls guide stops at tops and bottoms (see the girls-tops truncation note in `tommy-hilfiger-kids.ts`); no source table exists for these three groups. |
| No boys full-body / footwear chart | 11 | Same shape as girls: the boys guide has no full-body or footwear table published. |

Closing these requires a source table to transcribe, so it is seeding work for the next brand pass,
not a code change.

## Where the code lives

| Concern | File |
|---|---|
| Path aggregation during the scan | `src/lib/sizing/path-coverage.ts` |
| Brand-level research status | `buildBrandResearch` in `src/lib/sizing/chart-results.ts` |
| Stage 5 join and auto-match | `src/lib/sizing/assignments.ts` |
| Research scope on the run | `src/lib/db/sizing-runs.ts` (`queueScopedResearch`, `advanceBlockedRun`) |
| New tables | `src/lib/db/sizing-path-coverage.ts`, `src/lib/db/sizing-chart-assignments.ts` |
| Stage 4 screen | `src/modules/store/sizing/components/stage-chart-research.tsx` |
| Stage 5 screen | `src/modules/store/sizing/components/stage-chart-assignment.tsx` |
| Migration | `supabase/migrations/20260914140000_sizing_stage4_stage5.sql` |
