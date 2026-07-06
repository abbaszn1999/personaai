-- ─── users ────────────────────────────────────────────────────────────────────
create table public.users (
  id                          uuid primary key default gen_random_uuid(),
  email                       varchar not null unique,
  password_hash               varchar,
  first_name                  varchar,
  last_name                   varchar,
  profile_image_url           varchar,
  provider                    varchar not null default 'credentials',
  provider_id                 varchar,
  google_id                   varchar unique,
  email_verified              boolean not null default false,
  email_verification_token    varchar,
  email_verification_expiry   timestamptz,
  password_reset_token        varchar,
  password_reset_expiry       timestamptz,
  has_completed_onboarding    boolean not null default false,
  onboarding_data             jsonb,
  credits                     integer not null default 0,
  subscription_tier           varchar not null default 'free',
  workspace_limit             integer not null default 3,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

-- ─── sessions (connect-pg-simple compatible) ──────────────────────────────────
create table public.sessions (
  sid     varchar primary key,
  sess    json not null,
  expire  timestamptz not null
);

create index sessions_expire_idx on public.sessions (expire);
