-- ─── Hard cutover: ACS is now the sole catalog search backend ─────────────────
-- Retrieval no longer reads from `catalog_products` at all — `cosine.ts`/`filter.ts` are now
-- thin re-exports of the ACS-backed modes (`acs-cosine.ts`/`acs-filter.ts`), and
-- `getCatalogFacets`/`getProductGroup`/`getCatalogProductsByExternalIds` have ACS-backed
-- replacements in `src/lib/catalog/acs/catalog-reads.ts`. There is no parallel-evaluation phase
-- left to keep this table warm for, and no interim dual-write left writing to it — indexing
-- (`index-product.ts`, `process-queue.ts`) writes to ACS only. Nothing in the app queries this
-- table anymore, so it is dropped along with the RPCs that only ever existed to query it.
--
-- The pgmq queue (`catalog_enrichment`) and its `pg_cron` schedules are deliberately NOT dropped
-- here — the queue's chunking (claim-with-visibility-timeout, disjoint batches across overlapping
-- invocations) is still exactly what a large ACS backfill needs to stay within one request's
-- `maxDuration`; it is no longer specifically an LLM-throttling mechanism, but the app-level
-- payload it carries (`process-queue.ts`) has changed from "enrich + embed + upsert" to
-- "resolve categories + import to ACS".

drop function if exists public.prune_uncovered_catalog_products(uuid, text[]);

drop function if exists public.search_catalog_products(
  uuid, extensions.halfvec(768), integer, text, text, text, numeric, numeric, boolean, text[], text[], text, text
);

drop function if exists public.filter_catalog_products(
  uuid, integer, double precision, text, text, text, numeric, numeric, boolean, text[], text[], text, text
);

drop table if exists public.catalog_products;
