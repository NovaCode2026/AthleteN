create table if not exists public.device_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique,
  platform text not null check (platform in ('android','ios','web')),
  app_version text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  training boolean not null default true,
  competitions boolean not null default true,
  messages boolean not null default true,
  coach_academy boolean not null default true,
  achievements boolean not null default true,
  system boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.device_push_tokens enable row level security;
alter table public.notification_preferences enable row level security;
create policy "Users manage own push tokens" on public.device_push_tokens for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Users manage own notification preferences" on public.notification_preferences for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create index if not exists device_push_tokens_user_idx on public.device_push_tokens(user_id);
