-- ─── Shopper accounts (widget-level login, tenant-scoped) ───────────────────
-- Deliberately NOT public.users: that table is merchant/dashboard auth and carries billing
-- fields (credits, subscription_tier, workspace_limit) — mixing shopper logins into it would
-- risk a shopper ever being resolvable as a merchant. One shopper account is scoped to exactly
-- one workspace (same email can hold a separate account at every merchant using this widget),
-- matching "you're a customer of THIS store" and keeping each merchant's shopper list private.
create table public.shopper_accounts (
  id                    uuid primary key default gen_random_uuid(),
  workspace_id          uuid not null references public.workspaces(id) on delete cascade,
  email                 varchar not null,
  email_verified_at     timestamptz,
  privacy_accepted_at   timestamptz,
  last_seen_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (workspace_id, email)
);

create index shopper_accounts_workspace_idx on public.shopper_accounts(workspace_id);

alter table public.shopper_accounts enable row level security;

-- ─── One-time email login codes ──────────────────────────────────────────────
-- The 6-digit code is hashed, never stored raw — same reasoning as password_hash on
-- public.users. `attempts` caps brute-forcing a still-valid code; `consumed_at` stops replay.
create table public.shopper_login_codes (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces(id) on delete cascade,
  email          varchar not null,
  code_hash      varchar not null,
  attempts       integer not null default 0,
  expires_at     timestamptz not null,
  consumed_at    timestamptz,
  created_at     timestamptz not null default now()
);

create index shopper_login_codes_lookup_idx on public.shopper_login_codes(workspace_id, email, created_at desc);

alter table public.shopper_login_codes enable row level security;

-- ─── Shopper sessions ─────────────────────────────────────────────────────────
-- A bearer token kept in the widget's own localStorage, not a cookie: the widget mounts
-- directly into the merchant's page, so a cookie we set there is a third-party cookie —
-- already blocked by Safari and on the way out in Chrome — and cookies set by a WebView
-- inside the merchant's app are invisible to that same merchant's website anyway. A bearer
-- token sent as `Authorization: Bearer <token>` works identically everywhere. Only the hash
-- is stored, matching shopper_login_codes.
create table public.shopper_sessions (
  id                    uuid primary key default gen_random_uuid(),
  shopper_account_id    uuid not null references public.shopper_accounts(id) on delete cascade,
  token_hash            varchar not null unique,
  user_agent            text,
  created_at            timestamptz not null default now(),
  expires_at            timestamptz not null,
  revoked_at            timestamptz
);

create index shopper_sessions_account_idx on public.shopper_sessions(shopper_account_id);

alter table public.shopper_sessions enable row level security;

-- ─── Shopper profiles (server-side source of truth, up to 3 per account) ─────
-- The 3-profile ceiling is enforced in application code at insert time (see
-- src/lib/db/shopper-accounts.ts), matching the existing client-side `maxProfiles` cap in
-- use-try-on-agent.ts. Populated starting in the phase that moves profiles off localStorage
-- and onto the account — this migration only reserves the shape so that phase is additive.
create table public.shopper_profiles (
  id                    uuid primary key default gen_random_uuid(),
  shopper_account_id    uuid not null references public.shopper_accounts(id) on delete cascade,
  label                 varchar not null default 'Me',
  audience              varchar,
  height_cm             numeric,
  weight_kg             numeric,
  chest_cm              numeric,
  waist_cm              numeric,
  hips_cm               numeric,
  shoe_size_eu          numeric,
  avatar_url            text,
  backdrop_url          text,
  sort_order            integer not null default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index shopper_profiles_account_idx on public.shopper_profiles(shopper_account_id);

alter table public.shopper_profiles enable row level security;
