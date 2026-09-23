create or replace function public.set_my_account_code(p_code text)
returns text
language plpgsql
security definer
set search_path=public
as $$
declare
  uid uuid := auth.uid();
  normalized text;
begin
  if uid is null then
    raise exception 'Authentication required';
  end if;

  normalized := upper(btrim(coalesce(p_code,'')));

  if normalized = '' then
    raise exception 'Account code is required';
  end if;

  if length(normalized) < 4 or length(normalized) > 24 then
    raise exception 'Account code must be 4 to 24 characters';
  end if;

  if normalized !~ '^[A-Z0-9][A-Z0-9_-]*$' then
    raise exception 'Use only letters, numbers, hyphens and underscores';
  end if;

  if exists (
    select 1 from public.profiles
    where lower(btrim(account_code)) = lower(normalized)
      and user_id <> uid
  ) then
    raise exception 'That account code is already in use';
  end if;

  update public.profiles
  set account_code=normalized, updated_at=now()
  where user_id=uid;

  if not found then raise exception 'Profile not found'; end if;
  return normalized;
exception
  when unique_violation then raise exception 'That account code is already in use';
end;
$$;

grant execute on function public.set_my_account_code(text) to authenticated;

drop index if exists public.profiles_account_code_unique;
create unique index profiles_account_code_unique
  on public.profiles (lower(btrim(account_code)))
  where account_code is not null and btrim(account_code) <> '';