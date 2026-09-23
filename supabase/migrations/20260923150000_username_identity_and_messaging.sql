-- AthleteN username identity hardening
-- Usernames are trimmed, case-insensitive unique identifiers for messaging.

alter table public.profiles
  add column if not exists username_normalized text
  generated always as (lower(trim(username))) stored;

create unique index if not exists profiles_username_normalized_unique
  on public.profiles (username_normalized)
  where username is not null and trim(username) <> '';

create or replace function public.set_my_username(p_username text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  normalized text;
begin
  if uid is null then
    raise exception 'Authentication required';
  end if;

  normalized := lower(trim(coalesce(p_username, '')));

  if normalized = '' then
    raise exception 'Username is required';
  end if;

  if length(normalized) < 3 or length(normalized) > 30 then
    raise exception 'Username must be 3 to 30 characters';
  end if;

  if normalized !~ '^[a-z0-9][a-z0-9._-]*$' then
    raise exception 'Use only letters, numbers, dots, hyphens and underscores';
  end if;

  if exists (
    select 1
    from public.profiles
    where username_normalized = normalized
      and user_id <> uid
  ) then
    raise exception 'That username is already in use';
  end if;

  update public.profiles
  set username = trim(p_username),
      updated_at = now()
  where user_id = uid;

  if not found then
    raise exception 'Profile not found';
  end if;

  return trim(p_username);
exception
  when unique_violation then
    raise exception 'That username is already in use';
end;
$$;

create or replace function public.search_messaging_users(p_query text)
returns table(
  user_id uuid,
  username text,
  full_name text,
  account_code text,
  academy text,
  role text
)
language sql
security definer
set search_path = public
as $function$
  select p.user_id,p.username,p.full_name,p.account_code,p.academy,p.role
  from public.profiles p
  where p.user_id <> (select auth.uid())
    and p.username_normalized = lower(trim(left(coalesce(p_query,''),40)))
    and not exists(
      select 1 from public.user_blocks b
      where (b.blocker_user_id=(select auth.uid()) and b.blocked_user_id=p.user_id)
         or (b.blocker_user_id=p.user_id and b.blocked_user_id=(select auth.uid()))
    )
  limit 1;
$function$;

revoke execute on function public.set_my_username(text) from anon;
revoke execute on function public.search_messaging_users(text) from anon;
