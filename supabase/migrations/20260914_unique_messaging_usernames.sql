-- Unique public messaging usernames.
-- Usernames are generated from the profile name when missing and are globally unique.
alter table public.profiles add column if not exists username text;

create or replace function public.generate_profile_username()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  base text;
  candidate text;
  suffix integer := 0;
begin
  if new.username is null or btrim(new.username) = '' then
    base := lower(regexp_replace(coalesce(new.full_name, 'athlete'), '[^a-zA-Z0-9]+', '', 'g'));
    base := left(base, 20);
    if base = '' then base := 'athlete'; end if;
    candidate := base;
    while exists (select 1 from public.profiles p where lower(p.username) = lower(candidate) and p.user_id <> coalesce(new.user_id, '00000000-0000-0000-0000-000000000000'::uuid)) loop
      suffix := suffix + 1;
      candidate := left(base, greatest(1, 20 - length(suffix::text))) || suffix::text;
    end loop;
    new.username := candidate;
  else
    new.username := lower(btrim(new.username));
  end if;
  if new.username !~ '^[a-z0-9][a-z0-9_.-]{2,23}$' then
    raise exception 'Username must be 3-24 characters and use only letters, numbers, dot, underscore, or hyphen.';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_username_trigger on public.profiles;
create trigger profiles_username_trigger
before insert or update of username, full_name on public.profiles
for each row execute function public.generate_profile_username();

update public.profiles p
set username = lower(regexp_replace(left(coalesce(nullif(btrim(p.username), ''), p.full_name), 20), '[^a-zA-Z0-9]+', '', 'g'))
where p.username is null or btrim(p.username) = '';

-- Resolve any generated collisions deterministically.
with ranked as (
  select user_id, username, row_number() over (partition by lower(username) order by created_at, user_id) as rn
  from public.profiles
)
update public.profiles p
set username = left(r.username, greatest(1, 20 - length((r.rn - 1)::text))) || case when r.rn = 1 then '' else (r.rn - 1)::text end
from ranked r
where p.user_id = r.user_id and r.rn > 1;

create unique index if not exists profiles_username_lower_unique on public.profiles (lower(username));

create or replace function public.search_messaging_users(p_query text)
returns table (user_id uuid, username text, full_name text, academy text, role text)
language sql
security definer
set search_path = public
as $$
  select p.user_id, p.username, p.full_name, p.academy, p.role
  from public.profiles p
  where p.user_id <> (select auth.uid())
    and p.username is not null
    and lower(p.username) like lower('%' || left(btrim(p_query), 40) || '%')
  order by case when lower(p.username) = lower(btrim(p_query)) then 0 else 1 end, p.username
  limit 20;
$$;

revoke all on function public.search_messaging_users(text) from public, anon;
grant execute on function public.search_messaging_users(text) to authenticated;
