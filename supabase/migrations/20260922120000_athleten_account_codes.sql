-- AthleteN account codes for messaging/search.
alter table public.profiles add column if not exists account_code text;
create unique index if not exists profiles_account_code_unique on public.profiles(lower(account_code)) where account_code is not null;
create or replace function public.ensure_account_code() returns trigger language plpgsql as $$
begin
 if new.account_code is null or btrim(new.account_code)='' then new.account_code:='ATN-'||upper(substr(replace(new.user_id::text,'-',''),1,8)); end if;
 return new;
end; $$;
drop trigger if exists ensure_account_code on public.profiles;
create trigger ensure_account_code before insert on public.profiles for each row execute function public.ensure_account_code();
update public.profiles set account_code='ATN-'||upper(substr(replace(user_id::text,'-',''),1,8)) where account_code is null;
create or replace function public.find_user_by_account_code(p_code text) returns table(user_id uuid,full_name text,role text,account_code text) language sql stable security definer set search_path=public as $$
 select p.user_id,p.full_name,p.role,p.account_code from public.profiles p where lower(p.account_code)=lower(trim(p_code)) and (is_age_approved(auth.uid()) or public.is_platform_admin());
$$;
revoke execute on function public.find_user_by_account_code(text) from public,anon;
grant execute on function public.find_user_by_account_code(text) to authenticated;
