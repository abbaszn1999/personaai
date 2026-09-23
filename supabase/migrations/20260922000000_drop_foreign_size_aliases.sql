-- Strip fr/it/de/jp out of sizing_charts.chart_rows[].aliases.
--
-- SIZE_ALIAS_KEYS (src/lib/sizing/chart-schema.ts) is now the five merchant-facing systems --
-- alpha, eu, uk, us, numeric -- matching SIZE_TYPES (src/lib/sizing/size-types.ts). FR/IT/DE/JP
-- were removed: no merchant this store connects to is labelled in them, and every kept regional
-- key already has a live merchant behind it.
--
-- TypeScript already refuses to write these keys, and rowToChart() (src/lib/db/sizing-charts.ts)
-- now re-parses chart_rows through parseSizeChart() on every read, which silently drops any key
-- outside the current vocabulary -- so a stale fr/it value can no longer reach rowLabels(). This
-- migration is the belt: it removes the dead weight from the stored jsonb itself, rather than
-- leaving it to be filtered out by every future reader forever. The seeded Tommy Hilfiger rows are
-- fully rewritten by `pnpm sizing:seed` immediately after this runs, so this mainly matters for any
-- researched or merchant-uploaded chart this migration cannot regenerate from source.
--
-- Only touches rows that actually carry one of the four keys; every other row's chart_rows is left
-- byte-identical (no rewrite, no updated_at bump).
update public.sizing_charts
set chart_rows = (
  select coalesce(
    jsonb_agg(
      case
        when (elem -> 'aliases') ?| array['fr', 'it', 'de', 'jp']
          then jsonb_set(elem, '{aliases}', (elem -> 'aliases') - 'fr' - 'it' - 'de' - 'jp')
        else elem
      end
    ),
    '[]'::jsonb
  )
  from jsonb_array_elements(chart_rows) as elem
)
where exists (
  select 1
  from jsonb_array_elements(chart_rows) as e
  where (e -> 'aliases') ?| array['fr', 'it', 'de', 'jp']
);
