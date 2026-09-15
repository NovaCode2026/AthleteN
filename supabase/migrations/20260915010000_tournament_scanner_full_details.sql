-- Keep the scanner's structured tournament intelligence extensible.
alter table public.tournament_scans
  add column if not exists details jsonb not null default '{}'::jsonb;

create index if not exists idx_tournament_scans_user_checked
  on public.tournament_scans(user_id, last_checked_at desc);
