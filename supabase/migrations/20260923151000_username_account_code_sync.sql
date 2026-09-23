-- AthleteN username/account-code identity rules
-- Username is the public identity. Account code mirrors username exactly.
-- Full name remains a separate display field.

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
      account_code = trim(p_username),
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

update public.profiles
set account_code = trim(username), updated_at = now()
where username is not null
  and trim(username) <> ''
  and account_code is distinct from trim(username);

revoke execute on function public.set_my_username(text) from anon;
