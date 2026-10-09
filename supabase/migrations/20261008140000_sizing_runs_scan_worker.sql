alter table public.sizing_runs
  add column scan_worker text;

comment on column public.sizing_runs.scan_worker is
  'Which server build ran this run''s catalog scan: the scan code version and the host. Null means the scan ran on code from before this column existed. Lets a stale long-running worker be told apart from a current one.';
