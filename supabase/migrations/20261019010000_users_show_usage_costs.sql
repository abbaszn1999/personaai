-- Whether a merchant's Usage page shows dollar costs. The figures there are what each tool really
-- cost the platform, so they are hidden unless an admin turns them on for that merchant.
alter table public.users
  add column if not exists show_usage_costs boolean not null default false;
