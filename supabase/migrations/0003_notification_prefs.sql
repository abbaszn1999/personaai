-- Add notification_preferences column to users table
alter table public.users
  add column if not exists notification_preferences jsonb not null default '{}';
