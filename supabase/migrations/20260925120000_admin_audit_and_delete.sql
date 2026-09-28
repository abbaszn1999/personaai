-- Owner-only admin audit trail, plus a single transaction that removes a merchant and the
-- billing rows that would otherwise be left behind (those FKs are ON DELETE SET NULL).
-- Everything else that references users(id) or store_connections(id) already cascades.

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_email text not null,
  action text not null,
  target_user_id uuid,
  details jsonb not null default '{}'::jsonb,
  ip_hash text,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_log_created_idx on public.admin_audit_log (created_at desc);
create index if not exists admin_audit_log_target_idx on public.admin_audit_log (target_user_id, created_at desc);

alter table public.admin_audit_log enable row level security;

create or replace function public.admin_delete_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null then
    raise exception 'user id is required';
  end if;

  delete from public.billing_balance_ledger where user_id = p_user_id;
  delete from public.billing_orders where user_id = p_user_id;
  delete from public.billing_subscriptions where user_id = p_user_id;
  delete from public.sessions where sess->>'userId' = p_user_id::text;
  delete from public.users where id = p_user_id;
end;
$$;

revoke all on function public.admin_delete_user(uuid) from public, anon, authenticated;
grant execute on function public.admin_delete_user(uuid) to service_role;
