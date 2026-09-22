grant execute on function public.is_platform_admin() to authenticated;

create or replace function public.find_user_by_account_code(p_code text)
returns table(user_id uuid, full_name text, role text, account_code text)
language sql
stable
security definer
set search_path = public
as $$
  select p.user_id,p.full_name,p.role,p.account_code
  from public.profiles p
  where lower(p.account_code)=lower(trim(p_code))
    and (public.is_age_approved(auth.uid()) or public.is_platform_admin());
$$;

grant execute on function public.find_user_by_account_code(text) to authenticated;

drop function if exists public.search_messaging_users(text);

create function public.search_messaging_users(p_query text)
returns table(user_id uuid, username text, full_name text, account_code text, academy text, role text)
language sql
security definer
set search_path = public
as $$
  select p.user_id,p.username,p.full_name,p.account_code,p.academy,p.role
  from public.profiles p
  where p.user_id <> (select auth.uid())
    and (
      lower(coalesce(p.username,'')) like lower('%'||left(btrim(p_query),40)||'%')
      or lower(coalesce(p.full_name,'')) like lower('%'||left(btrim(p_query),40)||'%')
      or lower(coalesce(p.account_code,'')) like lower('%'||left(btrim(p_query),40)||'%')
    )
    and not exists(
      select 1 from public.user_blocks b
      where (b.blocker_user_id=(select auth.uid()) and b.blocked_user_id=p.user_id)
         or (b.blocker_user_id=p.user_id and b.blocked_user_id=(select auth.uid()))
    )
  order by
    case
      when lower(coalesce(p.username,''))=lower(btrim(p_query)) then 0
      when lower(coalesce(p.account_code,''))=lower(btrim(p_query)) then 0
      when lower(coalesce(p.full_name,''))=lower(btrim(p_query)) then 0
      else 1
    end,
    coalesce(p.full_name,p.username,p.account_code)
  limit 20;
$$;

grant execute on function public.search_messaging_users(text) to authenticated;