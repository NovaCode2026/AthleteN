-- Private-by-default opt-in and public-safe alias for AthleteN's daily leaderboard.
-- Candidate migration only. Do not apply to production until migration history is
-- reconciled and the complete migration chain has passed a reviewed staging replay.
--
-- Daily scores are derived from verified activity inside the Asia/Kolkata calendar
-- day. The API switches to the next day at 00:00 IST; no destructive reset or cron
-- job is required, and source activity records remain intact.

alter table public.profiles
  add column if not exists leaderboard_opt_in boolean not null default false,
  add column if not exists leaderboard_display_name text;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'profiles_leaderboard_display_name_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_leaderboard_display_name_check
      check (
        leaderboard_display_name is null
        or (
          leaderboard_display_name = btrim(leaderboard_display_name)
          and char_length(leaderboard_display_name) between 2 and 24
          and leaderboard_display_name ~ '^[A-Za-z0-9][A-Za-z0-9 ._-]{1,23}$'
        )
      );
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'profiles_leaderboard_opt_in_requires_alias'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_leaderboard_opt_in_requires_alias
      check (not leaderboard_opt_in or leaderboard_display_name is not null);
  end if;
end
$$;

create unique index if not exists profiles_daily_leaderboard_alias_unique_idx
  on public.profiles (lower(leaderboard_display_name))
  where leaderboard_opt_in = true
    and leaderboard_display_name is not null;

create index if not exists profiles_daily_leaderboard_opt_in_idx
  on public.profiles (role, user_id)
  where leaderboard_opt_in = true;

comment on column public.profiles.leaderboard_opt_in is
  'Explicit opt-in to show a user-chosen public-safe alias and daily leaderboard score.';

comment on column public.profiles.leaderboard_display_name is
  'Public-safe leaderboard alias; full name, username and profile image are never exposed by the leaderboard endpoint.';
