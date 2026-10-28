-- AthleteN launch readiness: canonical device tokens and attendance notifications.
-- Safe to re-run; no existing athlete records are modified or deleted.

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

create index if not exists device_push_tokens_user_idx
  on public.device_push_tokens(user_id);

alter table public.device_push_tokens enable row level security;
drop policy if exists "Users manage own push tokens" on public.device_push_tokens;
create policy "Users manage own push tokens"
  on public.device_push_tokens for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

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

alter table public.notification_preferences enable row level security;
drop policy if exists "Users manage own notification preferences" on public.notification_preferences;
create policy "Users manage own notification preferences"
  on public.notification_preferences for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create or replace function public.athleten_notify_attendance_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;

  v_status := coalesce(nullif(btrim(new.status), ''), 'updated');

  insert into public.notifications (
    user_id, title, body, notification_type, action_route, created_at, updated_at
  ) values (
    new.user_id,
    'Training attendance updated',
    'Your coach marked your attendance: ' || replace(v_status, '_', ' ') || '.',
    'training',
    '/notifications',
    now(),
    now()
  );

  return new;
end;
$$;

revoke all on function public.athleten_notify_attendance_change() from public, anon, authenticated;
drop trigger if exists athleten_attendance_notification on public.attendance_records;
create trigger athleten_attendance_notification
  after insert or update of status on public.attendance_records
  for each row execute function public.athleten_notify_attendance_change();

-- Supabase Realtime only sends table changes for tables in its publication.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'notifications'
     ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;
