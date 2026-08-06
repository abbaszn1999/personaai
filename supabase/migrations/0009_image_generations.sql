-- ─── image generations (credit-backed usage log) ───────────────────────────────
-- Every successfully generated Persona Agent image (avatar variation or try-on
-- render) costs exactly 1 credit, atomically deducted and logged here.
create table public.image_generations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  kind        varchar not null check (kind in ('avatar', 'try_on')),
  created_at  timestamptz not null default now()
);
create index image_generations_user_id_created_at_idx on public.image_generations (user_id, created_at);

alter table public.image_generations enable row level security;

-- ─── consume_image_credit RPC ──────────────────────────────────────────────────
-- Makes "check credits, decrement, and log" a single atomic operation — safe
-- against concurrent requests double-spending the last credit.
create or replace function public.consume_image_credit(p_user_id uuid, p_kind varchar)
returns boolean language plpgsql as $$
declare updated_rows int;
begin
  update public.users set credits = credits - 1, updated_at = now()
  where id = p_user_id and credits >= 1;
  get diagnostics updated_rows = row_count;
  if updated_rows = 0 then return false; end if;
  insert into public.image_generations (user_id, kind) values (p_user_id, p_kind);
  return true;
end;
$$;
